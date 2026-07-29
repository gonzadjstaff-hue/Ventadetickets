# Puesta en marcha local

## 1. Docker Desktop y PostgreSQL

Este proyecto no versiona un `docker-compose.yml` todavía; en desarrollo se usa un contenedor Postgres levantado a mano. Con Docker Desktop corriendo:

```bash
docker run --name tickets-db \
  -e POSTGRES_USER=<tu_usuario> \
  -e POSTGRES_PASSWORD=<tu_password> \
  -e POSTGRES_DB=tickets_db \
  -p 5432:5432 \
  -d postgres:16
```

Reemplazá usuario y password por los que vayas a usar (no se documentan credenciales reales acá). Con el contenedor corriendo, `backend/.env` debe apuntar a esa misma base con `DATABASE_URL`.

Los tests del backend usan una **segunda base, `tickets_test`, en el mismo contenedor** (mismas credenciales, nombre de base distinto) — se crea una sola vez:

```bash
docker exec tickets-db psql -U <tu_usuario> -d tickets_db -c "CREATE DATABASE tickets_test OWNER <tu_usuario>;"
```

Detalle de por qué está separada en `docs/ARCHITECTURE.md`.

## 2. Backend

```bash
cd backend
cp .env.example .env
```

Completar en `backend/.env` como mínimo:

| Variable | Valor esperado |
|---|---|
| `DATABASE_URL` | Cadena de conexión a `tickets_db` (host, puerto, usuario, password, nombre de base — no se muestran acá). |
| `DATABASE_URL_TEST` | Opcional. Si se deja vacía, se deriva automáticamente de `DATABASE_URL` apuntando a `tickets_test`. |
| `PORT` | `4000` (default). |
| `FRONTEND_URL` | `http://localhost:5173` (default) — usado para la config de CORS. |
| `CORS_ALLOWED_ORIGINS` | Vacío en desarrollo (no hace falta, `FRONTEND_URL` ya cubre `localhost:5173`). Orígenes adicionales separados por coma, para producción — ver `docs/DEPLOYMENT.md`. |
| `ENABLE_MVP_CHECKIN` | `true` para poder probar `/check-in` a mano. MVP sin autenticación — nunca activarlo así en un entorno público. `false`/vacío por defecto. |
| `ENABLE_MVP_PAYMENT_SIMULATOR` | `true` para poder probar la compra VIP a mano (ver paso 5 más abajo). Sin proveedor de pago real detrás — nunca activarlo así en un entorno público. `false`/vacío por defecto. |
| `EMAIL_PROVIDER` | `console` para probar el envío de email (General y VIP) sin credenciales reales ni riesgo de mandar un correo real por error — solo loguea un resumen seguro. Vacío = integración deshabilitada. `resend` requiere además `EMAIL_API_KEY` y `EMAIL_FROM`. |
| `EVENT_TIMEZONE` | `America/Argentina/Buenos_Aires` (default) — zona horaria para formatear fecha/horario del evento en el email. |
| `ORDER_EXPIRATION_MINUTES` | `15` (default) — cuánto dura la reserva de una orden VIP `PENDING`. |
| `ENABLE_MERCADOPAGO_CHECKOUT` | `true` para habilitar Checkout Pro de Mercado Pago como pago real de VIP (ver paso 6 más abajo). Solo queda efectivamente disponible si además están completas las 4 variables siguientes. `false`/vacío por defecto. |
| `MERCADOPAGO_ACCESS_TOKEN` | Access token de **prueba** (`TEST-...`) de una aplicación de Mercado Pago. Nunca uno productivo (`APP_USR-...`) salvo pedido explícito. |
| `MERCADOPAGO_WEBHOOK_SECRET` | Clave secreta de "Tus integraciones → Webhooks" en Mercado Pago, para validar `x-signature`. |
| `APP_PUBLIC_URL` | URL pública HTTPS del frontend (sin barra final) — se usa para las `back_urls` del checkout. En local hace falta un túnel (ver paso 6). |
| `BACKEND_PUBLIC_URL` | URL pública HTTPS del backend (sin barra final) — se usa para el `notification_url` del webhook. En local hace falta un túnel. |

