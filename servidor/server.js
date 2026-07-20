// ════════════════════════════════════════════════════════════════
// DESEO UN PREMIO — Servidor API
// Conecta el sitio (HTML/JS) y el panel admin con PostgreSQL
// ════════════════════════════════════════════════════════════════
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool, probarConexion } = require('./db');
const { extraerDatosComprobante } = require('./ocrCodigoSeguridad');

const app = express();
const PUERTO = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'cambia-esto';

app.use(cors());

// Permite explícitamente que páginas abiertas como archivo local (file://)
// o de otro origen puedan hacer fetch() hacia este servidor en localhost.
// Chrome bloquea esto por seguridad ("Private Network Access") si no se
// responde este header — sin él, el fetch() falla en silencio en el navegador
// aunque el servidor esté funcionando perfectamente (por eso navegar directo
// a la URL sí funciona, pero el panel admin no podía conectarse).
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  next();
});

app.use(express.json());

// ── Carpeta donde se guardan los comprobantes subidos ─────────────
const CARPETA_UPLOADS = path.join(__dirname, 'uploads');
if (!fs.existsSync(CARPETA_UPLOADS)) fs.mkdirSync(CARPETA_UPLOADS);
app.use('/uploads', express.static(CARPETA_UPLOADS));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CARPETA_UPLOADS),
  filename: (req, file, cb) => {
    const sufijo = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, sufijo + '-' + file.originalname.replace(/\s+/g, '_'));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // máximo 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten imágenes'));
  },
});

// ── Generador de número de ticket ─────────────────────────────────
function generarNumeroTicket() {
  return String(Math.floor(100000 + Math.random() * 899999));
}

// ════════════════════════════════════════════════════════════════
// MIDDLEWARE: verificar token de admin
// ════════════════════════════════════════════════════════════════
function requiereAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const token = header.slice(7);
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

