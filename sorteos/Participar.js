// ════════════════════════════════════════════════════════════════
// Configuración del servidor API
// ════════════════════════════════════════════════════════════════
// Toma la URL configurada en config.js (window.API_BASE_URL incluye '/api' al final)
const API_URL = (window.API_BASE_URL || 'http://localhost:3000/api').replace(/\/api\/?$/, '');

// ── Estado global ─────────────────────────────────────────────
let docTipo         = 'dni';
let nombreCompleto   = '';
let cantidadTickets  = 1;
let sorteoSeleccionado = null;
let archivoComprobante = null;
let sorteosDisponibles = [];
let enviandoComprobante = false;

const PRECIO_TICKET_DEFAULT = 60;

// Si el link trae ?sorteo=<id> (por ejemplo desde una tarjeta de la
// página principal), participamos en ESE sorteo específico. Si no viene
// el parámetro, o no coincide con ninguno activo, usamos el primero.
const sorteoIdDesdeUrl = new URLSearchParams(window.location.search).get('sorteo');

// ── Cargar sorteos activos desde el servidor al iniciar ────────
async function cargarSorteos() {
  try {
    const resp = await fetch(`${API_URL}/api/sorteos`);
    if (!resp.ok) throw new Error('Error al cargar sorteos');
    const data = await resp.json();
    sorteosDisponibles = data.filter(s => s.estado === 'activo');

    if (sorteosDisponibles.length === 0) {
      mostrarErrorSorteos('No hay sorteos activos en este momento.');
      return;
    }

    const porUrl = sorteoIdDesdeUrl
      ? sorteosDisponibles.find(s => String(s.id) === String(sorteoIdDesdeUrl))
      : null;
    sorteoSeleccionado = porUrl || sorteosDisponibles[0];

    actualizarNombreSorteo();
    actualizarMontos();
  } catch (err) {
    console.error('Error al cargar sorteos:', err);
    mostrarErrorSorteos('No se pudo conectar con el servidor. Verifica que esté corriendo.');
  }
}

// Muestra el nombre del sorteo elegido en la barra de arriba y en el
// resumen de confirmación del paso 3.
function actualizarNombreSorteo() {
  const nombre = sorteoSeleccionado ? sorteoSeleccionado.nombre : '—';
  const elBarra   = document.getElementById('sorteo-actual-nombre');
  const elConfirm = document.getElementById('confirm-sorteo-nombre');
  if (elBarra)   elBarra.textContent   = nombre;
  if (elConfirm) elConfirm.textContent = nombre;
}

function mostrarErrorSorteos(msg) {
  const cont = document.getElementById('paso1');
  if (cont) {
    const aviso = document.createElement('div');
    aviso.className = 'error-msg';
    aviso.style.marginBottom = '16px';
    aviso.textContent = '⚠️ ' + msg;
    cont.prepend(aviso);
  }
  const elBarra = document.getElementById('sorteo-actual-nombre');
  if (elBarra) elBarra.textContent = 'No disponible';
}

cargarSorteos();

// ── Tipo de documento ─────────────────────────────────────────
function setDocType(tipo) {
  docTipo = tipo;
  const input  = document.getElementById('doc-input');
  const label  = document.getElementById('doc-label');
  const btnDni = document.getElementById('btn-dni');
  const btnExt = document.getElementById('btn-ext');

  limpiarNombres();

  if (tipo === 'dni') {
    input.maxLength   = 8;
    input.inputMode   = 'numeric';
    input.placeholder = '0 0 0 0 0 0 0 0';
    label.textContent = 'Número de DNI';
    btnDni.classList.add('active');
    btnExt.classList.remove('active');
  } else {
    input.maxLength   = 12;
    input.inputMode   = 'text';
    input.placeholder = 'C A R N É';
    label.textContent = 'Número de Carné de Extranjería';
    btnDni.classList.remove('active');
    btnExt.classList.add('active');
  }
  input.value = '';
  input.focus();
}