`MERCADOPAGO_PUBLIC_KEY`, `MERCADOPAGO_API_BASE_URL` y `QR_SIGNING_SECRET` todavía no se usan en ningún código: pueden quedar vacías (ver `docs/DECISIONS.md` para por qué, en el caso de Mercado Pago). **Firebase sí se usa** desde la Etapa 1 de autenticación (`ADMIN`/`VALIDATOR` únicamente, nunca para compradores/asistentes) — ver la sección 8 más abajo para completar `FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY` y probarlo de punta a punta.

```bash
npm install   # dispara automáticamente "prisma generate" (script postinstall)

# Migraciones
npx prisma migrate deploy      # aplica las migraciones existentes a tickets_db
npm run test:db:setup           # aplica las mismas migraciones a tickets_test

# Datos de demo (idempotente, se puede correr varias veces sin duplicar)
npm run db:seed

npm run dev                       # http://localhost:4000
```

Verificar que responde en `GET http://localhost:4000/api/health`.

## 3. Frontend

```bash
cd frontend
cp .env.example .env
```

`frontend/.env` **no se sube a git** (está en `.gitignore`, igual que `backend/.env`). Completar:

```env
VITE_API_URL=http://localhost:4000
VITE_DEMO_EVENT_PUBLIC_ID=demo-event-pulse-2026-public
VITE_DEMO_GENERAL_TICKET_TYPE_ID=demo-tt-general-2026
VITE_DEMO_VIP_INDIVIDUAL_TICKET_TYPE_ID=demo-tt-vip-individual-2026
VITE_DEMO_VIP_DOBLE_TICKET_TYPE_ID=demo-tt-vip-doble-2026
```

**Importante:** `VITE_API_URL` va **sin** `/api` al final. `frontend/src/api/client.ts` arma cada URL como `${VITE_API_URL}${path}`, y los `path` (definidos en `frontend/src/api/registrations.ts`, `checkIns.ts`, `orders.ts`) ya incluyen el prefijo `/api` (ej. `/api/events/.../registrations/general`). Si `VITE_API_URL` incluyera `/api`, las requests terminarían duplicando el prefijo (`/api/api/...`) y fallarían con 404.

Los `VITE_DEMO_*` son los IDs reales creados por `backend/prisma/seed.ts` — ver `frontend/src/config/demoEvent.ts`. Son temporales: existen porque todavía no hay un endpoint de listado de eventos ni de tipos de entrada (`docs/DECISIONS.md`).

```bash
npm install
npm run dev    # http://localhost:5173
```

## 4. Verificación rápida — General

Con backend y frontend corriendo, abrir `http://localhost:5173/`, ir a la sección de entradas, elegir "General" y completar el formulario. Debería confirmar el registro sin necesidad de tocar la base a mano. Detalle de qué se creó en la última corrida real de esta prueba en `docs/PROGRESS.md`.

## 5. Probar la venta VIP simulada

Requiere `ENABLE_MVP_PAYMENT_SIMULATOR=true` en `backend/.env` (paso 2) y reiniciar el backend después de cambiarlo (la variable se lee una sola vez, al arrancar).

