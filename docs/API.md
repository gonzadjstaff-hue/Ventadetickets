# API

Base URL en desarrollo: `http://localhost:4000`. No hay prefijo de versión.

Estos son **todos** los endpoints que existen hoy. Cualquier otro endpoint mencionado en `project.md` (autenticación, admin) todavía no está implementado.

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

## Venta VIP simulada (Individual y Doble)

**Sin Mercado Pago real todavía** — el pago se simula con un endpoint de desarrollo (más abajo). Implementado en `backend/src/modules/orders/` (creación y consulta de orden) y `backend/src/modules/payments/` (simulador de pago). Detalle de las decisiones de diseño en `docs/DECISIONS.md`.

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
  "paymentSimulationAvailable": true
}
```

`paymentSimulationAvailable` solo aparece (y solo puede ser `true`) cuando el backend tiene `ENABLE_MVP_PAYMENT_SIMULATOR=true`. No se expone ningún id interno, hash ni token.

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
