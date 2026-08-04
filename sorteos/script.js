// ── Countdown Timer ───────────────────────────────────────────
// El banner "Próximo sorteo" ya NO tiene una fecha fija en el HTML:
// se calcula solo con el sorteo ACTIVO cuya fecha_sorteo sea la más
// cercana en el futuro (ver actualizarCountdownProximoSorteo, que se
// llama después de cargar los sorteos desde la API). Si no hay ningún
// sorteo activo con fecha futura, el banner completo se oculta —
// así un sorteo desactivado (o uno cuya fecha ya pasó) nunca se queda
// mostrado por accidente.
let targetDate = null;

function updateCountdown() {
  if (!targetDate) return;
  const now = new Date();
  const diff = targetDate - now;

  if (diff <= 0) {
    document.getElementById('days').textContent = '00';
    document.getElementById('hours').textContent = '00';
    document.getElementById('minutes').textContent = '00';
    document.getElementById('seconds').textContent = '00';
    return;
  }

  const days    = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours   = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  document.getElementById('days').textContent    = String(days).padStart(2, '0');
  document.getElementById('hours').textContent   = String(hours).padStart(2, '0');
  document.getElementById('minutes').textContent = String(minutes).padStart(2, '0');
  document.getElementById('seconds').textContent = String(seconds).padStart(2, '0');
}

setInterval(updateCountdown, 1000);

// Elige, entre los sorteos activos ya cargados, el que tenga la fecha
// más próxima (y todavía no pasada) para mostrarlo en el banner.
// Si ninguno califica, oculta el banner en vez de mostrar algo viejo.
function actualizarCountdownProximoSorteo(sorteosActivos) {
  const seccion = document.getElementById('countdown-section');
  if (!seccion) return;

  const ahora = new Date();
  const candidatos = (sorteosActivos || [])
    .filter(s => new Date(s.fecha_sorteo) > ahora)
    .sort((a, b) => new Date(a.fecha_sorteo) - new Date(b.fecha_sorteo));

  if (candidatos.length === 0) {
    seccion.style.display = 'none';
    targetDate = null;
    return;
  }

  const proximo = candidatos[0];
  targetDate = new Date(proximo.fecha_sorteo);

  const fechaStr = targetDate.toLocaleDateString('es-PE', { day: 'numeric', month: 'long' });
  const horaStr  = targetDate.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

  document.getElementById('countdown-nombre').textContent = proximo.nombre;
  document.getElementById('countdown-fecha-texto').textContent = `📅 ${fechaStr} · ${horaStr}`;

  seccion.style.display = '';
  updateCountdown();
}

// ── Toggle Premios ────────────────────────────────────────────
function togglePremios(id) {
  const list   = document.getElementById(id);
  const toggle = list.previousElementSibling;
  const arrow  = toggle.querySelector('.toggle-arrow');

  list.classList.toggle('show');
  arrow.classList.toggle('open');
}

// ── Copiar número Yape ────────────────────────────────────────
function copyNumber() {
  navigator.clipboard.writeText('964146346').then(() => {
    const btn = document.querySelector('.btn-copy');
    const original = btn.textContent;
    btn.textContent = '✅ ¡Copiado!';
    btn.style.background = 'rgba(0,200,100,0.3)';
    setTimeout(() => {
      btn.textContent = original;
      btn.style.background = '';
    }, 2000);
  });
}

// ── Animación de parpadeo de ojos ─────────────────────────────
function blinkEyes() {
  const eyeL = document.getElementById('eyeL');
  const eyeR = document.getElementById('eyeR');
  if (!eyeL) return;

  // Cerrar ojos
  eyeL.setAttribute('ry', '1');
  eyeR.setAttribute('ry', '1');

  setTimeout(() => {
    eyeL.setAttribute('ry', '5.5');
    eyeR.setAttribute('ry', '5.5');
  }, 150);
}

// Parpadear cada 3-5 segundos aleatoriamente
function scheduleBlink() {
  const delay = 3000 + Math.random() * 2000;
  setTimeout(() => {
    blinkEyes();
    scheduleBlink();
  }, delay);
}

scheduleBlink();

