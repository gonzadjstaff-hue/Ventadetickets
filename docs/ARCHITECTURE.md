# Arquitectura

## Frontend

`frontend/` — React 19 + Vite + TypeScript + Tailwind CSS v4.

- **`src/router/AppRouter.tsx`** — define las rutas con React Router: `/` → `PulseEventLanding`, `/checkout/return` → `CheckoutReturnPage` (destino público de las back_urls de Checkout Pro, sin dependencias pesadas, no lazy), `/staff/login` → `StaffLoginPage` (login real de staff), `/admin` → `AdminDashboardPage` (protegida, solo `ADMIN`), `/check-in` → `CheckInPage` (protegida, `ADMIN`/`VALIDATOR` — MVP de validación de QR, no linkeada desde la navegación pública) y `/auth-debug` → `AuthDebugPage` (técnica/temporal, ver más abajo). `/admin` y `/check-in` están envueltas en `ProtectedRoute` (`src/features/auth/ProtectedRoute.tsx`). `CheckInPage`, `StaffLoginPage`, `AdminDashboardPage` y `AuthDebugPage` se cargan con `React.lazy` + `Suspense`: la landing pública no tiene motivo para pagar ese peso en la carga inicial (ver `docs/DECISIONS.md`) — aunque el propio SDK de Firebase, al estar `AuthProvider` montado globalmente, sí se carga siempre (ver el bullet de autenticación más abajo y `docs/DECISIONS.md`).
- **`src/pages/PulseEventLanding.tsx`** — arma la landing pública del evento demo a partir de los componentes de `src/features/events/landing/`.
- **`src/pages/CheckoutReturnPage.tsx`** — pantalla de retorno del checkout de Mercado Pago. Lee únicamente `orderPublicId` de la URL (nunca `status`/`payment_id`/`collection_status` ni ningún otro query param que Mercado Pago agregue a la redirección); hace polling de `GET /orders/:orderPublicId` hasta un estado terminal (`PAID`/`CANCELLED`/`EXPIRED`) o un tiempo máximo, sin depender de ningún token — la aprobación real siempre pasa por el webhook del backend, nunca por esta pantalla. Ver `docs/DECISIONS.md`.
- **`src/features/events/landing/`** — todos los componentes visuales de la landing (Hero, TicketTypes, HowItWorks, etc.), datos mockeados (`mockData.ts`), y los componentes conectados a datos reales: `GeneralRegistrationModal.tsx` (registro gratuito), `EventTicket.tsx`/`TicketQrCode.tsx` (entrada descargable con QR real, reutilizada también para tickets VIP). `EventTicket` es puramente presentación + captura: no tiene botón propio, expone `generateCapture()` (vía `forwardRef`) para que un padre arme el PDF de descarga/compartir sin que el componente dispare nada por sí solo — ver `ticketExport/` más abajo.
- **`src/features/events/ticketExport/`** — arquitectura compartida de descarga/compartir en PDF, reutilizada por General, VIP Individual y VIP Doble (ver `docs/DECISIONS.md`): `ticketPdf.ts` (arma el PDF con `jsPDF`, `import()` dinámico), `share.ts` (wrapper de la Web Share API nativa), `downloadBlob.ts`, `useTicketPdfDelivery.ts` (hook que junta generación + descarga/compartir) y `TicketDeliveryButtons.tsx` (los botones, reutilizados tal cual).
- **`src/features/events/checkout/`** — flujo de compra VIP: `VipCheckoutModal.tsx` (pasos comprador → asistentes → resumen → pago → resultado, React Hook Form + Zod). En el paso de pago, si el backend informa `mercadoPagoCheckoutAvailable`, aparece el botón real "Pagar con Mercado Pago" (pide la preferencia y redirige a `checkoutUrl`); el simulador (`SimulatePaymentControls.tsx`, los 4 botones de simulación) solo aparece además en `import.meta.env.DEV` con `paymentSimulationAvailable`, y queda visualmente separado bajo la etiqueta "Herramientas de prueba" para no confundirse con el botón real.
- **`src/features/scanner/`** — `QrScanner.tsx` (lector de cámara sobre `html5-qrcode`, inicio/detención manual), `ManualQrInput.tsx` (carga manual solo en desarrollo), `CheckInResultPanel.tsx` — usados por `CheckInPage`.
- **`src/features/auth/`** — autenticación de staff (`ADMIN`/`VALIDATOR`), ver `docs/DECISIONS.md`. `firebaseClient.ts` (init lazy del Firebase Client SDK), `authService.ts` (login/logout/ID Token/mapeo de errores), `AuthContext.tsx` (`AuthProvider`, montado **globalmente** en `main.tsx` — expone `user` (Firebase), `profile` (respuesta de `POST /api/auth/session`), `loading`, `profileLoading`, `profileError`, `login`, `logout`, `getIdToken` vía `useAuth()`), `authContextValue.ts`/`useAuth.ts` (contexto/hook separados por Fast Refresh) y `ProtectedRoute.tsx` (gate de UI por rol — ver más abajo). `AuthProvider` resuelve/vincula el perfil interno automáticamente cada vez que cambia el usuario de Firebase (login o rehidratación al recargar), llamando `POST /api/auth/session` de forma idempotente.
- **`ProtectedRoute`** (`src/features/auth/ProtectedRoute.tsx`) — envuelve `/admin` y `/check-in`. Mientras se resuelve la sesión muestra un estado de carga; sin sesión (`user`/`profile` ausentes) redirige a `/staff/login`; con sesión pero rol no permitido muestra un mensaje de acceso denegado (sin redirigir). **Es un gate de UI, no la autoridad de seguridad** — eso sigue siendo exclusivamente `requireAuth`/`requireRole` en el backend.
- **`src/pages/StaffLoginPage.tsx`** — login real de staff (`/staff/login`). Firebase login → `AuthProvider` llama `POST /api/auth/session` → redirige a `/admin` (`ADMIN`) o `/check-in` (`VALIDATOR`) según `profile.role`. Si `POST /api/auth/session` falla (401/403/409/500), cierra la sesión de Firebase automáticamente (para que el formulario quede disponible de nuevo) mostrando el motivo antes.
- **`src/pages/AdminDashboardPage.tsx`** — layout inicial de `/admin` (protegida, solo `ADMIN`): sidebar (nav preparada para Resumen/Órdenes/Tickets/Asistentes/Pagos/Usuarios/Check-in — hoy solo "Resumen" y "Check-in" son funcionales, el resto son placeholders no interactivos con etiqueta "Próximamente") + header (email/rol del usuario, botón cerrar sesión). "Resumen" muestra tarjetas con el texto "Pendiente de conectar al backend" — **nunca cifras inventadas**, no hay todavía ningún endpoint de métricas del dashboard.
- **`src/pages/AuthDebugPage.tsx`** (`/auth-debug`) — pantalla técnica/temporal para validar el flujo de autenticación de punta a punta (login → ID Token → `POST /api/auth/session`), no linkeada desde la navegación pública. Consume el mismo `AuthProvider` global (ya no monta uno propio) — distinta de `/staff/login`, que es la pantalla real.
- **`src/api/`** — capa de acceso HTTP. `client.ts` centraliza `fetch` + manejo de errores (`ApiError`) leyendo `VITE_API_URL` una sola vez. `registrations.ts` (registro General), `checkIns.ts` (validación de QR), `orders.ts` (creación/consulta de orden VIP, simulación de pago, y `createMercadoPagoCheckout` para pedir la preferencia de Checkout Pro).
- **`src/config/demoEvent.ts`** — lee de variables de entorno los IDs del evento y tipos de entrada demo (General, VIP Individual, VIP Doble). Es el único lugar del frontend que conoce esos IDs; existe porque todavía no hay un endpoint de listado de eventos/tipos de entrada (ver `docs/DECISIONS.md`).
- **Estado del servidor**: `@tanstack/react-query` (`QueryClientProvider` montado en `src/main.tsx`), usado por las mutaciones de registro General, creación de orden VIP y simulación de pago.
- **Estilos**: Tailwind para estructura y layout; `pulse-landing.css` (dentro de `features/events/landing/`) para animaciones, gradientes y estados hover específicos de esa landing. Paleta y tipografía (Google Fonts "Kanit") están scopeadas a la clase `.pulse-landing` — cualquier componente que use esas clases (ej. `pulse-btn-primary`) necesita tener un ancestro con esa clase, si no el fondo/color queda indefinido (pasó una vez con `CheckInPage`, ver commit de esa pantalla).
- **`vite.config.ts`** — `build.rollupOptions.output.manualChunks` fuerza un chunk propio (`auth-vendor`) para `firebase`/`@firebase` + todo `src/features/auth/`. **No es opcional/cosmético**: sin este chunk forzado, Rolldown (el bundler de Vite 8) pierde silenciosamente el código real del SDK de Firebase del build de producción cuando el mismo módulo es alcanzable a la vez desde un import estático (`AuthProvider` global) y desde varios imports dinámicos (páginas lazy que usan `useAuth`) — ver `docs/DECISIONS.md` para el detalle completo de cómo se diagnosticó.

