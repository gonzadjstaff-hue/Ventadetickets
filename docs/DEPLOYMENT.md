# Despliegue a producción

Guía manual, paso a paso, para la arquitectura elegida:

- **Frontend** (React + Vite) → **Vercel**.
- **Backend** (Node + Express + Prisma) → **Render Web Service**.
- **Base de datos** → **PostgreSQL administrado en Render**.
- **Mercado Pago Checkout Pro** → contra la URL pública estable del backend en Render (ya no un túnel de desarrollo).

**Actualización (2026-07-29): el backend y el frontend SÍ están desplegados** (Render "Live" y Vercel "Ready", commit `4bf9de1` en ambos, confirmado manualmente por Gonzalo — ver `SESSION_HANDOFF.md`, sección 21). El resto de esta guía describe el procedimiento paso a paso tal como se siguió (o debería seguirse) para llegar a ese estado — no asumas que un paso puntual (ej. las variables de Firebase, ver el paso 5 y el paso 10) ya se completó solo porque el servicio esté Live: un backend puede estar Live y con Postgres conectado mientras una integración puntual (Firebase, Mercado Pago) sigue sin sus credenciales cargadas, sin que eso afecte el estado general del deploy. Esta guía no ejecuta ningún despliegue por sí sola — cada paso se hace a mano, con tus propias cuentas de Render/Vercel/Mercado Pago. No contiene credenciales reales; donde hace falta un valor propio, se indica entre `<...>`.

Antes de arrancar, confirmar en local que build/lint/test siguen en verde (ver `docs/PROGRESS.md` para el último resultado registrado) y que `backend/.env`/`frontend/.env` (con credenciales/valores locales) **nunca** se suben a git — ya están en `.gitignore` en la raíz, en `backend/` y en `frontend/`.

---

## 1. Crear la base PostgreSQL en Render

