# Estado de avance

## Completado

- **Base técnica** — frontend (React + Vite + TS + Tailwind v4) y backend (Express + TS) scaffoldeados, con lint/format/build/test configurados en ambos.
- **Modelo Prisma** — `backend/prisma/schema.prisma` con las 10 entidades del proyecto (`User`, `Event`, `TicketType`, `Order`, `OrderItem`, `Payment`, `Ticket`, `CheckIn`, `PaymentWebhookEvent`, `AuditLog`), enums de estado, políticas `onDelete` explícitas y campos de cancelación/reembolso donde corresponde.
- **Landing "Pulse Event"** — landing pública del evento demo (`frontend/src/pages/PulseEventLanding.tsx` + `frontend/src/features/events/landing/`), integrada a la estructura de React Router del proyecto.
- **Formulario de registro General** — `GeneralRegistrationModal.tsx`: React Hook Form + Zod, labels visibles, errores por campo, estado de carga, botón deshabilitado durante el envío, mensaje de éxito y mensaje específico para email duplicado.
- **Endpoint de registro** — `POST /api/events/:eventPublicId/registrations/general` (`backend/src/modules/registrations/`), con validación Zod, transacción `Serializable`, y las reglas de negocio descriptas en `docs/API.md` y `docs/DECISIONS.md`.
- **Migración de `firebaseUid`** — `User.firebaseUid` pasó a ser opcional (migración `make_firebase_uid_optional`), aplicada tanto en `tickets_db` como en `tickets_test`.
- **Seed idempotente** — `backend/prisma/seed.ts` (evento demo + General/VIP Individual/VIP Doble), verificado que correrlo dos veces no duplica filas.
- **Prueba real desde navegador** — flujo completo probado con Chromium (no solo tests automatizados). Ver detalle abajo.
- **Manejo de duplicado (409)** — probado tanto en test automatizado como en la prueba manual: un segundo registro con el mismo email para el mismo evento devuelve 409 y no crea filas nuevas.
- **Tests backend y frontend** — 14 tests de integración del endpoint de registro (contra la base aislada `tickets_test`) + 8 tests de frontend (render, validación, estado de carga, éxito, duplicado, error de red) + el smoke test de `App`.
- **Confirmación de que General no crea `Payment`** — verificado en test automatizado y en la base real durante la prueba manual.

- **QR real y entrada descargable** — `qrcode` + `html-to-image`, con un problema visual de recorte conocido y documentado (ver `docs/ROADMAP.md`), no bloqueante.
- **Email de confirmación** — `backend/src/integrations/email/` (Resend o modo consola de desarrollo), usado por General y por la aprobación de pago VIP.
- **Validación de acceso QR (check-in)** — MVP sin autenticación, `ENABLE_MVP_CHECKIN`, `backend/src/modules/check-in/` + pantalla `/check-in` en el frontend.
- **Venta VIP Individual y VIP Doble con pago simulado** — `backend/src/modules/orders/` (creación de orden, reserva de capacidad por 15 minutos, consulta de estado) + `backend/src/modules/payments/` (simulador de pago solo para desarrollo/tests, `ENABLE_MVP_PAYMENT_SIMULATOR`, emisión de tickets recién tras la aprobación). Frontend: `VipCheckoutModal` (comprador → asistentes → resumen → pago simulado → resultado), conectado a los botones "Elegir VIP"/"Elegir VIP doble" de la landing. 94 tests backend + 70 tests frontend en verde (ver detalle de la corrida más abajo).

## Pendiente

- Integración real con Mercado Pago (hoy el pago VIP se simula, ver `docs/DECISIONS.md` y `docs/ROADMAP.md`).
- Cron de expiración de órdenes vencidas (hoy es perezosa).
- Notificaciones/recordatorios por WhatsApp.
- CRM de asistentes.
- Panel administrativo.
- Reportes y estadísticas.
- Meta Pixel.
- Autenticación (Firebase, pensada para administradores y validadores — check-in y el simulador de pago son MVP sin auth mientras tanto).
- Deploy.

## Prueba manual realizada

Ejecutada contra el backend y frontend corriendo en local (`http://localhost:4000` / `http://localhost:5173`), navegador Chromium real (headless, vía Playwright), no simulada con `curl`.

1. **Registro exitoso** — desde la landing, click en "Elegir general", formulario completo con un email nuevo, envío. El modal mostró el mensaje de éxito con nombre del asistente y tipo de entrada; sin errores de consola del navegador.
2. Verificado en `tickets_db` después del registro:
   - **1** fila en `User` (con `firebaseUid` nulo).
   - **1** fila en `Order`, `status = PAID`, `total = 0.00`, `subtotal = 0.00`.
   - **1** fila en `OrderItem` (`quantity = 1`, `unitPrice = 0.00`).
   - **1** fila en `Ticket`, `status = ACTIVE`, con `qrTokenHash` de 64 caracteres (SHA-256) — no el token crudo.
   - **0** filas en `Payment`.
3. **Segundo intento, mismo email** — repetido desde el navegador contra el mismo evento: el backend respondió **409**, el modal mostró el mensaje específico "Este email ya tiene una entrada General para este evento" (no el mensaje genérico de error).
4. Verificado en `tickets_db` después del segundo intento: los conteos de `User`, `Order`, `Ticket` y `Payment` son **idénticos** a los del paso 2 — no se crearon filas adicionales.

## Venta VIP simulada — verificación automatizada + prueba manual en curso

Bloque implementado y verificado con **94 tests de backend** (`npm test` en `backend/`, incluye un test agregado que valida que los dos tickets de una orden VIP Doble se hacen check-in de forma independiente) y **70 tests de frontend** (`npm test` en `frontend/`), ambos en verde, más `lint` y `build` limpios en los dos lados y `prisma validate` OK. Cubre: creación de orden (VIP Individual/Doble, rechazo de General, validaciones, cálculo de total, `expiresAt`), capacidad (`PAID`/`PENDING` no vencida cuentan, `CANCELLED`/`EXPIRED`/`PENDING` vencida no cuentan, concurrencia por la última unidad), simulador de pago (`approved`/`pending`/`rejected`/`cancelled`, idempotencia de `approved`, concurrencia de aprobación, orden vencida, simulador deshabilitado → 404), consulta de orden (expiración perezosa, sin exponer hash/token), check-in independiente de los dos tickets de VIP Doble, y regresión de General/email/check-in (sin tocar esos módulos, sus tests siguen pasando sin cambios).

**Prueba manual — VIP Individual aprobada:** confirmada parcialmente por el usuario. Verificado en navegador real: reserva `PENDING` creada sin ticket visible, controles del simulador (Aprobar/Dejar pendiente/Rechazar/Cancelar), aprobación genera exactamente una entrada VIP Individual con nombre del asistente, `ticketPublicId` y un único QR, botón de descarga presente. **Todavía sin confirmar por el usuario:** descarga real del PNG, primer check-in (`VALID`) y segundo check-in del mismo QR (`ALREADY_USED`).

**Pendiente de prueba manual:** VIP Doble (dos asistentes, dos entradas, dos `ticketPublicId`/QR distintos, dos descargas, check-in independiente de cada QR), rechazo y reintento, cancelación, y verificación visual del email VIP (asunto/contenido correctos según tipo de entrada). Checklist paso a paso en `docs/LOCAL_SETUP.md` y en `SESSION_HANDOFF.md`.
