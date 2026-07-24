# Arquitectura

## Frontend

`frontend/` — React 19 + Vite + TypeScript + Tailwind CSS v4.

- **`src/router/AppRouter.tsx`** — define las rutas con React Router. Hoy hay una sola: `/` → `PulseEventLanding`.
- **`src/pages/PulseEventLanding.tsx`** — arma la landing pública del evento demo a partir de los componentes de `src/features/events/landing/`.
- **`src/features/events/landing/`** — todos los componentes visuales de la landing (Hero, TicketTypes, HowItWorks, etc.), datos mockeados (`mockData.ts`), y el único componente conectado a datos reales: `GeneralRegistrationModal.tsx` (formulario de registro gratuito, con React Hook Form + Zod).
- **`src/api/`** — capa de acceso HTTP. `client.ts` centraliza `fetch` + manejo de errores (`ApiError`) leyendo `VITE_API_URL` una sola vez; `registrations.ts` expone `registerGeneralTicket()`, la única llamada al backend que existe hoy.
- **`src/config/demoEvent.ts`** — lee de variables de entorno los IDs del evento y tipo de entrada demo (`VITE_DEMO_EVENT_PUBLIC_ID`, `VITE_DEMO_GENERAL_TICKET_TYPE_ID`). Es el único lugar del frontend que conoce esos IDs; existe porque todavía no hay un endpoint de listado de eventos (ver `docs/DECISIONS.md`).
- **Estado del servidor**: `@tanstack/react-query` (`QueryClientProvider` montado en `src/main.tsx`), usado hoy solo por la mutación de registro General (`useMutation` dentro de `GeneralRegistrationModal.tsx`).
- **Estilos**: Tailwind para estructura y layout; `pulse-landing.css` (dentro de `features/events/landing/`) para animaciones, gradientes y estados hover específicos de esa landing. Paleta y tipografía (Google Fonts "Kanit") están scopeadas a la clase `.pulse-landing`, no aplicadas globalmente.

## Backend

`backend/` — Node.js + Express 5 + TypeScript + Prisma.

- **`src/app.ts`** — arma la app Express: `helmet`, `cors` (restringido a `FRONTEND_URL`), rate limiting, `express.json()`, el endpoint `GET /api/health`, el router de `registrations` montado en `/api/events`, y el middleware de errores al final.
- **`src/config/env.ts`** — valida las variables de entorno con Zod al arrancar.
- **`src/shared/`**:
  - `prisma.ts` — instancia única de `PrismaClient`.
  - `AppError.ts` — clase base para errores de dominio (`code`, `message`, `statusCode`).
  - `qrToken.ts` — genera el token aleatorio del ticket y su hash SHA-256 (`crypto` nativo de Node, sin dependencias nuevas).
- **`src/middlewares/errorHandler.ts`** — único middleware de error de la app. Traduce `AppError` a su `statusCode`, errores de `ZodError` a 400 con detalle por campo, y cualquier otra excepción a 500 genérico (sin loguear el body de la request, que puede tener email/teléfono).
- **`src/modules/`** — un módulo por caso de uso, siguiendo `controller → service → routes` (sin capa de `repository` separada cuando toda la lógica es una única transacción). Hoy el único módulo con código es **`registrations/`**; el resto (`auth`, `events`, `orders`, `payments`, `ticket-types`, `tickets`, `check-in`, `admin`, `users`) son carpetas vacías reservadas para las próximas fases (ver `project.md`).

## PostgreSQL y Prisma

- Postgres 16 corriendo en Docker en desarrollo (contenedor `tickets-db`, base `tickets_db`), ver `docs/LOCAL_SETUP.md`.
- `backend/prisma/schema.prisma` es la única fuente de verdad del modelo de datos — detalle completo en `docs/DATA_MODEL.md`.
- Migraciones versionadas en `backend/prisma/migrations/`. Hasta ahora: `init` (esquema inicial) y `make_firebase_uid_optional` (`User.firebaseUid` pasó a ser opcional, ver `docs/DECISIONS.md`).
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

## Transacción Serializable

La transacción de `registerGeneralTicket()` (`backend/src/modules/registrations/service.ts`) corre con `isolationLevel: Serializable` de Postgres. Es necesario porque dos requests simultáneas con el mismo email (o compitiendo por el último cupo) podrían pasar ambas el chequeo de "no existe todavía" si se leyera con el nivel de aislamiento por defecto.

Cuando Postgres aborta una transacción por conflicto de serialización, Prisma lo expone como `PrismaClientKnownRequestError` con código `P2034`. El servicio lo captura explícitamente y lo traduce a un error de dominio (`RegistrationConflictError`, HTTP 409) — nunca llega un 500 genérico al cliente por este motivo. Probado en `backend/tests/registrations.general.test.ts` con dos submits simultáneos del mismo email: uno responde 201 y el otro 409, nunca 500.

## Base separada para tests

Los tests de integración del backend (`backend/tests/registrations.general.test.ts`) corren contra una base Postgres **distinta** de la de desarrollo, para no ensuciar ni depender de datos de `tickets_db`:

- `backend/tests/setup/testDatabaseUrl.ts` resuelve la URL de conexión de test: usa `DATABASE_URL_TEST` si está definida, o si no, la deriva de `DATABASE_URL` reemplazando el nombre de la base por `tickets_test` (misma instancia de Postgres, mismas credenciales). Incluye una guarda que aborta si la URL resuelta no tiene "test" en el nombre de la base, o si coincide con la de desarrollo.
- `backend/tests/setup/vitestSetup.ts` (registrado en `vitest.config.ts` vía `setupFiles`) aplica esa resolución antes de que se importe cualquier módulo de la app, así que todo el código bajo test (incluido `shared/prisma.ts`) queda apuntando a `tickets_test`.
- `backend/scripts/prepare-test-db.ts` (`npm run test:db:setup`) aplica las migraciones existentes contra la base de test. Es manual, no se ejecuta automáticamente en cada corrida de tests.
- Los tests limpian únicamente los fixtures que ellos mismos crean (`backend/tests/helpers/fixtures.ts`), nunca tocan `tickets_db`.

## Futuras integraciones

Todavía no implementadas — cuando se aborden, van a vivir en `backend/src/integrations/` (carpetas ya reservadas, vacías):

- **Firebase** (`integrations/firebase/`) — autenticación, solo para administradores y validadores (no para asistentes que compran/registran entradas).
- **Mercado Pago** (`integrations/mercadopago/`) — pagos para entradas VIP.
- **Email** (`integrations/email/`) — confirmación de compra y envío del ticket con QR. El token crudo del ticket (ver `docs/DECISIONS.md`) tendrá que llegar a este servicio en el mismo momento de la emisión, porque después no se puede recuperar.
- **WhatsApp** — notificaciones/recordatorios, no implementado ni tiene carpeta reservada todavía.
- **CRM** y **Meta Pixel** — no implementados.
