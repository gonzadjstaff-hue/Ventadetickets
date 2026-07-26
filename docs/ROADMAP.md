# Roadmap

Orden sugerido para las próximas fases, a partir del estado actual (ver `docs/PROGRESS.md`). No son fechas ni compromisos, es la secuencia lógica de dependencias.

## Completado

- ~~QR real~~ — implementado (`qrcode`, captura con `html-to-image`).
- ~~Email de confirmación~~ — implementado para General y VIP (`backend/src/integrations/email/`), reutilizando el mismo servicio para ambos flujos.
- ~~Validación de QR~~ — implementado como MVP sin autenticación (`backend/src/modules/check-in/`, `ENABLE_MVP_CHECKIN`).
- ~~Venta VIP (Individual y Doble)~~ — implementado con pago **simulado** (`backend/src/modules/orders/` + `payments/`, `ENABLE_MVP_PAYMENT_SIMULATOR`). VIP Doble emite 2 `Ticket` por unidad usando `ticketsPerUnit`, como estaba previsto. Probado manualmente en navegador real, VIP Individual y VIP Doble.
- ~~Descarga y compartir de entradas en PDF~~ — implementado para General, VIP Individual (PDF de 1 página) y VIP Doble (PDF de 2 páginas, una por asistente), con Web Share API cuando el navegador la soporta (`frontend/src/features/events/ticketExport/`, ver `docs/DECISIONS.md`). Reemplaza una primera versión con ZIP que se descartó por completo antes de este cierre (mala UX en celular). El recorte del borde derecho del PNG/PDF exportado también quedó corregido de raíz en este mismo trabajo.
- ~~Checkout Pro de Mercado Pago (modo prueba)~~ — implementado como recorrido de pago real para VIP, alternativo al simulador (que sigue disponible). Preferencias, webhook con verificación de firma y consulta server-to-server, idempotencia, emisión de tickets solo tras `approved`, manejo de `pending`/`rejected`/`cancelled`/`refunded`/`charged_back`. Ver `docs/DECISIONS.md`. **Falta**: credenciales de prueba reales configuradas y prueba manual de punta a punta (ver `SESSION_HANDOFF.md`) — sigue en la lista de "Próximo".

## Próximo

1. **Configurar credenciales de prueba de Mercado Pago y validar manualmente** — la integración ya está implementada y verificada automáticamente (148 tests de backend, 133 de frontend); falta que el usuario complete `.env` con credenciales de prueba reales, exponga una URL HTTPS para el webhook, y se confirme una compra de punta a punta. Guía paso a paso en `SESSION_HANDOFF.md`.
2. **Credenciales productivas de Mercado Pago** — fuera de alcance hasta que el modo prueba esté validado manualmente.
3. **Cron de expiración de órdenes** — hoy la expiración de una `Order` `PENDING` vencida es perezosa (se resuelve al consultarla o al intentar pagarla, ver `docs/DECISIONS.md`). Antes de producción conviene una tarea programada que barra órdenes vencidas proactivamente, para que el cupo se libere sin depender de que alguien la consulte.
4. **Email VIP con varios tickets en un solo mensaje** — hoy VIP Doble manda dos emails separados (uno por ticket, reutilizando el mismo servicio de General sin rediseñar la plantilla). Juntar ambos QR en un solo email queda pendiente si se vuelve un problema real de UX. El email tampoco adjunta el PDF todavía — sigue con el QR embebido inline como hasta ahora.
5. **Recuperación y reenvío de tickets** — si un email de entrega falla (General, VIP simulado o VIP con Mercado Pago), hoy no hay forma de reenviarlo ni de recuperar el ticket desde la app.
6. **WhatsApp** — notificaciones y recordatorios. No tiene carpeta de integración reservada todavía.
7. **CRM** — base de contactos/segmentos de asistentes.
8. **Administración y reportes** — panel admin (`backend/src/modules/admin/`, vacío), gestión de eventos/órdenes/tickets, exportaciones, estadísticas.
9. **Deploy** — el repositorio ya está **preparado** (frontend en Vercel, backend en Render, PostgreSQL administrado en Render — CORS multi-origen, health check, cierre controlado, `prisma migrate deploy`, `render.yaml`/`vercel.json` de referencia, ver `docs/DEPLOYMENT.md`), pero **todavía no se ejecutó ningún despliegue real** ni se cargó ninguna credencial en Vercel/Render/Mercado Pago.

Fuera de este orden, pendiente sin fecha asignada: **autenticación** (Firebase, pensada para administradores y validadores — hoy tanto check-in como el simulador de pago son MVP sin auth, explícitamente marcados como no aptos para producción) y **Meta Pixel**.
