// ════════════════════════════════════════════════════════════════
// PARCHE para server.js — reemplaza TODA la ruta POST /api/comprobantes
// ════════════════════════════════════════════════════════════════
// Este bloque reemplaza completa la ruta app.post('/api/comprobantes', ...)
// que ya tienes. Hace 3 cosas nuevas respecto a lo que tenías:
//
// 1. Intenta leer el código de seguridad Y la fecha directo de la imagen
//    (OCR) ANTES de guardar nada, si el cliente no los mandó ya escritos
//    a mano.
// 2. Si después de intentar el OCR sigue faltando alguno de los dos,
//    responde 422 con { error: 'ocr_incompleto', faltan: [...] } y NO
//    guarda nada (ni sube la imagen, ni toca la base de datos). El
//    navegador, al recibir esto, muestra los campos manuales que le
//    indiques en "faltan" y vuelve a intentar cuando el cliente los
//    complete.
// 3. El monto sigue con el descuento por combo (3/5/7/9/10 tickets) y
//    ahora redondeado a la decena más cercana (132→130, 255→260).
//
// ⚠️ OJO — revisa esto antes de pegar: la línea marcada más abajo con
// "AJUSTA AQUÍ" asume que extraerDatosComprobante(buffer) devuelve un
// objeto con las propiedades codigo_seguridad y fecha_comprobante (o
// codigo/fecha). Si tu ocrCodigoSeguridad.js usa otros nombres de
// propiedad, cambia esa línea para que apunte a los nombres reales.
// ════════════════════════════════════════════════════════════════

app.post('/api/comprobantes', upload.single('archivo'), async (req, res) => {
  const { documento, tipo_documento, nombres, apellidos, whatsapp, sorteo_id, cantidad } = req.body;
  let codigoSeguridad  = (req.body.codigo_seguridad || '').trim();
  let fechaComprobante = (req.body.fecha_comprobante || '').trim();

  if (!req.file) {
    return res.status(400).json({ error: 'Debes adjuntar el comprobante' });
  }
  if (!documento || !sorteo_id || !cantidad) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }

  // ── Intento de lectura automática (OCR) ───────────────────────────
  // Solo si el cliente no mandó ya el dato escrito a mano.
  if (!codigoSeguridad || !fechaComprobante) {
    try {
      const datosOcr = await extraerDatosComprobante(req.file.buffer);
      // AJUSTA AQUÍ si tu OCR devuelve otros nombres de propiedad:
      if (!codigoSeguridad)  codigoSeguridad  = (datosOcr.codigo_seguridad || datosOcr.codigo || '').trim();
      if (!fechaComprobante) fechaComprobante = (datosOcr.fecha_comprobante || datosOcr.fecha || '').trim();
    } catch (err) {
      console.error('OCR no pudo leer el comprobante:', err);
      // Seguimos igual — abajo se detecta qué quedó faltando.
    }
  }

  const faltan = [];
  if (!codigoSeguridad)  faltan.push('codigo_seguridad');
  if (!fechaComprobante) faltan.push('fecha_comprobante');
  if (faltan.length) {
    // No se sube la imagen ni se toca la base de datos todavía — el
    // cliente reintentará completo en cuanto el navegador le pida estos
    // datos y el usuario los escriba.
    return res.status(422).json({ error: 'ocr_incompleto', faltan });
  }

  // ── Subir la imagen (Cloudinary, o disco local si no hay credenciales
  // configuradas) — ya sabemos que tenemos código y fecha, así que vale
  // la pena guardarla. ────────────────────────────────────────────────
  let nombreArchivo, rutaArchivo;
  try {
    const guardado = await guardarComprobante(req.file.buffer, req.file.originalname);
    nombreArchivo = guardado.nombreArchivo;
    rutaArchivo = guardado.rutaArchivo;
  } catch (err) {
    console.error('Error al guardar la imagen del comprobante:', err);
    return res.status(500).json({ error: 'No se pudo guardar la imagen del comprobante. Intenta de nuevo.' });
  }

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    // ── Anti-fraude — código Y fecha ya usados juntos ──────────────
    const yaUsado = await cliente.query(
      `SELECT id FROM comprobantes
       WHERE codigo_seguridad = $1 AND fecha_comprobante = $2 AND estado IN ('pendiente', 'aprobado')
       LIMIT 1`,
      [codigoSeguridad, fechaComprobante]
    );
    if (yaUsado.rows.length) {
      await cliente.query('ROLLBACK');
      return res.status(400).json({ error: 'Este comprobante ya fue registrado anteriormente.' });
    }

    // Buscar o crear participante
    let r = await cliente.query(
      'SELECT id FROM participantes WHERE tipo_documento = $1 AND documento = $2',
      [tipo_documento || 'dni', documento]
    );
    let participanteId;
    if (r.rows[0]) {
      participanteId = r.rows[0].id;
      await cliente.query(
        'UPDATE participantes SET whatsapp = $1 WHERE id = $2',
        [whatsapp, participanteId]
      );
    } else {
      r = await cliente.query(
        `INSERT INTO participantes (tipo_documento, documento, nombres, apellidos, whatsapp)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [tipo_documento || 'dni', documento, nombres, apellidos, whatsapp]
      );
      participanteId = r.rows[0].id;
    }

    // Precio del ticket para ese sorteo
    const sorteoR = await cliente.query('SELECT precio_ticket FROM sorteos WHERE id = $1', [sorteo_id]);
    if (!sorteoR.rows[0]) throw new Error('Sorteo no encontrado');
    const precioTicket = Number(sorteoR.rows[0].precio_ticket);
    const totalLineal = precioTicket * Number(cantidad);

    // ── Promos por combo — solo en 3, 5, 7, 9 o 10 tickets exactos.
    // El % es sobre el precio normal de ESE sorteo, redondeado a la
    // decena más cercana (132→130, 183→180, 232→230, 255→260). El monto
    // final se recalcula siempre acá — nunca se confía en el navegador.
    const PORCENTAJES_POR_COMBO = { 3: 11, 5: 12, 7: 13, 9: 14, 10: 15 };
    const cant = Number(cantidad);
    const porcentajeDescuento = PORCENTAJES_POR_COMBO[cant] || 0;
    const monto = porcentajeDescuento > 0
      ? Math.max(0, Math.round((totalLineal * (1 - porcentajeDescuento / 100)) / 10) * 10)
      : totalLineal;

    const compR = await cliente.query(
      `INSERT INTO comprobantes (participante_id, sorteo_id, cantidad, monto, nombre_archivo, ruta_archivo, codigo_seguridad, fecha_comprobante, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pendiente') RETURNING *`,
      [participanteId, sorteo_id, cantidad, monto, nombreArchivo, rutaArchivo, codigoSeguridad, fechaComprobante]
    );

    await cliente.query('COMMIT');
    res.status(201).json({ ok: true, comprobante: compR.rows[0] });
  } catch (err) {
    await cliente.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al registrar el comprobante' });
  } finally {
    cliente.release();
  }
});
