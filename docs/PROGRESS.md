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

## Pendiente

- QR visual real (hoy solo existe el hash del token; no se genera ninguna imagen).
- Envío de confirmación por email.
- Notificaciones/recordatorios por WhatsApp.
- CRM de asistentes.
- Integración con Mercado Pago.
- Venta de entrada VIP Individual.
- Venta de entrada VIP Doble.
- Panel administrativo.
- Escáner / validación de acceso QR.
- Reportes y estadísticas.
- Meta Pixel.
- Autenticación (Firebase, pensada para administradores y validadores).
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
