const API_URL = (window.API_BASE_URL || 'http://localhost:3000/api').replace(/\/api\/?$/, '');

let tipoDocumento = 'dni';

function escaparHTML(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatearFecha(fechaISO) {
  if (!fechaISO) return 'Fecha no disponible';

  const fecha = new Date(fechaISO);

  if (Number.isNaN(fecha.getTime())) {
    return 'Fecha no disponible';
  }

  return fecha.toLocaleString('es-PE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatearFechaSorteo(fechaISO) {
  if (!fechaISO) return 'Fecha por confirmar';

  const fecha = new Date(fechaISO);

  if (Number.isNaN(fecha.getTime())) {
    return 'Fecha por confirmar';
  }

  return fecha.toLocaleString('es-PE', {
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function estadoPresentacion(estado) {
  if (estado === 'aprobado') {
    return {
      clase: 'approved',
      icono: '✅',
      titulo: 'Ticket Aprobado',
      texto: 'Tu pago fue aprobado y tu participación está confirmada.',
    };
  }

  if (estado === 'rechazado') {
    return {
      clase: 'rejected',
      icono: '❌',
      titulo: 'Comprobante Rechazado',
      texto: 'No pudimos validar este comprobante. Comunícate con atención al cliente.',
    };
  }

  return {
    clase: 'pending',
    icono: '⏳',
    titulo: 'Ticket Pendiente',
    texto: 'Estamos verificando tu comprobante. No necesitas volver a registrarte.',
  };
}

function obtenerDocumento() {
  return document.getElementById('doc-input').value.trim();
}

function limpiarResultado() {
  const resultado = document.getElementById('resultado');
  resultado.hidden = true;
  resultado.innerHTML = '';
}

function cambiarTipoDocumento(nuevoTipo) {
  tipoDocumento = nuevoTipo;

  document.querySelectorAll('.type-btn').forEach((boton) => {
    boton.classList.toggle('active', boton.dataset.type === nuevoTipo);
  });

  const input = document.getElementById('doc-input');
  const label = document.getElementById('document-label');

  input.value = '';
  input.classList.remove('error');

  if (nuevoTipo === 'ce') {
    label.textContent = 'Número de carné de extranjería';
    input.placeholder = 'Ingresa tu carné';
    input.maxLength = 12;
    input.inputMode = 'text';
  } else {
    label.textContent = 'Número de DNI';
    input.placeholder = 'Ingresa tu DNI';
    input.maxLength = 8;
    input.inputMode = 'numeric';
  }

  limpiarResultado();
  input.focus();
}

function validarDocumento() {
  const input = document.getElementById('doc-input');
  const valor = input.value.trim();

  input.classList.remove('error');

  if (!valor) {
    input.classList.add('error');
    mostrarMensaje('error', '⚠️', 'Ingresa tu documento', 'Necesitamos tu documento para consultar el historial.');
    return false;
  }

  if (tipoDocumento === 'dni' && !/^\d{8}$/.test(valor)) {
    input.classList.add('error');
    mostrarMensaje('error', '⚠️', 'DNI inválido', 'El DNI debe tener exactamente 8 dígitos.');
    return false;
  }

  if (tipoDocumento === 'ce' && (valor.length < 6 || valor.length > 12)) {
    input.classList.add('error');
    mostrarMensaje('error', '⚠️', 'Carné inválido', 'Ingresa entre 6 y 12 caracteres.');
    return false;
  }

  return true;
}

function mostrarMensaje(tipo, icono, titulo, texto) {
  const resultado = document.getElementById('resultado');
  const clase = tipo === 'error'
    ? 'error-card'
    : tipo === 'empty'
      ? 'empty-card'
      : 'loading-card';

  resultado.hidden = false;
  resultado.innerHTML = `
    <div class="${clase}">
      <span class="state-icon">${icono}</span>
      <h3>${escaparHTML(titulo)}</h3>
      <p>${escaparHTML(texto)}</p>
    </div>
  `;
}

async function consultarHistorial() {
  if (!validarDocumento()) return;

  const documento = obtenerDocumento();
  const boton = document.getElementById('btn-consultar');

  mostrarMensaje(
    'loading',
    '🔎',
    'Buscando tus participaciones...',
    'Estamos consultando tus compras y tickets.'
  );

  boton.disabled = true;
  boton.textContent = 'Consultando...';

  try {
    const resp = await fetch(
      `${API_URL}/api/tickets/${encodeURIComponent(documento)}`,
      { cache: 'no-store' }
    );

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      throw new Error(data.error || 'No se pudo consultar el historial.');
    }

    if (!data.encontrado) {
      mostrarMensaje(
        'empty',
        '🔍',
        'Aún no tienes compras registradas',
        'Si acabas de realizar una compra, verifica que hayas usado este mismo documento.'
      );
      return;
    }

    pintarHistorial(data);
  } catch (error) {
    console.error(error);

    mostrarMensaje(
      'error',
      '⚠️',
      'No pudimos consultar tus tickets',
      'Inténtalo nuevamente en unos segundos o comunícate con atención al cliente.'
    );
  } finally {
    boton.disabled = false;
    boton.textContent = 'Consultar historial →';
  }
}

function pintarHistorial(data) {
  const resultado = document.getElementById('resultado');
  const compras = Array.isArray(data.compras) ? data.compras : [];

  resultado.hidden = false;

  const totalCompras = compras.length;
  const totalAprobados = compras.reduce(
    (total, compra) => total + (compra.estado === 'aprobado' ? Number(compra.cantidad || 0) : 0),
    0
  );

  const perfil = `
    <div class="customer-card">
      <div class="customer-main">
        <div class="customer-avatar">👤</div>

        <div>
          <span class="purchase-kicker">PARTICIPANTE</span>
          <div class="customer-name">${escaparHTML(data.nombre)}</div>
          <div class="customer-meta">
            ${totalCompras} compra${totalCompras === 1 ? '' : 's'} registrada${totalCompras === 1 ? '' : 's'}
            · ${totalAprobados} ticket${totalAprobados === 1 ? '' : 's'} aprobado${totalAprobados === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <div class="history-count">${totalCompras} compra${totalCompras === 1 ? '' : 's'}</div>
    </div>
  `;

  const historial = compras.length
    ? compras.map(crearCompraHTML).join('')
    : `
      <div class="empty-card">
        <span class="state-icon">🎟</span>
        <h3>No encontramos compras</h3>
        <p>Este participante todavía no tiene comprobantes registrados.</p>
      </div>
    `;

  resultado.innerHTML = `
    ${perfil}
    <div class="history-list">${historial}</div>
  `;
}

function crearCompraHTML(compra) {
  const estado = estadoPresentacion(compra.estado);
  const tickets = Array.isArray(compra.tickets) ? compra.tickets : [];
  const premio = compra.premio || 'Premio del sorteo';

  const ticketsHTML = compra.estado === 'aprobado'
    ? `
      <div class="tickets-box">
        <div class="tickets-title">TUS TICKETS</div>
        <div class="ticket-list">
          ${
            tickets.length
              ? tickets.map((numero) =>
                  `<a class="ticket-number ticket-link"
                      href="ticket.html?numero=${encodeURIComponent(numero)}"
                      aria-label="Ver ticket oficial ${escaparHTML(numero)}">
                    <span>🎟 ${escaparHTML(numero)}</span>
                    <small>Ver Ticket Oficial →</small>
                  </a>`
                ).join('')
              : '<div class="ticket-number">Generando ticket…</div>'
          }
        </div>
      </div>
    `
    : '';

  return `
    <article class="purchase-card">
      <div class="purchase-head">
        <div>
          <span class="purchase-kicker">COMPRA #${escaparHTML(compra.id)}</span>
          <h2 class="purchase-title">${escaparHTML(compra.sorteo)}</h2>
          <div class="purchase-prize">🏆 Premio: ${escaparHTML(premio)}</div>
        </div>

        <div class="purchase-total">
          <strong>S/ ${Number(compra.monto || 0).toFixed(0)}</strong>
          <span>TOTAL PAGADO</span>
        </div>
      </div>

      <div class="purchase-info">
        <span class="info-chip">🎟 ${Number(compra.cantidad || 0)} ticket(s)</span>
        <span class="info-chip">🧾 Compra: ${escaparHTML(formatearFecha(compra.fecha_compra))}</span>
        <span class="info-chip">📅 Sorteo: ${escaparHTML(formatearFechaSorteo(compra.fecha_sorteo))}</span>
      </div>

      <div class="purchase-status ${estado.clase}">
        <div class="status-icon">${estado.icono}</div>
        <div>
          <div class="status-label">${estado.titulo}</div>
          <div class="status-sub">${estado.texto}</div>
        </div>
      </div>

      ${ticketsHTML}

      <div class="purchase-actions">
        <a class="btn-detail"
           href="estado-compra.html?id=${encodeURIComponent(compra.id)}">
          Ver detalle de esta compra →
        </a>
      </div>
    </article>
  `;
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('doc-input');

  document.querySelectorAll('.type-btn').forEach((boton) => {
    boton.addEventListener('click', () => cambiarTipoDocumento(boton.dataset.type));
  });

  document.getElementById('btn-consultar')
    .addEventListener('click', consultarHistorial);

  input.addEventListener('input', () => {
    if (tipoDocumento === 'dni') {
      input.value = input.value.replace(/\D/g, '');
    } else {
      input.value = input.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    }

    input.classList.remove('error');
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      consultarHistorial();
    }
  });
});
