# Juegos de memoria – versión web con MySQL

Contiene el **menú** para escoger entre:

- **Juego de Parejas**: el responsable inicia sesión, escribe el nombre del adulto mayor y juega.
  Al terminar se guardan los **intentos** y el **tiempo** de la partida.
- **Juego de Recuerdos**: inicio de sesión, 5 imágenes al azar y respuestas escritas o por voz.

Ambos guardan en **MySQL** y tienen su pantalla "Ver partidas guardadas".
La sesión se comparte: si ya inició sesión en un juego, el otro no se la vuelve a pedir.

También incluye **recuperación de contraseña por correo** (enlace de un solo uso que vale 1 hora)
y se puede **publicar en internet con un link**: vea [DESPLIEGUE.md](DESPLIEGUE.md).

## Requisitos

- [Node.js](https://nodejs.org) 18 o superior
- MySQL 8 (o MariaDB 10.4+) encendido
- Visual Studio Code

## Puesta en marcha (en VS Code)

1. **Archivo → Abrir carpeta…** y elija esta carpeta (`JuegosWeb`).
2. Abra la terminal (**Terminal → Nueva terminal**) e instale las dependencias:
   ```
   npm install
   ```
3. Cree la base de datos. Lo más fácil: abra `database/schema.sql` en MySQL Workbench
   (File → Open SQL Script) y presione el rayo ⚡.
   En la terminal de VS Code (PowerShell) sería:
   ```
   cmd /c "mysql -u root -p < database\schema.sql"
   ```
   > **Si ya había creado la base de datos antes**, no la cree de nuevo. Ejecute en Workbench,
   > en este orden y **una sola vez cada uno**:
   > 1. `database/migracion_parejas.sql` (tabla del Juego de Parejas), solo si aún no lo hizo.
   > 2. `database/migracion_recuperacion.sql` (correo de los usuarios y recuperación de contraseña).
4. Copie `.env.example` y llámela `.env`. Complete `DB_USER`, `DB_PASSWORD` y cambie `SESSION_SECRET`.
   Para probar la recuperación de contraseña en su computador no necesita configurar el correo:
   el enlace se imprime en la **terminal** donde corre `npm start`.
5. (Opcional) Pase las cuentas del antiguo `usuarios.txt` a la base de datos:
   ```
   npm run importar-usuarios
   ```
   Las claves se guardan cifradas (bcrypt). Usa `scripts/usuarios.txt`; para otro archivo:
   `npm run importar-usuarios -- ruta/archivo.txt`
6. Inicie el servidor:
   ```
   npm start
   ```
7. Abra **http://localhost:3000** en el navegador.

> No use la extensión "Live Server": esta aplicación necesita el servidor de Node para funcionar.

## Estructura

```
server.js                 Servidor Express y API
correo.js                 Envío de correos (Brevo)
db.js                     Conexión a MySQL
database/schema.sql       Tablas: usuarios, partidas, respuestas, partidas_parejas
database/migracion_parejas.sql      Tabla de Parejas (si ya tenía la base creada)
database/migracion_recuperacion.sql Correo y recuperación (si ya tenía la base creada)
scripts/                  Importador de usuarios.txt y creación de tablas en la nube
DESPLIEGUE.md             Guía para publicar con link (GitHub + Render + Aiven + Brevo)
public/index.html         Pantallas de la aplicación
public/css/estilos.css    Estilos
public/js/                parejas.js, recuerdos.js, sesion.js, main.js, api.js, nav.js
public/imagenes/          Imágenes del Juego de Recuerdos
```

## Qué se guarda en la base de datos

| Antes (Java)                          | Ahora (MySQL)                              |
|---------------------------------------|--------------------------------------------|
| `usuarios.txt`                        | tabla `usuarios` (clave con hash bcrypt)   |
| `Resultado_<nombre>_<fecha>.txt`      | tabla `partidas` (responsable, adulto mayor, fecha) |
| Las 5 imágenes y respuestas del .txt  | tabla `respuestas` (orden, imagen, respuesta) |
| (nuevo) enlaces de recuperación       | tabla `recuperaciones` (solo el hash del enlace, vence en 1 hora) |
| (nuevo) Juego de Parejas              | tabla `partidas_parejas` (adulto mayor, intentos, tiempo, fecha) |

En el Juego de Parejas el mínimo posible es 4 intentos (una pareja por intento). El tiempo
cuenta desde la primera tarjeta que se voltea hasta encontrar la última pareja. Si se
reinicia o se abandona una partida, no se guarda.

## Recuperación de contraseña

1. En el inicio de sesión: **¿Olvidó su contraseña?** → escribe su correo.
2. Le llega un enlace (vale 1 hora y se usa una sola vez) que abre la pantalla para elegir
   una contraseña nueva.
3. Para que funcione, la cuenta debe tener un **correo**. Las cuentas nuevas lo piden al
   registrarse; las antiguas lo agregan en **Correo de recuperación** (pide la contraseña actual).

Por seguridad, la página responde lo mismo exista o no el correo, y solo se guarda el hash del enlace.

## Para agregar o cambiar imágenes

Ponga archivos `.jpg`, `.jpeg`, `.png`, `.gif` o `.bmp` en `public/imagenes/`
(mínimo 5). No hay que reiniciar el servidor.

## Notas

- **Voz:** el modo de voz usa el reconocimiento del navegador (Chrome o Edge) en lugar de Vosk.
  Necesita internet y permiso de micrófono. Si no está disponible, se puede escribir la respuesta.
- Los archivos `Resultado_*.txt` anteriores no se migran automáticamente.
- Para publicarlo en internet use HTTPS y `NODE_ENV=production`.
