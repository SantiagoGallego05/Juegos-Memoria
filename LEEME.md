# Juegos de memoria – versión web con MySQL

Contiene el **menú** para escoger entre:

- **Juego de Parejas**: el responsable inicia sesión, escribe el nombre del adulto mayor y **elige la
  dificultad** (tablero de 3×2 hasta 5×4). Al terminar se guardan el **tablero**, los **intentos** y el
  **tiempo** de la partida.
- **Juego de Recuerdos**: inicio de sesión, 5 imágenes al azar y respuestas escritas o por voz. El
  responsable puede **subir sus propias fotos** (por ejemplo, de la familia) en *Mis imágenes* y elegir si
  juega con las del juego, solo con las suyas o con una mezcla.

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
   > **Si ya había creado la base de datos antes**, no la cree de nuevo: póngala al día con
   > ```
   > npm run migrar
   > ```
   > Revisa qué tablas y columnas faltan y agrega solo esas (no repite ni borra nada), así que se puede
   > ejecutar las veces que quiera. Equivale a los archivos `migracion_*.sql`, que quedan como referencia.
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
database/migracion_mejoras.sql      Tablero de Parejas e imágenes propias (si ya tenía la base creada)
scripts/                  migrar.js (pone la base al día), crear_tablas.js, importar_usuarios.js
DESPLIEGUE.md             Guía paso a paso: GitHub + Aiven + Brevo + Render (publicar con link)
public/index.html         Pantallas de la aplicación
public/css/estilos.css    Estilos
public/js/                parejas.js, recuerdos.js, imagenes.js, sesion.js, main.js, api.js, nav.js
public/imagenes/          Imágenes del Juego de Recuerdos
```

## Qué se guarda en la base de datos

| Antes (Java)                          | Ahora (MySQL)                              |
|---------------------------------------|--------------------------------------------|
| `usuarios.txt`                        | tabla `usuarios` (clave con hash bcrypt)   |
| `Resultado_<nombre>_<fecha>.txt`      | tabla `partidas` (responsable, adulto mayor, fecha) |
| Las 5 imágenes y respuestas del .txt  | tabla `respuestas` (orden, imagen, respuesta) |
| (nuevo) enlaces de recuperación       | tabla `recuperaciones` (solo el hash del enlace, vence en 1 hora) |
| (nuevo) fotos que sube cada responsable | tabla `imagenes_usuario` (la foto, privada de quien la sube) |
| (nuevo) Juego de Parejas              | tabla `partidas_parejas` (adulto mayor, tablero, intentos, tiempo, fecha) |

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

## Dificultad del Juego de Parejas

| Nivel | Tablero | Tarjetas | Parejas |
|---|---|---|---|
| Fácil | 3 × 2 | 6 | 3 |
| Normal | 4 × 2 | 8 | 4 |
| Medio | 4 × 3 | 12 | 6 |
| Difícil | 4 × 4 | 16 | 8 |
| Experto | 5 × 4 | 20 | 10 |

Se elige antes de empezar y se puede cambiar con **← Cambiar jugador o dificultad**. El mínimo de
intentos posible es una pareja por intento, así que se puede comparar el desempeño entre partidas
del mismo nivel.

## Mis imágenes (Juego de Recuerdos)

En la pantalla de datos, **📷 Mis imágenes**: elija una o varias fotos de su computador o celular. El
navegador las reduce (máximo 1280 px) y se guardan **en la base de datos**, privadas de quien las sube
(máximo 30 por usuario). Para jugar *Solo las mías* se necesitan al menos 5. Si elimina una foto, las
respuestas ya guardadas en el historial se conservan.

## Para agregar o cambiar imágenes del juego

Ponga archivos `.jpg`, `.jpeg`, `.png`, `.gif` o `.bmp` en `public/imagenes/`
(mínimo 5). No hay que reiniciar el servidor.

## Notas

- **Voz:** el modo de voz usa el reconocimiento del navegador (Chrome o Edge) en lugar de Vosk.
  Necesita internet y permiso de micrófono. Si no está disponible, se puede escribir la respuesta.
- Los archivos `Resultado_*.txt` anteriores no se migran automáticamente.
- Para publicarlo en internet use HTTPS y `NODE_ENV=production`.