1. Abrir `http://localhost:5173/`, ir a la sección de entradas y elegir "Elegir VIP" (Individual) o "Elegir VIP doble".
2. Completar comprador (nombre, email, WhatsApp) → siguiente.
3. Completar 1 asistente (Individual) o 2 asistentes (Doble) → siguiente.
4. Revisar el resumen (tipo, accesos, total) → "Confirmar reserva". La orden queda `PENDING`, con el tiempo restante de la reserva a la vista.
5. Con `ENABLE_MVP_PAYMENT_SIMULATOR=true` y el frontend en desarrollo (`npm run dev`, no un build de producción), aparece el bloque "Simulador de pago (solo desarrollo)" con 4 botones:
   - **Aprobar pago** → la orden pasa a `PAID`, se emite 1 ticket (Individual) o 2 tickets (Doble). VIP Individual muestra "Descargar entrada" (PDF de 1 página); VIP Doble muestra las dos entradas visibles pero con un único botón "Descargar ambas entradas" (PDF de 2 páginas, una por asistente, ver `docs/DECISIONS.md`), para evitar que el comprador descargue solo una y crea que ya tiene las dos. Si el navegador soporta la Web Share API con archivos, aparece además "Compartir entrada"/"Compartir ambas entradas".
   - **Dejar pendiente** → la orden sigue `PENDING`.
   - **Rechazar** → la orden sigue `PENDING` (para poder reintentar), con un aviso de pago rechazado.
   - **Cancelar** → la orden pasa a `CANCELLED`, libera el cupo.
6. Para probar el vencimiento de la reserva sin esperar 15 minutos reales: bajar `ORDER_EXPIRATION_MINUTES` temporalmente en `backend/.env` (ej. a `1`) y reiniciar el backend antes de crear la orden.

Verificado con tests automatizados (backend y frontend, ver `docs/PROGRESS.md`); la prueba manual real contra el navegador queda pendiente de confirmar.

## 6. Probar el checkout de Mercado Pago (modo prueba)

Recorrido de pago real para VIP, alternativo al simulador del paso 5. Requiere credenciales de **prueba** de Mercado Pago (nunca productivas) y una URL HTTPS pública para el webhook — no funciona apuntando a `localhost` sin un túnel, porque Mercado Pago necesita poder llamar al backend desde internet.

No se incluyen pasos automáticos para exponer `localhost` (instalar/configurar un túnel) sin autorización explícita — elegí la herramienta que prefieras (ver el punto 4 de abajo) y confirmá con el asistente antes de instalar algo nuevo.

1. **Crear (o elegir) una aplicación en Mercado Pago** — entrar a "Tus integraciones" en el panel de desarrolladores de Mercado Pago con la cuenta que vayas a usar, y crear una aplicación nueva (o reutilizar una existente) para este proyecto.
2. **Obtener las credenciales de prueba** — dentro de esa aplicación, copiar el **access token de prueba** (empieza con `TEST-`) y, si querés, la public key de prueba (no la usa este proyecto todavía, ver `docs/DECISIONS.md`).
3. **Crear usuarios de prueba, si hace falta** — Mercado Pago permite crear cuentas de prueba (comprador y vendedor) separadas de tu cuenta real, para no mezclar pagos de prueba con tu cuenta de producción. Si tu aplicación de prueba ya está asociada a una cuenta vendedora de prueba, podés saltear este paso.
4. **Exponer el backend con una URL HTTPS pública** — Mercado Pago necesita poder llamar a `POST /api/webhooks/mercadopago` desde internet. En desarrollo esto requiere un túnel hacia `http://localhost:4000` (por ejemplo, un servicio de túneles HTTPS reverso). Elegí la herramienta que prefieras; no la instalo por mi cuenta sin que lo pidas explícitamente.
5. **Configurar el webhook y obtener la clave secreta** — en "Tus integraciones → Webhooks" de tu aplicación, configurar la URL pública de arriba + `/api/webhooks/mercadopago`, seleccionar el evento "Pagos", y copiar la clave secreta que Mercado Pago genera ahí (es la que va en `MERCADOPAGO_WEBHOOK_SECRET`).
6. **Completar `backend/.env`**:
   ```env
   ENABLE_MERCADOPAGO_CHECKOUT=true
   MERCADOPAGO_ACCESS_TOKEN=TEST-...
   MERCADOPAGO_WEBHOOK_SECRET=<la clave secreta del paso 5>
   APP_PUBLIC_URL=<URL pública HTTPS del frontend, sin barra final>
   BACKEND_PUBLIC_URL=<URL pública HTTPS del backend, sin barra final — el túnel del paso 4>
   ```
   Reiniciar el backend después (las variables se leen una sola vez, al arrancar).
