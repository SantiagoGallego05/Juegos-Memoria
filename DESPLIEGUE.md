# Publicar la aplicación en internet (con link)

Al terminar tendrá una dirección como `https://juegos-memoria.onrender.com` que se abre
desde cualquier computador o celular con internet, sin necesidad de tener su equipo encendido.

## Qué se usa (todo con plan gratuito, sin tarjeta)

| Pieza | Servicio | Para qué |
|---|---|---|
| Código | **GitHub** | Guarda el proyecto; Render lo descarga de ahí |
| Página + servidor | **Render** (Web Service) | Ejecuta `server.js` y da el link público |
| Base de datos | **Aiven** (MySQL) | Guarda usuarios y partidas en la nube |
| Correos | **Brevo** | Envía el enlace de recuperación de contraseña |

> **Por qué Brevo y no Gmail/SMTP:** el plan gratis de Render bloquea los puertos de SMTP
> (25, 465 y 587), así que los correos se envían por la API web de Brevo.

Los planes gratuitos cambian con el tiempo. Si algún nombre de menú es distinto, busque la
opción equivalente.

---

## Paso 1. Subir el proyecto a GitHub

1. Cree una cuenta en https://github.com y un repositorio nuevo (por ejemplo `juegos-memoria`).
   Puede ser privado.
2. En la terminal de VS Code, dentro de la carpeta del proyecto:
   ```
   git init
   git add .
   git commit -m "Juegos de memoria"
   git branch -M main
   git remote add origin https://github.com/SU_USUARIO/juegos-memoria.git
   git push -u origin main
   ```
3. El archivo `.gitignore` ya evita subir `.env` (sus claves) y `node_modules`.
   **Nunca suba el archivo `.env`.**

## Paso 2. Base de datos en Aiven

1. Cree una cuenta en https://aiven.io (no pide tarjeta) y un servicio **MySQL** con el
   plan **Free**.
2. Espere a que el estado sea *Running* y copie los datos de conexión: **Host**, **Port**,
   **User**, **Password** y **Database name** (normalmente `defaultdb`).
3. En su computador, copie `.env.example` como `.env` y complete:
   ```
   DB_HOST=<host de Aiven>
   DB_PORT=<puerto de Aiven>
   DB_USER=<usuario>
   DB_PASSWORD=<contraseña>
   DB_NAME=defaultdb
   DB_SSL=true
   ```
4. Cree las tablas en la nube (ejecuta `schema.sql` sin las líneas de `CREATE DATABASE`):
   ```
   npm install
   npm run crear-tablas
   ```
   Debe mostrar "Tabla lista" para cada tabla. Si no conecta, revise en Aiven la lista de
   direcciones IP permitidas.
5. (Opcional) Pase sus cuentas antiguas: `npm run importar-usuarios`.

> **Importante:** el plan gratis de Aiven puede apagar el servicio si pasa mucho tiempo sin
> uso (avisan por correo). Se vuelve a encender desde su panel con un clic. **Revíselo el día
> antes de la sustentación.**

## Paso 3. Correos con Brevo

1. Cree una cuenta en https://www.brevo.com (plan Free: 300 correos al día).
2. Registre y **verifique el correo remitente** (sección de *Senders*): Brevo le envía un
   mensaje de confirmación. Ese será el correo desde el que salen los enlaces.
3. Cree una **API key** (sección *SMTP & API → API keys*) y cópiela: solo se muestra una vez.

## Paso 4. Publicar en Render

1. Cree una cuenta en https://render.com e inicie sesión con GitHub.
2. **New + → Web Service** y elija su repositorio.
3. Configure:

   | Campo | Valor |
   |---|---|
   | Runtime / Language | Node |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance Type | Free |
   | Health Check Path | `/salud` |

4. En **Environment Variables** agregue:

   | Variable | Valor |
   |---|---|
   | `NODE_ENV` | `production` |
   | `SESSION_SECRET` | un texto largo y aleatorio (mínimo 32 caracteres) |
   | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` | los de Aiven |
   | `DB_NAME` | `defaultdb` (o el nombre que muestre Aiven) |
   | `DB_SSL` | `true` |
   | `BREVO_API_KEY` | la clave de Brevo |
   | `CORREO_REMITENTE` | el correo que verificó en Brevo |
   | `BASE_URL` | la dirección pública (ver el punto siguiente) |

5. Pulse **Create Web Service**. Cuando termine de construir, Render muestra su dirección
   (`https://....onrender.com`). **Ese es su link.**
6. Copie esa dirección, péguela en la variable `BASE_URL` (sin `/` al final) y guarde:
   Render reinicia solo. Sin esto, el enlace del correo de recuperación apuntaría a
   `localhost`.

## Paso 5. Probar

1. Abra el link: debe aparecer el menú de juegos.
2. Cree una cuenta (con un correo real suyo) y juegue una partida de cada juego.
3. Cierre sesión → *¿Olvidó su contraseña?* → escriba su correo → abra el enlace que llega
   (revise **spam**) → elija una nueva contraseña → inicie sesión.

## Cosas que debe saber antes de presentarlo

- **Primera visita lenta:** en el plan gratis, Render "duerme" la aplicación tras 15 minutos
  sin visitas y la primera carga después puede tardar cerca de un minuto. **Abra el link unos
  minutos antes de presentar.**
- **Sesiones:** se guardan en la memoria del servidor; si Render reinicia o se vuelve a
  publicar, hay que iniciar sesión de nuevo. Los datos de la base no se pierden.
- **Voz:** el micrófono solo funciona en sitios con `https://` (Render lo da) y en Chrome o
  Edge.
- **Correos:** pueden llegar a spam al principio. Con el plan gratis de Brevo hay un máximo de
  300 al día.
- **Cuentas antiguas sin correo:** deben iniciar sesión y usar **Correo de recuperación**
  para agregarlo; sin correo no pueden recuperar la contraseña.
- **Cambios futuros:** cada `git push` a `main` vuelve a publicar la página automáticamente.

## Alternativa

Railway permite alojar la página y MySQL en un solo lugar, pero solo da un crédito de prueba
de 5 dólares por 30 días, sin plan gratuito permanente; por eso no se recomienda para algo que
debe seguir disponible.
