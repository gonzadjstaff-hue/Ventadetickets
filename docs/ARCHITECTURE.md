# Arquitectura

## Frontend

`frontend/` — React 19 + Vite + TypeScript + Tailwind CSS v4.

- **`src/router/AppRouter.tsx`** — define las rutas con React Router: `/` → `PulseEventLanding`, y `/check-in` → `CheckInPage` (MVP de validación de QR, sin autenticación, no linkeada desde la navegación pública — ver más abajo).
- **`src/pages/PulseEventLanding.tsx`** — arma la landing pública del evento demo a partir de los componentes de `src/features/events/landing/`.
- **`src/features/events/landing/`** — todos los componentes visuales de la landing (Hero, TicketTypes, HowItWorks, etc.), datos mockeados (`mockData.ts`), y los componentes conectados a datos reales: `GeneralRegistrationModal.tsx` (registro gratuito), `EventTicket.tsx`/`TicketQrCode.tsx` (entrada descargable con QR real, reutilizada también para tickets VIP).
- **`src/features/events/checkout/`** — flujo de compra VIP simulada: `VipCheckoutModal.tsx` (pasos comprador → asistentes → resumen → pago simulado → resultado, React Hook Form + Zod), `vipCheckoutSchema.ts`, `SimulatePaymentControls.tsx` (los 4 botones de simulación, solo visibles en `import.meta.env.DEV` y si el backend habilita `paymentSimulationAvailable`).
- **`src/features/scanner/`** — `QrScanner.tsx` (lector de cámara sobre `html5-qrcode`, inicio/detención manual), `ManualQrInput.tsx` (carga manual solo en desarrollo), `CheckInResultPanel.tsx` — usados por `CheckInPage`.
- **`src/api/`** — capa de acceso HTTP. `client.ts` centraliza `fetch` + manejo de errores (`ApiError`) leyendo `VITE_API_URL` una sola vez. `registrations.ts` (registro General), `checkIns.ts` (validación de QR), `orders.ts` (creación/consulta de orden VIP y simulación de pago).
- **`src/config/demoEvent.ts`** — lee de variables de entorno los IDs del evento y tipos de entrada demo (General, VIP Individual, VIP Doble). Es el único lugar del frontend que conoce esos IDs; existe porque todavía no hay un endpoint de listado de eventos/tipos de entrada (ver `docs/DECISIONS.md`).
- **Estado del servidor**: `@tanstack/react-query` (`QueryClientProvider` montado en `src/main.tsx`), usado por las mutaciones de registro General, creación de orden VIP y simulación de pago.
- **Estilos**: Tailwind para estructura y layout; `pulse-landing.css` (dentro de `features/events/landing/`) para animaciones, gradientes y estados hover específicos de esa landing. Paleta y tipografía (Google Fonts "Kanit") están scopeadas a la clase `.pulse-landing` — cualquier componente que use esas clases (ej. `pulse-btn-primary`) necesita tener un ancestro con esa clase, si no el fondo/color queda indefinido (pasó una vez con `CheckInPage`, ver commit de esa pantalla).

## Backend

`backend/` — Node.js + Express 5 + TypeScript + Prisma.

- **`src/app.ts`** — arma la app Express: `helmet`, `cors` (restringido a `FRONTEND_URL`), rate limiting, `express.json()`, el endpoint `GET /api/health`, y los routers de cada módulo montados en `/api/events` (`registrations`, `orders`) o `/api/dev` (`payments`, simulador). Los routers de MVP temporales (`check-in`, simulador de pago) solo se montan si su variable de entorno correspondiente está en `"true"` — si no, Express responde 404 estándar para esas rutas, como si no existieran.
- **`src/config/env.ts`** — valida las variables de entorno con Zod al arrancar. Trata strings vacíos (placeholders de `.env.example` sin completar) como si la variable no estuviera definida, para que el backend pueda arrancar igual con integraciones opcionales sin configurar.
- **`src/shared/`**:
  - `prisma.ts` — instancia única de `PrismaClient`.
  - `AppError.ts` — clase base para errores de dominio (`code`, `message`, `statusCode`).
  - `qrToken.ts` — genera el token aleatorio del ticket, su hash SHA-256, y parsea/valida el payload de un QR escaneado (`crypto` nativo de Node, sin dependencias nuevas). Usado tanto por el registro General/VIP (generación) como por check-in (parseo).