1. En el dashboard de Render: **New → PostgreSQL**.
2. Elegir nombre, región y plan. La región debería coincidir con la del Web Service del backend (paso 2) para minimizar latencia.
3. Crear. Render provisiona la instancia y expone (entre otros datos) una **Internal Database URL** y una **External Database URL** — ver la sección [Base de datos](#base-de-datos) más abajo sobre cuál usar y por qué.
4. No cargar ningún dato todavía — el schema se aplica en el paso 6, con `prisma migrate deploy`.

## 2. Crear el Web Service del backend en Render

1. **New → Web Service**, conectar el repositorio de GitHub.
2. Elegir la rama a desplegar (`main`).

## 3. Definir el Root Directory del backend

- **Root Directory:** `backend`

Es un monorepo (`backend/` y `frontend/` en el mismo repo) — sin esto, Render intentaría instalar/buildear desde la raíz del repo, donde no hay `package.json` de backend.

## 4. Build Command y Start Command

- **Build Command:**
  ```
  npm install && npm run build
  ```
  `npm install` dispara automáticamente el script `postinstall` (`prisma generate`, ver [Prisma en producción](#prisma-en-producción)) — no hace falta un paso aparte. `npm run build` compila TypeScript (`tsc -p tsconfig.json`) a `dist/`.

- **Start Command:**
  ```
  npm run prisma:deploy && npm start
  ```
  `npm run prisma:deploy` ejecuta `prisma migrate deploy` (nunca `migrate dev` ni `db push`, ver [Prisma en producción](#prisma-en-producción)) antes de levantar el proceso; `npm start` corre `node dist/server.js`. `prisma migrate deploy` es seguro de repetir en cada arranque/restart: si no hay migraciones nuevas, no hace nada.

- **Runtime:** Node (no hace falta Docker — el repo no tiene `Dockerfile` y no lo necesita para este despliegue).

## 5. Cargar las variables de entorno del backend

En la pestaña **Environment** del Web Service, cargar (ver la tabla completa en [Variables de entorno del backend](#variables-de-entorno-del-backend-referencia-completa)):

| Variable | Valor en este paso |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | La **Internal Database URL** de la base creada en el paso 1 (ver [Base de datos](#base-de-datos)) |
| `FRONTEND_URL` | Dejar pendiente — se completa recién en el paso 13, cuando exista la URL de Vercel |
| `CORS_ALLOWED_ORIGINS` | Dejar vacío por ahora (opcional, ver [CORS](#cors)) |
| `ENABLE_MVP_CHECKIN` | `false` (o no cargarla) |
| `ENABLE_MVP_PAYMENT_SIMULATOR` | `false` (o no cargarla) |
| `ENABLE_MERCADOPAGO_CHECKOUT` | `false` por ahora — se activa recién en el paso 16 |
| `FIREBASE_PROJECT_ID` | Del proyecto de Firebase (Configuración del proyecto → General) |
| `FIREBASE_CLIENT_EMAIL` | Del JSON de la cuenta de servicio (Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada) |
| `FIREBASE_PRIVATE_KEY` | Del mismo JSON — pegar tal cual, con `\n` literales; el backend la normaliza a saltos de línea reales (`backend/src/integrations/firebase/firebaseAdmin.ts`) |

**Las 3 `FIREBASE_*` son necesarias para que el login de staff (`/staff/login`, `ADMIN`/`VALIDATOR`) funcione, independientemente de si Mercado Pago está activado.** Sin ellas, el backend arranca igual y `GET /api/health` responde `ok` de todos modos (inicialización perezosa) — pero `POST /api/auth/session` (y por lo tanto todo el login) falla con `500 FIREBASE_NOT_CONFIGURED` en el 100% de los intentos, sin que eso se refleje en el health check. Verificación segura una vez desplegado, sin exponer ningún secreto: `curl -X POST https://<tu-backend>.onrender.com/api/auth/session -H "Authorization: Bearer test"` — `500 FIREBASE_NOT_CONFIGURED` indica que faltan estas variables; `401 UNAUTHORIZED` confirma que están cargadas (el token "test" es simplemente inválido, comportamiento esperado).

El resto de las variables de Mercado Pago (`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `APP_PUBLIC_URL`, `BACKEND_PUBLIC_URL`) se completan en los pasos 13-16, cuando ya existan las URLs finales.

## 6. Aplicar las migraciones

Con el Start Command del paso 4, `prisma migrate deploy` corre automáticamente en cada deploy/restart — no hace falta un paso manual aparte para el primer deploy. Si en algún momento hace falta correrlo a mano contra la base de Render (ej. para diagnosticar), usar la **Shell** del Web Service en el dashboard de Render (no la Local/External URL desde tu máquina, salvo que sea imprescindible — ver [Base de datos](#base-de-datos)):

```
npm run prisma:deploy
```

Nunca `prisma migrate dev` ni `prisma db push` contra la base de producción — ver [Prisma en producción](#prisma-en-producción).

`backend/prisma/seed.ts` (datos demo del evento "Pulse Festival 2026") **no se ejecuta automáticamente** en ningún paso de este despliegue. Es opcional y explícito (`npm run db:seed`, vía la Shell de Render) — solo tiene sentido correrlo si de verdad se quiere ese evento demo en la base de producción; es idempotente (`upsert` con IDs fijos) así que correrlo más de una vez no duplica filas, pero de todos modos es una decisión manual, nunca implícita.

## 7. Verificar el health check

Una vez que el deploy termina, Render debería mostrar el servicio como "Live". Confirmar:

```
GET https://<tu-backend>.onrender.com/api/health
```

Respuesta esperada: `{ "status": "ok", "timestamp": "..." }`. Este es también el **Health Check Path** que Render usa internamente (`/api/health`, ver `render.yaml` si se usa como Blueprint, o cargarlo a mano en **Settings → Health Check Path** si el servicio se creó sin Blueprint) — no consulta la base de datos ni ningún dato sensible.

## 8. Importar el frontend en Vercel

1. En Vercel: **Add New → Project**, importar el mismo repositorio.

## 9. Definir el Root Directory del frontend

- **Root Directory:** `frontend`
- **Framework Preset:** Vite (Vercel debería detectarlo solo al ver `vite.config.ts`)
- **Build Command:** `npm run build` (o dejar el default que infiere el preset — equivalente)
- **Output Directory:** `dist` (default del preset de Vite — coincide con lo que genera `vite build`, confirmado en este repo)

`frontend/vercel.json` ya incluye el rewrite necesario para las rutas de React Router (ver el paso 11) — no hace falta configurar nada adicional para eso en el dashboard.

## 10. Cargar la variable de la API en Vercel

| Variable | Valor |
|---|---|
| `VITE_API_URL` | `https://<tu-backend>.onrender.com` (la URL del Web Service del paso 2, **sin** `/api` al final — ver `docs/LOCAL_SETUP.md`) |
| `VITE_DEMO_EVENT_PUBLIC_ID`, `VITE_DEMO_GENERAL_TICKET_TYPE_ID`, `VITE_DEMO_VIP_INDIVIDUAL_TICKET_TYPE_ID`, `VITE_DEMO_VIP_DOBLE_TICKET_TYPE_ID` | Los mismos IDs que en desarrollo (creados por `backend/prisma/seed.ts`) si se corrió el seed contra la base de Render; si no, no hay evento para mostrar en la landing — ver el paso 6 |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | Los mismos valores públicos que en desarrollo (Firebase Console → Configuración del proyecto → Tus apps) — ver `docs/LOCAL_SETUP.md`, sección 8 |

`VITE_API_URL` es una variable de **build time** de Vite: si se cambia, hace falta un redeploy en Vercel para que el nuevo valor quede incluido en el bundle (no es una variable que el navegador lea en runtime). El repo no usa el nombre `VITE_API_BASE_URL` — se mantuvo `VITE_API_URL`, el nombre ya existente en `frontend/src/api/client.ts` y documentado en `docs/LOCAL_SETUP.md`, para no renombrar una variable ya en uso sin necesidad funcional (ver `docs/DECISIONS.md`). Configurala con ese nombre exacto en Vercel.

**Las 6 `VITE_FIREBASE_*` son igual de necesarias que `VITE_API_URL` para que `/staff/login` funcione** — son de build time igual que ella (Vite las inlinea en el bundle en tiempo de build), así que un cambio también exige redeploy. Cargalas en los tres entornos de Vercel (Production, Preview y Development). Son valores públicos de configuración de cliente (no secretos), pero **si falta una sola, las 6 se tratan como ausentes**: el SDK de Firebase no inicializa, y sin el fix de `frontend/src/pages/StaffLoginPage.tsx` (lee `configError` del contexto) el usuario vería un mensaje de "credenciales incorrectas" en vez del error real — verificado y corregido en el código, ver `docs/DECISIONS.md`.

Ninguna variable de Mercado Pago (`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_PUBLIC_KEY`) se carga en Vercel — el frontend nunca las usa ni las necesita (ver [Mercado Pago en el entorno desplegado](#mercado-pago-en-el-entorno-desplegado)).

## 11. Verificar las rutas SPA

Tras el primer deploy de Vercel, entrar directamente (refrescando el navegador, no solo navegando con clicks desde `/`) a:

- `https://<tu-frontend>.vercel.app/checkout/return`
- `https://<tu-frontend>.vercel.app/check-in`

Ambas deberían cargar la aplicación normalmente (React Router resuelve la ruta del lado del cliente) gracias al rewrite de `frontend/vercel.json` (`"/(.*)" → "/index.html"`). Sin ese rewrite, Vercel devolvería 404 al pedir esas rutas directamente, porque no existen como archivos estáticos.

## 12. Copiar las URLs finales

En este punto ya existen las dos URLs estables:

- **URL del frontend (Vercel):** `https://<tu-frontend>.vercel.app`
- **URL del backend (Render):** `https://<tu-backend>.onrender.com`

## 13. Configurar `APP_PUBLIC_URL` y `BACKEND_PUBLIC_URL`

En el Web Service del backend en Render (Environment), completar/actualizar:

| Variable | Debe contener exactamente |
|---|---|
| `FRONTEND_URL` | `https://<tu-frontend>.vercel.app` — **sin barra final**. Único uso: origen permitido por CORS (ver [CORS](#cors)). |
| `APP_PUBLIC_URL` | `https://<tu-frontend>.vercel.app` — **sin barra final**. El backend arma las `back_urls` del checkout de Mercado Pago como `${APP_PUBLIC_URL}/checkout/return?orderPublicId=...` (las 3 — success/pending/failure — iguales, ver `docs/DECISIONS.md`). |
| `BACKEND_PUBLIC_URL` | `https://<tu-backend>.onrender.com` — **sin barra final**. El backend arma el `notification_url` de la preferencia como `${BACKEND_PUBLIC_URL}/api/webhooks/mercadopago`. |

`FRONTEND_URL` y `APP_PUBLIC_URL` van a tener el mismo valor en este despliegue (un único frontend) — son variables separadas porque tienen usos distintos en el código (CORS vs. back_urls de Mercado Pago, ver `docs/DECISIONS.md`), no porque se espere que difieran.

Guardar los cambios dispara un redeploy del backend en Render.

## 14. Configurar el webhook en el panel de Mercado Pago

1. Entrar a "Tus integraciones" en el panel de desarrolladores de Mercado Pago, con la aplicación (de prueba) que se vaya a usar.
2. Ir a **Webhooks** y configurar la URL exacta:
   ```
   https://<tu-backend>.onrender.com/api/webhooks/mercadopago
   ```
   Este es el **endpoint completo** que Mercado Pago va a llamar server-to-server — coincide con `BACKEND_PUBLIC_URL` del paso 13 + el path fijo `/api/webhooks/mercadopago` (`backend/src/modules/payments/mercadoPagoWebhookRoutes.ts`).
3. Seleccionar el evento **"Pagos"**.

## 15. Obtener y cargar el webhook secret

1. Mercado Pago genera una clave secreta al guardar el webhook del paso 14 — copiarla.
2. Cargarla en Render como `MERCADOPAGO_WEBHOOK_SECRET`.
3. Cargar también `MERCADOPAGO_ACCESS_TOKEN` con el **access token de prueba** (`TEST-...`) de esa misma aplicación — nunca uno productivo (`APP_USR-...`) en esta etapa.

`MERCADOPAGO_PUBLIC_KEY` puede dejarse vacía: no la usa ningún código, ni backend ni frontend (Checkout Pro por redirección simple no la necesita — confirmado también en este bloque, ver [Mercado Pago en el entorno desplegado](#mercado-pago-en-el-entorno-desplegado)). `MERCADOPAGO_API_BASE_URL` también debe quedar vacía/sin cargar: el SDK oficial no soporta redirigir sus requests a otra base URL (ver `backend/src/integrations/payments/mercadoPago/mercadoPagoClient.ts`), así que esta variable debe quedar en su default oficial implícito, nunca configurarse con un valor propio.

## 16. Activar `ENABLE_MERCADOPAGO_CHECKOUT=true`

Recién con `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `APP_PUBLIC_URL` y `BACKEND_PUBLIC_URL` ya cargados (pasos 13 y 15), cambiar en Render:

```
ENABLE_MERCADOPAGO_CHECKOUT=true
```

Guardar (dispara un redeploy). `env.MERCADOPAGO_CHECKOUT_AVAILABLE` (`backend/src/config/env.ts`) recién queda `true` cuando las 5 condiciones se cumplen a la vez — si falta cualquiera, el backend arranca igual y las rutas de checkout/webhook simplemente no se montan (404 estándar, ver `docs/DECISIONS.md`).

## 17. Hacer una compra de prueba

Desde `https://<tu-frontend>.vercel.app` (no localhost): elegir VIP, completar comprador y asistentes, confirmar la reserva. En el paso de pago debería aparecer el botón real "Pagar con Mercado Pago" (el simulador **no** debería aparecer en este entorno — ver [Seguridad de producción](#seguridad-de-producción) sobre por qué). Pagar con una tarjeta de prueba de Mercado Pago.

## 18. Verificar webhook, email, tickets y check-in

1. En los logs del Web Service (dashboard de Render), confirmar que llegó `POST /api/webhooks/mercadopago` y que la firma se validó (sin error `INVALID_WEBHOOK_SIGNATURE`).
2. `https://<tu-frontend>.vercel.app/checkout/return` debería pasar de "Verificando pago…" a "Pago confirmado. Enviamos tus entradas por email." (nunca muestra el QR ahí, ver `docs/DECISIONS.md`).
3. Revisar que llegó el email con el ticket (si `EMAIL_PROVIDER=console`, revisar los logs del backend en vez de una bandeja de entrada real).
4. Si se necesita probar el check-in, cargar temporalmente `ENABLE_MVP_CHECKIN=true` en Render (recordar que es un MVP sin autenticación — no dejarlo activo en un entorno público más de lo necesario para la prueba) y validar el QR en `/check-in`: `VALID` la primera vez, `ALREADY_USED` al repetir.

---

## Variables de entorno del backend (referencia completa)

| Variable | Obligatoria | Valor esperado en producción |
|---|---|---|
| `NODE_ENV` | Sí | `production` |
| `PORT` | No | La inyecta Render automáticamente; el código ya lee `process.env.PORT` vía `env.PORT` — no hace falta cargarla a mano. |
| `DATABASE_URL` | Sí | Internal Database URL de la base de Render (ver [Base de datos](#base-de-datos)). |
| `FRONTEND_URL` | No (tiene default de desarrollo) | URL de Vercel, sin barra final (paso 13). |
| `CORS_ALLOWED_ORIGINS` | No | Vacío, salvo que haga falta permitir un origen adicional (ej. una preview de Vercel puntual) — ver [CORS](#cors). |
| `ENABLE_MVP_CHECKIN` | No | `false` o sin cargar (ver [Seguridad de producción](#seguridad-de-producción)). |
| `ENABLE_MVP_PAYMENT_SIMULATOR` | No | `false` o sin cargar. |
| `EMAIL_PROVIDER` / `EMAIL_API_KEY` / `EMAIL_FROM` | No | `console` para verificar sin enviar emails reales, o `resend` + credenciales reales de Resend. |
| `EVENT_TIMEZONE` | No | Default `America/Argentina/Buenos_Aires`. |
| `ORDER_EXPIRATION_MINUTES` | No | Default `15`. |
| `PAYMENT_PROVIDER` | No | Informativo, sin efecto en el código (ver `docs/DECISIONS.md`). |
| `ENABLE_MERCADOPAGO_CHECKOUT` | No | `false` hasta el paso 16, `true` después. |
| `MERCADOPAGO_ACCESS_TOKEN` | Solo si se activa Mercado Pago | Access token de **prueba** (`TEST-...`). |
| `MERCADOPAGO_WEBHOOK_SECRET` | Solo si se activa Mercado Pago | Clave secreta del paso 15. |
| `MERCADOPAGO_PUBLIC_KEY` | No | Vacía — no se usa (ver paso 15). |
| `MERCADOPAGO_API_BASE_URL` | No | Vacía — no se usa, el SDK no soporta redirigirla (ver paso 15). |
| `MERCADOPAGO_REQUEST_TIMEOUT_MS` | No | Default `8000`. |
| `APP_PUBLIC_URL` | Solo si se activa Mercado Pago | URL de Vercel, sin barra final (paso 13). |
| `BACKEND_PUBLIC_URL` | Solo si se activa Mercado Pago | URL de Render, sin barra final (paso 13). |
| `QR_SIGNING_SECRET` | No | No usada por ningún código todavía — puede quedar vacía. |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | **Sí, para que el login de staff funcione** (aunque no rompen el arranque del backend si faltan) | Cuenta de servicio de Firebase Admin SDK — ver el paso 5 más arriba. Corrección: una versión anterior de esta tabla decía incorrectamente que no se usaban; sí están completamente wireadas desde la Etapa 1 de autenticación (`backend/src/integrations/firebase/`, `requireAuth.ts`, `modules/auth/`). |

---

## Prisma en producción

**Estrategia elegida** (una sola, sin mezclar alternativas):

- **`prisma generate` en `postinstall`** (`backend/package.json`): corre automáticamente después de cualquier `npm install`, tanto en Render como en local. Se prefirió esto por sobre incluirlo en `build` o dejarlo como paso manual porque `npm install` es el único paso que Render garantiza ejecutar siempre antes del `buildCommand`, y porque así el cliente de Prisma queda regenerado también para cualquier desarrollador que clone el repo y corra `npm install` sin recordar el paso manual — coherente con el resto del proyecto, que evita pasos manuales olvidables cuando hay una alternativa automática igual de simple.
- **`prisma migrate deploy`, nunca `migrate dev` ni `db push`**, vía el script `prisma:deploy` (`backend/package.json`), encadenado al **Start Command** de Render (`npm run prisma:deploy && npm start`, ver paso 4). `migrate deploy` solo aplica migraciones ya versionadas en `backend/prisma/migrations/` (nunca genera una nueva a partir de un diff del schema, a diferencia de `migrate dev`), y es seguro de correr repetidamente — si no hay migraciones pendientes, no hace nada. Encadenarlo al Start Command (en vez de dejarlo como un paso manual aparte) garantiza que nunca se levante una versión nueva del backend contra un schema desactualizado, sin depender de que alguien se acuerde de correrlo a mano en cada deploy.
- **Nunca** `prisma migrate reset`, `prisma db push` ni un seed automático contra la base de producción — ninguno de los dos está en ningún script de build/start/postinstall de este repo.

## Base de datos

- **Internal Database URL** (Render): la URL a usar en `DATABASE_URL` del Web Service del backend. Backend y base corren dentro de la red privada de Render — más rápido y sin exponer la base a internet.
- **External Database URL** (Render): solo para administración desde fuera de Render (un cliente `psql`/GUI local, o correr `prisma:deploy` a mano desde tu máquina en un caso excepcional). No usarla como `DATABASE_URL` del Web Service.
- **SSL:** no se afirma acá un comportamiento exacto no confirmado — si Prisma reporta un error de conexión relacionado a SSL contra la base de Render, revisar la documentación vigente de Render sobre el formato de su connection string (suele bastar con la URL tal cual la entrega el dashboard; si hace falta, se agrega `?sslmode=require` al final de `DATABASE_URL`).
- **Connection pooling / límite de conexiones:** el pool por defecto de Prisma Client es `num_cpus * 2 + 1` por instancia del backend. Con un único Web Service (una instancia) esto no debería ser un problema en un plan chico de Render Postgres; si en algún momento aparece un error de "too many connections" (por ejemplo al escalar a más de una instancia), agregar `&connection_limit=<N>` al final de `DATABASE_URL` (parámetro estándar de Prisma, no específico de Render) en vez de asumir un número de conexiones máximas no confirmado para tu plan puntual.
- **Migraciones:** el repo ya tiene 4 migraciones versionadas, todas aditivas (ninguna elimina ni renombra columnas existentes) — `prisma migrate deploy` las aplica en orden contra una base de Render recién creada, sin necesitar ningún dato previo.
- **No ejecutar migraciones contra una base remota que todavía no existe** — el Web Service del backend falla al arrancar si `DATABASE_URL` no resuelve a una base real (paso 1 antes que el paso 2).
- **Seed:** ver el paso 6 — nunca automático, opcional y explícito.

## CORS

- `FRONTEND_URL` (default `http://localhost:5173`) siempre queda permitido.
- `CORS_ALLOWED_ORIGINS` (opcional, `backend/src/config/env.ts`) suma orígenes adicionales separados por coma — pensado para el dominio de Vercel en producción, o para permitir puntualmente una URL de preview de Vercel si hace falta probar contra el backend real antes de promover a producción. No se implementó un patrón que permita automáticamente **cualquier** subdominio `*.vercel.app`: eso permitiría que cualquier proyecto de Vercel (no solo el tuyo) llamara al backend con credenciales de navegador — cada preview que se quiera permitir se agrega de forma explícita.
- Nunca `origin: "*"` — `backend/src/app.ts` valida el `Origin` de cada request contra la lista permitida.
- Las requests sin header `Origin` (curl, health checks, y el webhook server-to-server de Mercado Pago) siempre pasan: CORS es una restricción que solo aplican los navegadores; la autenticidad del webhook la da la firma `x-signature`, nunca CORS (ver `docs/DECISIONS.md`).

## Mercado Pago en el entorno desplegado

- **`APP_PUBLIC_URL`** debe contener la URL pública HTTPS del **frontend** en Vercel, sin barra final.
- **`BACKEND_PUBLIC_URL`** debe contener la URL pública HTTPS del **backend** en Render, sin barra final.
- **Endpoint completo a cargar en el panel de Mercado Pago:** `${BACKEND_PUBLIC_URL}/api/webhooks/mercadopago`.
- **`back_urls`** que genera el backend: las 3 (success/pending/failure) iguales, `${APP_PUBLIC_URL}/checkout/return?orderPublicId=<el de la orden>` — nunca varían por resultado (ver `docs/DECISIONS.md`).
- **`MERCADOPAGO_PUBLIC_KEY`:** confirmado que no la usa ningún código, ni backend ni frontend — Checkout Pro por redirección simple (`init_point`/`sandbox_init_point`) no la necesita. Puede quedar vacía.
- **`MERCADOPAGO_API_BASE_URL`:** debe quedar en su default oficial implícito (vacía) — el SDK oficial no expone una forma soportada de redirigir sus requests a otra base URL (confirmado en el código fuente del SDK, ver `docs/DECISIONS.md`).

## Seguridad de producción

Auditado sobre el código ya existente más los cambios de este bloque — solo se corrigieron faltantes objetivos para un despliegue seguro, sin agregar funcionalidad nueva:

- **`trust proxy`**: `backend/src/app.ts` ahora hace `app.set("trust proxy", 1)` cuando `NODE_ENV=production` — necesario detrás del proxy inverso de Render para que `req.ip` (usado por el rate limiting) refleje la IP real del cliente, no la del proxy. `1` (no `true`) confía exactamente en ese único hop.
- **HTTPS**: Render termina TLS en su borde; el backend nunca necesita manejar certificados ni redirigir HTTP→HTTPS por su cuenta.
- **Rate limiting**: ya existía (`express-rate-limit`, 300 req/15 min por IP, aplicado a toda la app incluido el webhook) — suficiente para el volumen esperado y para el reintento documentado de Mercado Pago (cada ~15 min ante una respuesta que no sea 200/201).
- **Helmet**: ya existía, sin cambios.
- **Tamaño máximo del body**: `express.json()` ya aplica el límite por defecto de 100kb — de sobra para los payloads de este proyecto (formularios, notificaciones de webhook).
- **Webhook con firma**: ya auditado en el bloque anterior (ver conversación previa) — firma validada antes de consultar cualquier dato, nunca se confía en el body.
- **Logs sin secretos**: ya auditado — ningún token/secret/QR crudo se loguea en ningún punto de este bloque tampoco (los cambios de este bloque no tocan ningún camino de logging).
- **Errores sin stack trace en producción**: `backend/src/middlewares/errorHandler.ts` ya nunca envía el stack al cliente (solo `err.message` a la consola del servidor) — sin cambios necesarios.
- **CORS**: corregido en este bloque (ver [CORS](#cors)).
- **Variables obligatorias**: `DATABASE_URL` sigue siendo la única variable sin default que hace fallar el arranque si falta (`z.string().min(1)`) — comportamiento correcto, sin cambios.
- **Health check**: `GET /api/health` ya no consulta la base ni ningún dato sensible — sin cambios.
- **Simulador y check-in desactivados en producción**: `ENABLE_MVP_CHECKIN` y `ENABLE_MVP_PAYMENT_SIMULATOR` deben quedar en `false` (o sin cargar) en las variables de Render — es una configuración manual, no algo que el código fuerce por sí solo (documentado también en `render.yaml`, si se usa como Blueprint). Mientras estén apagadas, esas rutas responden 404 estándar, como si no existieran.
- **Cierre controlado (graceful shutdown)**: `backend/src/server.ts` ahora captura `SIGTERM`/`SIGINT` (la señal que Render manda al reciclar o detener una instancia), deja de aceptar conexiones nuevas, y recién después cierra la conexión de Prisma — antes no existía este manejo.

## Riesgos y pendientes

- **Estado real de las pruebas contra Mercado Pago: contradictorio entre documentos, sin resolver.** Esta sección decía "ninguna prueba manual real todavía", pero `docs/DECISIONS.md` (secciones "Diagnóstico de producción..." y "`SignatureMismatch` en producción...") describe evidencia concreta de un webhook real recibido en producción (`dataId=170718289792`, logs de Render). No se resolvió cuál de las dos es la afirmación vigente en esta sesión — ver `SESSION_HANDOFF.md` sección 21.6/14 para el detalle. Confirmar con Gonzalo y actualizar esta sección en consecuencia antes de asumir cualquiera de las dos.
- **`render.yaml`** (raíz del repo) es un punto de partida opcional, no verificado importándolo de verdad como Blueprint en esta sesión — revisar sus nombres de campo contra la documentación vigente de Render antes de usarlo; la vía principal y más robusta es la configuración manual paso a paso de esta guía.
- **Cron de expiración de órdenes** sigue pendiente (expiración perezosa, ver `docs/ROADMAP.md`) — no es un bloqueante para desplegar, pero una orden `PENDING` vencida solo se limpia cuando algo la consulta.
- **Conexiones de Postgres bajo carga real** no probadas contra un plan específico de Render — ver la nota de connection pooling en [Base de datos](#base-de-datos) si aparece en el futuro.
- **CORS_ALLOWED_ORIGINS** requiere agregar manualmente cada preview de Vercel que se quiera permitir contra el backend — no hay soporte automático para `*.vercel.app` (decisión de seguridad, ver [CORS](#cors)).
- **`render.yaml` no fue probado importándolo como Blueprint real** — evaluar si conviene usarlo o seguir la ruta 100% manual la primera vez.
