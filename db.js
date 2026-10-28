require('dotenv').config();
const fs = require('fs');
const mysql = require('mysql2/promise');

// Las bases de datos en la nube (Aiven, etc.) exigen conexion cifrada (SSL).
//   DB_SSL=true                -> conexion cifrada
//   DB_SSL_CA=<texto o ruta>   -> (opcional) certificado CA para verificar el servidor
function opcionesSsl() {
  if (String(process.env.DB_SSL).toLowerCase() !== 'true') return undefined;
  const ca = process.env.DB_SSL_CA;
  if (!ca) return { rejectUnauthorized: false };
  const contenido = ca.includes('BEGIN CERTIFICATE')
    ? ca.replace(/\\n/g, '\n')
    : fs.readFileSync(ca, 'utf8');
  return { ca: contenido, rejectUnauthorized: true };
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'juego_recuerdos',
  ssl: opcionesSsl(),
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
});

module.exports = pool;
