const API_URL = (window.API_BASE_URL || 'http://localhost:3000/api').replace(/\/api\/?$/, '');
const compraId = new URLSearchParams(window.location.search).get('id');

let intervaloEstado = null;

function escaparHTML(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatearFecha(fechaISO) {
  if (!fechaISO) return 'Fecha por confirmar';

  const fecha = new Date(fechaISO);
  if (Number.isNaN(fecha.getTime())) return 'Fecha por confirmar';

  return fecha.toLocaleString('es-PE', {
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function pintarEstado(data) {
  document.getElementById('sorteo-nombre').textContent =
    data.sorteo?.nombre || 'Sorteo de Premios';

  document.getElementById('sorteo-premio').textContent =
    `🏆 Premio: ${data.sorteo?.premio || 'Premio del sorteo'}`;

  document.getElementById('monto').textContent =
    Number(data.monto || 0).toFixed(0);

  document.getElementById('cantidad').textContent =
    Number(data.cantidad || 0);

  document.getElementById('fecha-sorteo').textContent =
    formatearFecha(data.sorteo?.fecha);

  const panel = document.getElementById('status-panel');
  const icon = document.getElementById('status-icon');
  const title = document.getElementById('status-title');
  const desc = document.getElementById('status-description');
  const ticketsSection = document.getElementById('tickets-section');
  const ticketsGrid = document.getElementById('tickets-grid');

  panel.classList.remove('pendiente', 'aprobado', 'rechazado');
  panel.classList.add(data.estado);

  if (data.estado === 'aprobado') {
    icon.textContent = '✅';
    title.textContent = 'Ticket Aprobado';
    desc.textContent =
      '¡Tu participación está confirmada! Tus números de ticket ya fueron asignados.';

    const tickets = Array.isArray(data.tickets) ? data.tickets : [];
    ticketsGrid.innerHTML = tickets.length
      ? tickets.map((numero) =>
          `<div class="ticket-number">🎟 ${escaparHTML(numero)}</div>`
        ).join('')
      : '<div class="ticket-number">Generando ticket…</div>';

    ticketsSection.hidden = false;

    if (intervaloEstado) {
      clearInterval(intervaloEstado);
      intervaloEstado = null;
    }
  } else if (data.estado === 'rechazado') {
    icon.textContent = '❌';
    title.textContent = 'Comprobante rechazado';
    desc.textContent =
      'No pudimos validar el comprobante. Comunícate con atención al cliente para revisarlo.';
    ticketsSection.hidden = true;

    if (intervaloEstado) {
      clearInterval(intervaloEstado);
      intervaloEstado = null;
    }
  } else {
    icon.textContent = '⏳';
    title.textContent = 'Ticket Pendiente';
    desc.textContent =
      'Estamos validando tu comprobante. No necesitas volver a registrarte; esta pantalla se actualizará automáticamente.';
    ticketsSection.hidden = true;
  }
}

function mostrarError(mensaje) {
  document.getElementById('sorteo-nombre').textContent = 'No pudimos consultar tu compra';
  document.getElementById('status-title').textContent = 'Intenta nuevamente';
  document.getElementById('status-description').textContent = mensaje;
  document.getElementById('status-icon').textContent = '⚠️';
}

async function consultarEstado() {
  if (!compraId) {
    mostrarError('El enlace no contiene un identificador de compra válido.');
    return;
  }

  const boton = document.getElementById('btn-refresh');
  if (boton) {
    boton.disabled = true;
    boton.textContent = '↻ Consultando...';
  }

  try {
    const resp = await fetch(
      `${API_URL}/api/comprobantes/${encodeURIComponent(compraId)}/estado`,
      { cache: 'no-store' }
    );

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      throw new Error(data.error || 'No pudimos consultar el estado.');
    }

    pintarEstado(data);
  } catch (error) {
    console.error(error);
    mostrarError(error.message);
  } finally {
    if (boton) {
      boton.disabled = false;
      boton.textContent = '↻ Actualizar estado';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-refresh')?.addEventListener('click', consultarEstado);
  consultarEstado();

  intervaloEstado = setInterval(consultarEstado, 15000);
});

window.addEventListener('beforeunload', () => {
  if (intervaloEstado) clearInterval(intervaloEstado);
});
