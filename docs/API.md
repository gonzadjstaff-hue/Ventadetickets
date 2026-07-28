# API

Base URL en desarrollo: `http://localhost:4000`. No hay prefijo de versión.

Estos son **todos** los endpoints que existen hoy. Cualquier otro endpoint mencionado en `project.md` (admin) todavía no está implementado.

---

## `GET /api/health`

Endpoint de salud, sin lógica de negocio.

**Respuesta 200**

```json
{
  "status": "ok",
  "timestamp": "2026-07-24T18:26:22.695Z"
}
```

---

## Autenticación (`ADMIN`/`VALIDATOR`)

Etapas 2 y 5 de autenticación y roles (ver `docs/DECISIONS.md`). Los tres endpoints requieren `Authorization: Bearer <Firebase ID Token>` — nunca hay sesión por cookie. **No protegen ni modifican ninguna ruta de negocio existente** (registro General, VIP, check-in, Mercado Pago siguen exactamente igual que antes) y **no interactúan con Mercado Pago** en ningún punto.

### `POST /api/auth/session`

Primer acceso (vinculación `firebaseUid` ↔ `User`) o acceso normal de un `ADMIN`/`VALIDATOR` **previamente preprovisionado** en Postgres (ver `backend/scripts/createStaffUser.ts` más abajo). Implementado en `backend/src/modules/auth/sessionService.ts`. No usa `requireAuth` — a propósito, porque `requireAuth` exige que el `User` ya esté vinculado, que es exactamente el caso que este endpoint resuelve. Verifica el token igual que `requireAuth` (mismo helper, `verifyBearerFirebaseToken`), pero no requiere ningún `body` — cualquier `email`/`role`/`firebaseUid` que venga en el body se ignora por completo, la única identidad que importa es la del token verificado.

**Body:** ninguno requerido (puede ir vacío).

**Respuesta 200**

```json
{
  "user": {
    "id": "user-id-interno",
    "email": "admin@example.com",
    "role": "ADMIN",
    "status": "ACTIVE"
  }
}
```

Nunca devuelve `firebaseUid`, el token, `displayName`, `phone`, `createdAt`/`updatedAt` ni ningún otro campo — solo estos 4.

**Flujo:**
1. Verifica el token (mismo criterio que `requireAuth`: email presente + verificado).
2. Busca un `User` por `firebaseUid`. Si existe y está `ACTIVE`, responde 200 directo (no escribe nada).
3. Si está `BLOCKED`, `403`.
4. Si no existe por `firebaseUid`, busca por `email` normalizado (minúsculas, recortado). Si no existe ningún `User` con ese email, `401` (nunca se crea un usuario nuevo acá — no hay registro público de `ADMIN`/`VALIDATOR`).
5. Si el `User` encontrado por email está `BLOCKED`, `403`.
6. Si ya tiene un `firebaseUid` distinto asignado, `409` (nunca se reemplaza un `firebaseUid` existente automáticamente).
7. Si tiene `firebaseUid: null`, lo vincula de forma atómica (`updateMany` condicionado, mismo patrón que la aprobación de pago/check-in) dentro de una transacción que también crea un `AuditLog` (`action: "STAFF_FIREBASE_UID_LINKED"`, sin el `firebaseUid` completo ni el token en `metadata`). Dos requests concurrentes con el mismo token nunca duplican el `AuditLog` ni fallan entre sí.

**Errores:** `401 UNAUTHORIZED` (mismas causas que `GET /api/auth/me`, más "no existe ningún `User` preprovisionado con ese email"), `403 FORBIDDEN` (`User.status === "BLOCKED"`), `409 FIREBASE_UID_CONFLICT` (el `User` de ese email ya está vinculado a otra cuenta de Firebase — el mensaje nunca menciona cuál), `500 FIREBASE_NOT_CONFIGURED`.

### `GET /api/auth/me`

Perfil mínimo del usuario autenticado, implementado en `backend/src/modules/auth/`. Protegido con `requireAuth` únicamente (cualquier `ADMIN`/`VALIDATOR` habilitado puede llamarlo).

