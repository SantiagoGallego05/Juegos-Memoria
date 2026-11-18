# Guía: publicar la aplicación con link (GitHub + Aiven + Brevo + Render)

Al terminar tendrá una dirección como `https://juegos-memoria.onrender.com` que abre desde
cualquier computador o celular con internet, sin tener su equipo encendido.

## Cómo encajan las piezas

```
Su computador ──git push──► GitHub ──(Render lo descarga)──► Render  ◄── el link público
                                                               │  │
                                          datos ───────────────┘  └─────────── correos
                                            ▼                                      ▼
                                          Aiven (MySQL)                         Brevo
```

| Pieza | Servicio | Para qué | Costo |
|---|---|---|---|
| Código | **GitHub** | Guarda el proyecto; Render lo descarga de ahí | Gratis |
| Base de datos | **Aiven** | MySQL en la nube: usuarios, partidas, **fotos subidas** | Gratis (1 GB) |
| Correos | **Brevo** | Envía el enlace de recuperación de contraseña | Gratis (300 al día) |
| Página + servidor | **Render** | Ejecuta `server.js` y da el link | Gratis (se "duerme", ver más abajo) |

**Orden recomendado:** 1) GitHub → 2) Aiven → 3) Brevo → 4) Render. Calcule entre 45 y 90 minutos
la primera vez. No necesita tarjeta de crédito en ninguno.

> Los menús de estas plataformas cambian de vez en cuando. Si un nombre no coincide, busque el más
> parecido. Los pasos de esta guía se verificaron en la documentación de cada servicio.

---

## 0. Preparación

1. Tenga instalado **Node.js** (ya lo usa) y **Git**: https://git-scm.com/download/win
2. Compruebe en la terminal de VS Code:
   ```powershell
   node -v
   git --version
   ```
3. Dígale a Git quién es (una sola vez en el computador; use el correo de su cuenta de GitHub):
   ```powershell
   git config --global user.name "Su Nombre"
   git config --global user.email "su_correo@ejemplo.com"
   ```

> **Si el proyecto está dentro de OneDrive** (como `C:\Users\...\OneDrive\...`): OneDrive intenta
> sincronizar la carpeta `node_modules` (miles de archivos) y puede volver todo lento. Si le molesta,
> pause la sincronización mientras trabaja o mueva el proyecto a una carpeta fuera de OneDrive,
> por ejemplo `C:\proyectos\JuegosWeb`.

---

## 1. GitHub: subir el proyecto

### 1.1 Crear la cuenta y el repositorio
1. Cree una cuenta en https://github.com.
2. Pulse **New** (o el **+** arriba a la derecha → *New repository*).
3. Nombre: `juegos-memoria`. Elija **Private** (privado) si prefiere que nadie vea el código;
   Render puede leer repositorios privados.
4. **No** marque *Add a README*, *.gitignore* ni *license*: el proyecto ya trae sus archivos.
5. Pulse **Create repository** y deje abierta la página: muestra la dirección del repositorio.

### 1.2 Subir el código
En la terminal de VS Code, dentro de la carpeta `JuegosWeb`:

```powershell
git init
git add .
git commit -m "Juegos de memoria"
git branch -M main
git remote add origin https://github.com/SU_USUARIO/juegos-memoria.git
git push -u origin main
```

Reemplace `SU_USUARIO` por su usuario de GitHub. La primera vez se abre una ventana del navegador
para iniciar sesión en GitHub: acéptela. (Si le pide "contraseña" por terminal, GitHub ya no
acepta la contraseña normal: cree un *Personal access token* en
*Settings → Developer settings → Personal access tokens* y úselo como contraseña.)

### 1.3 Compruebe lo más importante
Recargue la página del repositorio y verifique:
- ✅ Se ven `server.js`, `package.json`, la carpeta `public`, etc.
- ❌ **No** aparecen `.env`, `.env.nube` ni `node_modules`. El archivo `.gitignore` ya los excluye.

