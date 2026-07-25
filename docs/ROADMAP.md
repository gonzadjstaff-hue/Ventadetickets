# Roadmap

Orden sugerido para las próximas fases, a partir del estado actual (ver `docs/PROGRESS.md`). No son fechas ni compromisos, es la secuencia lógica de dependencias.

## Completado

- ~~QR real~~ — implementado (`qrcode`, descarga con `html-to-image`).
- ~~Email de confirmación~~ — implementado para General y VIP (`backend/src/integrations/email/`), reutilizando el mismo servicio para ambos flujos.
- ~~Validación de QR~~ — implementado como MVP sin autenticación (`backend/src/modules/check-in/`, `ENABLE_MVP_CHECKIN`).
- ~~Venta VIP (Individual y Doble)~~ — implementado con pago **simulado** (`backend/src/modules/orders/` + `payments/`, `ENABLE_MVP_PAYMENT_SIMULATOR`). VIP Doble emite 2 `Ticket` por unidad usando `ticketsPerUnit`, como estaba previsto.

## Próximo

1. **Mercado Pago real** — reemplazar `backend/src/modules/payments/` (hoy simula resultados) por la integración real: webhooks, `PaymentWebhookEvent`, idempotencia ante notificaciones duplicadas, credenciales reales. La creación de orden, la reserva de capacidad y la emisión de tickets no deberían necesitar cambios — solo el paso "confirmar el pago".
2. **Cron de expiración de órdenes** — hoy la expiración de una `Order` `PENDING` vencida es perezosa (se resuelve al consultarla o al intentar pagarla, ver `docs/DECISIONS.md`). Antes de producción conviene una tarea programada que barra órdenes vencidas proactivamente, para que el cupo se libere sin depender de que alguien la consulte.
3. **Email VIP con varios tickets en un solo mensaje** — hoy VIP Doble manda dos emails separados (uno por ticket, reutilizando el mismo servicio de General sin rediseñar la plantilla). Juntar ambos QR en un solo email queda pendiente si se vuelve un problema real de UX.
4. **Recorte del PNG descargable** — el QR/entrada descargable (`EventTicket.tsx`) tiene un problema visual de recorte conocido y documentado, sin resolver todavía. No bloqueó la venta VIP.
5. **WhatsApp** — notificaciones y recordatorios. No tiene carpeta de integración reservada todavía.
6. **CRM** — base de contactos/segmentos de asistentes.
7. **Administración y reportes** — panel admin (`backend/src/modules/admin/`, vacío), gestión de eventos/órdenes/tickets, exportaciones, estadísticas.
8. **Deploy** — puesta en producción de frontend y backend.

Fuera de este orden, pendiente sin fecha asignada: **autenticación** (Firebase, pensada para administradores y validadores — hoy tanto check-in como el simulador de pago son MVP sin auth, explícitamente marcados como no aptos para producción) y **Meta Pixel**.
