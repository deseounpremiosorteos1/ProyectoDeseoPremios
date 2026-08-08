// ══════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ══════════════════════════════════════════════════════════════
// El usuario/contraseña del admin ya NO se validan aquí — los verifica
// el servidor real contra la tabla admins (o el .env en el primer arranque).
const API_BASE = window.API_BASE_URL || 'http://localhost:3001/api';

function getToken() {
  return sessionStorage.getItem('admin_token');
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ══════════════════════════════════════════════════════════════
// SORTEOS — ahora viven en PostgreSQL, se piden a la API
// ══════════════════════════════════════════════════════════════
let sorteosCache = [];

async function fetchSorteos() {
  try {
    const res = await fetch(`${API_BASE}/sorteos`);
    if (!res.ok) throw new Error(`API respondió ${res.status}`);
    sorteosCache = await res.json();
  } catch (err) {
    console.error('No se pudo cargar los sorteos desde la API:', err);
    sorteosCache = [];
    toast('⚠️ No se pudo conectar con la base de datos de sorteos');
  }
  return sorteosCache;
}

// ══════════════════════════════════════════════════════════════
// COMPROBANTES — también reales, vienen de PostgreSQL
// ══════════════════════════════════════════════════════════════
let comprobantesCache = [];

async function fetchComprobantes() {
  try {
    const res = await fetch(`${API_BASE}/admin/comprobantes`, { headers: authHeaders() });
    if (res.status === 401) { logout(); return []; }
    if (!res.ok) throw new Error(`API respondió ${res.status}`);
    comprobantesCache = await res.json();
  } catch (err) {
    console.error('No se pudo cargar los comprobantes desde la API:', err);
    comprobantesCache = [];
  }
  return comprobantesCache;
}

// ── Notificaciones de comprobantes nuevos ──────────────────────
// Guardamos en localStorage qué comprobantes ya "vimos" para no
// repetir la alerta cada vez que se refresca la lista.
function idsYaNotificados() {
  try {
    return new Set(JSON.parse(localStorage.getItem('comprobantes_notificados') || '[]'));
  } catch {
    return new Set();
  }
}

function guardarIdsNotificados(set) {
  localStorage.setItem('comprobantes_notificados', JSON.stringify([...set]));
}

function detectarNuevosPendientes() {
  const vistos = idsYaNotificados();
  const pendientesAhora = comprobantesCache.filter(c => c.estado === 'pendiente');

  // Primera vez que se abre el panel: no alertamos por el historial que ya existía.
  if (!localStorage.getItem('comprobantes_notificados')) {
    guardarIdsNotificados(new Set(pendientesAhora.map(c => c.id)));
    return;
  }

  const nuevos = pendientesAhora.filter(c => !vistos.has(c.id));
  nuevos.forEach(c => {
    toast(`🔔 Nuevo comprobante de ${c.nombres} ${c.apellidos} — ${c.cantidad} ticket${c.cantidad > 1 ? 's' : ''}`);
    vistos.add(c.id);
  });
  if (nuevos.length) guardarIdsNotificados(vistos);
}

// ══════════════════════════════════════════════════════════════
// LOGIN — contra la API real (POST /api/admin/login)
// ══════════════════════════════════════════════════════════════
async function login() {
  const usuario  = document.getElementById('user-input')?.value.trim();
  const password = document.getElementById('pass-input')?.value;
  const err = document.getElementById('login-error');
  const btn = document.querySelector('.btn-login');

  if (err) err.style.display = 'none';
  if (btn) { btn.disabled = true; btn.textContent = 'Entrando…'; }

  try {
    const res = await fetch(`${API_BASE}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, password }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) throw new Error(data.error || 'Usuario o contraseña incorrectos');

    sessionStorage.setItem('admin_token', data.token);
    sessionStorage.setItem('admin_logged', '1');
    window.location.href = '/admin/dashboard.html';
  } catch (e) {
    if (err) {
      err.textContent = '❌ ' + e.message;
      err.style.display = 'block';
    }
    const passInput = document.getElementById('pass-input');
    if (passInput) { passInput.value = ''; passInput.focus(); }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Entrar al panel'; }
  }
}

function togglePass() {
  const inp = document.getElementById('pass-input');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

function logout() {
  sessionStorage.removeItem('admin_logged');
  sessionStorage.removeItem('admin_token');
  window.location.href = '/admin/index.html';
}

// ══════════════════════════════════════════════════════════════
// GUARD — verificar sesión en dashboard
// ══════════════════════════════════════════════════════════════
if (window.location.pathname.includes('dashboard')) {
  if (!sessionStorage.getItem('admin_logged')) {
    window.location.href = '/admin/index.html';
  }
}

// ══════════════════════════════════════════════════════════════
// INIT DASHBOARD
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  if (!document.getElementById('sec-dashboard')) return;

  // Fecha hoy
  const hoy = new Date();
  const fechaStr = hoy.toLocaleDateString('es-PE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  const el = document.getElementById('fecha-hoy');
  if (el) el.textContent = fechaStr.charAt(0).toUpperCase() + fechaStr.slice(1);

  await fetchSorteos();
  await fetchComprobantes();
  detectarNuevosPendientes();

  renderDashboard();
  renderComprobantes();
  renderParticipantes();
  renderSorteos();
  poblarSelectSorteoCompradores();
  renderCompradores();
  renderEstadisticas();
  actualizarBadge();

  // Revisa cada 15s si llegaron comprobantes nuevos y avisa con un toast
  setInterval(async () => {
    await fetchComprobantes();
    detectarNuevosPendientes();
    renderDashboard();
    renderComprobantes(
      document.getElementById('filtro-estado')?.value || 'todos',
      document.getElementById('search-comp')?.value || ''
    );
    renderParticipantes(document.getElementById('search-part')?.value || '');
    renderCompradores();
    renderEstadisticas();
    actualizarBadge();
  }, 15000);
});

// ══════════════════════════════════════════════════════════════
// NAVEGACIÓN
// ══════════════════════════════════════════════════════════════
const secTitles = {
  dashboard:    'Dashboard',
  comprobantes: 'Comprobantes',
  participantes:'Participantes',
  sorteos:      'Sorteos',
  compradores:  'Compradores',
  estadisticas: 'Estadísticas',
};

function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById(`sec-${name}`)?.classList.add('active');
  document.querySelector(`[data-section="${name}"]`)?.classList.add('active');

  const t = document.getElementById('topbar-title');
  if (t) t.textContent = secTitles[name] || name;

  // Cerrar sidebar en móvil
  document.getElementById('sidebar')?.classList.remove('open');
  return false;
}

function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('open');
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════
function renderDashboard() {
  const aprobados  = comprobantesCache.filter(c => c.estado === 'aprobado');
  const pendientes = comprobantesCache.filter(c => c.estado === 'pendiente');
  const totalTk    = aprobados.reduce((s, c) => s + c.cantidad, 0);
  // Postgres devuelve las columnas NUMERIC como texto — hay que forzar a número.
  const recaudado  = aprobados.reduce((s, c) => s + Number(c.monto), 0);

  setText('kpi-tickets',   totalTk);
  setText('kpi-pend',      pendientes.length);
  setText('kpi-aprobados', aprobados.length);
  setText('kpi-recaudado', `S/ ${recaudado.toLocaleString()}`);

  // Tabla recientes (últimos 5) — comprobantesCache ya viene ordenado del más nuevo al más viejo
  const recientes = comprobantesCache.slice(0, 5);
  const tbody = document.getElementById('tbody-recientes');
  if (!tbody) return;
  tbody.innerHTML = recientes.map(c => `
    <tr>
      <td><strong>${c.documento}</strong></td>
      <td>${c.nombres} ${c.apellidos}</td>
      <td>${c.cantidad}</td>
      <td>S/ ${c.monto}</td>
      <td>${c.sorteo_nombre}</td>
      <td><span class="estado ${c.estado}">${estadoLabel(c.estado)}</span></td>
      <td>
        ${c.estado === 'pendiente'
          ? `<button class="btn-aprobar"  onclick="aprobarComp('${c.id}')">✓ Aprobar</button>
             <button class="btn-rechazar" onclick="rechazarComp('${c.id}')">✗ Rechazar</button>`
          : `<button class="btn-ver" onclick="verComp('${c.id}')">Ver</button>`}
      </td>
    </tr>
  `).join('');
}

// ══════════════════════════════════════════════════════════════
// COMPROBANTES
// ══════════════════════════════════════════════════════════════
function renderComprobantes(filtro = 'todos', busq = '') {
  let lista = [...comprobantesCache];

  if (filtro !== 'todos') lista = lista.filter(c => c.estado === filtro);
  if (busq) {
    const q = busq.toLowerCase();
    lista = lista.filter(c =>
      c.documento.includes(q) || `${c.nombres} ${c.apellidos}`.toLowerCase().includes(q)
    );
  }

  const tbody = document.getElementById('tbody-comprobantes');
  if (!tbody) return;

  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:32px;color:#94A3B8">Sin resultados</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(c => `
    <tr>
      <td style="font-size:11px;color:#94A3B8">${c.id.slice(0, 8)}</td>
      <td><strong>${c.documento}</strong></td>
      <td>${c.nombres} ${c.apellidos}</td>
      <td>+51 ${c.whatsapp || '—'}</td>
      <td>${c.cantidad}</td>
      <td>S/ ${c.monto}</td>
      <td>${c.sorteo_nombre}</td>
      <td style="font-family:monospace">${c.codigo_seguridad || '—'}</td>
      <td>${new Date(c.subido_en).toLocaleDateString('es-PE')}</td>
      <td><span class="estado ${c.estado}">${estadoLabel(c.estado)}</span></td>
      <td style="white-space:nowrap">
        <button class="btn-ver" onclick="verComp('${c.id}')">Ver</button>
        ${c.estado === 'pendiente'
          ? `<button class="btn-aprobar"  onclick="aprobarComp('${c.id}')" style="margin-left:4px">✓</button>
             <button class="btn-rechazar" onclick="rechazarComp('${c.id}')" style="margin-left:4px">✗</button>`
          : ''}
      </td>
    </tr>
  `).join('');
}

function filtrarComprobantes() {
  const filtro = document.getElementById('filtro-estado')?.value || 'todos';
  const busq   = document.getElementById('search-comp')?.value || '';
  renderComprobantes(filtro, busq);
}

function verComp(id) {
  const c = comprobantesCache.find(x => x.id === id);
  if (!c) return;

  // El servidor real solo guarda el nombre del archivo (ruta_archivo);
  // la URL pública se arma acá, apuntando a /uploads/ del propio backend.
const urlArchivo = c.ruta_archivo
    ? (
        c.ruta_archivo.startsWith("http")
            ? c.ruta_archivo
            : `${API_BASE.replace(/\/api\/?$/, '')}/uploads/${c.ruta_archivo}`
      )
    : null;

  document.getElementById('modal-comp-title').textContent = `Comprobante de ${c.nombres} ${c.apellidos}`;
  document.getElementById('modal-comp-body').innerHTML = `
    <div style="padding:16px 20px">
      <div class="detail-row"><span>Documento</span><strong>${c.documento}</strong></div>
      <div class="detail-row"><span>Nombre</span><strong>${c.nombres} ${c.apellidos}</strong></div>
      <div class="detail-row"><span>WhatsApp</span><strong>+51 ${c.whatsapp || '—'}</strong></div>
      <div class="detail-row"><span>Sorteo</span><strong>${c.sorteo_nombre}</strong></div>
      <div class="detail-row"><span>Tickets</span><strong>${c.cantidad}</strong></div>
      <div class="detail-row"><span>Monto</span><strong>S/ ${c.monto}</strong></div>
      <div class="detail-row"><span>Código de seguridad</span><strong style="font-family:monospace">${c.codigo_seguridad || '—'}</strong></div>
      <div class="detail-row"><span>Fecha del comprobante</span><strong>${c.fecha_comprobante ? new Date(c.fecha_comprobante + 'T00:00:00').toLocaleDateString('es-PE') : '—'}</strong></div>
      <div class="detail-row"><span>Subido el</span><strong>${new Date(c.subido_en).toLocaleString('es-PE')}</strong></div>
      <div class="detail-row"><span>Estado</span><span class="estado ${c.estado}">${estadoLabel(c.estado)}</span></div>
      ${urlArchivo ? `<div class="detail-row"><span>Comprobante</span><a href="${urlArchivo}" target="_blank">Ver imagen</a></div>` : ''}
    </div>
  `;
  document.getElementById('modal-comp-footer').innerHTML = c.estado === 'pendiente'
    ? `<button class="btn-secondary" onclick="cerrarModal('modal-comp')">Cerrar</button>
       <button class="btn-rechazar" onclick="rechazarComp('${c.id}');cerrarModal('modal-comp')">✗ Rechazar</button>
       <button class="btn-aprobar"  onclick="aprobarComp('${c.id}');cerrarModal('modal-comp')">✓ Aprobar</button>`
    : `<button class="btn-primary" onclick="cerrarModal('modal-comp')">Cerrar</button>`;

  abrirModal('modal-comp');
}

async function aprobarComp(id) {
  const c = comprobantesCache.find(x => x.id === id);
  if (!c) return;

  try {
    const res = await fetch(`${API_BASE}/admin/comprobantes/${id}/aprobar`, {
      method: 'POST',
      headers: authHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `La API respondió ${res.status}`);

    await fetchComprobantes();
    // El servidor real devuelve los tickets como objetos completos ({numero, ...}),
    // no como simples strings.
    const numeros = (data.tickets || []).map(t => t.numero).join(', ');
    toast(`✅ Comprobante aprobado — Tickets: ${numeros}`);
    renderDashboard();
    renderComprobantes(
      document.getElementById('filtro-estado')?.value || 'todos',
      document.getElementById('search-comp')?.value || ''
    );
    renderParticipantes(document.getElementById('search-part')?.value || '');
    renderEstadisticas();
    actualizarBadge();
  } catch (err) {
    console.error('Error al aprobar comprobante:', err);
    toast('❌ ' + (err.message || 'No se pudo aprobar el comprobante.'));
  }
}

async function rechazarComp(id) {
  const c = comprobantesCache.find(x => x.id === id);
  if (!c) return;

  try {
    const res = await fetch(`${API_BASE}/admin/comprobantes/${id}/rechazar`, {
      method: 'POST',
      headers: authHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `La API respondió ${res.status}`);

    await fetchComprobantes();
    toast(`❌ Comprobante de ${c.nombres} ${c.apellidos} rechazado`);
    renderDashboard();
    renderComprobantes(
      document.getElementById('filtro-estado')?.value || 'todos',
      document.getElementById('search-comp')?.value || ''
    );
    renderEstadisticas();
    actualizarBadge();
  } catch (err) {
    console.error('Error al rechazar comprobante:', err);
    toast('❌ ' + (err.message || 'No se pudo rechazar el comprobante.'));
  }
}

// ══════════════════════════════════════════════════════════════
// PARTICIPANTES
// ══════════════════════════════════════════════════════════════
function renderParticipantes(busq = '') {
  // Agrupar comprobantes por documento
  const mapa = {};
  comprobantesCache.forEach(c => {
    if (!mapa[c.documento]) {
      mapa[c.documento] = {
        documento: c.documento, nombre: `${c.nombres} ${c.apellidos}`, wsp: c.whatsapp,
        tickets: 0, pagado: 0, sorteos: new Set(), estado: c.estado
      };
    }
    if (c.estado === 'aprobado') {
      mapa[c.documento].tickets += c.cantidad;
      mapa[c.documento].pagado  += Number(c.monto);
      mapa[c.documento].estado = 'aprobado';
    }
    mapa[c.documento].sorteos.add(c.sorteo_nombre);
  });

  let lista = Object.values(mapa);
  if (busq) {
    const q = busq.toLowerCase();
    lista = lista.filter(p => p.documento.includes(q) || p.nombre.toLowerCase().includes(q));
  }

  const tbody = document.getElementById('tbody-participantes');
  if (!tbody) return;

  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:#94A3B8">Sin resultados</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(p => `
    <tr>
      <td><strong>${p.documento}</strong></td>
      <td>${p.nombre}</td>
      <td>+51 ${p.wsp || '—'}</td>
      <td><strong>${p.tickets}</strong></td>
      <td>S/ ${p.pagado}</td>
      <td style="font-size:12px">${[...p.sorteos].join(', ')}</td>
      <td><span class="estado ${p.estado}">${estadoLabel(p.estado)}</span></td>
    </tr>
  `).join('');
}

function filtrarParticipantes() {
  renderParticipantes(document.getElementById('search-part')?.value || '');
}

// ══════════════════════════════════════════════════════════════
// SORTEOS
// ══════════════════════════════════════════════════════════════
function estadoSorteoUI(s) {
  const estado = s.estado || 'activo';

  const mapa = {
    programado:      { texto: '🟡 Programado', color: '#854D0E', fondo: '#FEF3C7' },
    activo:          { texto: '🟢 Ventas abiertas', color: '#166534', fondo: '#DCFCE7' },
    ventas_cerradas: { texto: '🟠 Ventas cerradas', color: '#9A3412', fondo: '#FFEDD5' },
    listo_sorteo:    { texto: '🎉 Listo para sortear', color: '#5B21B6', fondo: '#EDE9FE' },
    pausado:         { texto: '⏸️ Pausado manualmente', color: '#991B1B', fondo: '#FEE2E2' },
    cerrado:         { texto: '⏸️ Pausado manualmente', color: '#991B1B', fondo: '#FEE2E2' },
  };

  return mapa[estado] || mapa.activo;
}

function fmtFechaHoraAdmin(valor) {
  if (!valor) return '—';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';

  return d.toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderSorteos() {
  const grid = document.getElementById('sorteos-grid');
  if (!grid) return;

  if (sorteosCache.length === 0) {
    grid.innerHTML = `<p style="color:#94A3B8;padding:20px">No hay sorteos creados aún.</p>`;
    return;
  }

  grid.innerHTML = sorteosCache.map(s => {
    const comps      = comprobantesCache.filter(c => String(c.sorteo_id) === String(s.id));
    const aprobados  = comps.filter(c => c.estado === 'aprobado');
    const pendientes = comps.filter(c => c.estado === 'pendiente');

    // Los tickets son ILIMITADOS: aquí solo mostramos cuántos se vendieron.
    const tickets    = aprobados.reduce((sum, c) => sum + Number(c.cantidad || 0), 0);
    const recaudado  = aprobados.reduce((sum, c) => sum + Number(c.monto || 0), 0);

    const premios = Array.isArray(s.premios) && s.premios.length
      ? s.premios
      : (s.premio ? [s.premio] : []);

    const premioTxt = premios.length > 1
      ? `${escaparHtmlAttr(premios[0])} <span style="color:#94A3B8">(+${premios.length - 1} más)</span>`
      : escaparHtmlAttr(premios[0] || '—');

    const estadoUI = estadoSorteoUI(s);
    const pausadoManual = (s.estado_manual || s.estado) === 'cerrado';

    return `
      <div class="sorteo-admin-card${pausadoManual ? ' desactivado' : ''}">
        <div class="sorteo-admin-header">
          <div class="sorteo-admin-nombre">${escaparHtmlAttr(s.nombre)}</div>
          <div class="sorteo-admin-fecha">🎉 ${fmtFechaHoraAdmin(s.fecha_sorteo)}</div>
        </div>

        <div class="sorteo-admin-body">
          <div style="margin-bottom:10px">
            <span style="
              display:inline-block;
              padding:5px 9px;
              border-radius:999px;
              font-size:11px;
              font-weight:800;
              color:${estadoUI.color};
              background:${estadoUI.fondo}">
              ${estadoUI.texto}
            </span>
          </div>

          <div class="sorteo-stat-row">
            <span>Premio${premios.length > 1 ? 's' : ''}</span>
            <strong>${premioTxt}</strong>
          </div>

          <div class="sorteo-stat-row">
            <span>Inicio ventas</span>
            <strong>${fmtFechaHoraAdmin(s.fecha_inicio_ventas)}</strong>
          </div>

          <div class="sorteo-stat-row">
            <span>Cierre ventas</span>
            <strong>${fmtFechaHoraAdmin(s.fecha_cierre_ventas)}</strong>
          </div>

          <div class="sorteo-stat-row">
            <span>Fecha sorteo</span>
            <strong>${fmtFechaHoraAdmin(s.fecha_sorteo)}</strong>
          </div>

          <div class="sorteo-stat-row">
            <span>Precio ticket</span>
            <strong>S/ ${Number(s.precio_ticket || 0).toFixed(2)}</strong>
          </div>

          <div class="sorteo-stat-row">
            <span>Tickets vendidos</span>
            <strong>${tickets.toLocaleString('es-PE')}</strong>
          </div>

          <div class="sorteo-stat-row">
            <span>Pendientes</span>
            <strong style="color:#854D0E">${pendientes.length}</strong>
          </div>

          <div class="sorteo-stat-row">
            <span>Recaudado</span>
            <strong style="color:#166534">S/ ${recaudado.toLocaleString('es-PE')}</strong>
          </div>
        </div>

        <div class="sorteo-admin-footer" style="padding:0 20px 16px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-secondary" onclick="abrirModalSorteo('${s.id}')">✏️ Editar</button>

          <button
            class="btn-secondary"
            onclick="toggleEstadoSorteo('${s.id}', '${pausadoManual ? 'activo' : 'cerrado'}')">
            ${pausadoManual ? '✅ Reactivar' : '⏸️ Pausar ventas'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// El botón manual queda como emergencia.
// El cierre normal ocurre solo por fecha_cierre_ventas.
async function toggleEstadoSorteo(id, nuevoEstado) {
  try {
    const res = await fetch(`${API_BASE}/sorteos/${id}/estado`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ estado: nuevoEstado }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `La API respondió ${res.status}`);
    }

    await fetchSorteos();
    renderSorteos();
    poblarSelectSorteoCompradores();
    renderEstadisticas();

    toast(
      nuevoEstado === 'activo'
        ? '✅ Sorteo reactivado. Las fechas vuelven a controlar las ventas.'
        : '⏸️ Ventas pausadas manualmente'
    );
  } catch (err) {
    console.error('Error al cambiar estado del sorteo:', err);
    toast('❌ No se pudo cambiar el estado del sorteo');
  }
}

function escaparHtmlAttr(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Lista dinámica de premios en el modal (1 a 10 campos) ──────
function filaPremioHTML(valor) {
  return `
    <div class="premio-input-row" style="display:flex;gap:8px;margin-bottom:8px">
      <input type="text" class="login-input premio-input" value="${escaparHtmlAttr(valor)}" placeholder="Ej: Toyota Yaris 0km" style="flex:1"/>
      <button type="button" class="btn-secondary" onclick="quitarCampoPremio(this)">✕</button>
    </div>
  `;
}

function renderPremiosLista(valores) {
  const wrap = document.getElementById('premios-lista');
  if (!wrap) return;
  const lista = valores && valores.length ? valores : [''];
  wrap.innerHTML = lista.map(filaPremioHTML).join('');
  actualizarControlesPremios();
}

function contarCamposPremio() {
  return document.querySelectorAll('#premios-lista .premio-input').length;
}

function actualizarControlesPremios() {
  const total = contarCamposPremio();
  const btnAgregar = document.getElementById('btn-agregar-premio');
  if (btnAgregar) btnAgregar.disabled = total >= 10;
  document.querySelectorAll('#premios-lista .premio-input-row button').forEach(btn => {
    btn.disabled = total <= 1;
  });
}

function agregarCampoPremio() {
  if (contarCamposPremio() >= 10) { toast('⚠️ Máximo 10 premios por sorteo'); return; }
  document.getElementById('premios-lista')?.insertAdjacentHTML('beforeend', filaPremioHTML(''));
  actualizarControlesPremios();
}

function quitarCampoPremio(btn) {
  if (contarCamposPremio() <= 1) return;
  btn.closest('.premio-input-row')?.remove();
  actualizarControlesPremios();
}

// sorteoEditandoId: null = creando uno nuevo, string = editando ese id
let sorteoEditandoId = null;

function aInputFechaHora(valor) {
  if (!valor) return { fecha: '', hora: '' };
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return { fecha: '', hora: '' };

  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return {
    fecha: local.toISOString().slice(0, 10),
    hora: local.toISOString().slice(11, 16),
  };
}

function abrirModalSorteo(id) {
  sorteoEditandoId = id || null;
  const titulo = document.getElementById('modal-sorteo-titulo');
  const btnGuardar = document.getElementById('btn-guardar-sorteo');

  if (sorteoEditandoId) {
    const s = sorteosCache.find(x => String(x.id) === String(sorteoEditandoId));
    if (!s) {
      toast('⚠️ No encontré ese sorteo');
      return;
    }

    document.getElementById('s-nombre').value = s.nombre || '';

    const inicio = aInputFechaHora(s.fecha_inicio_ventas);
    const cierre = aInputFechaHora(s.fecha_cierre_ventas);
    const sorteo = aInputFechaHora(s.fecha_sorteo);

    document.getElementById('s-inicio-fecha').value = inicio.fecha;
    document.getElementById('s-inicio-hora').value  = inicio.hora || '08:00';

    document.getElementById('s-cierre-fecha').value = cierre.fecha;
    document.getElementById('s-cierre-hora').value  = cierre.hora || '22:00';

    document.getElementById('s-fecha').value = sorteo.fecha;
    document.getElementById('s-hora').value  = sorteo.hora || '16:00';

    document.getElementById('s-precio').value = s.precio_ticket || '';

    const premios = Array.isArray(s.premios) && s.premios.length
      ? s.premios
      : (s.premio ? [s.premio] : ['']);

    renderPremiosLista(premios);

    if (titulo) titulo.textContent = 'Editar Sorteo';
    if (btnGuardar) btnGuardar.textContent = 'Guardar cambios';
  } else {
    document.getElementById('s-nombre').value = '';
    document.getElementById('s-inicio-fecha').value = '';
    document.getElementById('s-inicio-hora').value = '08:00';
    document.getElementById('s-cierre-fecha').value = '';
    document.getElementById('s-cierre-hora').value = '22:00';
    document.getElementById('s-fecha').value = '';
    document.getElementById('s-hora').value = '16:00';
    document.getElementById('s-precio').value = '';

    renderPremiosLista(['']);

    if (titulo) titulo.textContent = 'Nuevo Sorteo';
    if (btnGuardar) btnGuardar.textContent = 'Crear sorteo';
  }

  abrirModal('modal-sorteo');
}

async function guardarSorteo() {
  const nombre = document.getElementById('s-nombre').value.trim();

  const inicioFecha = document.getElementById('s-inicio-fecha').value;
  const inicioHora  = document.getElementById('s-inicio-hora').value || '08:00';

  const cierreFecha = document.getElementById('s-cierre-fecha').value;
  const cierreHora  = document.getElementById('s-cierre-hora').value || '22:00';

  const fechaSorteo = document.getElementById('s-fecha').value;
  const horaSorteo  = document.getElementById('s-hora').value || '16:00';

  const precio = parseFloat(document.getElementById('s-precio').value);

  const premios = [...document.querySelectorAll('#premios-lista .premio-input')]
    .map(i => i.value.trim())
    .filter(Boolean);

  if (!nombre || !inicioFecha || !cierreFecha || !fechaSorteo || !precio) {
    toast('⚠️ Completa nombre, inicio de ventas, cierre de ventas, fecha del sorteo y precio');
    return;
  }

  const fechaInicioVentas = `${inicioFecha}T${inicioHora}:00`;
  const fechaCierreVentas = `${cierreFecha}T${cierreHora}:00`;
  const fechaSorteoCompleta = `${fechaSorteo}T${horaSorteo}:00`;

  const inicio = new Date(fechaInicioVentas);
  const cierre = new Date(fechaCierreVentas);
  const sorteo = new Date(fechaSorteoCompleta);

  if (!(inicio < cierre)) {
    toast('⚠️ El cierre de ventas debe ser posterior al inicio');
    return;
  }

  if (!(cierre < sorteo)) {
    toast('⚠️ La fecha del sorteo debe ser posterior al cierre de ventas');
    return;
  }

  if (premios.length === 0) {
    toast('⚠️ Agrega al menos 1 premio');
    return;
  }

  if (premios.length > 10) {
    toast('⚠️ Máximo 10 premios por sorteo');
    return;
  }

  const editando = !!sorteoEditandoId;
  const btn = document.getElementById('btn-guardar-sorteo');

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Guardando…';
  }

  try {
    const url = editando
      ? `${API_BASE}/sorteos/${sorteoEditandoId}`
      : `${API_BASE}/sorteos`;

    const res = await fetch(url, {
      method: editando ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        nombre,
        premios,

        // Tickets ilimitados: no enviamos ninguna capacidad máxima.
        fecha_inicio_ventas: fechaInicioVentas,
        fecha_cierre_ventas: fechaCierreVentas,
        fecha_sorteo: fechaSorteoCompleta,

        precio_ticket: precio,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `La API respondió ${res.status}`);
    }

    await fetchSorteos();
    cerrarModal('modal-sorteo');

    renderSorteos();
    poblarSelectSorteoCompradores();
    renderCompradores();
    renderEstadisticas();

    toast(
      editando
        ? `✏️ Sorteo "${nombre}" actualizado`
        : `🎰 Sorteo "${nombre}" creado con cierre automático de ventas`
    );

    sorteoEditandoId = null;
  } catch (err) {
    console.error('Error al guardar el sorteo:', err);
    toast(`❌ ${err.message || 'No se pudo guardar el sorteo'}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = editando ? 'Guardar cambios' : 'Crear sorteo';
    }
  }
}

// ══════════════════════════════════════════════════════════════
// COMPRADORES POR SORTEO
// ══════════════════════════════════════════════════════════════
// Reutiliza comprobantesCache/sorteosCache que ya se cargan para las
// otras secciones — no necesita pedir nada nuevo al servidor.
function poblarSelectSorteoCompradores() {
  const select = document.getElementById('comprador-sorteo-select');
  if (!select) return;

  const actual = select.value;
  select.innerHTML = '<option value="">Selecciona un sorteo…</option>' +
    sorteosCache.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');

  // Si ya había uno elegido y sigue existiendo, lo mantenemos seleccionado
  if (actual && sorteosCache.some(s => String(s.id) === actual)) {
    select.value = actual;
  }
}

// Arma la lista de compradores (pago aprobado) de un sorteo, agrupados
// por documento. La usan la tabla, la exportación a Excel y la ruleta.
function obtenerCompradoresDeSorteo(sorteoId, busq = '') {
  const mapa = {};
  comprobantesCache
    .filter(c => String(c.sorteo_id) === String(sorteoId) && c.estado === 'aprobado')
    .forEach(c => {
      if (!mapa[c.documento]) {
        mapa[c.documento] = {
          documento: c.documento,
          nombre: `${c.nombres} ${c.apellidos}`,
          whatsapp: c.whatsapp,
          tickets: 0,
          monto: 0,
          ultimaCompra: c.subido_en,
        };
      }
      mapa[c.documento].tickets += c.cantidad;
      mapa[c.documento].monto   += Number(c.monto);
      if (new Date(c.subido_en) > new Date(mapa[c.documento].ultimaCompra)) {
        mapa[c.documento].ultimaCompra = c.subido_en;
      }
    });

  let lista = Object.values(mapa);
  const q = (busq || '').toLowerCase();
  if (q) {
    lista = lista.filter(p => p.documento.includes(q) || p.nombre.toLowerCase().includes(q));
  }
  lista.sort((a, b) => new Date(b.ultimaCompra) - new Date(a.ultimaCompra));
  return lista;
}

function renderCompradores() {
  const tbody = document.getElementById('tbody-compradores');
  if (!tbody) return;

  const sorteoId = document.getElementById('comprador-sorteo-select')?.value || '';
  const busq     = document.getElementById('search-comprador')?.value || '';

  if (!sorteoId) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:#94A3B8">Elige un sorteo arriba para ver quiénes compraron</td></tr>`;
    return;
  }

  const lista = obtenerCompradoresDeSorteo(sorteoId, busq);

  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:#94A3B8">Nadie ha comprado (con pago aprobado) este sorteo todavía</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(p => `
    <tr>
      <td><strong>${p.documento}</strong></td>
      <td>${p.nombre}</td>
      <td>+51 ${p.whatsapp || '—'}</td>
      <td><strong>${p.tickets}</strong></td>
      <td>S/ ${p.monto}</td>
      <td>${new Date(p.ultimaCompra).toLocaleDateString('es-PE')}</td>
      <td><button class="btn-ver" onclick="verTicketsComprador('${p.documento}')">Ver tickets</button></td>
    </tr>
  `).join('');
}

// ── Descargar la lista de compradores como Excel (.xlsx) ───────
function descargarCompradoresExcel() {
  const sorteoId = document.getElementById('comprador-sorteo-select')?.value || '';
  if (!sorteoId) { toast('⚠️ Elige un sorteo primero'); return; }
  if (typeof XLSX === 'undefined') { toast('⚠️ No se pudo cargar el generador de Excel'); return; }

  const sorteo = sorteosCache.find(s => String(s.id) === String(sorteoId));
  const busq = document.getElementById('search-comprador')?.value || '';
  const lista = obtenerCompradoresDeSorteo(sorteoId, busq);

  if (lista.length === 0) { toast('⚠️ No hay compradores para exportar'); return; }

  const filas = lista.map(p => ({
    DNI: p.documento,
    Nombre: p.nombre,
    WhatsApp: p.whatsapp ? `+51 ${p.whatsapp}` : '',
    Tickets: p.tickets,
    'Monto pagado (S/.)': p.monto,
    'Última compra': new Date(p.ultimaCompra).toLocaleDateString('es-PE'),
  }));

  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Compradores');

  const nombreSorteo = (sorteo?.nombre || 'sorteo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_');
  XLSX.writeFile(libro, `compradores_${nombreSorteo}.xlsx`);
}

// Consulta el endpoint público de tickets (el mismo que usa "Mis Tickets")
// para mostrar los números de ticket exactos de esa persona.
async function verTicketsComprador(documento) {
  try {
    const res = await fetch(`${API_BASE}/tickets/${documento}`);
    const data = await res.json();
    if (!data.encontrado) { toast('No se encontraron tickets para ese documento'); return; }

    const detalle = (data.sorteos || [])
      .map(s => `${s.nombre}: ${(s.tickets || []).join(', ')}`)
      .join(' | ');
    toast(`🎟️ ${data.nombre} — ${detalle || 'sin tickets'}`);
  } catch (err) {
    console.error('Error al consultar tickets:', err);
    toast('❌ No se pudo consultar los tickets de este comprador');
  }
}

// ══════════════════════════════════════════════════════════════
// RULETA DE SORTEO
// ══════════════════════════════════════════════════════════════
// Elige ganador(es) al azar, ponderando la probabilidad de cada
// comprador según su cantidad de tickets. Un premio = una vuelta.
// Nadie puede ganar dos veces en el mismo sorteo.
let ruletaEstado = null;
const COLORES_RULETA = ['#004D98', '#A50044', '#EDBB00', '#166534', '#7C3AED', '#DB2777', '#0891B2', '#EA580C'];

function abrirModalRuleta() {
  const sorteoId = document.getElementById('comprador-sorteo-select')?.value || '';
  if (!sorteoId) { toast('⚠️ Primero elige un sorteo en el desplegable'); return; }

  const sorteo = sorteosCache.find(s => String(s.id) === String(sorteoId));
  if (!sorteo) { toast('⚠️ No encontré ese sorteo'); return; }

  const premios = Array.isArray(sorteo.premios) && sorteo.premios.length
    ? sorteo.premios
    : (sorteo.premio ? [sorteo.premio] : ['Premio']);

  const compradores = obtenerCompradoresDeSorteo(sorteoId, '');
  if (compradores.length === 0) {
    toast('⚠️ Este sorteo todavía no tiene compradores con pago aprobado');
    return;
  }

  ruletaEstado = {
    sorteoId,
    premios,
    indicePremio: 0,
    ganadores: [],
    entradasDisponibles: compradores.map(c => ({ ...c })),
    rotacionAcumulada: 0,
    girando: false,
  };

  const canvas = document.getElementById('ruleta-canvas');
  if (canvas) { canvas.style.transition = 'none'; canvas.style.transform = 'rotate(0deg)'; }

  document.getElementById('ruleta-resultado').innerHTML = '';
  const btn = document.getElementById('btn-girar-ruleta');
  if (btn) { btn.disabled = false; btn.textContent = '🎡 Girar'; }

  actualizarTituloRuleta();
  dibujarRuedaCanvas(ruletaEstado.entradasDisponibles);
  abrirModal('modal-ruleta');
}

function actualizarTituloRuleta() {
  const el = document.getElementById('ruleta-premio-actual');
  if (!el || !ruletaEstado) return;
  const total = ruletaEstado.premios.length;
  const actual = ruletaEstado.premios[ruletaEstado.indicePremio];
  el.textContent = total > 1
    ? `Premio ${ruletaEstado.indicePremio + 1} de ${total}: ${actual}`
    : `Premio: ${actual}`;
}

function dibujarRuedaCanvas(entradas) {
  const canvas = document.getElementById('ruleta-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2, radio = W / 2 - 4;
  const n = entradas.length;
  const anguloPorSlice = (2 * Math.PI) / n;

  ctx.clearRect(0, 0, W, H);

  entradas.forEach((ent, i) => {
    const inicio = i * anguloPorSlice - Math.PI / 2;
    const fin = inicio + anguloPorSlice;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radio, inicio, fin);
    ctx.closePath();
    ctx.fillStyle = COLORES_RULETA[i % COLORES_RULETA.length];
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(inicio + anguloPorSlice / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    const primerNombre = (ent.nombre || '').trim().split(' ')[0] || ent.documento;
    const etiqueta = primerNombre.length > 12 ? primerNombre.slice(0, 12) + '…' : primerNombre;
    ctx.fillText(etiqueta, radio - 10, 4);
    ctx.restore();
  });
}

// Sorteo ponderado: cada ticket cuenta como una "papeleta", así que
// quien compró más tickets tiene más chances (pero no es garantía).
function elegirGanadorPonderado(entradas) {
  const pesoTotal = entradas.reduce((s, e) => s + e.tickets, 0);
  let r = Math.random() * pesoTotal;
  for (const ent of entradas) {
    r -= ent.tickets;
    if (r <= 0) return ent;
  }
  return entradas[entradas.length - 1];
}

function girarRuleta() {
  if (!ruletaEstado || ruletaEstado.girando) return;
  const entradas = ruletaEstado.entradasDisponibles;
  if (entradas.length === 0) { toast('⚠️ No quedan compradores para sortear'); return; }

  const ganador = elegirGanadorPonderado(entradas);
  const indiceGanador = entradas.indexOf(ganador);
  const n = entradas.length;
  const anguloSlice = 360 / n;
  const anguloCentro = indiceGanador * anguloSlice + anguloSlice / 2;

  // Calcula cuánto girar para que el puntero (fijo arriba) quede
  // exactamente sobre la porción del ganador, siempre avanzando
  // hacia adelante desde donde quedó la ruleta la vez anterior.
  const visualObjetivo = (360 - anguloCentro + 360) % 360;
  const visualActual = ((ruletaEstado.rotacionAcumulada % 360) + 360) % 360;
  let diff = visualObjetivo - visualActual;
  if (diff <= 0) diff += 360;
  const vueltasExtra = 8;
  ruletaEstado.rotacionAcumulada += diff + vueltasExtra * 360;

  ruletaEstado.girando = true;
  const btn = document.getElementById('btn-girar-ruleta');
  if (btn) { btn.disabled = true; btn.textContent = 'Girando…'; }
  document.getElementById('ruleta-resultado').innerHTML = '';

  const canvas = document.getElementById('ruleta-canvas');
  canvas.style.transition = 'transform 10s cubic-bezier(0.12, 0.72, 0.15, 1)';
  canvas.style.transform = `rotate(${ruletaEstado.rotacionAcumulada}deg)`;

  setTimeout(() => {
    ruletaEstado.girando = false;
    ruletaEstado.ganadores.push({ premio: ruletaEstado.premios[ruletaEstado.indicePremio], comprador: ganador });
    ruletaEstado.entradasDisponibles = entradas.filter(e => e !== ganador);

    document.getElementById('ruleta-resultado').innerHTML =
      `🎉 ¡Ganador! <strong>${ganador.nombre}</strong> (DNI ${ganador.documento})`;

    ruletaEstado.indicePremio++;
    const quedanPremios = ruletaEstado.indicePremio < ruletaEstado.premios.length;
    const quedanCompradores = ruletaEstado.entradasDisponibles.length > 0;

    if (quedanPremios && quedanCompradores) {
      actualizarTituloRuleta();
      const canvasReset = document.getElementById('ruleta-canvas');
      canvasReset.style.transition = 'none';
      canvasReset.style.transform = 'rotate(0deg)';
      ruletaEstado.rotacionAcumulada = 0;
      void canvasReset.offsetWidth; // fuerza el reflow antes de la próxima animación
      dibujarRuedaCanvas(ruletaEstado.entradasDisponibles);
      if (btn) { btn.disabled = false; btn.textContent = '🎡 Girar siguiente premio'; }
    } else {
      document.getElementById('ruleta-premio-actual').textContent = '🏁 ¡Sorteo completo!';
      if (btn) { btn.disabled = true; btn.textContent = 'Sorteo finalizado'; }
      mostrarResumenGanadores();
    }
  }, 10200);
}

function mostrarResumenGanadores() {
  if (!ruletaEstado) return;
  const resumen = ruletaEstado.ganadores
    .map(g => `${g.premio}: <strong>${g.comprador.nombre}</strong> (DNI ${g.comprador.documento})`)
    .join('<br>');
  const el = document.getElementById('ruleta-resultado');
  el.innerHTML = el.innerHTML + '<br><br>Resumen de ganadores:<br>' + resumen;
}

// ══════════════════════════════════════════════════════════════
// ESTADÍSTICAS
// ══════════════════════════════════════════════════════════════
function renderEstadisticas() {
  const aprobados  = comprobantesCache.filter(c => c.estado === 'aprobado');
  const total      = comprobantesCache.length;
  const recaudado  = aprobados.reduce((s, c) => s + Number(c.monto), 0);
  const conv       = total > 0 ? Math.round((aprobados.length / total) * 100) : 0;
  const activos    = sorteosCache.filter(s => s.estado === 'activo').length;

  // Registros hoy
  const hoy = new Date().toISOString().slice(0, 10);
  const hoyCount = comprobantesCache.filter(c => (c.subido_en || '').slice(0, 10) === hoy).length;

  setText('est-hoy',     hoyCount);
  setText('est-sorteos', activos);
  setText('est-conv',    `${conv}%`);
  setText('est-total',   `S/ ${recaudado.toLocaleString()}`);

  // Gráfico por sorteo
  const chartSorteos = document.getElementById('chart-sorteos');
  if (chartSorteos) {
    const max = Math.max(...sorteosCache.map(s => {
      return comprobantesCache
        .filter(c => c.sorteo_id === s.id && c.estado === 'aprobado')
        .reduce((sum, c) => sum + c.cantidad, 0);
    }), 1);
    chartSorteos.innerHTML = sorteosCache.map((s, i) => {
      const tickets = comprobantesCache
        .filter(c => c.sorteo_id === s.id && c.estado === 'aprobado')
        .reduce((sum, c) => sum + c.cantidad, 0);
      const pct = Math.round((tickets / max) * 100);
      const color = i % 2 === 0 ? '#004D98' : '#A50044';
      return `
        <div class="bar-row">
          <div class="bar-label">${s.nombre}</div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${pct}%;background:${color}">${tickets > 0 ? tickets : ''}</div>
          </div>
          <div class="bar-val">${tickets} tk</div>
        </div>`;
    }).join('');
  }

  // Gráfico últimos 7 días
  const chartDias = document.getElementById('chart-dias');
  if (chartDias) {
    const dias = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric' });
      const count = comprobantesCache.filter(c => (c.subido_en || '').slice(0, 10) === key).length;
      dias.push({ label, count });
    }
    const maxDia = Math.max(...dias.map(d => d.count), 1);
    chartDias.innerHTML = dias.map(d => {
      const pct = Math.round((d.count / maxDia) * 100);
      return `
        <div class="bar-row">
          <div class="bar-label">${d.label}</div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${pct}%;background:#EDBB00;color:#001233">${d.count > 0 ? d.count : ''}</div>
          </div>
          <div class="bar-val">${d.count}</div>
        </div>`;
    }).join('');
  }
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
function actualizarBadge() {
  const pend = comprobantesCache.filter(c => c.estado === 'pendiente').length;
  const badge = document.getElementById('badge-pend');
  if (badge) {
    badge.textContent = pend;
    badge.style.display = pend > 0 ? 'inline-block' : 'none';
  }
}

function estadoLabel(e) {
  return { pendiente: '⏳ Pendiente', aprobado: '✅ Aprobado', rechazado: '❌ Rechazado' }[e] || e;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function abrirModal(id)  { document.getElementById(id).style.display = 'flex'; }
function cerrarModal(id) { document.getElementById(id).style.display = 'none'; }

function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}
document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('sidebar');
  const menuButton = document.getElementById('sidebar-toggle');

  if (!sidebar || !menuButton) {
    console.warn('No se encontró #sidebar o #sidebar-toggle');
    return;
  }

  let overlay = document.querySelector('.sidebar-overlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
  }

  function abrirMenu() {
    sidebar.classList.add('open');
    overlay.classList.add('show');
    document.body.classList.add('sidebar-open');
    menuButton.setAttribute('aria-expanded', 'true');
  }

  function cerrarMenu() {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
    document.body.classList.remove('sidebar-open');
    menuButton.setAttribute('aria-expanded', 'false');
  }

  menuButton.addEventListener('click', event => {
    event.preventDefault();

    if (sidebar.classList.contains('open')) {
      cerrarMenu();
    } else {
      abrirMenu();
    }
  });

  overlay.addEventListener('click', cerrarMenu);

  sidebar.querySelectorAll('.nav-item, a').forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 900) {
        cerrarMenu();
      }
    });
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) {
      cerrarMenu();
    }
  });
});