## Backend

`backend/` — Node.js + Express 5 + TypeScript + Prisma.

- **`src/app.ts`** — arma la app Express: `trust proxy` (solo si `NODE_ENV=production`, necesario detrás del proxy inverso de Render — ver `docs/DEPLOYMENT.md`), `helmet`, `cors` (función que permite `FRONTEND_URL` más cualquier origen adicional listado en `CORS_ALLOWED_ORIGINS`, nunca `"*"`; las requests sin header `Origin` — curl, health checks, el webhook de Mercado Pago — siempre pasan, porque CORS no protege a un webhook server-to-server), rate limiting, `express.json()`, el endpoint `GET /api/health`, y los routers de cada módulo montados en `/api/events` (`registrations`, `orders`, checkout de Mercado Pago) o `/api/dev` (`payments`, simulador) o en la raíz de `/api` (webhook de Mercado Pago). Los routers de MVP temporales (`check-in`, simulador de pago) y los de Mercado Pago (checkout + webhook) solo se montan si su variable de entorno correspondiente está efectivamente disponible — si no, Express responde 404 estándar para esas rutas, como si no existieran.
- **`src/server.ts`** — instancia `createApp()` y escucha en `env.PORT`/`"0.0.0.0"`. Captura `SIGTERM`/`SIGINT` (la señal que Render manda al reciclar o detener una instancia) para un cierre controlado: deja de aceptar conexiones nuevas y recién después desconecta Prisma.
- **`src/config/env.ts`** — valida las variables de entorno con Zod al arrancar. Trata strings vacíos (placeholders de `.env.example` sin completar) como si la variable no estuviera definida, para que el backend pueda arrancar igual con integraciones opcionales sin configurar. También deriva `CORS_ALLOWED_ORIGINS_LIST` (array final de orígenes permitidos por CORS: `FRONTEND_URL` más los de `CORS_ALLOWED_ORIGINS`, separados por coma) una sola vez al arrancar — mismo criterio que `MERCADOPAGO_CHECKOUT_AVAILABLE`.
- **`src/shared/`**:
  - `prisma.ts` — instancia única de `PrismaClient`.
  - `AppError.ts` — clase base para errores de dominio (`code`, `message`, `statusCode`).
  - `qrToken.ts` — genera el token aleatorio del ticket, su hash SHA-256, y parsea/valida el payload de un QR escaneado (`crypto` nativo de Node, sin dependencias nuevas). Usado tanto por el registro General/VIP (generación) como por check-in (parseo).