7. **Hacer una compra de prueba** — abrir la app (a través de la URL pública del frontend, no `localhost`, para que las `back_urls` funcionen), elegir VIP, completar comprador y asistentes, confirmar la reserva. En el paso de pago debería aparecer el botón real "Pagar con Mercado Pago" (además del simulador, si `ENABLE_MVP_PAYMENT_SIMULATOR=true`, claramente separado bajo "Herramientas de prueba"). Click ahí redirige al checkout de Mercado Pago.
8. **Pagar con una tarjeta de prueba** — Mercado Pago documenta tarjetas de prueba específicas por país para simular aprobado/rechazado/pendiente. Completar el pago en el entorno de Mercado Pago.
9. **Verificar el webhook** — confirmar en los logs del backend que llegó `POST /api/webhooks/mercadopago` y que la firma se validó (si no llega nada, revisar que la URL pública del paso 4 siga activa y que coincida exactamente con la configurada en el paso 5).
10. **Verificar pago, email, tickets y check-in** — la pantalla `/checkout/return` debería pasar de "Verificando pago…" a "Pago confirmado. Enviamos tus entradas por email." (nunca muestra el QR ahí). Revisar el email (o la consola, si `EMAIL_PROVIDER=console`) para confirmar que llegó el ticket. Si `ENABLE_MVP_CHECKIN=true`, probar el QR en `/check-in`: `VALID` la primera vez, `ALREADY_USED` al repetir.

Verificado con tests automatizados (backend y frontend, con el proveedor mockeado — ver `docs/PROGRESS.md`); **ninguna prueba manual real contra la API de Mercado Pago todavía** — no hay credenciales de prueba ni URL pública configuradas en este entorno.

## 7. Probar el login de Firebase (ADMIN/VALIDATOR)

Firebase Authentication es solo para administradores/validadores (ver `docs/DECISIONS.md`) — nunca para compradores/asistentes, que siguen registrándose sin cuenta. El procedimiento manual completo, de punta a punta:

1. **Crear un usuario en Firebase Console** — en el proyecto de Firebase correspondiente, "Authentication → Users → Add user", con un email y contraseña de prueba (nunca una cuenta ni una contraseña real).
2. **Copiar el UID** del usuario recién creado (columna "User UID" en la lista de usuarios).
3. **Ejecutar el script del backend** con las 4 variables de entorno (nunca hardcodeadas en el script ni en ningún archivo versionado):
   ```bash
   cd backend
   FIREBASE_UID=<uid_copiado> USER_EMAIL=<mismo_email_de_firebase> USER_ROLE=ADMIN USER_STATUS=ACTIVE npm run auth:create-test-user
   ```
   `USER_ROLE` es obligatoria (`USER`/`VALIDATOR`/`ADMIN`); `USER_STATUS` es opcional, default `ACTIVE`. El script inserta o actualiza (por `email`) un `User` en Postgres con ese `firebaseUid`/`role`/`status`, e imprime el registro resultante — nunca borra nada ni toca otras tablas. Si el `firebaseUid` ya está asignado a otro `email`, corta antes de escribir nada y explica el conflicto.
4. **Completar `frontend/.env`** con las 6 variables `VITE_FIREBASE_*` (ver "Configuración del proyecto → General → Tus apps" en Firebase Console — son públicas, van en el bundle del cliente, nunca son secretas por sí solas).
5. **Levantar backend y frontend** (`npm run dev` en ambos, ver secciones 2 y 3 más arriba).
6. **Abrir `http://localhost:5173/auth-debug`** — pantalla técnica, no linkeada desde la navegación pública (ver `docs/DECISIONS.md`).
7. **Loguearse con el email/contraseña del paso 1** y confirmar que la pantalla muestra `email`/`role`/`status` — esa respuesta viene de `POST /api/auth/session` (ver la sección siguiente para el flujo completo), no de `GET /api/auth/me`.