> **Si por error subió un archivo `.env`:** contiene sus claves. Aunque lo borre del repositorio,
> quedan en el historial, así que **cambie esas claves** (contraseña de Aiven, clave de Brevo,
> `SESSION_SECRET`) y luego quítelo con `git rm --cached .env` → `git commit -m "Quitar .env"`
> → `git push`.

### 1.4 Cada vez que haga cambios
```powershell
git add .
git commit -m "Describa el cambio"
git push
```
Render vuelve a publicar la página solo (paso 4).

### Errores frecuentes de Git

| Mensaje | Qué hacer |
|---|---|
| `remote origin already exists` | `git remote set-url origin https://github.com/SU_USUARIO/juegos-memoria.git` |
| `Author identity unknown` | Repita los dos comandos `git config` del paso 0 |
| `src refspec main does not match any` | Aún no hizo el `git commit`; hágalo y repita el `push` |
| `rejected ... fetch first` | `git pull --rebase origin main` y luego `git push` |
| `Authentication failed` | Use un *Personal access token* en lugar de la contraseña (ver 1.2) |

---

## 2. Aiven: la base de datos MySQL en la nube

### 2.1 Crear el servicio
1. Cree una cuenta en https://console.aiven.io.
2. **Services → Create service → MySQL**.
3. En *Service tier* elija **Free**. (En el plan gratis no se escoge región.)
4. Póngale un nombre (por ejemplo `juegos-mysql`) y pulse **Create service**.
5. Espere a que el estado sea **Running** (tarda unos minutos). Conectarse antes de eso da errores
   que parecen de contraseña pero no lo son.

### 2.2 Copiar los datos de conexión
En la pestaña **Overview** del servicio, en *Connection information*, anote:

| Dato de Aiven | Variable del `.env` |
|---|---|
| Host | `DB_HOST` |
| **Port** | `DB_PORT` |
| User (normalmente `avnadmin`) | `DB_USER` |
| Password | `DB_PASSWORD` |
| Database name (normalmente `defaultdb`) | `DB_NAME` |

> ⚠️ **Dos trampas frecuentes**
> 1. **Aiven muestra dos puertos para MySQL:** el normal y el de *X Protocol*. Use **el puerto
>    MySQL normal**. Con el otro, la conexión se queda esperando y falla con `ETIMEDOUT`.
> 2. Aiven también muestra un *Service URI* (`mysql://usuario:clave@host...`). **No lo use**: este
>    proyecto pide cada dato por separado.

Aiven exige conexión cifrada, así que además agregue `DB_SSL=true`.

Abajo en la misma página, compruebe que **Allowed IP addresses** esté en `0.0.0.0/0` (cualquiera
puede intentar conectarse; es lo normal en el plan gratis, la contraseña lo protege).

### 2.3 Crear las tablas en la nube
Para no mezclar con su MySQL local, cree un archivo `.env.nube` (copia de `.env.example`) con los
datos de Aiven:

```
DB_HOST=<host de Aiven>
DB_PORT=<puerto MySQL normal de Aiven>
DB_USER=avnadmin
DB_PASSWORD=<contraseña de Aiven>
DB_NAME=defaultdb
DB_SSL=true
```

Después, en PowerShell:

```powershell
npm install
$env:ENV_FILE=".env.nube"; npm run crear-tablas
```

Debe imprimir `Tabla lista: ...` para cada tabla. (Los archivos `.env.*` están en `.gitignore`: no se
suben a GitHub.) Para volver a usar su base local, cierre y abra la terminal, o ejecute
`Remove-Item Env:ENV_FILE`.

### 2.4 Cosas que debe saber
- **Se puede apagar por inactividad.** Si la página deja de conectar, entre a Aiven →
  su servicio → **Actions (⋮) → Power on service**. **Revíselo el día antes de presentar.**