// ── Scroll suave para nav links ───────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ── Animación entrada de cards al hacer scroll ────────────────
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.sorteo-card, .step, .ganador-card').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(24px)';
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  observer.observe(el);
});

// ── Modo claro / oscuro ────────────────────────────────────────
function applyTheme(isDark) {
  const icon = document.getElementById('theme-icon');
  document.body.classList.toggle('dark-mode', isDark);
  if (icon) icon.textContent = isDark ? '☀️' : '🌙';
}

function toggleTheme() {
  const isDark = !document.body.classList.contains('dark-mode');
  applyTheme(isDark);
  localStorage.setItem('deseoUnPremioTheme', isDark ? 'dark' : 'light');
}

(function initTheme() {
  const saved = localStorage.getItem('deseoUnPremioTheme');
  applyTheme(saved === 'dark');
})();

// ── Sorteos dinámicos desde la API (base de datos) ─────────────
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

const ORDINALES_PREMIO = ['1er', '2do', '3er', '4to', '5to', '6to', '7mo', '8vo', '9no', '10mo'];

function etiquetaPremio(i) {
  const ordinal = ORDINALES_PREMIO[i] || `${i + 1}to`;
  const emoji = i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🎁';
  return `${emoji} ${ordinal} Premio:`;
}

function renderSorteoCardPublico(s, destacado) {
  const fecha = new Date(s.fecha_sorteo);
  const fechaStr = fecha.toLocaleDateString('es-PE', { day: 'numeric', month: 'long' });
  const horaStr  = fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  const precio   = Math.round(Number(s.precio_ticket));
  const premios  = Array.isArray(s.premios) && s.premios.length ? s.premios : [s.premio];
  const premioId = `premios-pub-${s.id}`;

  const premiosHtml = premios.length > 1 ? `
    <div class="premios-toggle" onclick="togglePremios('${premioId}')">
      Ver premios (${premios.length}) <span class="toggle-arrow">▼</span>
    </div>
    <div class="premios-list" id="${premioId}">
      ${premios.map((p, i) => `<div class="premio-item">${etiquetaPremio(i)} ${escapeHtml(p)}</div>`).join('')}
    </div>
  ` : '';

  return `
    <div class="sorteo-card${destacado ? ' featured' : ''}">
      ${destacado ? '<div class="card-badge">🔥 MÁS POPULAR</div>' : ''}
      <div class="card-header">
        <div>
          <h2 class="card-title">${escapeHtml(s.nombre)}</h2>
          <p class="card-desc">🏆 Premio: ${escapeHtml(premios[0])}</p>
        </div>
        <div class="card-price${destacado ? '' : ' green'}">
          <span class="currency">S/</span>
          <span class="amount">${precio}</span>
          <span class="per-ticket">por ticket</span>
        </div>
      </div>
      <div class="card-meta">
        <span class="meta-item">📅 ${fechaStr}</span>
        <span class="meta-item">⏰ ${horaStr}</span>
      </div>
      ${premiosHtml}
      <a href="participar?sorteo=${s.id}" class="btn-participar">Participar →</a>
    </div>
  `;
}