**Respuesta 200**

```json
{
  "user": {
    "id": "user-id-interno",
    "firebaseUid": "firebase-uid",
    "email": "admin@example.com",
    "role": "ADMIN",
    "status": "ACTIVE"
  }
}
```

Nunca devuelve el token, `displayName`, `phone`, `createdAt`/`updatedAt` ni ningún otro campo de `User` — solo estos 5.

**Errores:** `401 UNAUTHORIZED` (sin header, esquema distinto de Bearer, token vacío/inválido/expirado/revocado, sin email, email no verificado, o sin `User` interno vinculado a ese `firebaseUid` — ver `requireAuth` en `docs/ARCHITECTURE.md`), `403 FORBIDDEN` (`User.status === "BLOCKED"`), `500 FIREBASE_NOT_CONFIGURED` (faltan las credenciales de Firebase Admin en el servidor — error de configuración, no del cliente).

### `GET /api/auth/admin-check`

**Solo técnica y temporal**, para validar `requireAuth` + `requireRole("ADMIN")` de punta a punta durante el desarrollo de esta etapa — no forma parte de ningún flujo de negocio. Protegido con `requireAuth` y `requireRole("ADMIN")`: cualquier otro rol (`VALIDATOR`, `USER`) recibe `403 FORBIDDEN`.

**Respuesta 200**

```json
{ "ok": true, "message": "Admin access confirmed" }
```

**Errores:** mismos `401`/`403`/`500` que `GET /api/auth/me`, más `403 FORBIDDEN` si el rol no es `ADMIN`.

---

## `POST /api/events/:eventPublicId/registrations/general`

Registra un asistente en la entrada **General** (gratuita) de un evento. No requiere autenticación ni cuenta de usuario previa. Implementado en `backend/src/modules/registrations/`.

### Parámetros de ruta

| Parámetro | Descripción |
|---|---|
| `eventPublicId` | `Event.publicId` del evento. |

### Body

```json
{
  "ticketTypeId": "demo-tt-general-2026",
  "firstName": "Ada",
  "lastName": "Lovelace",
  "email": "ada@example.com",
  "phone": "+5491122334455",
  "acceptedTerms": true
}
```

`ticketTypeId` es el `id` real de `TicketType` (no hay un campo `TicketType.publicId` separado hoy — ver `docs/DECISIONS.md` y `docs/DATA_MODEL.md`). El backend resuelve el evento y el tipo de entrada exclusivamente por estos IDs, nunca por nombre.

Validación y normalización (Zod, `schemas.ts`):
- `email` → recortado y pasado a minúsculas.
- `firstName` / `lastName` → recortados, sin espacios sobrantes.
- `phone` → se le quitan espacios/guiones/paréntesis y debe quedar en formato E.164 (`+` seguido de 8 a 15 dígitos).
- `acceptedTerms` → debe ser `true`; si no, error de validación.

### Respuesta 201 — registro creado

```json
{
  "attendeeName": "Ada Lovelace",
  "orderPublicId": "cknq2x9c40003uud8vv9ej3dx",
  "ticketPublicId": "cknq2x9c80005uud8h1m2p9w1",
  "ticketToken": "3f8a1c...9e2b",
  "ticketType": "General",
  "message": "¡Listo! Tu entrada General quedó confirmada.",
  "emailStatus": "sent",
  "emailSent": true
}
```

`ticketToken` es el token crudo del ticket. Se devuelve **una única vez**, en esta respuesta — el backend solo guarda su hash SHA-256 (`Ticket.qrTokenHash`) y no puede volver a mostrarlo. Ver `docs/DECISIONS.md`.

`emailStatus` es uno de `"sent" | "simulated" | "disabled" | "failed"` (ver `backend/src/integrations/email/`). `emailSent` es un atajo equivalente a `emailStatus === "sent"`. Un email que falla o está deshabilitado **no** hace fallar el registro: la orden y el ticket ya están confirmados igual, y la descarga del ticket no depende del email.

