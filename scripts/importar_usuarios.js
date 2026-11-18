// Importa las cuentas del antiguo usuarios.txt (formato usuario|clave|nombre[|correo])
// a la tabla "usuarios", guardando las claves como hash bcrypt.
//   npm run importar-usuarios                 -> usa scripts/usuarios.txt
//   npm run importar-usuarios -- ruta/otro.txt
// ENV_FILE permite usar otro archivo de configuracion (por ejemplo .env.nube)
require('dotenv').config({ path: process.env.ENV_FILE || '.env' });
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('../db');

async function main() {
  const archivo = process.argv[2] || path.join(__dirname, 'usuarios.txt');
  const lineas = fs.readFileSync(archivo, 'utf8').split(/\r?\n/).filter(l => l.trim());
  let nuevos = 0, repetidos = 0;

  for (const linea of lineas) {
    const [usuario, clave, nombre, correo] = linea.split('|');
    if (!usuario || !clave || !nombre) {
      console.log('Linea ignorada (formato incorrecto):', linea);
      continue;
    }
    const hash = await bcrypt.hash(clave, 10);
    const [r] = await pool.execute(
      'INSERT IGNORE INTO usuarios (usuario, password_hash, nombre_responsable, correo) VALUES (?, ?, ?, ?)',
      [usuario.trim(), hash, nombre.trim(), correo && correo.trim() ? correo.trim().toLowerCase() : null]
    );
    if (r.affectedRows) nuevos++; else repetidos++;
  }
  console.log(`Listo. Importados: ${nuevos}. Ya existian: ${repetidos}.`);
  await pool.end();
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
