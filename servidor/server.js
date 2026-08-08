require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v2: cloudinary } = require('cloudinary');
const { pool, probarConexion } = require('./db');
const { extraerDatosComprobante } = require('./ocrCodigoSeguridad');

const app = express();

const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('La variable JWT_SECRET es obligatoria');
}

const cloudinaryConfigurado = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (cloudinaryConfigurado) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
} else if (NODE_ENV === 'production') {
  throw new Error('Cloudinary debe estar configurado en producción');
}

const origenesPermitidos = [
  process.env.FRONTEND_URL,
  process.env.ADMIN_URL,
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
].filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || origenesPermitidos.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origen no autorizado por CORS: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter(req, file, callback) {
    if (!tiposPermitidos.includes(file.mimetype)) {
      return callback(new Error('Solo se permiten imágenes JPG, PNG o WEBP'));
    }
    callback(null, true);
  },
});

function requiereAdmin(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    req.admin = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}


const whatsappConfigurado = Boolean(
  process.env.WHATSAPP_ACCESS_TOKEN &&
  process.env.WHATSAPP_PHONE_NUMBER_ID
);

function normalizarWhatsAppPeru(numero) {
  const limpio = String(numero || '').replace(/\D/g, '');

  if (!limpio) return '';
  if (limpio.startsWith('51') && limpio.length >= 11) return limpio;
  if (limpio.length === 9) return `51${limpio}`;

  return limpio;
}