Esta operación **no crea ningún `Payment`**: la `Order` se marca `PAID` directamente porque el total es 0. Confirmado en `backend/tests/registrations.general.test.ts` y en la prueba manual documentada en `docs/PROGRESS.md`.

### Errores

Todas las respuestas de error tienen esta forma:

```json
{
  "error": {
    "code": "TICKET_TYPE_NOT_FREE",
    "message": "Este tipo de entrada no es gratuito."
  }
}
```

Excepto los errores de validación de Zod, que además incluyen `fields`:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Los datos enviados no son válidos.",
    "fields": { "email": ["Ingresá un email válido."] }
  }
}
```

| Status | `code` | Motivo |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body inválido según el schema de Zod (formato de email/teléfono, términos no aceptados, campos faltantes). |
| 400 | `TICKET_TYPE_NOT_ACTIVE` | El `TicketType` existe pero su `status` no es `ACTIVE`. |
| 400 | `TICKET_TYPE_NOT_FREE` | El `TicketType` existe pero su `price` no es 0. |
| 404 | `EVENT_NOT_FOUND` | No existe ningún `Event` con ese `publicId`. |
| 404 | `TICKET_TYPE_NOT_FOUND` | No existe ningún `TicketType` con ese `id` para ese evento. |
| 409 | `DUPLICATE_REGISTRATION` | Ese email ya tiene un ticket `ACTIVE`/`USED` de ese `TicketType` en ese evento. |
| 409 | `SOLD_OUT` | No queda cupo disponible (`TicketType.capacity` alcanzado). |
| 409 | `REGISTRATION_CONFLICT` | Postgres abortó la transacción `Serializable` por conflicto de concurrencia (dos requests simultáneas). Nunca se devuelve 500 por este motivo. |
| 422 | `EVENT_NOT_PUBLISHED` | El evento existe pero su `status` no es `PUBLISHED`. |
| 422 | `OUTSIDE_SALES_WINDOW` | La fecha actual está fuera de `salesStartAt`–`salesEndAt` del `TicketType`. |

Cualquier otro error no controlado devuelve 500 con `{ "error": { "code": "INTERNAL_ERROR", ... } }`; el body de la request nunca se loguea (puede contener email/teléfono).

---

## `POST /api/events/:eventPublicId/check-ins`

**MVP de desarrollo, no lista para producción** — no existe autenticación de validadores todavía. Solo existe si `ENABLE_MVP_CHECKIN=true` en el backend; si no, esta ruta responde 404 estándar de Express (el router ni se monta). Implementado en `backend/src/modules/check-in/`, detalle completo del flujo en `docs/ARCHITECTURE.md`.

### Body

```json
{ "qrPayload": "pulse-ticket:v1:<ticketToken>" }
```

`qrPayload` es exactamente el contenido crudo leído del QR (nunca el token por separado, nunca por query string).

### Respuesta 200 — intento adjudicado

```json
{
  "result": "VALID",
  "message": "Acceso permitido.",
  "ticketPublicId": "cknq2x9c80005uud8h1m2p9w1",
  "holderName": "Ada Lovelace",
  "ticketType": "General"
}
```

`result` es uno de `VALID | ALREADY_USED | WRONG_EVENT | NOT_PAID | CANCELLED`. `ticketPublicId`/`holderName`/`ticketType` solo vienen en `VALID` y `ALREADY_USED`; los demás resultados devuelven únicamente `result` y `message`. Nunca se devuelve email, teléfono, token ni hash.

### Errores

| Status | `code` | Motivo |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Falta `qrPayload` o no es un string. |
| 400 | `INVALID_TICKET` | Formato/versión de `qrPayload` inválidos, o el token no corresponde a ningún `Ticket`. No se persiste ningún `CheckIn` en este caso (`CheckIn.ticketId` es obligatorio). |
| 404 | `EVENT_NOT_FOUND` | No existe ningún `Event` con ese `publicId`. |

---

## Venta VIP (Individual y Doble)

Creación y consulta de orden implementadas en `backend/src/modules/orders/`. El pago se puede confirmar de dos formas: con un **simulador de pago** (endpoint de desarrollo, más abajo) o con **Checkout Pro de Mercado Pago en modo prueba** (ver la sección dedicada más abajo) — ambos coexisten. Detalle de las decisiones de diseño en `docs/DECISIONS.md`.

### `POST /api/events/:eventPublicId/orders/vip`

Crea una orden `PENDING` que reserva una unidad de un `TicketType` VIP (`price > 0`) por 15 minutos (`ORDER_EXPIRATION_MINUTES`). No emite ningún `Ticket` ni crea ningún `Payment` — eso pasa recién cuando el pago queda aprobado.

**Body**

```json
{
  "ticketTypeId": "demo-tt-vip-individual-2026",
  "buyer": { "name": "Ada Lovelace", "email": "ada@example.com", "whatsapp": "+5491122334455" },
  "attendees": [{ "name": "Ada Lovelace" }]
}
```

`attendees` debe tener **exactamente** `TicketType.ticketsPerUnit` elementos (1 para VIP Individual, 2 para VIP Doble) — ni menos ni más.

**Respuesta 201**

```json
{
  "orderPublicId": "ckor2x9c40003uud8vv9ej3dx",
  "eventPublicId": "demo-event-pulse-2026-public",
  "ticketType": "VIP Individual",
  "total": 35000,
  "currency": "ARS",
  "expiresAt": "2026-07-24T21:15:00.000Z",
  "buyer": { "name": "Ada Lovelace", "email": "ada@example.com", "whatsapp": "+5491122334455" },
  "attendees": ["Ada Lovelace"],
  "status": "PENDING",
  "paymentSimulationAvailable": true,
  "mercadoPagoCheckoutAvailable": true
}
```

`paymentSimulationAvailable` solo aparece (y solo puede ser `true`) cuando el backend tiene `ENABLE_MVP_PAYMENT_SIMULATOR=true`. `mercadoPagoCheckoutAvailable` solo aparece (y solo puede ser `true`) cuando Checkout Pro de Mercado Pago está efectivamente disponible — ver `docs/DECISIONS.md` y la sección de Mercado Pago más abajo. No se expone ningún id interno, hash ni token.

**Errores**

| Status | `code` | Motivo |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body inválido (email/WhatsApp con formato incorrecto, `attendees` vacío o con más de 2 elementos, etc.). |
| 400 | `TICKET_TYPE_NOT_ACTIVE` | El `TicketType` existe pero no está `ACTIVE`. |
| 400 | `TICKET_TYPE_NOT_VIP` | El `TicketType` es gratuito (`price = 0`, ej. General) — este endpoint es solo para VIP. |
| 400 | `INVALID_ATTENDEE_COUNT` | La cantidad de asistentes no coincide con `TicketType.ticketsPerUnit`. |
| 404 | `EVENT_NOT_FOUND` / `TICKET_TYPE_NOT_FOUND` | No existe el evento, o no existe ese tipo de entrada para ese evento. |
| 409 | `SOLD_OUT` | No queda cupo disponible (contando `PAID` + `PENDING` no vencidas). |
| 409 | `ORDER_CONFLICT` | Conflicto de concurrencia (`Serializable`). Nunca 500 por este motivo. |
| 422 | `EVENT_NOT_PUBLISHED` / `OUTSIDE_SALES_WINDOW` | Mismo criterio que el registro General. |

### `GET /api/events/:eventPublicId/orders/:orderPublicId`

Consulta el estado de una orden (VIP o, en principio, cualquier otra). Si estaba `PENDING` y ya venció, la marca `EXPIRED` en el momento de la consulta (expiración perezosa, ver `docs/DECISIONS.md`).

**Respuesta 200**

```json
{
  "orderPublicId": "ckor2x9c40003uud8vv9ej3dx",
  "status": "PAID",
  "ticketType": "VIP Doble",
  "total": 60000,
  "currency": "ARS",
  "expiresAt": "2026-07-24T21:15:00.000Z",
  "buyerName": "Ada Lovelace",
  "attendees": ["Ada Lovelace", "Grace Hopper"],
  "paymentStatus": "APPROVED",
  "tickets": [
    { "ticketPublicId": "cktk...1", "holderName": "Ada Lovelace", "ticketTypeName": "VIP Doble" },
    { "ticketPublicId": "cktk...2", "holderName": "Grace Hopper", "ticketTypeName": "VIP Doble" }
  ]
}
```

`tickets` solo aparece cuando `status === "PAID"`, y nunca incluye `qrTokenHash` ni el token crudo — esta consulta **no** sirve para volver a descargar el QR de un ticket ya emitido (ver más abajo). `status` es uno de `PENDING | PAID | CANCELLED | EXPIRED`.

**Errores:** `404 EVENT_NOT_FOUND`, `404 ORDER_NOT_FOUND` (mismo código tanto si la orden no existe como si es de otro evento, para no confirmar su existencia).

### `POST /api/dev/orders/:orderPublicId/simulate-payment`

**Exclusivamente desarrollo/tests.** Solo existe si `ENABLE_MVP_PAYMENT_SIMULATOR=true`; si no, 404 estándar de Express (el router no se monta). No hay ningún proveedor de pago real detrás: aprueba/rechaza lo que se le pida. Nunca debe estar disponible en producción.

**Body**

```json
{ "result": "approved" }
```

`result` es uno de `"approved" | "pending" | "rejected" | "cancelled"`.

**Respuesta 200**

```json
{
  "orderStatus": "PAID",
  "paymentStatus": "APPROVED",
  "alreadyProcessed": false,
  "tickets": [
    {
      "ticketPublicId": "cktk...1",
      "holderName": "Ada Lovelace",
      "ticketType": "VIP Individual",
      "token": "3f8a1c...9e2b",
      "emailStatus": "sent"
    }
  ]
}
```

- `tickets` (con `token` crudo incluido) **solo viene en la respuesta que aprueba por primera vez**. Un `approved` repetido sobre una orden ya `PAID` devuelve `alreadyProcessed: true` y **sin** `tickets` — no hay forma de reconstruir el token crudo después (mismo motivo que en el registro General, ver `docs/DECISIONS.md`).
- `pending` y `rejected` dejan la `Order` en `PENDING` (permiten reintentar mientras no venza) y nunca generan tickets.
- `cancelled` pasa la `Order` a `CANCELLED` (libera la reserva) y nunca genera tickets.
- Si la orden ya venció, la respuesta refleja `orderStatus: "EXPIRED"` con `alreadyProcessed: true`, sin aprobar nada.

**Errores:** `400 VALIDATION_ERROR` (valor de `result` inválido), `404 ORDER_NOT_FOUND`.

---

## Checkout Pro de Mercado Pago (modo prueba)

Recorrido de pago real para VIP, alternativo al simulador de arriba (que sigue disponible). Implementado en `backend/src/modules/payments/` (`mercadoPagoCheckoutService.ts`, `mercadoPagoWebhookService.ts`, `mercadoPagoController.ts`) y `backend/src/integrations/payments/`. Detalle de diseño en `docs/DECISIONS.md`.

Ambos endpoints de esta sección **solo existen** si `env.MERCADOPAGO_CHECKOUT_AVAILABLE` es `true` (flag `ENABLE_MERCADOPAGO_CHECKOUT=true` **y** credenciales/URLs completas — ver `docs/LOCAL_SETUP.md`). Si no, responden 404 estándar de Express, como si no existieran (mismo patrón que los MVP de arriba).

### `POST /api/events/:eventPublicId/orders/:orderPublicId/checkout/mercadopago`

Crea (o reutiliza) una preferencia de Checkout Pro para una orden VIP ya creada y todavía `PENDING`. No requiere body: el importe, la moneda y el título se toman siempre de la base, nunca de lo que mande el frontend.

**Respuesta 201**

```json
{
  "preferenceId": "1234567-abcd-...",
  "checkoutUrl": "https://sandbox.mercadopago.com/checkout/v1/redirect?pref_id=...",
  "orderPublicId": "ckor2x9c40003uud8vv9ej3dx",
  "expiresAt": "2026-07-24T21:15:00.000Z"
}
```

`checkoutUrl` ya viene resuelto del lado del backend: es `sandbox_init_point` cuando `MERCADOPAGO_ACCESS_TOKEN` es de prueba (`TEST-...`), o `init_point` con credenciales productivas. El frontend solo tiene que redirigir ahí — nunca arma esta URL por su cuenta, y nunca recibe el access token.

Si la orden ya tiene una preferencia creada (mismo `orderPublicId`, sigue `PENDING` y no venció), se reutiliza (un `GET` liviano contra Mercado Pago) en vez de crear una nueva — ver `docs/DECISIONS.md`.

**Errores**

| Status | `code` | Motivo |
|---|---|---|
| 404 | `EVENT_NOT_FOUND` / `ORDER_NOT_FOUND` | Mismo criterio que el resto de la API (no distingue "no existe" de "es de otro evento"). |
| 400 | `ORDER_CANCELLED` | La orden fue cancelada. |
| 409 | `ORDER_EXPIRED` | La reserva venció (aplica expiración perezosa antes de responder). |
| 409 | `ORDER_ALREADY_PAID` | La orden ya está `PAID`: no se crea otra preferencia. |
| 503 | `MERCADOPAGO_CHECKOUT_UNAVAILABLE` | No debería poder pasar (la ruta no se monta si está deshabilitado) — red de seguridad. |
| 502 / 504 | `MERCADOPAGO_PROVIDER_ERROR` | Falla al comunicarse con Mercado Pago (timeout, 401/403/404/429/5xx, payload inesperado). Nunca expone el error crudo del proveedor. |

### `POST /api/webhooks/mercadopago`

Endpoint público (sin autenticación de usuario) al que Mercado Pago llama server-to-server para notificar cambios de estado de un pago. La autenticidad se valida por firma (`x-signature`/`x-request-id`), nunca por sesión.

**Nunca confía en el body de la notificación para nada**: valida la firma, extrae el `payment id` (`data.id`, de la query string o del body), y vuelve a consultar el pago completo directamente a la API de Mercado Pago (`GET /v1/payments/:id`) antes de tocar cualquier dato. Verifica que el pago corresponda a una `Order` existente (`external_reference` = `Order.publicId`), que el importe y la moneda coincidan exactamente, y que `live_mode` sea coherente con el entorno configurado — cualquier discrepancia se ignora sin aprobar nada (pero responde 200, para no generar reintentos eternos de algo que nunca va a coincidir).

Solo un pago `approved` marca la `Order` `PAID` y emite los tickets (mismo mecanismo de `updateMany` condicionado por `status: "PENDING"` que usa el simulador, más la expiración perezosa aplicada antes de aprobar). El email con el ticket se envía inmediatamente después, con los tokens crudos todavía en memoria de ese mismo request — nunca se persisten ni se vuelven a pedir.

**Respuesta 200** — `{ "received": true }` (siempre que la firma sea válida, aunque el pago se haya ignorado por algún mismatch).

**Errores**

| Status | `code` | Motivo |
|---|---|---|
| 401 | `INVALID_WEBHOOK_SIGNATURE` | Firma ausente, malformada o que no coincide. Nunca consulta el pago en este caso. |
| 502 / 504 | `MERCADOPAGO_PROVIDER_ERROR` | Falla al consultar el pago server-to-server. Mercado Pago reintenta la notificación (cada ~15 min) ante cualquier respuesta que no sea 200/201. |

Idempotente en dos niveles: `PaymentWebhookEvent` (deduplicación por `provider` + el `id` de la notificación) evita reprocesar una notificación ya completada, y el `Payment`/`Order` subyacentes usan `upsert`/`updateMany` condicionado — ni una notificación repetida ni dos notificaciones concurrentes para el mismo pago duplican tickets.
