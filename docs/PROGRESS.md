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

- **QR real y entrada descargable** — `qrcode` + `html-to-image`. El recorte del borde derecho que tenía la exportación quedó corregido de raíz (medición con `getBoundingClientRect` + espera a `document.fonts.ready`, ver `docs/DECISIONS.md`) — corrección verificada por tests unitarios, **pendiente de confirmación visual manual** del usuario (ningún test puede afirmar por sí solo que "se ve bien").
- **Email de confirmación** — `backend/src/integrations/email/` (Resend o modo consola de desarrollo), usado por General y por la aprobación de pago VIP.
- **Validación de acceso QR (check-in)** — MVP sin autenticación, `ENABLE_MVP_CHECKIN`, `backend/src/modules/check-in/` + pantalla `/check-in` en el frontend.
- **Venta VIP Individual y VIP Doble con pago simulado** — `backend/src/modules/orders/` (creación de orden, reserva de capacidad por 15 minutos, consulta de estado) + `backend/src/modules/payments/` (simulador de pago solo para desarrollo/tests, `ENABLE_MVP_PAYMENT_SIMULATOR`, emisión de tickets recién tras la aprobación). Frontend: `VipCheckoutModal` (comprador → asistentes → resumen → pago simulado → resultado), conectado a los botones "Elegir VIP"/"Elegir VIP doble" de la landing. Commiteado y pusheado a `main`. Probado con la suite automatizada y **manualmente en navegador real, tanto VIP Individual como VIP Doble aprobadas** (confirmado por el usuario).
- **Descarga y compartir unificados en PDF (General, VIP Individual, VIP Doble)** — General y VIP Individual muestran "Descargar entrada" (PDF de 1 página); VIP Doble muestra las dos entradas visibles, sin botones individuales, con un único "Descargar ambas entradas" (PDF de 2 páginas, una por asistente). Cuando el navegador soporta la Web Share API con archivos, aparece además "Compartir entrada"/"Compartir ambas entradas". Arquitectura compartida entre los tres flujos en `frontend/src/features/events/ticketExport/` (ver `docs/DECISIONS.md`) — nada de ZIP: se evaluó, se implementó una primera versión y se descartó por completo antes de este cierre porque obliga a descomprimir en el celular, justo el caso de uso principal. `jsPDF` es la única dependencia nueva, cargada con `import()` dinámico. Además, en el mismo bloque: mensajes de error diferenciados para las 3 mutaciones del checkout VIP, contador de reserva corregido, confirmación dentro del modal VIP antes de cerrar sin descargar/compartir, bloqueo de scroll del fondo, y `/check-in` cargado de forma diferida (chunk principal ~820 KB → ~445 KB, ~250 KB → ~139 KB gzip). Verificado con la suite automatizada — la prueba manual en navegador de este bloque específico (PDF) queda registrada en `SESSION_HANDOFF.md`, no asumir que ya se confirmó sin revisar ese estado.
- **Checkout Pro de Mercado Pago (modo prueba)** — recorrido de pago real para VIP, alternativo al simulador (que sigue disponible como "Herramientas de prueba", claramente separado del botón real). Creación/reutilización de preferencia (`POST .../checkout/mercadopago`), webhook server-to-server con verificación de firma HMAC-SHA256 y consulta directa del pago (`POST /api/webhooks/mercadopago`), idempotencia en dos capas (`PaymentWebhookEvent` + `upsert`/`updateMany` guardado), emisión de tickets y envío de email solo tras `approved`, manejo de `pending`/`rejected`/`cancelled`/`refunded`/`charged_back`. Frontend: botón "Pagar con Mercado Pago" en `VipCheckoutModal`, pantalla pública `/checkout/return` con polling del estado real (nunca confía en query params de retorno). SDK oficial `mercadopago` (npm), arquitectura aislada en `backend/src/integrations/payments/` — detalle completo de las decisiones (incluyendo un bug real detectado en la versión instalada del SDK) en `docs/DECISIONS.md`. Una sola migración aditiva (`Order.providerPreferenceId`). Verificado con **148 tests de backend** (94 preexistentes + 54 nuevos) y **133 de frontend** (116 preexistentes + 17 nuevos), lint y build limpios en ambos lados, `prisma validate` OK. **Sin ninguna prueba manual todavía** — necesita credenciales de prueba reales y una URL HTTPS pública, ver `SESSION_HANDOFF.md` para la guía paso a paso.

- **Preparación para despliegue (Vercel + Render)** — repositorio adaptado para desplegarse sin ejecutar ningún despliegue real: CORS multi-origen (`CORS_ALLOWED_ORIGINS`, nunca `"*"`), `trust proxy` en producción, cierre controlado del backend ante `SIGTERM`/`SIGINT`, health check ya existente (`GET /api/health`) confirmado apto, `prisma generate` en `postinstall` y `prisma migrate deploy` encadenado al arranque (nunca `migrate dev`/`db push`), fallback de `VITE_API_URL` a `localhost` restringido a desarrollo, rewrite de SPA para Vercel (`frontend/vercel.json`), Blueprint de referencia sin secretos (`render.yaml`). Guía manual paso a paso completa en `docs/DEPLOYMENT.md`. Verificado con la suite automatizada (**152 tests de backend** — 148 preexistentes + 4 nuevos de CORS — y **133 de frontend**, sin cambios en frontend), lint y build limpios en ambos lados, `prisma validate` OK. **Sin ningún despliegue real todavía** — ni Vercel, ni Render, ni credenciales cargadas en ninguna cuenta externa.

## Pendiente