async function enviarPlantillaWhatsApp({
  telefono,
  plantilla,
  parametros = [],
  idioma = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'es',
}) {
  if (!whatsappConfigurado || !plantilla) {
    return { omitido: true };
  }

  const destinatario = normalizarWhatsAppPeru(telefono);

  if (!destinatario) {
    return { omitido: true };
  }

  const version = process.env.WHATSAPP_API_VERSION || 'v26.0';
  const url =
    `https://graph.facebook.com/${version}/` +
    `${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const body = {
    messaging_product: 'whatsapp',
    to: destinatario,
    type: 'template',
    template: {
      name: plantilla,
      language: { code: idioma },
      components: [
        {
          type: 'body',
          parameters: parametros.map((valor) => ({
            type: 'text',
            text: String(valor ?? ''),
          })),
        },
      ],
    },
  };

  const respuesta = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    console.error('Error enviando WhatsApp:', data);
    throw new Error(data?.error?.message || 'No se pudo enviar el WhatsApp');
  }

  return data;
}

async function notificarComprobanteRecibido(datos) {
  try {
    return await enviarPlantillaWhatsApp({
      telefono: datos.whatsapp,
      plantilla: process.env.WHATSAPP_TEMPLATE_RECIBIDO,
      parametros: [
        datos.nombre,
        datos.sorteo,
        datos.cantidad,
        `S/ ${Number(datos.monto).toFixed(2)}`,
      ],
    });
  } catch (error) {
    console.error('WhatsApp comprobante recibido:', error.message);
    return { error: error.message };
  }
}

async function notificarCompraAprobada(datos) {
  try {
    return await enviarPlantillaWhatsApp({
      telefono: datos.whatsapp,
      plantilla: process.env.WHATSAPP_TEMPLATE_APROBADO,
      parametros: [
        datos.nombre,
        datos.sorteo,
        datos.tickets.join(', '),
        datos.urlEstado || '',
      ],
    });
  } catch (error) {
    console.error('WhatsApp compra aprobada:', error.message);
    return { error: error.message };
  }
}

async function notificarCompraRechazada(datos) {
  try {
    return await enviarPlantillaWhatsApp({
      telefono: datos.whatsapp,
      plantilla: process.env.WHATSAPP_TEMPLATE_RECHAZADO,
      parametros: [
        datos.nombre,
        datos.sorteo,
      ],
    });
  } catch (error) {
    console.error('WhatsApp compra rechazada:', error.message);
    return { error: error.message };
  }
}

function generarNumeroTicket() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizarPremios(premios, premioUnico) {
  const lista = Array.isArray(premios)
    ? premios.map((p) => String(p).trim()).filter(Boolean)
    : [];

  if (lista.length === 0 && premioUnico) {
    lista.push(String(premioUnico).trim());
  }

  return lista;
}

function subirComprobanteCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'deseo-un-premio/comprobantes',
        resource_type: 'image',
        unique_filename: true,
        overwrite: false,
      },
      (error, resultado) => {
        if (error) return reject(error);
        resolve({
          nombreArchivo: resultado.public_id,
          rutaArchivo: resultado.secure_url,
        });
      }
    );

    stream.end(buffer);
  });
}

async function guardarComprobante(buffer, originalName) {
  if (cloudinaryConfigurado) {
    return subirComprobanteCloudinary(buffer);
  }

  // Solo para desarrollo local.
  const fs = require('fs');
  const path = require('path');
  const carpeta = path.join(__dirname, 'uploads');
  await fs.promises.mkdir(carpeta, { recursive: true });

  const extension = path.extname(originalName || '.jpg').toLowerCase() || '.jpg';
  const nombreArchivo = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
  await fs.promises.writeFile(path.join(carpeta, nombreArchivo), buffer);

  return {
    nombreArchivo,
    rutaArchivo: `/uploads/${nombreArchivo}`,
  };
}

if (!cloudinaryConfigurado) {
  const path = require('path');
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
}

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      ok: true,
      servicio: 'Deseo Un Premio API',
      entorno: NODE_ENV,
      baseDatos: 'conectada',
      fecha: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check fallido:', error);
    res.status(503).json({
      ok: false,
      servicio: 'Deseo Un Premio API',
      baseDatos: 'desconectada',
    });
  }
});

app.post('/api/admin/login', async (req, res) => {
  const usuario = String(req.body.usuario || '').trim();
  const password = String(req.body.password || '');

  if (!usuario || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
  }

  try {
    const resultado = await pool.query(
      'SELECT id, usuario, password_hash FROM admins WHERE usuario = $1 LIMIT 1',
      [usuario]
    );

    const admin = resultado.rows[0];

    if (!admin) {
      if (
        process.env.ADMIN_USER &&
        process.env.ADMIN_PASSWORD &&
        usuario === process.env.ADMIN_USER &&
        password === process.env.ADMIN_PASSWORD
      ) {
        const token = jwt.sign({ usuario }, JWT_SECRET, { expiresIn: '8h' });
        return res.json({ token, usuario });
      }

      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const passwordCorrecto = await bcrypt.compare(password, admin.password_hash);

    if (!passwordCorrecto) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const token = jwt.sign(
      { id: admin.id, usuario: admin.usuario },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    return res.json({ token, usuario: admin.usuario });
  } catch (error) {
    console.error('Error de login:', error);
    return res.status(500).json({ error: 'Error del servidor' });
  }
});

function calcularEstadoSorteo(sorteo, ahora = new Date()) {
  // "cerrado" sigue siendo la pausa manual de emergencia.
  if (sorteo.estado === 'cerrado') {
    return 'pausado';
  }

  const inicio = sorteo.fecha_inicio_ventas
    ? new Date(sorteo.fecha_inicio_ventas)
    : null;

  const cierre = sorteo.fecha_cierre_ventas
    ? new Date(sorteo.fecha_cierre_ventas)
    : null;

  const fechaSorteo = sorteo.fecha_sorteo
    ? new Date(sorteo.fecha_sorteo)
    : null;

  if (inicio && ahora < inicio) {
    return 'programado';
  }

  if (cierre && ahora >= cierre) {
    if (fechaSorteo && ahora >= fechaSorteo) {
      return 'listo_sorteo';
    }

    return 'ventas_cerradas';
  }

  return 'activo';
}

function serializarSorteo(sorteo) {
  return {
    ...sorteo,

    // Conservamos el estado guardado para el botón Pausar/Reactivar.
    estado_manual: sorteo.estado,

    // "estado" es lo que verá frontend/admin y se calcula por fecha.
    estado: calcularEstadoSorteo(sorteo),
  };
}

app.get('/api/sorteos', async (req, res) => {
  const { estado } = req.query;

  try {
    const resultado = await pool.query(
      `SELECT *
       FROM sorteos
       ORDER BY fecha_sorteo ASC`
    );

    let sorteos = resultado.rows.map(serializarSorteo);

    if (estado && estado !== 'todos') {
      sorteos = sorteos.filter((s) => s.estado === estado);
    }

    return res.json(sorteos);
  } catch (error) {
    console.error('Error al consultar sorteos:', error);
    return res.status(500).json({
      error: 'Error al consultar sorteos',
    });
  }
});

app.post('/api/sorteos', requiereAdmin, async (req, res) => {
  const {
    nombre,
    premio,
    fecha_inicio_ventas,
    fecha_cierre_ventas,
    fecha_sorteo,
    precio_ticket,
    premios,
  } = req.body;

  const listaPremios = normalizarPremios(premios, premio);

  if (
    !nombre ||
    !fecha_inicio_ventas ||
    !fecha_cierre_ventas ||
    !fecha_sorteo
  ) {
    return res.status(400).json({
      error:
        'Nombre, inicio de ventas, cierre de ventas y fecha del sorteo son obligatorios',
    });
  }

  const inicio = new Date(fecha_inicio_ventas);
  const cierre = new Date(fecha_cierre_ventas);
  const sorteo = new Date(fecha_sorteo);

  if (
    Number.isNaN(inicio.getTime()) ||
    Number.isNaN(cierre.getTime()) ||
    Number.isNaN(sorteo.getTime())
  ) {
    return res.status(400).json({ error: 'Las fechas enviadas no son válidas' });
  }

  if (!(inicio < cierre)) {
    return res.status(400).json({
      error: 'La fecha de cierre debe ser posterior al inicio de ventas',
    });
  }

  if (!(cierre < sorteo)) {
    return res.status(400).json({
      error: 'La fecha del sorteo debe ser posterior al cierre de ventas',
    });
  }

  if (listaPremios.length < 1 || listaPremios.length > 10) {
    return res.status(400).json({ error: 'Debes registrar entre 1 y 10 premios' });
  }

  try {
    const resultado = await pool.query(
      `INSERT INTO sorteos
       (
         nombre,
         premio,
         fecha_inicio_ventas,
         fecha_cierre_ventas,
         fecha_sorteo,
         precio_ticket,
         premios
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING *`,
      [
        String(nombre).trim(),
        listaPremios[0],
        fecha_inicio_ventas,
        fecha_cierre_ventas,
        fecha_sorteo,
        Number(precio_ticket || 60),
        JSON.stringify(listaPremios),
      ]
    );

    return res.status(201).json(serializarSorteo(resultado.rows[0]));
  } catch (error) {
    console.error('Error al crear sorteo:', error);
    return res.status(500).json({ error: 'Error al crear el sorteo' });
  }
});

app.patch('/api/sorteos/:id', requiereAdmin, async (req, res) => {
  const {
    nombre,
    premio,
    fecha_inicio_ventas,
    fecha_cierre_ventas,
    fecha_sorteo,
    precio_ticket,
    premios,
  } = req.body;

  const listaPremios = normalizarPremios(premios, premio);

  if (
    !nombre ||
    !fecha_inicio_ventas ||
    !fecha_cierre_ventas ||
    !fecha_sorteo
  ) {
    return res.status(400).json({
      error:
        'Nombre, inicio de ventas, cierre de ventas y fecha del sorteo son obligatorios',
    });
  }

  const inicio = new Date(fecha_inicio_ventas);
  const cierre = new Date(fecha_cierre_ventas);
  const sorteo = new Date(fecha_sorteo);

  if (
    Number.isNaN(inicio.getTime()) ||
    Number.isNaN(cierre.getTime()) ||
    Number.isNaN(sorteo.getTime())
  ) {
    return res.status(400).json({ error: 'Las fechas enviadas no son válidas' });
  }

  if (!(inicio < cierre)) {
    return res.status(400).json({
      error: 'La fecha de cierre debe ser posterior al inicio de ventas',
    });
  }

  if (!(cierre < sorteo)) {
    return res.status(400).json({
      error: 'La fecha del sorteo debe ser posterior al cierre de ventas',
    });
  }

  if (listaPremios.length < 1 || listaPremios.length > 10) {
    return res.status(400).json({ error: 'Debes registrar entre 1 y 10 premios' });
  }

  try {
    const resultado = await pool.query(
      `UPDATE sorteos
       SET nombre = $1,
           premio = $2,
           fecha_inicio_ventas = $3,
           fecha_cierre_ventas = $4,
           fecha_sorteo = $5,
           precio_ticket = $6,
           premios = $7::jsonb
       WHERE id = $8
       RETURNING *`,
      [
        String(nombre).trim(),
        listaPremios[0],
        fecha_inicio_ventas,
        fecha_cierre_ventas,
        fecha_sorteo,
        Number(precio_ticket || 60),
        JSON.stringify(listaPremios),
        req.params.id,
      ]
    );

    if (!resultado.rows[0]) {
      return res.status(404).json({ error: 'Sorteo no encontrado' });
    }

    return res.json(serializarSorteo(resultado.rows[0]));
  } catch (error) {
    console.error('Error al editar sorteo:', error);
    return res.status(500).json({ error: 'Error al editar el sorteo' });
  }
});

app.patch('/api/sorteos/:id/estado', requiereAdmin, async (req, res) => {
  const { estado } = req.body;

  if (!['activo', 'cerrado'].includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }

  try {
    const resultado = await pool.query(
      'UPDATE sorteos SET estado = $1 WHERE id = $2 RETURNING *',
      [estado, req.params.id]
    );

    if (!resultado.rows[0]) {
      return res.status(404).json({ error: 'Sorteo no encontrado' });
    }

    return res.json(serializarSorteo(resultado.rows[0]));
  } catch (error) {
    console.error('Error al actualizar sorteo:', error);
    return res.status(500).json({ error: 'Error al actualizar el sorteo' });
  }
});

app.delete('/api/sorteos/:id', requiereAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      'DELETE FROM sorteos WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (!resultado.rows[0]) {
      return res.status(404).json({ error: 'Sorteo no encontrado' });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error('Error al eliminar sorteo:', error);
    return res.status(500).json({ error: 'Error al eliminar el sorteo' });
  }
});


// ============================================================
// TICKET OFICIAL - CONSULTA SEGURA POR NÚMERO
// Este endpoint NO modifica la base de datos.
// ============================================================
app.get('/api/ticket/:numero', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT
         t.numero,
         p.nombres,
         p.apellidos,
         p.documento,
         s.nombre AS sorteo,
         s.premio,
         s.premios,
         s.fecha_sorteo,
         c.estado AS estado_pago
       FROM tickets t
       JOIN participantes p
         ON p.id = t.participante_id
       JOIN sorteos s
         ON s.id = t.sorteo_id
       JOIN comprobantes c
         ON c.id = t.comprobante_id
       WHERE t.numero = $1
       LIMIT 1`,
      [req.params.numero]
    );

    const fila = resultado.rows[0];

    if (!fila) {
      return res.status(404).json({
        valido: false,
        error: 'Ticket no encontrado',
      });
    }

    const listaPremios = Array.isArray(fila.premios)
      ? fila.premios.filter(Boolean)
      : [];

    return res.json({
      valido: fila.estado_pago === 'aprobado',
      numero: fila.numero,
      participante: `${fila.nombres} ${fila.apellidos}`.trim(),
      documento: fila.documento,
      sorteo: fila.sorteo,
      premio: listaPremios[0] || fila.premio || 'Premio del sorteo',
      fecha_sorteo: fila.fecha_sorteo,
      estado_pago: fila.estado_pago,
    });
  } catch (error) {
    console.error('Error al consultar ticket:', error);

    return res.status(500).json({
      valido: false,
      error: 'Error al consultar el ticket',
    });
  }
});

