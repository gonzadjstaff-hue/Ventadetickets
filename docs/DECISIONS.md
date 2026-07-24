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
