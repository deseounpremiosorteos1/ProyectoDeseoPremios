// ════════════════════════════════════════════════════════════════
// Configuración del servidor API
// ════════════════════════════════════════════════════════════════
// Toma la URL configurada en config.js (window.API_BASE_URL incluye '/api' al final)
const API_URL = (window.API_BASE_URL || 'http://localhost:3001/api').replace(/\/api\/?$/, '');

// ── Estado global ─────────────────────────────────────────────
let docTipo         = 'dni';
let nombreCompleto   = '';
let cantidadTickets  = 1;
let sorteoSeleccionado = null;
let archivoComprobante = null;
let sorteosDisponibles = [];
let enviandoComprobante = false;

const PRECIO_TICKET_DEFAULT = 60;

// El id del sorteo llega por la URL (?sorteo=ID) desde la tarjeta en la
// que el usuario dio clic en "Participar →" en la página principal.
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

    // Usamos el sorteo indicado en la URL (el que el usuario eligió en la
    // página principal). Si no viene ninguno, o ya no está activo, caemos
    // al primer sorteo activo disponible.
    let elegido = null;
    if (sorteoIdDesdeUrl) {
      elegido = sorteosDisponibles.find(s => String(s.id) === String(sorteoIdDesdeUrl));
      if (!elegido) {
        mostrarErrorSorteos('Ese sorteo ya no está disponible. Te mostramos otro sorteo activo.');
      }
    }
    sorteoSeleccionado = elegido || sorteosDisponibles[0];

    actualizarNombreSorteo();
    actualizarMontos();
  } catch (err) {
    console.error('Error al cargar sorteos:', err);
    mostrarErrorSorteos('No se pudo conectar con el servidor. Verifica que esté corriendo.');
  }
}