app.get('/api/tickets/:documento', async (req, res) => {
  try {
    const participanteResultado = await pool.query(
      `SELECT id, nombres, apellidos
       FROM participantes
       WHERE documento = $1
       LIMIT 1`,
      [req.params.documento]
    );

    const participante = participanteResultado.rows[0];

    if (!participante) {
      return res.json({ encontrado: false });
    }

    const comprasResultado = await pool.query(
      `SELECT
         c.id,
         c.estado,
         c.cantidad,
         c.monto,
         c.subido_en AS fecha_compra,
         s.nombre AS sorteo,
         s.premio,
         s.premios,
         s.fecha_sorteo,
         COALESCE(
           ARRAY_AGG(t.numero ORDER BY t.numero)
             FILTER (WHERE t.id IS NOT NULL),
           ARRAY[]::varchar[]
         ) AS tickets
       FROM comprobantes c
       JOIN sorteos s ON s.id = c.sorteo_id
       LEFT JOIN tickets t ON t.comprobante_id = c.id
       WHERE c.participante_id = $1
       GROUP BY c.id, s.id
       ORDER BY c.subido_en DESC`,
      [participante.id]
    );

    const compras = comprasResultado.rows.map((fila) => {
      const listaPremios = Array.isArray(fila.premios)
        ? fila.premios.filter(Boolean)
        : [];

      return {
        id: fila.id,
        estado: fila.estado,
        cantidad: Number(fila.cantidad || 0),
        monto: Number(fila.monto || 0),
        fecha_compra: fila.fecha_compra,
        sorteo: fila.sorteo,
        premio: listaPremios[0] || fila.premio || 'Premio del sorteo',
        fecha_sorteo: fila.fecha_sorteo,
        tickets: fila.tickets || [],
      };
    });

    return res.json({
      encontrado: true,
      nombre: `${participante.nombres} ${participante.apellidos}`.trim(),
      compras,
    });
  } catch (error) {
    console.error('Error al consultar historial de tickets:', error);
    return res.status(500).json({
      error: 'Error al consultar el historial de tickets',
    });
  }
});

