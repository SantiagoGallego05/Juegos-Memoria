// Crea las tablas en la base de datos configurada en .env (o en las variables
// de entorno). Sirve sobre todo para la base de datos en la nube, donde no se
// puede (ni hace falta) ejecutar CREATE DATABASE.
//   npm run crear-tablas
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../db');

// Devuelve las sentencias de schema.sql sin comentarios, sin CREATE DATABASE y sin USE
function leerSentencias(sql) {
  return sql
    .replace(/--.*$/gm, '')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && !/^CREATE\s+DATABASE\b/i.test(s) && !/^USE\b/i.test(s));
}

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  const sentencias = leerSentencias(sql);

  for (const sentencia of sentencias) {
    await pool.query(sentencia);
    const nombre = (sentencia.match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/i) || [])[1];
    if (nombre) console.log(`Tabla lista: ${nombre}`);
  }
  console.log('Listo. Las tablas existen en la base de datos', process.env.DB_NAME || 'juego_recuerdos');
  await pool.end();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

module.exports = { leerSentencias };
