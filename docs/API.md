# API

Base URL en desarrollo: `http://localhost:4000`. No hay prefijo de versión.

Estos son **todos** los endpoints que existen hoy. Cualquier otro endpoint mencionado en `project.md` (autenticación, eventos, órdenes, pagos, check-in, admin) todavía no está implementado.

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
  "message": "¡Listo! Tu entrada General quedó confirmada."
}
```

`ticketToken` es el token crudo del ticket. Se devuelve **una única vez**, en esta respuesta — el backend solo guarda su hash SHA-256 (`Ticket.qrTokenHash`) y no puede volver a mostrarlo. Ver `docs/DECISIONS.md`.

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