app.get('/api/participantes/:documento', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT nombres, apellidos
       FROM participantes
       WHERE documento = $1
       LIMIT 1`,
      [req.params.documento]
    );

    if (!resultado.rows[0]) {
      return res.json({ encontrado: false });
    }

    return res.json({
      encontrado: true,
      ...resultado.rows[0],
    });
  } catch (error) {
    console.error('Error al buscar participante:', error);
    return res.status(500).json({ error: 'Error al buscar participante' });
  }
});

app.get('/api/admin/participantes', requiereAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT
        p.documento,
        p.tipo_documento,
        p.nombres,
        p.apellidos,
        p.whatsapp,
        s.id AS sorteo_id,
        s.nombre AS sorteo_nombre,
        ARRAY_AGG(t.numero ORDER BY t.numero) AS tickets,
        MIN(t.creado_en) AS fecha
      FROM participantes p
      JOIN tickets t ON t.participante_id = p.id
      JOIN sorteos s ON s.id = t.sorteo_id
      GROUP BY
        p.documento,
        p.tipo_documento,
        p.nombres,
        p.apellidos,
        p.whatsapp,
        s.id,
        s.nombre
      ORDER BY fecha DESC
    `);

    return res.json(resultado.rows);
  } catch (error) {
    console.error('Error al listar participantes:', error);
    return res.status(500).json({ error: 'Error al listar participantes' });
  }
});

