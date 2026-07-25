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
| `ENABLE_MVP_CHECKIN` | `true` para poder probar `/check-in` a mano. MVP sin autenticación — nunca activarlo así en un entorno público. `false`/vacío por defecto. |
| `ENABLE_MVP_PAYMENT_SIMULATOR` | `true` para poder probar la compra VIP a mano (ver paso 5 más abajo). Sin proveedor de pago real detrás — nunca activarlo así en un entorno público. `false`/vacío por defecto. |
| `EMAIL_PROVIDER` | `console` para probar el envío de email (General y VIP) sin credenciales reales ni riesgo de mandar un correo real por error — solo loguea un resumen seguro. Vacío = integración deshabilitada. `resend` requiere además `EMAIL_API_KEY` y `EMAIL_FROM`. |
| `EVENT_TIMEZONE` | `America/Argentina/Buenos_Aires` (default) — zona horaria para formatear fecha/horario del evento en el email. |
| `ORDER_EXPIRATION_MINUTES` | `15` (default) — cuánto dura la reserva de una orden VIP `PENDING`. |

Firebase, Mercado Pago y `QR_SIGNING_SECRET` todavía no se usan en ningún código: pueden quedar vacías.

```bash
npm install
npx prisma generate

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
   - **Aprobar pago** → la orden pasa a `PAID`, se emite 1 ticket (Individual) o 2 tickets (Doble), cada uno con su propio QR y botón de descarga individual.
   - **Dejar pendiente** → la orden sigue `PENDING`.
   - **Rechazar** → la orden sigue `PENDING` (para poder reintentar), con un aviso de pago rechazado.
   - **Cancelar** → la orden pasa a `CANCELLED`, libera el cupo.
6. Para probar el vencimiento de la reserva sin esperar 15 minutos reales: bajar `ORDER_EXPIRATION_MINUTES` temporalmente en `backend/.env` (ej. a `1`) y reiniciar el backend antes de crear la orden.

Verificado con tests automatizados (backend y frontend, ver `docs/PROGRESS.md`); la prueba manual real contra el navegador queda pendiente de confirmar.