- **`src/middlewares/errorHandler.ts`** — único middleware de error de la app. Traduce `AppError` a su `statusCode`, errores de `ZodError` a 400 con detalle por campo, y cualquier otra excepción a 500 genérico (sin loguear el body de la request, que puede tener email/teléfono).
- **`src/middlewares/verifyBearerFirebaseToken.ts`** — lee `Authorization: Bearer <token>`, lo verifica contra Firebase (vía `integrations/firebase/firebaseAdmin.ts`) y exige `email_verified === true`, devolviendo solo `{ uid, email }`. Único punto que hace esta verificación — compartido por `requireAuth` (abajo) y `POST /api/auth/session`, para que la lógica de identidad nunca pueda divergir entre los dos.
- **`src/middlewares/requireAuth.ts` / `requireRole.ts`** — infraestructura de autenticación y autorización para `ADMIN`/`VALIDATOR` (Etapa 1, ver `docs/DECISIONS.md`). `requireAuth` usa `verifyBearerFirebaseToken`, resuelve el `User` interno por `firebaseUid` y adjunta `req.authUser` (`firebaseUid`, `email`, `emailVerified`, `userId`, `role`, `status` — tipado en `authTypes.ts`, `Request` aumentado en `src/types/express.d.ts`); `role`/`status` siempre se leen de esa fila de Postgres, nunca del token. Responde 401 si el `firebaseUid` todavía no tiene un `User` vinculado — esa vinculación es responsabilidad exclusiva de `POST /api/auth/session`, no de este middleware. `requireRole(...roles)` solo lee `req.authUser.role` ya resuelto.
- **`src/modules/auth/`** (Etapas 2 y 5, ver `docs/DECISIONS.md` y `docs/API.md`) — `POST /api/auth/session` (primer acceso: vincula `firebaseUid` ↔ `User` preprovisionado por email, ver `sessionService.ts`), `GET /api/auth/me` (perfil mínimo del usuario ya vinculado) y `GET /api/auth/admin-check` (solo técnica/temporal, valida `requireRole("ADMIN")` de punta a punta). Montados sin flag en `/api/auth` (`app.ts`). **`/check-in` es la única ruta de negocio protegida hasta ahora** (`requireAuth` + `requireRole("ADMIN", "VALIDATOR")`, ver el bullet de `check-in/` más abajo) — registro General, VIP y Mercado Pago siguen sin autenticación, y ninguna ruta de `auth/` interactúa con Mercado Pago en ningún punto. No hay registro público de `ADMIN`/`VALIDATOR`: solo puede vincularse un `User` preprovisionado de antemano (`backend/scripts/createStaffUser.ts`).
- **`src/integrations/email/`** — envío del ticket con QR por email (`emailService.ts` orquesta, `template.ts` arma el HTML con el QR como PNG adjunto inline por CID, `resendProvider.ts`/`consoleProvider.ts` son los dos proveedores). Usado tanto por el registro General como por la aprobación de pago VIP.
- **`src/modules/`** — un módulo por caso de uso, siguiendo `controller → service → routes` (sin capa de `repository` separada cuando toda la lógica es una única transacción). Con código hoy: **`auth/`** (`GET /me`, `GET /admin-check` — ver el bullet dedicado más arriba), **`registrations/`** (General), **`check-in/`** (validación de QR; protegida con `requireAuth` + `requireRole("ADMIN", "VALIDATOR")` — `CheckIn.validatorUserId` sale de `req.authUser.userId`, el validador real, ya no de un usuario "sistema"/demo; sigue detrás de `ENABLE_MVP_CHECKIN` porque la selección de evento sigue siendo MVP, ver `docs/DECISIONS.md`), **`orders/`** (creación y consulta de orden VIP, cálculo de capacidad) y **`payments/`** (simulador de pago, emisión de tickets, y ahora también Checkout Pro/webhook de Mercado Pago: `mercadoPagoCheckoutService.ts`, `mercadoPagoWebhookService.ts`, `mercadoPagoController.ts`, `mercadoPagoRoutes.ts`, `mercadoPagoWebhookRoutes.ts`, `mercadoPagoErrors.ts`). El resto (`events`, `ticket-types`, `tickets`, `admin`, `users`) son carpetas vacías reservadas para las próximas fases (ver `project.md`).