- **`src/middlewares/errorHandler.ts`** — único middleware de error de la app. Traduce `AppError` a su `statusCode`, errores de `ZodError` a 400 con detalle por campo, y cualquier otra excepción a 500 genérico (sin loguear el body de la request, que puede tener email/teléfono).
- **`src/integrations/email/`** — envío del ticket con QR por email (`emailService.ts` orquesta, `template.ts` arma el HTML con el QR como PNG adjunto inline por CID, `resendProvider.ts`/`consoleProvider.ts` son los dos proveedores). Usado tanto por el registro General como por la aprobación de pago VIP.
- **`src/modules/`** — un módulo por caso de uso, siguiendo `controller → service → routes` (sin capa de `repository` separada cuando toda la lógica es una única transacción). Con código hoy: **`registrations/`** (General), **`check-in/`** (validación de QR, MVP sin auth), **`orders/`** (creación y consulta de orden VIP, cálculo de capacidad) y **`payments/`** (simulador de pago y emisión de tickets). El resto (`auth`, `events`, `ticket-types`, `tickets`, `admin`, `users`) son carpetas vacías reservadas para las próximas fases (ver `project.md`).

## PostgreSQL y Prisma

- Postgres 16 corriendo en Docker en desarrollo (contenedor `tickets-db`, base `tickets_db`), ver `docs/LOCAL_SETUP.md`.
- `backend/prisma/schema.prisma` es la única fuente de verdad del modelo de datos — detalle completo en `docs/DATA_MODEL.md`.
- Migraciones versionadas en `backend/prisma/migrations/`. Hasta ahora: `init` (esquema inicial), `make_firebase_uid_optional` (`User.firebaseUid` opcional) y `add_order_item_attendee_names` (`OrderItem.attendeeNames Json?`, para la compra VIP — ver `docs/DECISIONS.md`).
- `backend/prisma/seed.ts` — seed de desarrollo idempotente (usa `upsert` con IDs fijos), crea un evento demo publicado y sus 3 tipos de entrada. No se ejecuta automáticamente; se corre a mano con `npm run db:seed`.

## Flujo de registro General

Único flujo de negocio implementado hoy. Endpoint: `POST /api/events/:eventPublicId/registrations/general` (detalle completo en `docs/API.md`).

```
Frontend (GeneralRegistrationModal)
  → valida el formulario con Zod (feedback inmediato)
  → POST /api/events/:eventPublicId/registrations/general  { ticketTypeId, firstName, lastName, email, phone, acceptedTerms }

Backend (modules/registrations)
  1. schemas.ts   → valida y normaliza el body con Zod (email en minúsculas, nombre/apellido sin espacios sobrantes, teléfono en formato E.164)
  2. service.ts   → busca el Event por publicId; confirma que está PUBLISHED
                   → busca el TicketType por id + eventId; confirma que está ACTIVE, que price = 0, y que la fecha actual está dentro de su ventana de venta
                   → dentro de una transacción Serializable (ver más abajo):
                       - confirma que ese email no tenga ya un Ticket ACTIVE/USED de ese TicketType en ese evento (si lo tiene, aborta con 409)
                       - confirma cupo disponible (unidades vendidas < TicketType.capacity)
                       - crea (o reutiliza, si el email ya existía) el User
                       - crea la Order con status PAID, total 0, sin crear ningún Payment
                       - crea el OrderItem (quantity 1, unitPrice 0)
                       - crea el Ticket (status ACTIVE, qrTokenHash = SHA-256 del token generado)
  3. controller.ts → arma la respuesta 201 con el token crudo (única vez que existe fuera del proceso)
```

Todo el registro (User + Order + OrderItem + Ticket) se crea o no se crea completo: si cualquier chequeo falla dentro de la transacción, no queda ningún resto en la base.

## Flujo de compra VIP simulada (Individual y Doble)

Sin Mercado Pago real todavía (el pago se simula, ver `docs/DECISIONS.md`). Tres pasos separados, cada uno su propio endpoint (detalle completo en `docs/API.md`):

```
1. Crear orden — POST /api/events/:eventPublicId/orders/vip
   Frontend (VipCheckoutModal): comprador → asistentes → resumen → confirmar
   Backend (modules/orders):
     - valida TicketType (VIP = price > 0, ACTIVE, dentro de ventana de venta)
     - exige attendees.length === TicketType.ticketsPerUnit
     - dentro de una transacción Serializable: recalcula cupo disponible
       (PAID + PENDING no vencidas), crea/reutiliza User, crea Order PENDING
       con expiresAt a ORDER_EXPIRATION_MINUTES, crea 1 OrderItem con
       attendeeNames — sin Ticket, sin Payment.

2. Simular el pago — POST /api/dev/orders/:orderPublicId/simulate-payment (solo dev/tests)
   Backend (modules/payments):
     - si la orden ya venció, la marca EXPIRED (expiración perezosa) y no aprueba nada
     - si ya estaba resuelta (PAID/CANCELLED/EXPIRED), devuelve alreadyProcessed sin tocar nada
     - transición guardada por updateMany condicionado a status: "PENDING"
       (mismo patrón que check-in, no Serializable: acá no hay que volver a
       chequear cupo, solo evitar que dos aprobaciones simultáneas emitan dos veces)
     - approved: Payment APPROVED, Order PAID, emite ticketsPerUnit Ticket
       (uno por nombre en attendeeNames), y recién ahí — fuera de la
       transacción — llama a sendGeneralTicketEmail() una vez por ticket

3. Consultar estado — GET /api/events/:eventPublicId/orders/:orderPublicId
   Aplica la misma expiración perezosa; nunca devuelve token ni qrTokenHash.
```