Ninguna prueba manual real de este flujo se hizo todavía en este entorno — el script existe y está probado con tests unitarios de su lógica de validación (`backend/tests/createTestUserLogic.test.ts`), pero no se corrió contra ninguna base real ni se creó ningún usuario real en Firebase Console.

### Alternativa: flujo "real" de preprovisión + primer login (`POST /api/auth/session`)

El paso 3 de arriba (`createTestUser.ts`) es un atajo de desarrollo: vincula el `firebaseUid` directamente, sin pasar por `POST /api/auth/session`. El flujo pensado para producción es distinto (ver `docs/DECISIONS.md`):

1. **Preprovisionar el `User` en Postgres, sin `firebaseUid`:**
   ```bash
   cd backend
   STAFF_EMAIL=<email> STAFF_ROLE=ADMIN STAFF_DISPLAY_NAME="<nombre>" npm run auth:create-staff-user
   ```
2. **Crear ese mismo email en Firebase Console** (paso 1 de arriba).

   **Importante — email verificado:** un usuario creado a mano en Firebase Console vía "Authentication → Users → Add user" puede quedar con `emailVerified: false` (Firebase Console no lo marca como verificado por defecto). El backend exige `email_verified === true` de forma estricta en `verifyBearerFirebaseToken.ts` — con el email sin verificar, `POST /api/auth/session` responde 401 aunque el token sea válido y el `User` esté correctamente preprovisionado. Para un usuario staff ya preprovisionado (paso 1 de esta sección), marcarlo como verificado con:
   ```bash
   cd backend
   STAFF_EMAIL=<email> npm run auth:verify-staff-email
   ```
   Uso manual únicamente (no se ejecuta en ningún hook ni automáticamente). Antes de tocar Firebase, confirma que `STAFF_EMAIL` corresponde a un `User` ADMIN/VALIDATOR ya preprovisionado en Postgres — nunca verifica el email de una cuenta arbitraria. Es idempotente: si el email ya estaba verificado, no hace ningún cambio. Nunca imprime UID, email completo, token ni credenciales — solo confirma si quedó marcado como verificado o si ya lo estaba.
3. **Primer login desde `/auth-debug`** — el frontend ya implementa este flujo completo de punta a punta (verificado de punta a punta en este entorno: Firebase autenticó, `POST /api/auth/session` vinculó la sesión, y el perfil devuelto trajo `role`/`status` correctos):
   1. Firebase inicia sesión (`loginWithEmail`).
   2. El frontend obtiene el Firebase ID Token del usuario recién logueado.
   3. Llama a `POST /api/auth/session` con `Authorization: Bearer <token>` (sin body: la única identidad que importa es la del token verificado, nunca datos que el frontend pudiera enviar).
   4. El backend vincula `firebaseUid` al `User` preprovisionado si todavía está en `null` (de forma atómica, con `AuditLog`) — si ya estaba vinculado, resuelve la sesión sin volver a escribir nada.
   5. La respuesta devuelve el perfil interno (`id`/`email`/`role`/`status`), que la pantalla muestra tal cual — nunca confía en un rol propio ni en datos enviados por el frontend.
   6. En recargas de página (con la sesión de Firebase ya persistida por el SDK), el frontend vuelve a llamar `POST /api/auth/session` de forma idempotente para rehidratar el perfil — no hace falta ningún paso manual adicional.
   7. `GET /api/auth/me` sigue disponible para validaciones puntuales posteriores (ya con la sesión vinculada), pero no forma parte del primer login: no lo bloquea ni hace falta llamarlo para que el login funcione.

## 8. Despliegue (Vercel + Render)

Este documento cubre únicamente el entorno **local**. Para desplegar el frontend en Vercel, el backend en Render y una base PostgreSQL administrada en Render (incluyendo Mercado Pago contra la URL pública estable del backend en vez de un túnel), ver la guía paso a paso completa en [`docs/DEPLOYMENT.md`](./DEPLOYMENT.md) — nada de eso está desplegado todavía.
