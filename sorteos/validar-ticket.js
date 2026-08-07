const API_URL = (window.API_BASE_URL || 'http://localhost:3000/api').replace(/\/api\/?$/, '');
const numero = new URLSearchParams(window.location.search).get('numero');

function ocultarDocumento(documento) {
  const valor = String(documento || '').trim();
  if (valor.length <= 2) return valor;
  return `${'*'.repeat(Math.max(0, valor.length - 2))}${valor.slice(-2)}`;
}

function formatearFecha(fechaISO) {
  if (!fechaISO) return 'Por confirmar';

  const fecha = new Date(fechaISO);
  if (Number.isNaN(fecha.getTime())) return 'Por confirmar';

  return fecha.toLocaleString('es-PE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function mostrarInvalido(mensaje) {
  document.getElementById('loading').hidden = true;
  document.getElementById('valid').hidden = true;
  document.getElementById('invalid').hidden = false;
  document.getElementById('invalid-message').textContent = mensaje;
}

function mostrarValido(ticket) {
  document.getElementById('loading').hidden = true;
  document.getElementById('invalid').hidden = true;
  document.getElementById('valid').hidden = false;

  document.getElementById('v-numero').textContent = ticket.numero;
  document.getElementById('v-participante').textContent = ticket.participante || '—';
  document.getElementById('v-documento').textContent = ocultarDocumento(ticket.documento);
  document.getElementById('v-sorteo').textContent = ticket.sorteo || '—';
  document.getElementById('v-premio').textContent = ticket.premio || '—';
  document.getElementById('v-fecha').textContent = formatearFecha(ticket.fecha_sorteo);
  document.getElementById('v-estado').textContent =
    ticket.estado_pago === 'aprobado' ? '✅ Aprobado' : ticket.estado_pago || '—';

  document.getElementById('v-codigo').textContent = `DUP-${ticket.numero}`;

  document.getElementById('btn-ver-ticket').href =
    `ticket.html?numero=${encodeURIComponent(ticket.numero)}`;
}

async function validar() {
  if (!numero) {
    mostrarInvalido('El enlace no contiene un número de ticket.');
    return;
  }

  try {
    const resp = await fetch(
      `${API_URL}/api/ticket/${encodeURIComponent(numero)}`,
      { cache: 'no-store' }
    );

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      throw new Error(data.error || 'Ticket no encontrado.');
    }

    if (!data.valido) {
      mostrarInvalido('El ticket existe, pero actualmente no se encuentra aprobado.');
      return;
    }

    mostrarValido(data);
  } catch (error) {
    console.error(error);
    mostrarInvalido(error.message || 'No pudimos validar este ticket.');
  }
}

document.addEventListener('DOMContentLoaded', validar);
