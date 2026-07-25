# Decisiones de diseño

Registro de decisiones no obvias tomadas durante la implementación del flujo de registro General, con su razón. Para el porqué de cada campo del modelo ver también `docs/DATA_MODEL.md`.

## La entrada General es gratuita

`TicketType` para "General" tiene `price = 0` por definición del proyecto (`project.md`), no como un caso particular de "entrada barata". El endpoint de registro (`POST /api/events/:eventPublicId/registrations/general`) rechaza con 400 (`TICKET_TYPE_NOT_FREE`) cualquier intento de usarlo contra un `TicketType` cuyo precio no sea exactamente 0.

## La Order de General queda en `PAID` sin crear `Payment`

Cuando el total de la orden es 0, el servicio marca `Order.status = PAID` directamente y **no crea ninguna fila en `Payment`**. Motivo: `Payment` representa un movimiento de dinero real con un proveedor (mock o Mercado Pago); una entrada gratuita no tiene ningún movimiento que registrar. Confirmado con test automatizado y con prueba manual (ver `docs/PROGRESS.md`).

## `User.firebaseUid` es opcional

Originalmente era `String @unique` obligatorio. Se volvió `String? @unique` (migración `make_firebase_uid_optional`) porque el registro General no requiere autenticación ni cuenta previa: la persona completa nombre, email y WhatsApp y listo. Postgres permite múltiples `NULL` en una columna `UNIQUE` (cada `NULL` es distinto), así que esto no compromete la unicidad para cuando sí haya usuarios autenticados con Firebase (pensado para administradores y validadores, no para asistentes).

## `TicketType.id` se usa provisionalmente como identificador público en la API

El body de `POST /api/events/:eventPublicId/registrations/general` pide `ticketTypeId`, y ese valor es el `id` interno de Prisma (la primary key, un cuid), **no** un campo `publicId` separado — porque `TicketType` no tiene esa columna, a diferencia de `Event`, `Order` y `Ticket`.

Esto no es un descuido: `TicketType.id` ya es un cuid no incremental y no adivinable, así que cumple igual la regla de seguridad de no exponer IDs incrementales. Se evaluará agregar una columna `TicketType.publicId` (igual que en `Event`/`Order`/`Ticket`) más adelante, cuando el proyecto escale y tenga sentido desacoplar el identificador interno del expuesto — por ejemplo si `TicketType.id` necesitara rotar o si se quisiera ocultar el orden de creación. No es necesario para el volumen y alcance actual.

## VIP Doble genera 2 tickets por unidad comprada

`TicketType.ticketsPerUnit` (default 1) expresa cuántos tickets individuales se emiten por cada unidad vendida de ese tipo de entrada. General y VIP Individual usan 1; VIP Doble usa 2. La lógica de emisión debe leer este valor desde el dato, nunca inferirlo del nombre del tipo de entrada — la venta de VIP (que todavía no está implementada) tendrá que respetar este mismo campo en vez de hardcodear "si es VIP Doble, emitir 2".

## `TicketType.capacity` representa unidades vendibles, no tickets emitidos

Para VIP Doble, `capacity = 50` significa 50 **unidades** vendibles, que generan hasta 100 tickets individuales (50 × `ticketsPerUnit` 2). El chequeo de cupo del registro General sigue este mismo criterio: cuenta unidades vendidas (`OrderItem.quantity`), no tickets emitidos — así queda correcto también para cuando se implemente la venta de VIP Doble, en vez de subestimar el cupo disponible.

## Token del ticket: crudo de un solo uso + hash SHA-256

`generateQrToken()` (`backend/src/shared/qrToken.ts`) genera un token aleatorio (`crypto.randomBytes`, sin dependencias nuevas) y calcula su SHA-256. Solo el hash se persiste en `Ticket.qrTokenHash`; el token crudo se devuelve **una sola vez**, en la respuesta 201 del registro, y no se guarda en ningún lado ni se loguea. Como el hash es unidireccional, no hay forma de recuperar el token crudo después — el futuro servicio de email/QR va a tener que recibirlo en el mismo momento de la emisión del ticket, no en un paso posterior.