// ════════════════════════════════════════════════════════════════
// AUTH — Login del admin
// ════════════════════════════════════════════════════════════════
app.post('/api/admin/login', async (req, res) => {
  const { usuario, password } = req.body;
  try {
    const r = await pool.query('SELECT * FROM admins WHERE usuario = $1', [usuario]);
    const admin = r.rows[0];

    // Para el primer arranque, si no hay admins en la BD, se valida contra .env
    if (!admin) {
      if (usuario === process.env.ADMIN_USER && password === process.env.ADMIN_PASSWORD) {
        const token = jwt.sign({ usuario }, JWT_SECRET, { expiresIn: '8h' });
        return res.json({ token, usuario });
      }
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

    const token = jwt.sign({ usuario: admin.usuario, id: admin.id }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, usuario: admin.usuario });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ════════════════════════════════════════════════════════════════
// SORTEOS
// ════════════════════════════════════════════════════════════════

// Listar sorteos (público). Si mandan ?estado=activo, solo devuelve los
// activos (así el sitio público no muestra los que el admin desactivó).
// Sin ese parámetro (como usa el panel admin) devuelve todos, para que
// ahí sí se puedan ver y reactivar los desactivados.
app.get('/api/sorteos', async (req, res) => {
  const { estado } = req.query;
  try {
    const params = [];
    let where = '';
    if (estado && estado !== 'todos') {
      params.push(estado);
      where = 'WHERE estado = $1';
    }
    const r = await pool.query(`SELECT * FROM sorteos ${where} ORDER BY fecha_sorteo ASC`, params);
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al consultar sorteos' });
  }
});

// Valida y normaliza la lista de premios que manda el admin (1 a 10,
// aceptando también el campo viejo "premio" por si algún cliente
// todavía no envía la lista).
function normalizarPremios(premios, premioUnico) {
  let lista = Array.isArray(premios) ? premios.map((p) => String(p).trim()).filter(Boolean) : [];
  if (lista.length === 0 && premioUnico) lista = [String(premioUnico).trim()];
  return lista;
}

// Crear sorteo (admin)
app.post('/api/sorteos', requiereAdmin, async (req, res) => {
  const { nombre, premio, fecha_sorteo, precio_ticket, premios } = req.body;
  if (!nombre || !fecha_sorteo) {
    return res.status(400).json({ error: 'Nombre y fecha son obligatorios' });
  }

  const listaPremios = normalizarPremios(premios, premio);
  if (listaPremios.length === 0) {
    return res.status(400).json({ error: 'Debes indicar al menos 1 premio' });
  }
  if (listaPremios.length > 10) {
    return res.status(400).json({ error: 'Puedes registrar como máximo 10 premios por sorteo' });
  }

  try {
    const r = await pool.query(
      `INSERT INTO sorteos (nombre, premio, fecha_sorteo, precio_ticket, premios)
       VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING *`,
      [nombre, listaPremios[0], fecha_sorteo, precio_ticket || 60, JSON.stringify(listaPremios)]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear el sorteo' });
  }
});

// Editar sorteo — nombre, fecha, precio y lista de premios (admin)
app.patch('/api/sorteos/:id', requiereAdmin, async (req, res) => {
  const { nombre, premio, fecha_sorteo, precio_ticket, premios } = req.body;
  if (!nombre || !fecha_sorteo) {
    return res.status(400).json({ error: 'Nombre y fecha son obligatorios' });
  }

  const listaPremios = normalizarPremios(premios, premio);
  if (listaPremios.length === 0) {
    return res.status(400).json({ error: 'Debes indicar al menos 1 premio' });
  }
  if (listaPremios.length > 10) {
    return res.status(400).json({ error: 'Puedes registrar como máximo 10 premios por sorteo' });
  }

  try {
    const r = await pool.query(
      `UPDATE sorteos SET nombre = $1, premio = $2, fecha_sorteo = $3, precio_ticket = $4, premios = $5::jsonb
       WHERE id = $6 RETURNING *`,
      [nombre, listaPremios[0], fecha_sorteo, precio_ticket || 60, JSON.stringify(listaPremios), req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Sorteo no encontrado' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al editar el sorteo' });
  }
});

// Cambiar estado de un sorteo (admin)
app.patch('/api/sorteos/:id/estado', requiereAdmin, async (req, res) => {
  const { estado } = req.body;
  if (!['activo', 'cerrado'].includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  try {
    const r = await pool.query(
      'UPDATE sorteos SET estado = $1 WHERE id = $2 RETURNING *',
      [estado, req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Sorteo no encontrado' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar el sorteo' });
  }
});

// Eliminar sorteo (admin)
app.delete('/api/sorteos/:id', requiereAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM sorteos WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar el sorteo' });
  }
});

// ════════════════════════════════════════════════════════════════
// MIS TICKETS — consulta pública por documento
// ════════════════════════════════════════════════════════════════
app.get('/api/tickets/:documento', async (req, res) => {
  const { documento } = req.params;
  try {
    const r = await pool.query(
      `SELECT * FROM vista_tickets_participante WHERE documento = $1`,
      [documento]
    );
    if (r.rows.length === 0) {
      return res.json({ encontrado: false });
    }
    const nombreCompleto = `${r.rows[0].nombres} ${r.rows[0].apellidos}`;
    const totalTickets = r.rows.reduce((acc, row) => acc + Number(row.total_tickets), 0);
    res.json({
      encontrado: true,
      nombre: nombreCompleto,
      totalTickets,
      sorteos: r.rows.map((row) => ({
        nombre: row.sorteo_nombre,
        fecha: row.fecha_sorteo,
        tickets: row.tickets,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al consultar tickets' });
  }
});

// ════════════════════════════════════════════════════════════════
// PARTICIPAR — buscar nombre por DNI (autocompletado del formulario)
// ════════════════════════════════════════════════════════════════
app.get('/api/participantes/:documento', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT nombres, apellidos FROM participantes WHERE documento = $1',
      [req.params.documento]
    );
    if (!r.rows[0]) return res.json({ encontrado: false });
    res.json({ encontrado: true, ...r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al buscar participante' });
  }
});

// Listar todos los participantes (admin)
app.get('/api/admin/participantes', requiereAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT p.documento, p.tipo_documento, p.nombres, p.apellidos, p.whatsapp,
             s.id AS sorteo_id, s.nombre AS sorteo_nombre,
             ARRAY_AGG(t.numero ORDER BY t.numero) AS tickets,
             MIN(t.creado_en) AS fecha
      FROM participantes p
      JOIN tickets t ON t.participante_id = p.id
      JOIN sorteos s ON s.id = t.sorteo_id
      GROUP BY p.documento, p.tipo_documento, p.nombres, p.apellidos, p.whatsapp, s.id, s.nombre
      ORDER BY fecha DESC
    `);
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar participantes' });
  }
});

// ════════════════════════════════════════════════════════════════
// COMPROBANTES
// ════════════════════════════════════════════════════════════════

// Subir un comprobante de pago (público, desde Participar.html)
app.post('/api/comprobantes', upload.single('archivo'), async (req, res) => {
  const { documento, tipo_documento, nombres, apellidos, whatsapp, sorteo_id, cantidad } = req.body;

  if (!documento || !nombres || !apellidos || !whatsapp || !sorteo_id || !cantidad) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'Debes adjuntar el comprobante de pago' });
  }

  // ── Código de seguridad y fecha del comprobante ────────────────────
  // El código de seguridad de Yape solo tiene 3 dígitos, así que es
  // normal que se repita entre pagos de días distintos. Por eso el
  // chequeo de "comprobante repetido" exige que coincidan el código Y
  // la fecha del comprobante — no el código solo.
  // Si el participante ya los escribió a mano, se usan directamente.
  // Lo que falte se intenta leer automáticamente desde la imagen. Si
  // el OCR no logra leer algo, se le pide al participante que lo
  // complete manualmente.
  let codigoSeguridad = (req.body.codigo_seguridad || '').trim();
  let fechaComprobante = (req.body.fecha_comprobante || '').trim();

  const faltaCodigoInicial = !codigoSeguridad || codigoSeguridad.length < 3;
  if (faltaCodigoInicial || !fechaComprobante) {
    const detectado = await extraerDatosComprobante(req.file.path);
    if (faltaCodigoInicial && detectado.codigo) codigoSeguridad = detectado.codigo;
    if (!fechaComprobante && detectado.fecha) fechaComprobante = detectado.fecha;
  }

  const faltaCodigo = !codigoSeguridad || codigoSeguridad.length < 3;
  const faltaFecha  = !fechaComprobante;

  if (faltaCodigo || faltaFecha) {
    fs.unlink(req.file.path, () => {}); // limpia el archivo, se re-sube al reintentar
    let error = 'No pudimos leer el código de seguridad ni la fecha de tu comprobante. Por favor complétalos manualmente.';
    if (faltaCodigo && !faltaFecha) error = 'No pudimos leer el código de seguridad de tu comprobante automáticamente. Por favor escríbelo manualmente.';
    if (!faltaCodigo && faltaFecha) error = 'No pudimos leer la fecha de tu comprobante automáticamente. Por favor escríbela manualmente.';
    return res.status(400).json({
      error,
      requiereCodigoManual: faltaCodigo,
      requiereFechaManual: faltaFecha,
    });
  }

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    // ── Anti-fraude — si ese código de seguridad Y esa fecha ya se
    // usaron juntos en un comprobante pendiente o aprobado, no se
    // acepta de nuevo (evita que alguien reutilice el mismo pago para
    // registrar varios comprobantes). El código solo NO alcanza para
    // considerarlo duplicado, porque son solo 3 dígitos y se repiten
    // entre pagos de días distintos.
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

    // Obtener precio del ticket para ese sorteo
    const sorteoR = await cliente.query('SELECT precio_ticket FROM sorteos WHERE id = $1', [sorteo_id]);
    if (!sorteoR.rows[0]) throw new Error('Sorteo no encontrado');
    const monto = Number(sorteoR.rows[0].precio_ticket) * Number(cantidad);

    const compR = await cliente.query(
      `INSERT INTO comprobantes (participante_id, sorteo_id, cantidad, monto, nombre_archivo, ruta_archivo, codigo_seguridad, fecha_comprobante, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pendiente') RETURNING *`,
      [participanteId, sorteo_id, cantidad, monto, req.file.originalname, req.file.filename, codigoSeguridad, fechaComprobante]
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

// Listar comprobantes (admin) — opcionalmente filtrar por estado
// (c.* ya incluye codigo_seguridad automáticamente en cuanto exista la columna)
app.get('/api/admin/comprobantes', requiereAdmin, async (req, res) => {
  const { estado } = req.query;
  try {
    const params = [];
    let where = '';
    if (estado && estado !== 'todos') {
      params.push(estado);
      where = 'WHERE c.estado = $1';
    }
    const r = await pool.query(
      `SELECT c.*, p.documento, p.nombres, p.apellidos, p.whatsapp, s.nombre AS sorteo_nombre
       FROM comprobantes c
       JOIN participantes p ON p.id = c.participante_id
       JOIN sorteos s ON s.id = c.sorteo_id
       ${where}
       ORDER BY c.subido_en DESC`,
      params
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar comprobantes' });
  }
});

// Aprobar comprobante → genera tickets automáticamente (admin)
app.post('/api/admin/comprobantes/:id/aprobar', requiereAdmin, async (req, res) => {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const compR = await cliente.query('SELECT * FROM comprobantes WHERE id = $1', [req.params.id]);
    const comp = compR.rows[0];
    if (!comp) throw new Error('Comprobante no encontrado');
    if (comp.estado === 'aprobado') throw new Error('Este comprobante ya fue aprobado');

    await cliente.query(
      `UPDATE comprobantes SET estado = 'aprobado', revisado_por = $1 WHERE id = $2`,
      [req.admin?.usuario || 'admin', comp.id]
    );

    const ticketsCreados = [];
    for (let i = 0; i < comp.cantidad; i++) {
      let numero, intentos = 0;
      do {
        numero = generarNumeroTicket();
        intentos++;
        const existe = await cliente.query('SELECT 1 FROM tickets WHERE numero = $1', [numero]);
        if (existe.rows.length === 0) break;
      } while (intentos < 10);

      const tR = await cliente.query(
        `INSERT INTO tickets (numero, participante_id, sorteo_id, comprobante_id)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [numero, comp.participante_id, comp.sorteo_id, comp.id]
      );
      ticketsCreados.push(tR.rows[0]);
    }

    await cliente.query('COMMIT');
    res.json({ ok: true, tickets: ticketsCreados });
  } catch (err) {
    await cliente.query('ROLLBACK');
    console.error(err);
    res.status(400).json({ error: err.message || 'Error al aprobar el comprobante' });
  } finally {
    cliente.release();
  }
});

// Rechazar comprobante (admin)
app.post('/api/admin/comprobantes/:id/rechazar', requiereAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE comprobantes SET estado = 'rechazado', revisado_por = $1 WHERE id = $2 RETURNING *`,
      [req.admin?.usuario || 'admin', req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Comprobante no encontrado' });
    res.json({ ok: true, comprobante: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al rechazar el comprobante' });
  }
});

// Volver un comprobante a pendiente (admin)
app.post('/api/admin/comprobantes/:id/revertir', requiereAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE comprobantes SET estado = 'pendiente', revisado_por = NULL WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Comprobante no encontrado' });
    res.json({ ok: true, comprobante: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al revertir el comprobante' });
  }
});

// ════════════════════════════════════════════════════════════════
// DASHBOARD — estadísticas generales (admin)
// ════════════════════════════════════════════════════════════════
app.get('/api/admin/estadisticas', requiereAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM tickets)                                          AS total_tickets,
        (SELECT COUNT(*) FROM participantes)                                    AS total_participantes,
        (SELECT COUNT(*) FROM comprobantes WHERE estado = 'pendiente')          AS comprobantes_pendientes,
        (SELECT COALESCE(SUM(monto),0) FROM comprobantes WHERE estado='aprobado')  AS ingresos_confirmados,
        (SELECT COALESCE(SUM(monto),0) FROM comprobantes WHERE estado='pendiente') AS ingresos_pendientes
    `);
    const porSorteo = await pool.query(`
      SELECT s.id, s.nombre, s.estado, COUNT(t.id) AS tickets
      FROM sorteos s
      LEFT JOIN tickets t ON t.sorteo_id = s.id
      GROUP BY s.id, s.nombre, s.estado
      ORDER BY tickets DESC
    `);
    res.json({ resumen: r.rows[0], porSorteo: porSorteo.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al calcular estadísticas' });
  }
});

// ════════════════════════════════════════════════════════════════
// INICIO DEL SERVIDOR
// ════════════════════════════════════════════════════════════════
app.listen(PUERTO, async () => {
  console.log(`\n🚀 Servidor corriendo en http://localhost:${PUERTO}`);
  await probarConexion();
  console.log(`📂 Comprobantes se guardan en: ${CARPETA_UPLOADS}\n`);
});
