// ════════════════════════════════════════════════════════════════
// Lectura automática del código de seguridad (3 dígitos) Y de la
// fecha desde la imagen de un comprobante de Yape.
//
// Por qué también leemos la fecha:
// El código de seguridad solo tiene 3 dígitos (1000 combinaciones),
// así que con el tiempo es normal y esperado que dos pagos distintos
// —de días distintos— compartan el mismo código por pura casualidad.
// Para detectar de verdad un comprobante reutilizado (fraude), hay
// que exigir que coincidan el código Y la fecha del comprobante, no
// el código solo.
//
// Cómo funciona:
// 1. Se hace una primera pasada de OCR normal sobre toda la imagen.
//    De ese texto completo se intenta extraer la fecha (formato
//    típico de Yape: "12 jul. 2026").
// 2. Con la misma pasada, se ubica la línea que contiene la palabra
//    "SEGURIDAD" (parte de "CÓDIGO DE SEGURIDAD") para saber dónde
//    están dibujados los 3 recuadros con los dígitos.
// 3. Se recorta esa zona y se AGRANDA 4 veces, se pasa a escala de
//    grises y se le sube el contraste (evita que Tesseract confunda
//    dígitos parecidos, p. ej. leer "9" como "2").
// 4. Se hace una segunda pasada de OCR SOLO en ese recorte agrandado,
//    con un "whitelist" de solo dígitos (0-9) en modo línea única.
// 5. Devuelve { codigo, fecha }. Cualquiera de los dos puede venir
//    en null si no se pudo leer — el servidor le pedirá al
//    participante que complete manualmente lo que falte.
// ════════════════════════════════════════════════════════════════
const { createWorker, PSM } = require('tesseract.js');
const { Jimp } = require('jimp');

const MESES = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, set: 9, sep: 9, oct: 10, nov: 11, dic: 12,
};

// Busca un patrón "12 jul. 2026" / "12 de julio de 2026" en el texto
// completo reconocido por el OCR y lo devuelve en formato ISO
// (YYYY-MM-DD), listo para guardar en una columna DATE de Postgres.
function extraerFechaDeTexto(texto) {
  if (!texto) return null;
  const regex = /(\d{1,2})\s*(?:de\s+)?([a-záéíóúñ]{3,})\.?\s*(?:de\s+)?(\d{4})/i;
  const m = texto.match(regex);
  if (!m) return null;

  const dia = parseInt(m[1], 10);
  const mesTexto = m[2]
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .slice(0, 3);
  const mes = MESES[mesTexto];
  const anio = parseInt(m[3], 10);

  if (!mes || dia < 1 || dia > 31 || anio < 2000 || anio > 2100) return null;

  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

async function extraerDatosComprobante(rutaImagen) {
  let worker;
  try {
    worker = await createWorker('spa');

    // ── Primera pasada: OCR completo (sirve para la fecha y para ubicar la etiqueta) ──
    const { data } = await worker.recognize(rutaImagen, {}, { blocks: true });

    const fecha = extraerFechaDeTexto(data.text);

    let lineaObjetivo = null;
    let x1Etiqueta = null;

    for (const block of data.blocks || []) {
      for (const parrafo of block.paragraphs || []) {
        for (const linea of parrafo.lines || []) {
          if (/SEGURIDAD/i.test(linea.text)) {
            lineaObjetivo = linea;
            for (const palabra of linea.words || []) {
              if (/SEGURIDAD/i.test(palabra.text)) {
                x1Etiqueta = palabra.bbox.x1;
              }
            }
          }
        }
      }
    }

    if (!lineaObjetivo || x1Etiqueta == null) {
      return { codigo: null, fecha }; // no se encontró la etiqueta, pero la fecha puede haber salido igual
    }

    const left = x1Etiqueta + 5;
    const top = Math.max(0, lineaObjetivo.bbox.y0 - 5);
    const width = (lineaObjetivo.bbox.x1 - x1Etiqueta) + 80;
    const height = (lineaObjetivo.bbox.y1 - lineaObjetivo.bbox.y0) + 10;

    // ── Recortar la zona de los dígitos y agrandarla antes de leerla ──
    const img = await Jimp.read(rutaImagen);
    const recorte = img.clone().crop({ x: left, y: top, w: width, h: height });
    const factor = 4;
    recorte.resize({ w: recorte.bitmap.width * factor, h: recorte.bitmap.height * factor });
    recorte.greyscale();
    recorte.contrast(0.3);
    const bufferRecorte = await recorte.getBuffer('image/png');

    // ── Segunda pasada: solo dígitos, solo esa zona, ya agrandada ──
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789',
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
    });
    const { data: data2 } = await worker.recognize(bufferRecorte);
    const digitos = (data2.text.match(/\d/g) || []).join('');

    return { codigo: digitos.length === 3 ? digitos : null, fecha };
  } catch (err) {
    console.error('⚠️ Error al leer el comprobante con OCR:', err.message);
    return { codigo: null, fecha: null };
  } finally {
    if (worker) {
      try { await worker.terminate(); } catch (_) { /* ignorar */ }
    }
  }
}

module.exports = { extraerDatosComprobante, extraerFechaDeTexto };