Igual que en General: los tickets nunca se emiten mientras la orden esté `PENDING`, el token crudo solo existe en la respuesta inmediata de la primera aprobación, y solo se persiste su hash.

## Transacción Serializable

La transacción de `registerGeneralTicket()` (`backend/src/modules/registrations/service.ts`) corre con `isolationLevel: Serializable` de Postgres. Es necesario porque dos requests simultáneas con el mismo email (o compitiendo por el último cupo) podrían pasar ambas el chequeo de "no existe todavía" si se leyera con el nivel de aislamiento por defecto.

Cuando Postgres aborta una transacción por conflicto de serialización, Prisma lo expone como `PrismaClientKnownRequestError` con código `P2034`. El servicio lo captura explícitamente y lo traduce a un error de dominio (`RegistrationConflictError` en General, `OrderConflictError` en VIP; ambos HTTP 409) — nunca llega un 500 genérico al cliente por este motivo. Probado con submits/compras simultáneas del mismo email o por la última unidad de cupo: uno responde 201 y el otro 409, nunca 500.

La aprobación de pago VIP (`modules/payments/simulationService.ts`) usa un mecanismo distinto y más simple — `updateMany` condicionado por `status: "PENDING"` (mismo patrón que `check-in`) en vez de `Serializable` — porque ahí no hace falta releer ningún cupo, solo garantizar que una única request gane la transición de estado. Ver `docs/DECISIONS.md`.

## Base separada para tests

Los tests de integración del backend corren contra una base Postgres **distinta** de la de desarrollo, para no ensuciar ni depender de datos de `tickets_db`:

- `backend/tests/setup/testDatabaseUrl.ts` resuelve la URL de conexión de test: usa `DATABASE_URL_TEST` si está definida, o si no, la deriva de `DATABASE_URL` reemplazando el nombre de la base por `tickets_test` (misma instancia de Postgres, mismas credenciales). Incluye una guarda que aborta si la URL resuelta no tiene "test" en el nombre de la base, o si coincide con la de desarrollo.
- `backend/tests/setup/vitestSetup.ts` (registrado en `vitest.config.ts` vía `setupFiles`) aplica esa resolución antes de que se importe cualquier módulo de la app, así que todo el código bajo test (incluido `shared/prisma.ts`) queda apuntando a `tickets_test`. También fuerza en `"true"` las variables de los MVP temporales (`ENABLE_MVP_CHECKIN`, `ENABLE_MVP_PAYMENT_SIMULATOR`) para poder ejercitar esos flujos; los archivos dedicados a probar el caso "deshabilitado" (`checkIn.disabled.test.ts`, `paymentSimulator.disabled.test.ts`) las fuerzan de nuevo a `"false"` antes de importar la app, en su propio registro de módulos.
- `backend/scripts/prepare-test-db.ts` (`npm run test:db:setup`) aplica las migraciones existentes contra la base de test. Es manual, no se ejecuta automáticamente en cada corrida de tests.
- Los tests limpian únicamente los fixtures que ellos mismos crean (`backend/tests/helpers/fixtures.ts`), nunca tocan `tickets_db`.
- `vitest.config.ts` corre los archivos de test **en serie** (`fileParallelism: false`): varios usan transacciones `Serializable` contra una base chica, y correrlos en paralelo puede generar falsos conflictos de serialización entre archivos distintos (no un bug real). Ver `docs/DECISIONS.md`.

## Integraciones

- **Email** (`integrations/email/`) — implementado. Confirmación de compra y envío del ticket con QR (PNG generado con `qrcode`, adjunto inline por CID vía Resend, o simulado en consola en desarrollo). El token crudo llega a este servicio en el mismo momento de la emisión del ticket (General o VIP), nunca después.
- **Firebase** (`integrations/firebase/`, carpeta reservada, vacía) — todavía no implementado. Autenticación, solo para administradores y validadores (no para asistentes que compran/registran entradas).
- **Mercado Pago** (`integrations/mercadopago/`, carpeta reservada, vacía) — todavía no implementado. Va a reemplazar al simulador de pago (`modules/payments/`) como fuente real de aprobación/rechazo, sin cambiar el resto del flujo (creación de orden, emisión de tickets, email).
- **WhatsApp** — notificaciones/recordatorios, no implementado ni tiene carpeta reservada todavía.
- **CRM** y **Meta Pixel** — no implementados.
