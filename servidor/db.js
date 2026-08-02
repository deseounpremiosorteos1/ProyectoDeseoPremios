require('dotenv').config();

const { Pool } = require('pg');

const configuracion = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: false }
          : false,
    }
  : {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    };

const pool = new Pool({
  ...configuracion,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (error) => {
  console.error('Error inesperado en PostgreSQL:', error);
});

async function probarConexion() {
  let cliente;

  try {
    cliente = await pool.connect();

    const resultado = await cliente.query(`
      SELECT
        NOW() AS fecha,
        current_database() AS base_datos
    `);

    console.log(
      `✅ PostgreSQL conectado: ${resultado.rows[0].base_datos}`
    );
  } catch (error) {
    console.error('❌ No se pudo conectar con PostgreSQL:', error.message);
    throw error;
  } finally {
    cliente?.release();
  }
}

module.exports = {
  pool,
  probarConexion,
};