app.post('/api/comprobantes', upload.single('archivo'), async (req, res) => {
  const {
    documento,
    tipo_documento,
    nombres,
    apellidos,
    whatsapp,
    sorteo_id,
    cantidad,
  } = req.body;

  const cantidadTickets = Number(cantidad);

  if (
    !documento ||
    !nombres ||
    !apellidos ||
    !whatsapp ||
    !sorteo_id ||
    !Number.isInteger(cantidadTickets) ||
    cantidadTickets < 1 ||
    cantidadTickets > 100
  ) {
    return res.status(400).json({ error: 'Los datos enviados no son válidos' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Debes adjuntar el comprobante' });
  }

  let codigoSeguridad = String(req.body.codigo_seguridad || '').trim();
  let fechaComprobante = String(req.body.fecha_comprobante || '').trim();

  if (!codigoSeguridad || !fechaComprobante) {
    try {
      const datosOcr = await extraerDatosComprobante(req.file.buffer);

      if (!codigoSeguridad) {
        codigoSeguridad = String(
          datosOcr.codigo_seguridad || datosOcr.codigo || ''
        ).trim();
      }

      if (!fechaComprobante) {
        fechaComprobante = String(
          datosOcr.fecha_comprobante || datosOcr.fecha || ''
        ).trim();
      }
    } catch (error) {
      console.error('OCR no pudo procesar el comprobante:', error);
    }
  }

  const faltan = [];

  if (!codigoSeguridad || codigoSeguridad.length < 3) {
    faltan.push('codigo_seguridad');
  }

  if (!fechaComprobante) {
    faltan.push('fecha_comprobante');
  }

  if (faltan.length > 0) {
    return res.status(422).json({
      error: 'ocr_incompleto',
      faltan,
    });
  }

  let archivoGuardado;

  try {
    archivoGuardado = await guardarComprobante(
      req.file.buffer,
      req.file.originalname
    );
  } catch (error) {
    console.error('Error al guardar comprobante:', error);
    return res.status(500).json({
      error: 'No se pudo guardar la imagen del comprobante',
    });
  }

  const cliente = await pool.connect();

  try {
    await cliente.query('BEGIN');

    const sorteoResultado = await cliente.query(
      `SELECT
         id,
         nombre,
         premio,
         premios,
         fecha_inicio_ventas,
         fecha_cierre_ventas,
         fecha_sorteo,
         precio_ticket,
         estado
       FROM sorteos
       WHERE id = $1
       LIMIT 1`,
      [sorteo_id]
    );

    const sorteo = sorteoResultado.rows[0];

    if (!sorteo) {
      await cliente.query('ROLLBACK');
      return res.status(404).json({ error: 'Sorteo no encontrado' });
    }

    const estadoAutomatico = calcularEstadoSorteo(sorteo);

    if (estadoAutomatico !== 'activo') {
      await cliente.query('ROLLBACK');

      const mensajes = {
        programado: 'Las ventas de este sorteo todavía no han comenzado',
        ventas_cerradas: 'Las ventas de este sorteo ya finalizaron',
        listo_sorteo: 'El período de ventas terminó y el sorteo ya está listo para realizarse',
        pausado: 'Las ventas de este sorteo están pausadas temporalmente',
      };

      return res.status(400).json({
        error: mensajes[estadoAutomatico] || 'El sorteo no está disponible',
      });
    }


    let participanteResultado = await cliente.query(
      `SELECT id
       FROM participantes
       WHERE tipo_documento = $1
         AND documento = $2
       LIMIT 1`,
      [tipo_documento || 'dni', documento]
    );

    let participanteId = participanteResultado.rows[0]?.id;

    if (participanteId) {
      await cliente.query(
        `UPDATE participantes
         SET nombres = $1,
             apellidos = $2,
             whatsapp = $3
         WHERE id = $4`,
        [nombres, apellidos, whatsapp, participanteId]
      );
    } else {
      participanteResultado = await cliente.query(
        `INSERT INTO participantes
         (tipo_documento, documento, nombres, apellidos, whatsapp)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          tipo_documento || 'dni',
          documento,
          nombres,
          apellidos,
          whatsapp,
        ]
      );

      participanteId = participanteResultado.rows[0].id;
    }

    const precioTicket = Number(sorteo.precio_ticket);
    const totalLineal = precioTicket * cantidadTickets;

    const porcentajesPorCombo = {
      3: 11,
      5: 12,
      7: 13,
      9: 14,
      10: 15,
    };

    const porcentajeDescuento =
      porcentajesPorCombo[cantidadTickets] || 0;

    const monto = porcentajeDescuento > 0
      ? Math.max(
          0,
          Math.round(
            (
              totalLineal *
              (1 - porcentajeDescuento / 100)
            ) / 10
          ) * 10
        )
      : totalLineal;

    const comprobanteResultado = await cliente.query(
      `INSERT INTO comprobantes
       (
         participante_id,
         sorteo_id,
         cantidad,
         monto,
         nombre_archivo,
         ruta_archivo,
         codigo_seguridad,
         fecha_comprobante,
         estado
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pendiente')
       RETURNING *`,
      [
        participanteId,
        sorteo_id,
        cantidadTickets,
        monto,
        archivoGuardado.nombreArchivo,
        archivoGuardado.rutaArchivo,
        codigoSeguridad,
        fechaComprobante,
      ]
    );

    await cliente.query('COMMIT');

    const comprobanteCreado = comprobanteResultado.rows[0];

    // El WhatsApp es una notificación adicional: si Meta está temporalmente
    // indisponible, la compra igualmente queda registrada.
    void notificarComprobanteRecibido({
      whatsapp,
      nombre: `${nombres} ${apellidos}`.trim(),
      sorteo: sorteo.nombre,
      cantidad: cantidadTickets,
      monto,
    });

    return res.status(201).json({
      ok: true,
      comprobante: comprobanteCreado,
      seguimiento_url: `/estado-compra.html?id=${comprobanteCreado.id}`,
    });
  } catch (error) {
    await cliente.query('ROLLBACK');

    if (error.code === '23505') {
      return res.status(409).json({
        error: 'Este comprobante ya fue registrado anteriormente',
      });
    }

    console.error('Error al registrar comprobante:', error);

    return res.status(500).json({
      error: 'Error al registrar el comprobante',
    });
  } finally {
    cliente.release();
  }
});


app.get('/api/comprobantes/:id/estado', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT
         c.id,
         c.estado,
         c.cantidad,
         c.monto,
         c.subido_en,
         p.nombres,
         p.apellidos,
         s.nombre AS sorteo_nombre,
         s.premio AS sorteo_premio,
         s.premios AS sorteo_premios,
         s.fecha_sorteo,
         COALESCE(
           ARRAY_AGG(t.numero ORDER BY t.numero)
             FILTER (WHERE t.id IS NOT NULL),
           ARRAY[]::varchar[]
         ) AS tickets
       FROM comprobantes c
       JOIN participantes p ON p.id = c.participante_id
       JOIN sorteos s ON s.id = c.sorteo_id
       LEFT JOIN tickets t ON t.comprobante_id = c.id
       WHERE c.id = $1
       GROUP BY c.id, p.id, s.id
       LIMIT 1`,
      [req.params.id]
    );

    const compra = resultado.rows[0];

    if (!compra) {
      return res.status(404).json({ error: 'Compra no encontrada' });
    }

    const listaPremios = Array.isArray(compra.sorteo_premios)
      ? compra.sorteo_premios.filter(Boolean)
      : [];

    return res.json({
      id: compra.id,
      estado: compra.estado,
      cantidad: Number(compra.cantidad),
      monto: Number(compra.monto),
      subido_en: compra.subido_en,
      participante: `${compra.nombres} ${compra.apellidos}`.trim(),
      sorteo: {
        nombre: compra.sorteo_nombre,
        premio: listaPremios[0] || compra.sorteo_premio || 'Premio del sorteo',
        fecha: compra.fecha_sorteo,
      },
      tickets: compra.tickets || [],
    });
  } catch (error) {
    console.error('Error al consultar estado de compra:', error);
    return res.status(500).json({ error: 'Error al consultar el estado de la compra' });
  }
});

app.get('/api/admin/comprobantes', requiereAdmin, async (req, res) => {
  const { estado } = req.query;

  try {
    const parametros = [];
    let where = '';

    if (estado && estado !== 'todos') {
      parametros.push(estado);
      where = 'WHERE c.estado = $1';
    }

    const resultado = await pool.query(
      `SELECT
         c.*,
         p.documento,
         p.nombres,
         p.apellidos,
         p.whatsapp,
         s.nombre AS sorteo_nombre
       FROM comprobantes c
       JOIN participantes p ON p.id = c.participante_id
       JOIN sorteos s ON s.id = c.sorteo_id
       ${where}
       ORDER BY c.subido_en DESC`,
      parametros
    );

    return res.json(resultado.rows);
  } catch (error) {
    console.error('Error al listar comprobantes:', error);
    return res.status(500).json({ error: 'Error al listar comprobantes' });
  }
});

app.post(
  '/api/admin/comprobantes/:id/aprobar',
  requiereAdmin,
  async (req, res) => {
    const cliente = await pool.connect();

    try {
      await cliente.query('BEGIN');

      const comprobanteResultado = await cliente.query(
        `SELECT
           c.*,
           p.nombres,
           p.apellidos,
           p.whatsapp,
           s.nombre AS sorteo_nombre
         FROM comprobantes c
         JOIN participantes p ON p.id = c.participante_id
         JOIN sorteos s ON s.id = c.sorteo_id
         WHERE c.id = $1
         FOR UPDATE OF c`,
        [req.params.id]
      );

      const comprobante = comprobanteResultado.rows[0];

      if (!comprobante) {
        throw new Error('Comprobante no encontrado');
      }

      if (comprobante.estado === 'aprobado') {
        throw new Error('Este comprobante ya fue aprobado');
      }

      await cliente.query(
        `UPDATE comprobantes
         SET estado = 'aprobado',
             revisado_por = $1
         WHERE id = $2`,
        [req.admin.usuario || 'admin', comprobante.id]
      );

      const ticketsCreados = [];

      for (let i = 0; i < Number(comprobante.cantidad); i += 1) {
        let ticketCreado = null;

        for (let intento = 0; intento < 20 && !ticketCreado; intento += 1) {
          try {
            const resultadoTicket = await cliente.query(
              `INSERT INTO tickets
               (numero, participante_id, sorteo_id, comprobante_id)
               VALUES ($1, $2, $3, $4)
               RETURNING *`,
              [
                generarNumeroTicket(),
                comprobante.participante_id,
                comprobante.sorteo_id,
                comprobante.id,
              ]
            );

            ticketCreado = resultadoTicket.rows[0];
          } catch (error) {
            if (error.code !== '23505') throw error;
          }
        }

        if (!ticketCreado) {
          throw new Error('No se pudo generar un número de ticket único');
        }

        ticketsCreados.push(ticketCreado);
      }

      await cliente.query('COMMIT');

      const urlEstado = process.env.FRONTEND_PUBLIC_URL
        ? `${process.env.FRONTEND_PUBLIC_URL.replace(/\/$/, '')}/estado-compra.html?id=${comprobante.id}`
        : '';

      void notificarCompraAprobada({
        whatsapp: comprobante.whatsapp,
        nombre: `${comprobante.nombres} ${comprobante.apellidos}`.trim(),
        sorteo: comprobante.sorteo_nombre,
        tickets: ticketsCreados.map((ticket) => ticket.numero),
        urlEstado,
      });

      return res.json({
        ok: true,
        tickets: ticketsCreados,
      });
    } catch (error) {
      await cliente.query('ROLLBACK');
      console.error('Error al aprobar comprobante:', error);

      return res.status(400).json({
        error: error.message || 'Error al aprobar el comprobante',
      });
    } finally {
      cliente.release();
    }
  }
);

app.post(
  '/api/admin/comprobantes/:id/rechazar',
  requiereAdmin,
  async (req, res) => {
    try {
      const previo = await pool.query(
        `SELECT c.id, p.nombres, p.apellidos, p.whatsapp, s.nombre AS sorteo_nombre
         FROM comprobantes c
         JOIN participantes p ON p.id = c.participante_id
         JOIN sorteos s ON s.id = c.sorteo_id
         WHERE c.id = $1
         LIMIT 1`,
        [req.params.id]
      );

      const resultado = await pool.query(
        `UPDATE comprobantes
         SET estado = 'rechazado',
             revisado_por = $1
         WHERE id = $2
         RETURNING *`,
        [req.admin.usuario || 'admin', req.params.id]
      );

      if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Comprobante no encontrado' });
      }

      const datos = previo.rows[0];
      if (datos) {
        void notificarCompraRechazada({
          whatsapp: datos.whatsapp,
          nombre: `${datos.nombres} ${datos.apellidos}`.trim(),
          sorteo: datos.sorteo_nombre,
        });
      }

      return res.json({
        ok: true,
        comprobante: resultado.rows[0],
      });
    } catch (error) {
      console.error('Error al rechazar comprobante:', error);
      return res.status(500).json({ error: 'Error al rechazar el comprobante' });
    }
  }
);

app.post(
  '/api/admin/comprobantes/:id/revertir',
  requiereAdmin,
  async (req, res) => {
    try {
      const resultado = await pool.query(
        `UPDATE comprobantes
         SET estado = 'pendiente',
             revisado_por = NULL
         WHERE id = $1
         RETURNING *`,
        [req.params.id]
      );

      if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Comprobante no encontrado' });
      }

      return res.json({
        ok: true,
        comprobante: resultado.rows[0],
      });
    } catch (error) {
      console.error('Error al revertir comprobante:', error);
      return res.status(500).json({ error: 'Error al revertir el comprobante' });
    }
  }
);

app.get('/api/admin/estadisticas', requiereAdmin, async (req, res) => {
  try {
    const resumen = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM tickets) AS total_tickets,
        (SELECT COUNT(*) FROM participantes) AS total_participantes,
        (SELECT COUNT(*) FROM comprobantes WHERE estado = 'pendiente')
          AS comprobantes_pendientes,
        (SELECT COALESCE(SUM(monto), 0)
         FROM comprobantes
         WHERE estado = 'aprobado')
          AS ingresos_confirmados,
        (SELECT COALESCE(SUM(monto), 0)
         FROM comprobantes
         WHERE estado = 'pendiente')
          AS ingresos_pendientes
    `);

    const porSorteo = await pool.query(`
      SELECT
        s.id,
        s.nombre,
        s.estado,
        COUNT(t.id) AS tickets
      FROM sorteos s
      LEFT JOIN tickets t ON t.sorteo_id = s.id
      GROUP BY s.id, s.nombre, s.estado
      ORDER BY tickets DESC
    `);

    return res.json({
      resumen: resumen.rows[0],
      porSorteo: porSorteo.rows,
    });
  } catch (error) {
    console.error('Error al calcular estadísticas:', error);
    return res.status(500).json({ error: 'Error al calcular estadísticas' });
  }
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    ruta: req.originalUrl,
  });
});

app.use((error, req, res, next) => {
  console.error('Error no controlado:', error);

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'La imagen supera el tamaño máximo de 5 MB',
      });
    }

    return res.status(400).json({ error: error.message });
  }

  if (error.message?.includes('Solo se permiten imágenes')) {
    return res.status(415).json({ error: error.message });
  }

  if (error.message?.includes('CORS')) {
    return res.status(403).json({ error: 'Origen no autorizado' });
  }

  return res.status(500).json({
    error: NODE_ENV === 'production'
      ? 'Ocurrió un error interno'
      : error.message,
  });
});

async function iniciarServidor() {
  await probarConexion();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API ejecutándose en el puerto ${PORT}`);
    console.log(`🌎 Entorno: ${NODE_ENV}`);
  });
}

iniciarServidor().catch((error) => {
  console.error('No se pudo iniciar el servidor:', error);
  process.exit(1);
});