async function cargarSorteosPublicos() {
  console.log('[carrusel] cargarSorteosPublicos() arrancó');
  const grid = document.getElementById('sorteos-grid-public');
  if (!grid) { console.log('[carrusel] no encontré #sorteos-grid-public en el HTML'); return; }

const apiBase = window.API_BASE_URL;

if (!apiBase) {
  console.error('API_BASE_URL no está definida. Revisa config.js');
  throw new Error('Configuración de API no disponible');
}
  console.log('[carrusel] pidiendo:', `${apiBase}/sorteos?estado=activo`);

  try {
    const res = await fetch(`${apiBase}/sorteos?estado=activo`);
    console.log('[carrusel] respuesta status:', res.status);
    if (!res.ok) throw new Error(`API respondió ${res.status}`);
    const sorteos = await res.json();
    console.log('[carrusel] sorteos recibidos:', sorteos.length, sorteos);

    if (!Array.isArray(sorteos) || sorteos.length === 0) {
      grid.innerHTML = `<p class="sorteos-empty">No hay sorteos activos por ahora. ¡Vuelve pronto!</p>`;
      ocultarControlesCarrusel();
      actualizarCountdownProximoSorteo([]);
      return;
    }

    sorteosCarrusel = sorteos;
    grid.innerHTML = sorteos.map((s, i) => renderSorteoCardPublico(s, i === 0)).join('');
    carruselIndex = 0;
    renderCarrusel();
    actualizarCountdownProximoSorteo(sorteos);
    console.log('[carrusel] listo, sorteosCarrusel.length =', sorteosCarrusel.length);
  } catch (err) {
    console.error('[carrusel] ERROR al cargar sorteos:', err);
    grid.innerHTML = `
      <div class="sorteos-error-card">
        <div class="error-status-icon" aria-hidden="true">⌁</div>
        <div class="error-status-copy">
          <strong>No se pudo conectar con el servidor de sorteos.</strong>
          <span>Intenta de nuevo más tarde.</span>
        </div>
        <button type="button" class="btn-reintentar" onclick="cargarSorteosPublicos()">
          ↻ <span>Reintentar</span>
        </button>
      </div>`;
    ocultarControlesCarrusel();
    actualizarCountdownProximoSorteo([]);
  }
}

document.addEventListener('DOMContentLoaded', cargarSorteosPublicos);

// ── Carrusel de sorteos ────────────────────────────────────────
// Muestra 1 sorteo a la vez en celular y 2 en pantallas más anchas,
// con flechas para navegar y puntos para saber en qué página estás.
let sorteosCarrusel = [];
let carruselIndex = 0;

function cardsPorVista() {
  return window.matchMedia('(min-width: 900px)').matches ? 2 : 1;
}

function ocultarControlesCarrusel() {
  const prev = document.getElementById('sorteos-prev');
  const next = document.getElementById('sorteos-next');
  const dots = document.getElementById('sorteos-dots');
  if (prev) prev.style.display = 'none';
  if (next) next.style.display = 'none';
  if (dots) dots.innerHTML = '';
}

function renderCarrusel() {
  const grid = document.getElementById('sorteos-grid-public');
  const prev = document.getElementById('sorteos-prev');
  const next = document.getElementById('sorteos-next');
  const dots = document.getElementById('sorteos-dots');
  if (!grid) return;

  const total = sorteosCarrusel.length;
  const porVista = cardsPorVista();

  // Si todos los sorteos ya caben en una sola vista, no hace falta carrusel
  if (total <= porVista) {
    grid.style.transform = 'translateX(0)';
    ocultarControlesCarrusel();
    return;
  }

  if (prev) prev.style.display = '';
  if (next) next.style.display = '';

  const maxIndex = Math.max(0, total - porVista);
  carruselIndex = Math.min(Math.max(carruselIndex, 0), maxIndex);

  const pct = 100 / porVista;
  grid.style.transform = `translateX(-${carruselIndex * pct}%)`;

  if (prev) prev.disabled = carruselIndex <= 0;
  if (next) next.disabled = carruselIndex >= maxIndex;

  if (dots) {
    const totalPaginas = Math.ceil(total / porVista);
    const paginaActual = Math.round(carruselIndex / porVista);
    dots.innerHTML = Array.from({ length: totalPaginas }).map((_, i) => `
      <button class="carousel-dot${i === paginaActual ? ' active' : ''}"
        onclick="irAPaginaSorteo(${i})" aria-label="Ir a la página ${i + 1}"></button>
    `).join('');
  }
}

function sorteoSiguiente() {
  const porVista = cardsPorVista();
  const maxIndex = Math.max(0, sorteosCarrusel.length - porVista);
  carruselIndex = Math.min(carruselIndex + porVista, maxIndex);
  renderCarrusel();
}

function sorteoAnterior() {
  const porVista = cardsPorVista();
  carruselIndex = Math.max(carruselIndex - porVista, 0);
  renderCarrusel();
}

function irAPaginaSorteo(pagina) {
  const porVista = cardsPorVista();
  carruselIndex = pagina * porVista;
  renderCarrusel();
}

let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(renderCarrusel, 150);
});