- Estado del servicio de Aiven: https://status.aiven.io
- Las fotos que suben los usuarios se guardan **en esta base de datos**, no en el disco de Render
  (el disco de Render gratis se borra al reiniciar). Cada foto se reduce a unos 200–500 KB y hay un
  máximo de 30 por usuario, así que 1 GB alcanza de sobra.

---

## 3. Brevo: correos de recuperación de contraseña

(Sin esto la página funciona igual, pero no podrá enviar el enlace para recuperar la contraseña.)

1. Cree una cuenta en https://www.brevo.com (plan gratis: 300 correos al día).
2. **Registre su remitente:** *Settings → Senders & IP → Senders → Add a sender*. Escriba su
   nombre y un correo suyo real. Brevo le envía un mensaje de confirmación: **abra el enlace** para
   verificarlo. Sin verificar, Brevo no entrega los correos.
3. **Cree la clave de la API:** *Settings → SMTP & API → API Keys → Generate a new API key*.
   Copie la clave (empieza por `xkeysib-`). **Solo se muestra una vez**: guárdela.
4. Anote para el paso siguiente:
   - `BREVO_API_KEY` = la clave
   - `CORREO_REMITENTE` = el correo verificado en el punto 2

> Si un correo no llega: revise la carpeta de **spam** y, en Brevo, *Transactional → Email logs*, que
> explica por qué se rechazó. Los primeros correos desde un remitente nuevo suelen caer en spam.

---

## 4. Render: publicar la página

### 4.1 Crear la cuenta y conectar GitHub
1. Cree una cuenta en https://render.com e inicie sesión **con GitHub**.
2. En el panel: **New → Web Service → Build and deploy from a Git repository → Next**.
3. Elija su repositorio `juegos-memoria`. Si no aparece, pulse **Configure GitHub App** y déle acceso
   a ese repositorio.

### 4.2 Configurarlo

| Campo | Valor |
|---|---|
| Name | `juegos-memoria` (será parte del link) |
| Branch | `main` |
| Language / Runtime | **Node** |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | **Free** |

Abra la sección **Advanced** y ponga **Health Check Path** = `/salud`.

### 4.3 Variables de entorno (en *Advanced → Environment Variables*)

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | un texto largo y aleatorio (mínimo 32 caracteres) |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` | los de Aiven |
| `DB_NAME` | `defaultdb` (o el que muestre Aiven) |
| `DB_SSL` | `true` |
| `BREVO_API_KEY` | la clave de Brevo |
| `CORREO_REMITENTE` | el correo verificado en Brevo |
| `BASE_URL` | por ahora déjela para después (paso 4.5) |

**No cree** la variable `PORT`: Render la pone sola y la aplicación ya la usa.

> Para generar un `SESSION_SECRET`, en PowerShell:
> `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### 4.4 Publicar
Pulse **Create Web Service**. Render descarga el código, ejecuta `npm install` y arranca la
aplicación; la primera vez tarda unos minutos. Puede ver el avance en la pestaña de registros
(*Logs* / *Events*). Cuando termine verá algo como `Servidor listo en http://localhost:10000`.

### 4.5 Escribir el link en BASE_URL
1. Arriba en la página del servicio, Render muestra su dirección: `https://juegos-memoria.onrender.com`.
   **Ese es su link.**
2. Vaya a **Environment**, cree `BASE_URL` con esa dirección **sin `/` al final** y guarde.
   Render reinicia solo.

Sin este paso, el enlace del correo de recuperación apuntaría a `localhost` y no funcionaría.

### 4.6 Probar todo
1. Abra el link: debe verse el menú.
2. **Cree una cuenta** con un correo real suyo.
3. Juegue **Parejas** en un nivel y **Recuerdos** con las imágenes del juego.
4. En Recuerdos → **Mis imágenes**, suba 5 o más fotos y juegue con *Solo las mías*.
5. Cierre sesión → **¿Olvidó su contraseña?** → revise su correo (y spam) → abra el enlace → elija una
   contraseña nueva → inicie sesión.