// ── Input DNI: solo números ───────────────────────────────────
document.getElementById('doc-input').addEventListener('input', function () {
  if (docTipo === 'dni') {
    this.value = this.value.replace(/\D/g, '');
  }
  this.classList.remove('error');
  limpiarNombres();

  // Buscar nombre al completar 8 dígitos
  if (docTipo === 'dni' && this.value.length === 8) {
    buscarNombre(this.value);
  }
});

// WhatsApp: solo números
document.getElementById('wsp-input').addEventListener('input', function () {
  this.value = this.value.replace(/\D/g, '');
  this.classList.remove('error');
});

// ── Buscar nombre por DNI (contra el servidor real) ────────────
async function buscarNombre(dni) {
  const msgEl      = document.getElementById('dni-msg');
  const camposNom  = document.getElementById('campos-nombres');

  msgEl.textContent = '🔍 Verificando DNI...';
  msgEl.className   = 'dni-msg buscando';
  camposNom.style.display = 'none';

  try {
    const resp = await fetch(`${API_URL}/api/participantes/${dni}`);
    const data = await resp.json();

    if (data.encontrado) {
      msgEl.textContent = '✅ DNI verificado correctamente';
      msgEl.className   = 'dni-msg encontrado';

      document.getElementById('input-nombres').value   = data.nombres;
      document.getElementById('input-apellidos').value = data.apellidos;
      document.getElementById('input-nombres').readOnly   = true;
      document.getElementById('input-apellidos').readOnly = true;
      document.getElementById('input-nombres').classList.add('readonly');
      document.getElementById('input-apellidos').classList.add('readonly');

      nombreCompleto = `${data.nombres} ${data.apellidos}`;
      camposNom.style.display = 'block';

    } else {
      msgEl.innerHTML = '⚠️ DNI no registrado en nuestra base de datos — <strong>ingresa tus datos manualmente</strong>';
      msgEl.className = 'dni-msg no-encontrado';

      document.getElementById('input-nombres').value   = '';
      document.getElementById('input-apellidos').value = '';
      document.getElementById('input-nombres').readOnly   = false;
      document.getElementById('input-apellidos').readOnly = false;
      document.getElementById('input-nombres').classList.remove('readonly');
      document.getElementById('input-apellidos').classList.remove('readonly');
      document.getElementById('input-nombres').placeholder   = 'Ingresa tus nombres';
      document.getElementById('input-apellidos').placeholder = 'Ingresa tus apellidos';

      nombreCompleto = '';
      camposNom.style.display = 'block';
      document.getElementById('input-nombres').focus();
    }
  } catch (err) {
    console.error('Error al buscar DNI:', err);
    msgEl.innerHTML = '⚠️ No se pudo verificar el DNI (sin conexión al servidor) — <strong>ingresa tus datos manualmente</strong>';
    msgEl.className = 'dni-msg no-encontrado';
    document.getElementById('input-nombres').readOnly   = false;
    document.getElementById('input-apellidos').readOnly = false;
    camposNom.style.display = 'block';
  }
}

// ── Limpiar nombres ───────────────────────────────────────────
function limpiarNombres() {
  nombreCompleto = '';
  const msgEl     = document.getElementById('dni-msg');
  const camposNom = document.getElementById('campos-nombres');
  msgEl.textContent = '';
  msgEl.className   = 'dni-msg';
  camposNom.style.display = 'none';
}

