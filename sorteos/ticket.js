const API_URL = (window.API_BASE_URL || 'http://localhost:3000/api').replace(/\/api\/?$/, '');

const numeroTicket = new URLSearchParams(window.location.search).get('numero');

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

function mostrarError(mensaje) {
  document.getElementById('loading-card').hidden = true;
  document.getElementById('ticket-card').hidden = true;
  document.getElementById('error-card').hidden = false;
  document.getElementById('error-text').textContent = mensaje;
}

function construirUrlValidacion(numero) {
  const rutaActual = window.location.pathname;
  const basePath = rutaActual.substring(0, rutaActual.lastIndexOf('/') + 1);

  return (
    `${window.location.origin}${basePath}validar-ticket.html` +
    `?numero=${encodeURIComponent(numero)}`
  );
}

function generarQr(numero) {
  const contenedor = document.getElementById('qr-code');
  contenedor.innerHTML = '';

  const urlTicket = construirUrlValidacion(numero);

  const linkValidacion = document.getElementById('btn-open-validation');
  if (linkValidacion) {
    linkValidacion.href = urlTicket;
  }

  if (typeof QRCode !== 'function') {
    contenedor.innerHTML = '<small>No se pudo cargar el QR.</small>';
    return;
  }

  new QRCode(contenedor, {
    text: urlTicket,
    width: 148,
    height: 148,
    correctLevel: QRCode.CorrectLevel.M,
  });
}

function pintarTicket(ticket) {
  document.getElementById('loading-card').hidden = true;
  document.getElementById('error-card').hidden = true;
  document.getElementById('ticket-card').hidden = false;

  document.getElementById('ticket-number').textContent = ticket.numero;
  document.getElementById('participant-name').textContent =
    ticket.participante || 'Participante';
  document.getElementById('participant-document').textContent =
    ocultarDocumento(ticket.documento);
  document.getElementById('raffle-name').textContent =
    ticket.sorteo || 'Sorteo';
  document.getElementById('raffle-prize').textContent =
    ticket.premio || 'Premio del sorteo';
  document.getElementById('raffle-date').textContent =
    formatearFecha(ticket.fecha_sorteo);
  document.getElementById('payment-status').textContent =
    ticket.estado_pago === 'aprobado' ? '✅ Aprobado' : ticket.estado_pago || '—';

  const codigo = `DUP-${ticket.numero}`;
  document.getElementById('verification-code').textContent = `Código: ${codigo}`;

  const estado = document.getElementById('ticket-status');
  estado.textContent = ticket.valido ? 'VÁLIDO' : 'NO VÁLIDO';

  if (!ticket.valido) {
    estado.style.background = '#ffe6e9';
    estado.style.color = '#a61f32';
  }

  generarQr(ticket.numero);
}


function mostrarToast(mensaje) {
  let toast = document.getElementById('ticket-toast');

  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ticket-toast';
    toast.className = 'ticket-toast';
    document.body.appendChild(toast);
  }

  toast.textContent = mensaje;
  toast.classList.add('visible');

  clearTimeout(window.__ticketToastTimer);
  window.__ticketToastTimer = setTimeout(() => {
    toast.classList.remove('visible');
  }, 2500);
}

function imprimirTicket() {
  window.print();
}

function compartirPorWhatsApp() {
  if (!numeroTicket) return;

  const url = construirUrlValidacion(numeroTicket);

  const mensaje =
    `🎟 Ticket Oficial - Deseo Un Premio\n\n` +
    `Ticket: ${numeroTicket}\n` +
    `Validar autenticidad: ${url}`;

  const destino = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
  window.open(destino, '_blank', 'noopener');
}

async function verificarNuevamente() {
  const boton = document.getElementById('btn-refresh');

  if (boton) {
    boton.disabled = true;
    boton.textContent = '↻ Verificando...';
  }

  await cargarTicket();

  if (boton) {
    boton.disabled = false;
    boton.textContent = '↻ Verificar nuevamente';
  }

  mostrarToast('Estado del ticket actualizado');
}

async function cargarTicket() {
  if (!numeroTicket) {
    mostrarError('El enlace no contiene un número de ticket.');
    return;
  }

  try {
    const resp = await fetch(
      `${API_URL}/api/ticket/${encodeURIComponent(numeroTicket)}`,
      { cache: 'no-store' }
    );

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      throw new Error(data.error || 'Ticket no encontrado.');
    }

    pintarTicket(data);
  } catch (error) {
    console.error(error);
    mostrarError(error.message || 'No se pudo consultar el ticket.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-print')?.addEventListener('click', imprimirTicket);
  document.getElementById('btn-whatsapp')?.addEventListener('click', compartirPorWhatsApp);
  document.getElementById('btn-refresh')?.addEventListener('click', verificarNuevamente);

  cargarTicket();
});