## PostgreSQL y Prisma

- Postgres 16 corriendo en Docker en desarrollo (contenedor `tickets-db`, base `tickets_db`), ver `docs/LOCAL_SETUP.md`.
- `backend/prisma/schema.prisma` es la única fuente de verdad del modelo de datos — detalle completo en `docs/DATA_MODEL.md`.
- Migraciones versionadas en `backend/prisma/migrations/`. Hasta ahora: `init` (esquema inicial), `make_firebase_uid_optional` (`User.firebaseUid` opcional), `add_order_item_attendee_names` (`OrderItem.attendeeNames Json?`, para la compra VIP) y `add_order_provider_preference_id` (`Order.providerPreferenceId String?`, nullable, para reutilizar la preferencia de Checkout Pro de Mercado Pago — ver `docs/DECISIONS.md`).
- `backend/prisma/seed.ts` — seed de desarrollo idempotente (usa `upsert` con IDs fijos), crea un evento demo publicado y sus 3 tipos de entrada. No se ejecuta automáticamente; se corre a mano con `npm run db:seed` (tampoco en producción — ver `docs/DEPLOYMENT.md`). Ya no siembra ningún usuario "sistema"/demo para check-in — desde que `check-in` exige un `ADMIN`/`VALIDATOR` real autenticado, ese usuario fijo quedó sin uso y se retiró (ver `docs/DECISIONS.md`).
- `backend/scripts/createStaffUser.ts` (`npm run auth:create-staff-user`) — preprovisiona un `ADMIN`/`VALIDATOR` (email/displayName/role, `status: ACTIVE`, `firebaseUid: null`) antes de su primer login real. Nunca toca `firebaseUid` (eso lo hace `POST /api/auth/session`), nunca degrada un usuario existente sin `STAFF_CONFIRM_UPDATE=true` explícito. `backend/scripts/createTestUser.ts` (`npm run auth:create-test-user`) es distinto: crea un `User` ya vinculado directamente por `firebaseUid`, para poder probar sin pasar por Firebase Console/`/api/auth/session` en desarrollo local. `backend/scripts/verifyStaffEmail.ts` (`npm run auth:verify-staff-email`) marca `emailVerified: true` en Firebase Auth para un `ADMIN`/`VALIDATOR` ya preprovisionado — necesario porque Firebase Console no marca el email como verificado por defecto, y `verifyBearerFirebaseToken.ts` lo exige de forma estricta — ver `docs/LOCAL_SETUP.md`. Ninguno de los tres se ejecuta automáticamente.
- `backend/package.json`: `postinstall` corre `prisma generate` automáticamente después de cualquier `npm install` (local o en Render); `prisma:deploy` corre `prisma migrate deploy` (nunca `migrate dev` ni `db push`) — encadenado al comando de arranque en producción, ver `docs/DEPLOYMENT.md`.