// ── Ir a Paso 2 ───────────────────────────────────────────────
function irPaso2() {
  const doc      = document.getElementById('doc-input').value.trim();
  const wsp      = document.getElementById('wsp-input').value.trim();
  const nomInput = document.getElementById('input-nombres');
  const apInput  = document.getElementById('input-apellidos');
  let valido = true;

  if (!sorteoSeleccionado) {
    alert('No hay un sorteo activo disponible en este momento.');
    return;
  }

  if (docTipo === 'dni' && doc.length !== 8) {
    document.getElementById('doc-input').classList.add('error');
    valido = false;
  }
  if (docTipo === 'ext' && doc.length < 6) {
    document.getElementById('doc-input').classList.add('error');
    valido = false;
  }

  if (nomInput && !nomInput.value.trim()) {
    nomInput.classList.add('error');
    valido = false;
  }
  if (apInput && !apInput.value.trim()) {
    apInput.classList.add('error');
    valido = false;
  }

  if (nomInput && apInput) {
    nombreCompleto = `${nomInput.value.trim()} ${apInput.value.trim()}`;
  }

  if (!nombreCompleto.trim()) {
    valido = false;
  }

  if (wsp.length !== 9) {
    document.getElementById('wsp-input').classList.add('error');
    valido = false;
  }

  if (!valido) return;

  document.getElementById('paso1').style.display  = 'none';
  document.getElementById('paso2').style.display  = 'grid';

  document.getElementById('prog1').classList.add('done');
  document.getElementById('prog2').classList.add('active');
  document.getElementById('progress-label').innerHTML =
    'Paso 2 de 3 — <strong>Sube tu comprobante</strong>';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Cantidad de tickets ───────────────────────────────────────
function cambiarCantidad(delta) {
  cantidadTickets = Math.max(1, cantidadTickets + delta);
  actualizarMontos();
}

// ── Promociones por combo ──────────────────────────────────────
// El descuento SOLO se aplica en estas 5 cantidades exactas — cualquier
// otra cantidad (1, 2, 4, 6, 8, 11...) paga el precio normal sin
// descuento. Es un % sobre el precio normal de ESE sorteo (cantidad ×
// precio_ticket), no un monto fijo igual para todos los sorteos. El
// monto final se redondea a la decena más cercana (ej: 132→130, 255→260).
const PORCENTAJES_POR_COMBO = { 3: 11, 5: 12, 7: 13, 9: 14, 10: 15 };

function porcentajeDescuentoPorCantidad(cantidad) {
  return PORCENTAJES_POR_COMBO[cantidad] || 0;
}

// Tickets de referencia que se muestran como accesos rápidos en el modal
// "Ver promos".
const TICKETS_PROMO_DESTACADOS = [3, 5, 7, 9, 10];

function comboActivoParaCantidad(cantidad = cantidadTickets) {
  const pct = porcentajeDescuentoPorCantidad(cantidad);
  if (!pct) return null;
  const precio = sorteoSeleccionado ? Number(sorteoSeleccionado.precio_ticket) : PRECIO_TICKET_DEFAULT;
  const total = cantidad * precio;
  const conDescuento = total * (1 - pct / 100);
  return Math.max(0, Math.round(conDescuento / 10) * 10); // redondeado a la decena más cercana
}

function actualizarMontos() {
  const cantEl  = document.getElementById('cantidad');
  const totalEl = document.getElementById('total-monto');
  const yapeEl  = document.getElementById('yape-monto');
  const aviso   = document.getElementById('promo-aplicada-aviso');
  const texto   = document.getElementById('promo-aplicada-texto');

  const precio      = sorteoSeleccionado ? Number(sorteoSeleccionado.precio_ticket) : PRECIO_TICKET_DEFAULT;
  const totalNormal = cantidadTickets * precio;
  const comboMonto  = comboActivoParaCantidad();
  const total       = comboMonto ?? totalNormal;

  if (cantEl)  cantEl.textContent = cantidadTickets;
  if (totalEl) totalEl.textContent = `S/ ${total}`;
  if (yapeEl)  yapeEl.textContent  = total;

  if (comboMonto != null && totalNormal > comboMonto && aviso && texto) {
    const pct = porcentajeDescuentoPorCantidad(cantidadTickets);
    texto.textContent = `${pct}% de descuento por llevar ${cantidadTickets} tickets`;
    aviso.style.display = 'block';
  } else if (aviso) {
    aviso.style.display = 'none';
  }
}

function abrirModalPromo() {
  // Los precios del modal se calculan al vuelo según el precio_ticket
  // del sorteo que el cliente está viendo — no son un monto fijo igual
  // para todos los sorteos.
  TICKETS_PROMO_DESTACADOS.forEach((cant) => {
    const elPrecio = document.getElementById(`promo-precio-${cant}`);
    if (elPrecio) elPrecio.textContent = `S/ ${comboActivoParaCantidad(cant)}`;
    const elPct = document.getElementById(`promo-pct-${cant}`);
    if (elPct) elPct.textContent = `-${porcentajeDescuentoPorCantidad(cant)}%`;
  });
  const modal = document.getElementById('modal-promo');
  if (modal) modal.style.display = 'flex';
}

function cerrarModalPromo(event) {
  if (event) event.preventDefault();
  const modal = document.getElementById('modal-promo');
  if (modal) modal.style.display = 'none';
}

// Botones del modal: solo fijan la cantidad — el combo se aplica solo
// porque esa cantidad ya está en PORCENTAJES_POR_COMBO.
function elegirPromo(cantidad) {
  cantidadTickets = cantidad;
  actualizarMontos();
  cerrarModalPromo();
}

// ── Código de seguridad y fecha del comprobante ────────────────
// Estos dos campos normalmente están ocultos: al subir la imagen, el
// servidor intenta leerlos directamente ahí (OCR). Solo se muestran si
// el servidor avisa que no logró leer alguno — "camposFaltantes" guarda
// exactamente cuáles pidió, y solo esos se exigen antes de reintentar.
let camposFaltantes = [];

const CAMPO_MANUAL_INPUT = {
  codigo_seguridad: 'codigo-seguridad-input',
  fecha_comprobante: 'fecha-comprobante-input',
};
const CAMPO_MANUAL_WRAPPER = {
  codigo_seguridad: 'campo-codigo-manual',
  fecha_comprobante: 'campo-fecha-manual',
};

function mostrarCampoManual(campo) {
  const wrapper = document.getElementById(CAMPO_MANUAL_WRAPPER[campo]);
  if (wrapper) wrapper.style.display = 'block';
}

function camposManualesCompletos() {
  return camposFaltantes.every((campo) => {
    const input = document.getElementById(CAMPO_MANUAL_INPUT[campo]);
    return input && input.value.trim().length > 0;
  });
}

function intentarEnvioAutomatico() {
  if (archivoComprobante && camposManualesCompletos()) {
    enviarComprobante();
  }
}

document.getElementById('codigo-seguridad-input').addEventListener('input', function () {
  this.classList.remove('error');
  intentarEnvioAutomatico();
});

document.getElementById('fecha-comprobante-input').addEventListener('change', function () {
  this.classList.remove('error');
  intentarEnvioAutomatico();
});

// ── Upload comprobante ────────────────────────────────────────
function triggerUpload() {
  document.getElementById('file-input').click();
}

function archivoSeleccionado(event) {
  const archivo = event.target.files[0];
  if (!archivo) return;

  archivoComprobante = archivo;

  const area    = document.getElementById('upload-area');
  const content = document.getElementById('upload-content');

  area.classList.add('uploaded');
  content.innerHTML = `
    <div class="upload-icon">✅</div>
    <div class="upload-text" style="color:#22c55e">¡Comprobante adjuntado!</div>
    <div style="font-size:12px;color:#6B7280;margin-top:4px">${archivo.name}</div>
  `;

  // Primer intento: no pedimos nada manual todavía — dejamos que el
  // servidor intente leer el código y la fecha de la propia imagen.
  if (camposManualesCompletos()) {
    enviarComprobante();
  }
}

// ── Enviar comprobante al servidor ──────────────────────────────
async function enviarComprobante() {
  if (!archivoComprobante || !sorteoSeleccionado || enviandoComprobante) return;
  if (!camposManualesCompletos()) return;

  const codigo = document.getElementById('codigo-seguridad-input').value.trim();
  const fecha  = document.getElementById('fecha-comprobante-input').value.trim();

  const doc      = document.getElementById('doc-input').value.trim();
  const wsp      = document.getElementById('wsp-input').value.trim();
  const nomInput = document.getElementById('input-nombres');
  const apInput  = document.getElementById('input-apellidos');

  const formData = new FormData();
  formData.append('documento', doc);
  formData.append('tipo_documento', docTipo);
  formData.append('nombres', nomInput.value.trim());
  formData.append('apellidos', apInput.value.trim());
  formData.append('whatsapp', wsp);
  formData.append('sorteo_id', sorteoSeleccionado.id);
  formData.append('cantidad', cantidadTickets);
  // Si el cliente todavía no los tiene (primer intento), se mandan vacíos
  // y el servidor los completa leyendo la imagen con OCR.
  formData.append('codigo_seguridad', codigo);
  formData.append('fecha_comprobante', fecha);
  // El monto lo recalcula el servidor por su cuenta (cantidad ×
  // precio_ticket del sorteo, menos el descuento por combo si aplica) —
  // no se manda el monto desde el navegador, nunca se confía en él.
  formData.append('archivo', archivoComprobante);

  const content = document.getElementById('upload-content');
  enviandoComprobante = true;

  try {
    const resp = await fetch(`${API_URL}/api/comprobantes`, {
      method: 'POST',
      body: formData,
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));

      // El servidor no pudo leer algo de la imagen — mostramos solo esos
      // campos y esperamos a que el cliente los complete. NO se limpia
      // archivoComprobante: al llenar el campo se reintenta solo.
      if (errData.error === 'ocr_incompleto' && Array.isArray(errData.faltan) && errData.faltan.length) {
        camposFaltantes = errData.faltan;
        camposFaltantes.forEach(mostrarCampoManual);
        content.innerHTML = `
          <div class="upload-icon">✍️</div>
          <div class="upload-text" style="color:#A50044">Necesitamos que confirmes un dato</div>
          <div style="font-size:12px;color:#6B7280;margin-top:4px">No logramos leer todo de tu imagen — completa el campo marcado abajo.</div>
        `;
        enviandoComprobante = false;
        const primerCampo = document.getElementById(CAMPO_MANUAL_INPUT[camposFaltantes[0]]);
        if (primerCampo) primerCampo.focus();
        return;
      }

      throw new Error(errData.error || 'Error al subir el comprobante');
    }

    setTimeout(() => irPaso3(), 800);
  } catch (err) {
    console.error('Error al enviar comprobante:', err);
    content.innerHTML = `
      <div class="upload-icon">⚠️</div>
      <div class="upload-text" style="color:#A50044">No se pudo enviar el comprobante</div>
      <div style="font-size:12px;color:#6B7280;margin-top:4px">${err.message}. Intenta de nuevo.</div>
    `;
    document.getElementById('upload-area').classList.remove('uploaded');
    archivoComprobante = null;
    enviandoComprobante = false;
  }
}

