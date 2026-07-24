# Roadmap

Orden sugerido para las próximas fases, a partir del estado actual (ver `docs/PROGRESS.md`). No son fechas ni compromisos, es la secuencia lógica de dependencias.

1. **QR real** — generar la imagen/código QR del ticket a partir del token crudo que ya se devuelve en el registro (hoy solo existe el hash `Ticket.qrTokenHash`; no hay generación de imagen).
2. **Email de confirmación** — enviar el ticket (con su QR) al asistente en el mismo momento de la emisión, porque el token crudo no se puede recuperar después. Implica resolver `backend/src/integrations/email/` (carpeta reservada, vacía).
3. **Validación de QR** — pantalla de escaneo para validadores, endpoint de check-in, prevención de doble uso. Corresponde al módulo `backend/src/modules/check-in/` (vacío) y a `CheckIn` en el modelo de datos.
4. **Venta VIP (Individual y Doble) + Mercado Pago** — extender el flujo de registro (hoy solo cubre General, gratuita) para entradas pagas: reserva de stock, creación de `Payment`, webhooks, idempotencia. VIP Doble debe emitir 2 `Ticket` por unidad usando `ticketsPerUnit` (ver `docs/DATA_MODEL.md`), no una regla hardcodeada.
5. **WhatsApp** — notificaciones y recordatorios. No tiene carpeta de integración reservada todavía.
6. **CRM** — base de contactos/segmentos de asistentes.
7. **Administración y reportes** — panel admin (`backend/src/modules/admin/`, vacío), gestión de eventos/órdenes/tickets, exportaciones, estadísticas.
8. **Deploy** — puesta en producción de frontend y backend.

Fuera de este orden, pendiente sin fecha asignada: **autenticación** (Firebase, pensada para administradores y validadores — los asistentes que registran una entrada General no necesitan cuenta) y **Meta Pixel**.