## Despliegue

Preparado (no ejecutado) para: frontend en Vercel (`frontend/vercel.json`, rewrite de SPA para las rutas de React Router), backend en Render (`render.yaml` en la raíz, opcional — Blueprint de referencia, la vía documentada paso a paso es configurar el Web Service a mano) y PostgreSQL administrado en Render. Guía completa, con las variables exactas de cada entorno, en `docs/DEPLOYMENT.md`.

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

El simulador de pago sigue disponible como herramienta de desarrollo/tests, en paralelo al Checkout Pro de Mercado Pago real (ver la sección dedicada más abajo, "Flujo de compra VIP con Mercado Pago"). Tres pasos separados, cada uno su propio endpoint (detalle completo en `docs/API.md`):

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

## Flujo de compra VIP con Mercado Pago (Checkout Pro, modo prueba)

Recorrido de pago real, alternativo al simulador de arriba (que sigue disponible). Reutiliza la misma creación de orden (`POST /orders/vip`) — lo que cambia es cómo se aprueba el pago. Detalle completo de diseño en `docs/DECISIONS.md`, endpoints en `docs/API.md`.

```
1. Frontend (VipCheckoutModal, orden ya PENDING): botón "Pagar con Mercado Pago"
   → POST /api/events/:eventPublicId/orders/:orderPublicId/checkout/mercadopago (sin body)

2. Backend (modules/payments/mercadoPagoCheckoutService.ts):
     - valida que la orden exista, sea de ese evento, y siga PENDING (aplica
       expiración perezosa; rechaza CANCELLED/EXPIRED/ya PAID)
     - arma la preferencia con datos de la BASE (nunca del frontend): importe,
       moneda, external_reference = orderPublicId, back_urls (las 3 iguales,
       apuntando a /checkout/return?orderPublicId=...), notification_url
     - crea la preferencia en Mercado Pago (o reutiliza la existente si ya
       hay una vigente para esa orden) y persiste providerPreferenceId
     - responde con checkoutUrl ya resuelto (sandbox en modo prueba)

3. Frontend: redirige el navegador a checkoutUrl (Mercado Pago)
4. El comprador paga en el entorno de Mercado Pago
5. Mercado Pago redirige de vuelta a /checkout/return?orderPublicId=...
   (mismo destino sin importar el resultado — nunca se confía en query params
   de retorno para aprobar nada)
6. Frontend (CheckoutReturnPage): polling de GET /orders/:orderPublicId hasta
   PAID/CANCELLED/EXPIRED o timeout

--- en paralelo, server-to-server ---

7. Mercado Pago llama a POST /api/webhooks/mercadopago
8. Backend (modules/payments/mercadoPagoWebhookService.ts):
     - valida x-signature (HMAC-SHA256, comparación timing-safe) — firma
       inválida: 401, nunca consulta nada
     - dedup por PaymentWebhookEvent (provider + id de la notificación)
     - consulta el pago real: GET /v1/payments/:id (nunca confía en el body
       del webhook para status/amount/external_reference)
     - verifica: existe una Order con publicId = external_reference, importe
       y moneda coinciden, live_mode coherente con las credenciales
       configuradas — cualquier discrepancia se ignora sin aprobar nada
     - approved: aplica expiración perezosa primero (una orden ya vencida no
       se aprueba), transición PENDING → PAID guardada por updateMany, emite
       tickets (mismo emitTicketsForOrderItem que el simulador), envía el
       email con los tokens crudos en memoria de ese mismo request
     - pending/rejected: Order sigue PENDING; cancelled: Order → CANCELLED;
       refunded/charged_back: si la Order ya estaba PAID, pasa a REFUNDED y
       los tickets ACTIVE quedan REFUNDED (bloqueando su check-in)
```