// ── Ir a Paso 3 ───────────────────────────────────────────────
function irPaso3() {
  const wsp = document.getElementById('wsp-input').value.trim();

  document.getElementById('paso2').style.display = 'none';
  document.getElementById('paso3').style.display = 'block';

  document.getElementById('wsp-confirm').textContent    = `+51 ${wsp}`;
  document.getElementById('confirm-tickets').textContent = `${cantidadTickets} ticket${cantidadTickets > 1 ? 's' : ''}`;
  const totalConfirmado = comboActivoParaCantidad()
    ?? cantidadTickets * (sorteoSeleccionado ? Number(sorteoSeleccionado.precio_ticket) : PRECIO_TICKET_DEFAULT);
  document.getElementById('confirm-monto').textContent  = `S/ ${totalConfirmado}`;
  document.getElementById('confirm-nombre').textContent = nombreCompleto;
  actualizarNombreSorteo();

  document.getElementById('prog2').classList.add('done');
  document.getElementById('prog3').classList.add('active');
  document.getElementById('progress-label').innerHTML = 'Paso 3 de 3 — <strong>¡Listo!</strong>';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Copiar Yape ───────────────────────────────────────────────
function copiarYape() {
  navigator.clipboard.writeText('926636117').then(() => {
    const btn = document.querySelector('.btn-copiar');
    btn.textContent = '✅ ¡Copiado!';
    setTimeout(() => { btn.textContent = '📋 Copiar número'; }, 2000);
  });
}