## Prevención de duplicados sin restricción única nueva en la base

Un mismo email no puede tener más de una entrada General por evento, pero sí debe poder comprar VIP en el futuro (incluso más de una vez). Una constraint `@@unique` genérica sobre `(userId, eventId, ticketTypeId)` bloquearía sin querer esas futuras recompras VIP. En cambio, el chequeo de duplicado se hace **dentro de la transacción** (buscar si ya existe un `Ticket` `ACTIVE`/`USED` de ese `TicketType`, para ese email, en ese evento) y se apoya en el aislamiento `Serializable` para ser seguro ante concurrencia, sin agregar ninguna columna ni índice nuevo.

## Concurrencia: transacción `Serializable`

La transacción completa de creación de usuario + orden + item + ticket corre con `isolationLevel: Serializable`. Si Postgres aborta la transacción por conflicto de concurrencia (dos requests simultáneas, mismo email o compitiendo por el último cupo), Prisma lo expone como error `P2034`; el servicio lo captura y responde 409 (`REGISTRATION_CONFLICT`) en vez de dejar pasar un 500 genérico. Probado con dos submits simultáneos del mismo email en `backend/tests/registrations.general.test.ts`.

## Base `tickets_test` aislada para los tests del backend

Los tests de integración corren contra una base Postgres separada de la de desarrollo (`tickets_test`, misma instancia de Docker, mismas credenciales que `tickets_db`). La URL se deriva en memoria a partir de `DATABASE_URL` (o se toma de `DATABASE_URL_TEST` si está definida) — nunca se escribe en ningún `.env`. Incluye una guarda que rechaza correr los tests si la base resuelta no tiene "test" en el nombre, para no arriesgar los datos de desarrollo por error de configuración. Detalle en `docs/ARCHITECTURE.md`.

## `vitest.config.ts`: `fileParallelism: false` en el backend

Varios archivos de test usan transacciones `Serializable` (registro General, órdenes VIP) contra `tickets_test`, que es una base chica. Con archivos corriendo en paralelo, Postgres puede abortar transacciones de **archivos distintos** por falsos conflictos de serialización (predicate locks a nivel de página, típico en tablas chicas con `seq scan`) — no por ningún bug real del código. Se detectó primero al separar los tests de email del registro General en dos archivos (aparecían 409 espurios); se resolvió juntándolos en un mismo archivo. Al sumar el bloque VIP (que también usa `Serializable`) se optó por la solución de raíz: correr todos los archivos de test del backend en serie (`fileParallelism: false` en `vitest.config.ts`). Cambia el tiempo total de la suite, no su cobertura.

## Venta VIP (Individual y Doble) simulada — MVP sin Mercado Pago real

Bloque implementado en `backend/src/modules/orders/` (creación de orden, capacidad, consulta) y `backend/src/modules/payments/` (simulador de pago, emisión de tickets). Decisiones tomadas:

- **Una sola unidad por operación de compra.** El body de `POST /api/events/:eventPublicId/orders/vip` no tiene campo `quantity`: siempre es 1. Simplifica la reserva de capacidad y el cálculo de asistentes para este MVP; ampliar a N unidades queda para más adelante.
- **`price > 0` es la señal de "es VIP".** El endpoint de compra VIP rechaza cualquier `TicketType` con `price = 0` (que es exactamente la definición ya vigente de "General", ver más arriba) con `TICKET_TYPE_NOT_VIP`. No se agregó un campo/enum `TicketType.category` nuevo: la distinción ya existía implícitamente en el dato, agregar una columna solo para esto hubiera sido redundante para el volumen actual (3 tipos de entrada). Revisar si en el futuro aparece un tipo pago que no deba pasar por el flujo VIP.
- **La cantidad de asistentes debe ser exactamente `TicketType.ticketsPerUnit`.** Mismo criterio que ya regía la emisión de tickets (ver más arriba): la validación lee el dato, nunca hardcodea "si es Doble, pedir 2".
- **Reserva de 15 minutos**, reutilizando la variable `ORDER_EXPIRATION_MINUTES` que ya estaba documentada en `.env.example` sin usarse. `Order.expiresAt` (columna que ya existía en el schema, sin uso hasta ahora) se completa al crear la orden; no hizo falta ningún campo nuevo para esto.
- **Los tickets se emiten únicamente cuando el pago queda `APPROVED`**, nunca al crear la orden `PENDING`. `OrderItem.attendeeNames` (columna `Json?` nueva, migración `add_order_item_attendee_names`) guarda los nombres de los asistentes en el momento de la reserva, para poder usarlos como `Ticket.holderName` en el momento de la emisión — potencialmente minutos después, en otro request.
- **El simulador de pago es exclusivamente de desarrollo/tests**, gateado por `ENABLE_MVP_PAYMENT_SIMULATOR` (mismo patrón que `ENABLE_MVP_CHECKIN`: router no se monta si está apagado, así que la ruta responde 404 estándar de Express en vez de confirmar que la feature existe). Nunca debe activarse en producción: aprueba cualquier pago que se le pida, no hay ningún proveedor real detrás.
- **Concurrencia de capacidad:** transacción `Serializable` (mismo mecanismo que el registro General) al crear la orden, recalculando el cupo disponible **dentro** de la transacción — nunca confiando en una lectura previa. Ante conflicto de serialización, Postgres aborta una de las dos transacciones (`P2034`), traducido a `ORDER_CONFLICT` (409).
- **Concurrencia de aprobación:** a diferencia de la creación, la aprobación del pago usa el mismo patrón que el check-in (`updateMany` condicionado por `status: "PENDING"`, no Serializable) — más simple y suficiente, porque acá no hay que comprobar cupo de nuevo (la unidad ya estaba reservada desde que la orden se creó `PENDING`), solo garantizar que un único request gane la transición de estado.
- **`APPROVED` es idempotente.** Un segundo llamado a `simulate-payment` sobre una orden ya `PAID` no genera tickets nuevos ni intenta reconstruir los tokens ya emitidos (es imposible: el hash es unidireccional, igual que con General). Devuelve `alreadyProcessed: true` sin el campo `tickets`. La descarga/QR de esos tickets solo existieron en la respuesta inmediata de la primera aprobación — documentado también en `docs/API.md`.
- **`REJECTED` mantiene la Order en `PENDING`** (en vez de pasarla a `CANCELLED`), para permitir reintentar el pago mientras la reserva siga vigente — la opción más simple y la que mejor refleja un flujo de pago real (una tarjeta rechazada no cancela el carrito). `CANCELLED` sí es terminal: libera la reserva y no permite reintentos sobre esa misma orden.
- **Expiración perezosa, sin cron.** Una orden `PENDING` vencida se marca `EXPIRED` recién cuando algo la toca: `GET` de estado o un intento de `simulate-payment`. La comprobación de capacidad para una compra nueva no necesita tocar el estado de otras filas: simplemente no cuenta las `PENDING` con `expiresAt` pasado. Una tarea programada real para barrer reservas vencidas queda pendiente para producción (ver `docs/ROADMAP.md`).
- **Email VIP reutiliza el mismo servicio que General**, una vez por ticket emitido (así que VIP Doble manda dos emails separados, no uno con dos QR). No se rediseñó la plantilla para soportar múltiples tickets en un solo email — se evaluó y no hacía falta: la función existente (`sendGeneralTicketEmail`) ya es genérica por ticket individual.
- **`GET /orders/:orderPublicId` nunca distingue entre "no existe" y "es de otro evento"**: mismo código `ORDER_NOT_FOUND` para ambos casos, para no confirmarle a quien consulta que una orden ajena existe.
