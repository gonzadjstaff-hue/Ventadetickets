# Modelo de datos

Fuente de verdad: `backend/prisma/schema.prisma`. Este documento explica los modelos y relaciones tal como existen hoy, no un diseño aspiracional.

## Modelos

| Modelo | Representa |
|---|---|
| `User` | Cualquier persona con fila propia: comprador/asistente registrado, validador o admin, según `role`. `firebaseUid` es opcional (ver `docs/DECISIONS.md`) — hoy los asistentes que compran/registran entradas no tienen Firebase. Incluye un usuario "sistema" fijo (`demo-validator-mvp`, `role: VALIDATOR`) sembrado por `seed.ts`, usado por check-in mientras no hay autenticación de validadores. |
| `Event` | Un evento publicable. Tiene `publicId` propio, distinto de su `id` interno. |
| `TicketType` | Una categoría de entrada de un evento (General, VIP Individual, VIP Doble), con precio, cupo y ventana de venta propios. **No tiene `publicId` separado** — ver más abajo. |
| `Order` | Una compra/registro: un `User` obteniendo entradas de un `Event`. Tiene `publicId` propio. |
| `OrderItem` | Línea de una `Order`: cantidad de un `TicketType` específico, con su precio unitario. |
| `Payment` | Un intento/registro de pago asociado a una `Order`. **No existe** para órdenes gratuitas (ver más abajo). |
| `Ticket` | Una entrada individual emitida (una unidad de acceso), con su propio `publicId`, `qrTokenHash` y estado. |
| `CheckIn` | Un intento de validación/escaneo de un `Ticket` en la puerta. Implementado como MVP sin autenticación (`ENABLE_MVP_CHECKIN`) — ver `docs/API.md`. |
| `PaymentWebhookEvent` | Registro de cada notificación de webhook recibida de un proveedor de pago, para deduplicación (`@@unique([provider, externalEventId])`) y auditoría. Implementado para Mercado Pago — ver `docs/DECISIONS.md` y `docs/API.md`. |
| `AuditLog` | Registro genérico de acciones administrativas/sensibles (no implementado todavía). |

## Relaciones principales

```
User 1──N Order
Event 1──N TicketType
Event 1──N Order
TicketType 1──N OrderItem
TicketType 1──N Ticket
Order 1──N OrderItem
Order 1──N Payment
Order 1──N Ticket
OrderItem 1──N Ticket   (agregado para trazabilidad: qué tickets salieron de qué línea de orden)
Ticket 1──N CheckIn
```

Todas las relaciones tienen `onDelete: Restrict` (o `SetNull` en las opcionales, como `AuditLog.user`) — no hay `Cascade` en ningún lado: borrar un `Event` con actividad, o una `Order` con tickets, falla en vez de arrastrar el borrado.

## `Order`, `OrderItem`, `Payment` y `Ticket` — quién es quién

Es fácil confundirlos porque los cuatro están relacionados con una compra. La diferencia:

- **`Order`** — la transacción como un todo. Tiene un `status` (`PENDING`, `PAID`, `CANCELLED`, `EXPIRED`, `REFUNDED`, etc.), un `total`, un `subtotal` y (desde la compra VIP) un `expiresAt` real: mientras está `PENDING`, es hasta cuándo vale la reserva de cupo (`ORDER_EXPIRATION_MINUTES`, expiración perezosa — ver `docs/DECISIONS.md`). `providerPreferenceId` (nullable, agregado para Checkout Pro de Mercado Pago) guarda el id de la preferencia creada para esa orden, para reutilizarla en vez de crear una nueva en cada intento de pago. Es el nivel "recibo".
- **`OrderItem`** — una línea dentro de esa orden: "N unidades de este `TicketType`, a tal precio unitario". Una orden puede tener varias líneas (hoy, tanto en General como en VIP, siempre es exactamente una: `quantity = 1`). `attendeeNames` (`Json?`, array de strings) guarda el nombre de cada asistente cargado en el checkout VIP, en el mismo orden en que se van a emitir los `Ticket` cuando el pago quede aprobado — General no lo usa (queda `null`), porque ahí alcanza con `Ticket.holderName`.
- **`Payment`** — el intento de cobro de una orden con un proveedor real (mock o Mercado Pago). Una orden puede tener cero (si es gratuita), uno o varios `Payment` (reintentos: cada aprobación hace `upsert` sobre el mismo `Payment` de la orden, identificado por `provider + providerPaymentId`). **El registro General nunca crea `Payment`**: si el total es 0, la orden pasa a `PAID` directamente. La compra VIP sí crea `Payment`, con `provider = "mock-simulator"` (simulador, ver `docs/DECISIONS.md`) o `provider = "mercadopago"` (Checkout Pro real, modo prueba).
- **`Ticket`** — el acceso individual en sí, el que se escanea en la puerta. Una `OrderItem` con `quantity = 1` y `ticketsPerUnit = 1` (General, VIP Individual) genera un `Ticket`; una `OrderItem` de VIP Doble (`ticketsPerUnit = 2`) genera dos `Ticket` a partir de la misma línea, uno por nombre en `OrderItem.attendeeNames`, cada uno con su propio `publicId`, token y hash. Implementado en `backend/src/modules/payments/ticketEmissionService.ts`.

## `ticketsPerUnit`

Campo de `TicketType`, default `1`. Indica cuántos `Ticket` individuales corresponden a cada unidad comprada de ese tipo de entrada:

- General → `1` (una unidad comprada = un ticket).
- VIP Individual → `1`.
- VIP Doble → `2` (una unidad comprada = dos tickets, pensado para que las dos personas entren por separado).

Existe específicamente para que la lógica de emisión de tickets lea este valor del dato en vez de tener una regla tipo "si el nombre contiene 'Doble', emitir 2" en el código.

Relacionado: `TicketType.capacity` representa **unidades vendibles**, no tickets emitidos. Para VIP Doble, `capacity = 50` son 50 unidades → hasta 100 tickets individuales. El chequeo de cupo del registro General cuenta unidades vendidas (`OrderItem.quantity`), consistente con esta definición.

## `TicketType` no tiene `publicId` separado hoy

A diferencia de `Event`, `Order` y `Ticket` (que exponen un `publicId` distinto de su `id` interno), `TicketType` solo tiene `id` — igual que `User`. La API pública de registro (`ticketTypeId` en el body de `POST /api/events/:eventPublicId/registrations/general`) recibe directamente ese `id`.

No es un error: `TicketType.id` es un cuid no incremental y no adivinable, así que cumple igual la regla de no exponer identificadores secuenciales. Es una decisión explícita, documentada con su razón completa en `docs/DECISIONS.md`.
