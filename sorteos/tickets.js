// ════════════════════════════════════════════════════════════════
// Configuración del servidor API
// Si en algún momento subes el backend a internet, solo cambia esta línea
// ════════════════════════════════════════════════════════════════
const API_URL = 'http://localhost:3000';

// ── Estado ────────────────────────────────────────────────────
let modoExtranjeria = false;

// ── Toggle extranjería ────────────────────────────────────────
function toggleExtranjeria() {
  modoExtranjeria = !modoExtranjeria;
  const input   = document.getElementById('doc-input');
  const btn     = document.getElementById('btn-extranjeria');
  const msg     = document.getElementById('extranjeria-msg');
  const label   = document.getElementById('input-label');

  if (modoExtranjeria) {
    input.maxLength   = 12;
    input.placeholder = 'Ingresa tu carné';
    input.inputMode   = 'text';
    input.classList.add('extranjeria');
    btn.classList.add('active');
    btn.textContent   = '✅ Carné de extranjería activado';
    label.textContent = 'Número de Carné de Extranjería';
    msg.style.display = 'block';
  } else {
    input.maxLength   = 8;
    input.placeholder = 'Ingresa tu DNI';
    input.inputMode   = 'numeric';
    input.classList.remove('extranjeria');
    btn.classList.remove('active');
    btn.textContent   = '🌍 Tengo carné de extranjería';
    label.textContent = 'Número de DNI';
    msg.style.display = 'none';
  }

  input.value = '';
  input.focus();
  limpiarResultado();
}

// ── Validar input ─────────────────────────────────────────────
document.getElementById('doc-input').addEventListener('input', function () {
  if (!modoExtranjeria) {
    // Solo números para DNI
    this.value = this.value.replace(/\D/g, '');
  }
  this.classList.remove('error');
  limpiarResultado();
});

// También permite consultar con Enter
document.getElementById('doc-input').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') consultarTickets();
});

// ── Limpiar resultado ─────────────────────────────────────────
function limpiarResultado() {
  const res = document.getElementById('resultado');
  res.style.display = 'none';
  res.innerHTML = '';
}

// ── Mostrar estado "buscando..." ───────────────────────────────
function mostrarCargando() {
  const res = document.getElementById('resultado');
  res.style.display = 'block';
  res.innerHTML = `<div class="error-msg" style="background:#EAF1FB;color:#004D98;">🔍 Buscando tus tickets...</div>`;
}

// ── Consultar tickets (ahora contra el servidor real) ──────────
async function consultarTickets() {
  const input    = document.getElementById('doc-input');
  const valor    = input.value.trim();
  const minLen   = modoExtranjeria ? 6 : 8;
  const maxLen   = modoExtranjeria ? 12 : 8;

  // Validación
  if (!valor) {
    input.classList.add('error');
    mostrarError('Por favor ingresa tu número de documento.');
    return;
  }

  if (!modoExtranjeria && !/^\d+$/.test(valor)) {
    input.classList.add('error');
    mostrarError('El DNI solo debe contener números.');
    return;
  }

  if (valor.length < minLen || valor.length > maxLen) {
    input.classList.add('error');
    mostrarError(
      modoExtranjeria
        ? `El carné debe tener entre ${minLen} y ${maxLen} caracteres.`
        : `El DNI debe tener exactamente 8 dígitos.`
    );
    return;
  }

  input.classList.remove('error');
  mostrarCargando();

  try {
    const resp = await fetch(`${API_URL}/api/tickets/${valor}`);

    if (!resp.ok) {
      throw new Error('Error del servidor');
    }

    const data = await resp.json();

    if (data.encontrado) {
      mostrarResultado(data);
    } else {
      mostrarNoEncontrado(valor);
    }
  } catch (err) {
    console.error('Error al consultar tickets:', err);
    mostrarErrorConexion();
  }
}

// ── Mostrar error inline ──────────────────────────────────────
function mostrarError(msg) {
  const res = document.getElementById('resultado');
  res.style.display = 'block';
  res.innerHTML = `<div class="error-msg">⚠️ ${msg}</div>`;
}

// ── Mostrar error de conexión con el servidor ──────────────────
function mostrarErrorConexion() {
  const res = document.getElementById('resultado');
  res.style.display = 'block';
  res.innerHTML = `
    <div class="no-encontrado">
      <span class="icon">⚠️</span>
      <h3>No pudimos conectar con el servidor</h3>
      <p>Verifica que el servidor esté corriendo en <strong>${API_URL}</strong>.<br>
         Si el problema persiste, contáctanos por WhatsApp.</p>
    </div>
  `;
}

// ── Mostrar no encontrado ─────────────────────────────────────
function mostrarNoEncontrado(doc) {
  const res = document.getElementById('resultado');
  res.style.display = 'block';
  res.innerHTML = `
    <div class="no-encontrado">
      <span class="icon">🔍</span>
      <h3>No encontramos tickets para este documento</h3>
      <p>El ${modoExtranjeria ? 'carné' : 'DNI'} <strong>${doc}</strong> no tiene tickets registrados.<br>
         Si realizaste un pago y no ves tus tickets, contáctanos por WhatsApp.</p>
    </div>
  `;
}

// ── Mostrar resultado ─────────────────────────────────────────
function mostrarResultado(data) {
  const res = document.getElementById('resultado');
  res.style.display = 'block';

  // Card del participante
  let html = `
    <div class="participante-card">
      <div class="participante-avatar">👤</div>
      <div class="participante-info">
        <span class="participante-eyebrow">PARTICIPANTE</span>
        <div class="participante-nombre">${data.nombre}</div>
        <div class="participante-meta">${data.totalTickets} ticket${data.totalTickets !== 1 ? 's' : ''} en total · datos protegidos 🔒</div>
      </div>
    </div>
  `;

  // Sorteos y tickets
  data.sorteos.forEach(sorteo => {
    const fechaFmt = formatearFecha(sorteo.fecha);
    html += `
      <div class="sorteo-section">
        <div class="sorteo-header">
          <div>
            <div class="sorteo-title">${sorteo.nombre}</div>
            <span class="sorteo-fecha">📅 Sorteo ${fechaFmt}</span>
          </div>
          <div class="ticket-count-badge">
            ${sorteo.tickets.length} 🎫
          </div>
        </div>
        <div class="tickets-grid">
          ${sorteo.tickets.map(num => crearTicketHTML(num, sorteo, fechaFmt)).join('')}
        </div>
      </div>
    `;
  });

  res.innerHTML = html;
}

// ── Formatear fecha que viene del servidor (ISO) a texto legible ──
function formatearFecha(fechaISO) {
  const d = new Date(fechaISO);
  const dia = d.toLocaleDateString('es-PE', { day: 'numeric', month: 'long' });
  const hora = d.toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${dia} · ${hora}`;
}

// ── Crear HTML de un ticket visual ───────────────────────────
function crearTicketHTML(numero, sorteo, fechaFmt) {
  return `
    <div class="ticket-visual">
      <div class="ticket-bg-circle"></div>
      <div class="ticket-header">
        <div class="ticket-sorteo-name">${sorteo.nombre.toUpperCase()}</div>
        <div class="ticket-label">TICKET</div>
      </div>
      <div class="ticket-number">${numero}</div>
      <hr class="ticket-divider">
      <div class="ticket-footer">
        <div class="ticket-empresa">DESEO UN PREMIO</div>
        <div class="ticket-fecha-sorteo">Sorteo ${fechaFmt.split('·')[0].trim()}</div>
      </div>
    </div>
  `;
}