---

## 5. Actualizar la página cuando haga cambios

1. Suba el código: `git add .` → `git commit -m "..."` → `git push` (Render publica solo).
2. Si el cambio incluye **tablas nuevas o columnas nuevas** (como en esta versión), actualice también
   las bases de datos con el migrador, que revisa qué falta y no repite nada:

   ```powershell
   npm run migrar                                       # su base local (.env)
   $env:ENV_FILE=".env.nube"; npm run migrar            # la base de Aiven
   ```
   Hágalo **antes** de probar la versión nueva: si la base no está al día, las funciones nuevas fallan.

Si un despliegue falla, Render cancela el cambio y sigue funcionando la versión anterior; el motivo
aparece en los registros.

---

## 6. Problemas frecuentes

| Síntoma | Causa probable y solución |
|---|---|
| `Access denied for user 'root'@'localhost' (using password: NO)` | El programa no lee el `.env`. Debe llamarse exactamente `.env`, estar junto a `package.json` y tener `DB_PASSWORD`. |
| `connect ETIMEDOUT` | (1) El servicio de Aiven no está **Running** o está apagado. (2) Usó el **puerto X Protocol**. (3) Su red bloquea ese puerto (pruebe con los datos del celular). (4) *Allowed IP addresses* no es `0.0.0.0/0`. |
| `Access denied` con datos de Aiven | Contraseña o usuario mal copiados, o espacios/comillas en el `.env`. |
| La página tarda ~1 minuto en abrir | Es normal en Render gratis tras 15 minutos sin visitas: se "duerme". Abra el link antes de presentar. |
| `No se pudo conectar a MySQL` en los registros de Render | Variables `DB_*` mal escritas, falta `DB_SSL=true` o Aiven está apagado. |
| Hay que iniciar sesión otra vez de repente | Render reinició o se publicó una versión nueva: las sesiones viven en memoria. Los datos no se pierden. |
| No llega el correo de recuperación | Revise spam; que el remitente esté **verificado** en Brevo; *Transactional → Email logs*; y que `BASE_URL`, `BREVO_API_KEY` y `CORREO_REMITENTE` estén en Render. Las cuentas antiguas sin correo deben agregarlo en **Correo de recuperación**. |
| Falla la subida de una foto | Debe ser JPG, PNG o WEBP (las de iPhone en formato HEIC a veces no se leen: súbalas como JPG). Máximo 30 imágenes por usuario. |
| `Unknown column 'columnas'` o `Table ... doesn't exist` | La base no está al día: ejecute `npm run migrar` (paso 5). |
| El micrófono no funciona | Use Chrome o Edge, permita el micrófono y abra el sitio con `https://` (Render ya lo da). |

---

## 7. Lista de comprobación para la sustentación

- [ ] Aiven en estado **Running** (si no, *Power on service*).
- [ ] Abrir el link **5 a 10 minutos antes** para que Render "despierte".
- [ ] Tener una cuenta de prueba ya creada y con algunas fotos subidas.
- [ ] Tener a mano el link de Render y el del repositorio de GitHub.
- [ ] Haber probado la recuperación de contraseña con su correo.
- [ ] Plan de respaldo: el proyecto corriendo en local (`npm start`) por si falla internet.

## Límites de los planes gratuitos

- **Render:** la página se duerme tras 15 minutos sin uso; bloquea los puertos de correo SMTP (por eso
  se usa la API de Brevo); su disco se borra al reiniciar (por eso las fotos van a la base de datos).
- **Aiven:** 1 GB y se puede apagar por inactividad.
- **Brevo:** 300 correos al día.
- Si algún día necesita algo más estable, Railway permite alojar la página y MySQL juntos, pero solo
  da un crédito de prueba (5 dólares por 30 días) y luego es de pago.
