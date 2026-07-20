// ════════════════════════════════════════════════════════════════
// Conexión a PostgreSQL — usa los datos del archivo .env
// ════════════════════════════════════════════════════════════════
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.on('error', (err) => {
  console.error('Error inesperado en la conexión a PostgreSQL:', err);
});

// Probar la conexión al iniciar
async function probarConexion() {
  try {
    const cliente = await pool.connect();
    console.log('✅ Conectado a PostgreSQL correctamente (base de datos: ' + process.env.DB_NAME + ')');
    cliente.release();
  } catch (err) {
    console.error('❌ No se pudo conectar a PostgreSQL. Revisa tu archivo .env');
    console.error('   Detalle:', err.message);
  }
}

module.exports = { pool, probarConexion };