// ── Mostrar el nombre del sorteo elegido (paso 1 y confirmación) ────
function actualizarNombreSorteo() {
  if (!sorteoSeleccionado) return;
  const banner = document.getElementById('sorteo-actual-nombre');
  if (banner) banner.textContent = sorteoSeleccionado.nombre;
  const confirm = document.getElementById('confirm-sorteo-nombre');
  if (confirm) confirm.textContent = sorteoSeleccionado.nombre;
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

// ── Buscar nombre por DNI (ahora contra el servidor real) ──────
async function buscarNombre(dni) {
  const msgEl      = document.getElementById('dni-msg');
  const camposNom  = document.getElementById('campos-nombres');

  // Mostrar buscando...
  msgEl.textContent = '🔍 Verificando DNI...';
  msgEl.className   = 'dni-msg buscando';
  camposNom.style.display = 'none';

  try {
    const resp = await fetch(`${API_URL}/api/participantes/${dni}`);
    const data = await resp.json();

    if (data.encontrado) {
      // ✅ Encontrado — mostrar datos precargados (solo lectura)
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
      // ❌ No encontrado — campos editables para ingresar manualmente
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

  // Validar documento
  if (docTipo === 'dni' && doc.length !== 8) {
    document.getElementById('doc-input').classList.add('error');
    valido = false;
  }
  if (docTipo === 'ext' && doc.length < 6) {
    document.getElementById('doc-input').classList.add('error');
    valido = false;
  }

  // Validar nombres
  if (nomInput && !nomInput.value.trim()) {
    nomInput.classList.add('error');
    valido = false;
  }
  if (apInput && !apInput.value.trim()) {
    apInput.classList.add('error');
    valido = false;
  }

  // Armar nombre completo
  if (nomInput && apInput) {
    nombreCompleto = `${nomInput.value.trim()} ${apInput.value.trim()}`;
  }

  if (!nombreCompleto.trim()) {
    valido = false;
  }

  // Validar WhatsApp
  if (wsp.length !== 9) {
    document.getElementById('wsp-input').classList.add('error');
    valido = false;
  }

  if (!valido) return;

  // Ir a paso 2
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

function actualizarMontos() {
  const precio = sorteoSeleccionado ? Number(sorteoSeleccionado.precio_ticket) : PRECIO_TICKET_DEFAULT;
  const total  = cantidadTickets * precio;
  const cantEl = document.getElementById('cantidad');
  const totalEl = document.getElementById('total-monto');
  const yapeEl  = document.getElementById('yape-monto');
  if (cantEl)  cantEl.textContent = cantidadTickets;
  if (totalEl) totalEl.textContent = `S/ ${total}`;
  if (yapeEl)  yapeEl.textContent  = total;
}

// ── Código de seguridad y fecha del comprobante ────────────────
// Estos dos campos normalmente están ocultos: el servidor intenta
// leerlos directamente de la imagen del comprobante. Solo se muestran
// si el servidor no logró leer alguno, y en cuanto el participante
// completa TODOS los que quedaron visibles, se reintenta el envío
// automáticamente (con el mismo archivo ya seleccionado, sin que
// tenga que volver a subirlo).
function camposManualesCompletos() {
  const grupoCodigo = document.getElementById('codigo-seguridad-group');
  const grupoFecha  = document.getElementById('fecha-comprobante-group');

  const codigoOk = grupoCodigo.style.display === 'none' ||
    document.getElementById('codigo-seguridad-input').value.trim().length >= 3;
  const fechaOk = grupoFecha.style.display === 'none' ||
    !!document.getElementById('fecha-comprobante-input').value;

  return codigoOk && fechaOk;
}

document.getElementById('codigo-seguridad-input').addEventListener('input', function () {
  this.classList.remove('error');
  if (archivoComprobante && camposManualesCompletos()) {
    enviarComprobante();
  }
});

document.getElementById('fecha-comprobante-input').addEventListener('input', function () {
  this.classList.remove('error');
  if (archivoComprobante && camposManualesCompletos()) {
    enviarComprobante();
  }
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
    <div class="upload-icon">⏳</div>
    <div class="upload-text">Leyendo comprobante...</div>
    <div style="font-size:12px;color:#6B7280;margin-top:4px">${archivo.name}</div>
  `;

  // Se envía directamente: el servidor intenta leer el código de
  // seguridad de la imagen. Si no puede, nos lo dice y ahí recién
  // mostramos el campo manual.
  enviarComprobante();
}

// ── Enviar comprobante al servidor ──────────────────────────────
async function enviarComprobante() {
  if (!archivoComprobante || !sorteoSeleccionado || enviandoComprobante) return;

  const codigoInput = document.getElementById('codigo-seguridad-input');
  const codigo = codigoInput.value.trim();
  // Si el grupo del código ya está visible es porque un intento anterior
  // no logró leerlo automáticamente, así que ahora sí es obligatorio.
  const codigoEsObligatorio = document.getElementById('codigo-seguridad-group').style.display !== 'none';
  if (codigoEsObligatorio && codigo.length < 3) {
    codigoInput.classList.add('error');
    return;
  }

  const fechaInput = document.getElementById('fecha-comprobante-input');
  const fecha = fechaInput.value.trim();
  // Igual que el código: si el grupo de fecha ya está visible es porque
  // el servidor no pudo leerla sola, así que ahora es obligatoria.
  const fechaEsObligatoria = document.getElementById('fecha-comprobante-group').style.display !== 'none';
  if (fechaEsObligatoria && !fecha) {
    fechaInput.classList.add('error');
    return;
  }

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
  formData.append('codigo_seguridad', codigo);
  formData.append('fecha_comprobante', fecha);
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

      if (errData.requiereCodigoManual || errData.requiereFechaManual) {
        // El servidor no pudo leer el código y/o la fecha de la imagen:
        // mostramos los campos manuales que falten y dejamos el
        // comprobante seleccionado para que no tenga que volver a
        // subirlo, solo completar el dato faltante.
        if (errData.requiereCodigoManual) {
          document.getElementById('codigo-seguridad-group').style.display = 'block';
          codigoInput.classList.add('error');
        }
        if (errData.requiereFechaManual) {
          document.getElementById('fecha-comprobante-group').style.display = 'block';
          fechaInput.classList.add('error');
        }
        (errData.requiereCodigoManual ? codigoInput : fechaInput).focus();

        content.innerHTML = `
          <div class="upload-icon">✅</div>
          <div class="upload-text" style="color:#22c55e">¡Comprobante adjuntado!</div>
          <div style="font-size:12px;color:#6B7280;margin-top:4px">${archivoComprobante.name}</div>
        `;
        enviandoComprobante = false;
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
  document.getElementById('confirm-monto').textContent   = `S/ ${cantidadTickets * (sorteoSeleccionado ? Number(sorteoSeleccionado.precio_ticket) : PRECIO_TICKET_DEFAULT)}`;
  document.getElementById('confirm-nombre').textContent  = nombreCompleto;

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