- Configurar credenciales de prueba reales de Mercado Pago y probar manualmente el checkout de punta a punta (ver `SESSION_HANDOFF.md`) — la integración en modo prueba ya está implementada y verificada automáticamente.
- Cron de expiración de órdenes vencidas (hoy es perezosa).
- Notificaciones/recordatorios por WhatsApp.
- CRM de asistentes.
- Panel administrativo.
- Reportes y estadísticas.
- Meta Pixel.
- Autenticación (Firebase, pensada para administradores y validadores — check-in y el simulador de pago son MVP sin auth mientras tanto).
- Deploy real (el repositorio ya está preparado para desplegarse — CORS multi-origen, health check, cierre controlado, estrategia de Prisma en producción, `render.yaml`/`vercel.json` de referencia — pero nada de esto se ejecutó todavía; guía completa en `docs/DEPLOYMENT.md`).

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

## Venta VIP simulada — commiteada, probada automática y manualmente

Bloque implementado, verificado con la suite automatizada (backend y frontend en verde, ver más abajo), **probado manualmente en navegador real (VIP Individual y VIP Doble aprobadas, confirmado por el usuario)**, commiteado y pusheado a `main`.

## Descarga/compartir en PDF y auditoría del checkout — verificación automatizada, prueba manual pendiente

Bloque posterior, exclusivamente frontend (no se tocó el backend). Verificado con **94 tests de backend** (sin cambios respecto al bloque anterior — no se tocó nada de `backend/`) y **116 tests de frontend** (94 preexistentes + 22 nuevos/adaptados de este bloque: `ticketPdf.ts` armando páginas A4 con relación de aspecto real, `share.ts` con la Web Share API incluyendo el caso `AbortError`/`DOMException`, `EventTicket.generateCapture` con el fix del recorte, descarga/compartir de VIP Individual y VIP Doble incluyendo doble clic y reintento tras error, y descarga en PDF de General), ambos en verde, más `lint` y `build` limpios en los dos lados y `prisma validate` OK.

Cubre (automatizado o por inspección de código, **nunca navegador real todavía**): General y VIP Individual muestran "Descargar entrada" y generan un PDF de 1 página con el `ticketPublicId` correcto en el nombre; VIP Doble muestra un único botón "Descargar ambas entradas", ningún botón individual, y genera un único PDF de 2 páginas (una por asistente, con su `ticketPublicId` y QR correctos, sin mezclarlos); si falla la generación de cualquier página no se descarga ningún PDF parcial, las entradas siguen visibles y se puede reintentar; no se dispara una segunda descarga por doble clic; estados "Preparando entrada…"/"Preparando ambas entradas…" con `aria-busy` y botón deshabilitado; "Compartir" solo aparece con soporte real de Web Share API, comparte el mismo `File` PDF (nunca una URL), una cancelación del usuario no se trata como error y un fallo real deja la descarga disponible; ningún resto de código/dependencia de ZIP; confirmación dentro del modal VIP (sin `alert()`) si se intenta cerrar sin haber descargado ni compartido; el contador de reserva usa `expiresAt` del backend sin sumar minutos localmente, limpia su interval al cerrar el modal y al desmontar, nunca muestra un valor negativo, y detiene la cuenta al pasar a `APPROVED`; el fondo no scrollea mientras el modal VIP está abierto; email VIP re-auditado sin encontrar defectos nuevos.

**No se hizo ninguna prueba manual en navegador todavía para este bloque** — en particular: que el PDF se abra bien en un celular real, que el QR de cada página escanee correctamente, que la corrección del recorte del borde derecho realmente se vea completa, y que "Compartir" funcione de punta a punta en un navegador con soporte real (Chrome Android, Safari iOS). Checklist paso a paso en `SESSION_HANDOFF.md`.

### Tamaño del bundle (antes/después de este bloque)

| Chunk | Antes | Después |
|---|---|---|
| Principal (landing) | ~445 KB (~139 KB gzip) | ~447 KB (~140 KB gzip) — sin cambio relevante |
| `/check-in` (lazy, sin cambios en este bloque) | ~374 KB (~111 KB gzip) | igual |
| `jsPDF` (lazy, solo al descargar/compartir) | — (no existía) | ~399 KB (~130 KB gzip) |

`jsPDF` reemplaza a `JSZip` (que pesaba ~28 KB gzip) — bastante más pesado, el costo real de generar un PDF con especificación de página/fuentes en vez de solo empaquetar bytes. Sigue **fuera del bundle inicial** (`import()` dinámico, se descarga recién al primer clic en "Descargar"/"Compartir"). `jsPDF` además genera chunks separados para sus plugins opcionales (`html2canvas`, `canvg`, `DOMPurify`) que esta app **nunca usa** (solo se llama `addImage`, nunca `.html()`) — quedan en `dist/` pero nunca se descargan en el uso real de la app; confirmado revisando que solo el propio chunk de `jsPDF` los referencia, vía `import()` condicionado a una feature que no se invoca.

### Bundle tras el bloque de Mercado Pago (verificado con `npm run build`)

| Chunk | Tamaño |
|---|---|
| Principal (`index-*.js`) | ~452.99 KB (~141.54 KB gzip) — botón de Mercado Pago y `/checkout/return` van acá, sin dependencias nuevas |
| `CheckInPage` (lazy) | ~374.14 KB (~110.73 KB gzip) — sin cambios |
| `jsPDF` (lazy) | ~399.35 KB (~129.64 KB gzip) — sin cambios |

Ningún chunk nuevo: `CheckoutReturnPage` no usa ninguna dependencia pesada, así que no se justificaba cargarla con `React.lazy` (a diferencia de `/check-in`). Build sin warning de chunk.