Idempotente en dos niveles: `PaymentWebhookEvent` evita reprocesar la misma notificación, y `Payment`/`Order` usan `upsert`/`updateMany` condicionado — ni una notificación repetida ni dos concurrentes duplican tickets.

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

- **Email** (`integrations/email/`) — implementado. Confirmación de compra y envío del ticket con QR (PNG generado con `qrcode`, adjunto inline por CID vía Resend, o simulado en consola en desarrollo). El token crudo llega a este servicio en el mismo momento de la emisión del ticket (General, VIP simulado o VIP con Mercado Pago), nunca después.
- **Firebase** (`integrations/firebase/firebaseAdmin.ts`) — Admin SDK, solo para autenticar administradores y validadores (nunca a los asistentes que compran/registran entradas, que siguen sin cuenta). Inicialización perezosa (un solo import no tiene efecto secundario), normalización de `FIREBASE_PRIVATE_KEY` (saltos de línea literales `\n` → reales), verificación de ID Tokens con `checkRevoked: true`, y `getFirebaseAuth()` expuesto para scripts administrativos (`verifyStaffEmail.ts`). Consumido por `requireAuth`, `POST /api/auth/session` y `GET /api/auth/me`. Del lado del negocio, la única ruta protegida hasta ahora es `check-in` (ver `docs/DECISIONS.md`); registro General, VIP y Mercado Pago siguen sin autenticación.
- **Mercado Pago** (`integrations/payments/`, con `integrations/payments/mercadoPago/`) — implementado como recorrido de pago real para VIP (Checkout Pro, modo prueba), coexistiendo con el simulador de `modules/payments/`. `integrations/payments/types.ts` define la interfaz interna `PaymentProvider` (crear preferencia, consultar pago, verificar firma) — el resto del sistema nunca conoce una estructura cruda de Mercado Pago. `mercadoPago/mercadoPagoClient.ts` es el único archivo que importa el SDK oficial (`mercadopago` npm, ver `docs/DECISIONS.md`); `mercadoPago/mercadoPagoProvider.ts` implementa la interfaz y normaliza estados/errores; `paymentProviderRegistry.ts` decide si está disponible (`env.MERCADOPAGO_CHECKOUT_AVAILABLE`). Consumido por `modules/payments/mercadoPagoCheckoutService.ts` (crear/reutilizar preferencia) y `mercadoPagoWebhookService.ts` (webhook idempotente: verifica firma, consulta el pago server-to-server, y solo `approved` emite tickets). Ver `docs/API.md` para los endpoints.
- **WhatsApp** — notificaciones/recordatorios, no implementado ni tiene carpeta reservada todavía.
- **CRM** y **Meta Pixel** — no implementados.
