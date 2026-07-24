# App de Venta de Tickets Automatizada

## 1. Descripción general

Aplicación web mobile-first para publicar eventos, registrar usuarios, vender entradas y controlar el acceso mediante códigos QR.

La solución estará dividida en dos aplicaciones independientes:

- **Frontend:** React + Vite + TypeScript.
- **Backend:** Node.js + Express + TypeScript.
- **Base de datos:** PostgreSQL.
- **ORM:** Prisma.
- **Autenticación:** Firebase Authentication.
- **Pagos:** Mercado Pago.
- **Estilos:** Tailwind CSS.
- **Generación de QR:** biblioteca `qrcode`.
- **Lectura de QR:** biblioteca `html5-qrcode`.

El proyecto debe priorizar una arquitectura clara, modular y mantenible. No se utilizará Next.js.

---

## 2. Objetivo

Construir una plataforma que permita:

- Publicar eventos.
- Registrar usuarios.
- Iniciar sesión con correo y Google.
- Ofrecer entradas gratuitas y pagas.
- Cobrar mediante Mercado Pago.
- Generar tickets digitales.
- Emitir códigos QR únicos.
- Validar entradas desde un celular.
- Evitar el uso duplicado de tickets.
- Administrar eventos, ventas, asistentes y accesos.

---

## 3. Alcance del MVP

La primera versión debe incluir:

### Sitio público

- Página principal.
- Listado de eventos disponibles.
- Página de detalle de cada evento.
- Descripción del evento.
- Fecha y hora.
- Ubicación.
- Imagen de portada.
- Tipos de entrada.
- Precio.
- Cupo disponible.
- Botón para registrarse o comprar.

### Usuarios

- Registro con correo y contraseña.
- Inicio de sesión con correo y contraseña.
- Inicio de sesión con Google.
- Recuperación de contraseña.
- Cierre de sesión.
- Perfil básico.
- Historial de compras.
- Sección “Mis entradas”.

### Entradas

Tipos iniciales:

1. Entrada general gratuita.
2. Pase VIP individual.
3. Pase VIP doble.

Cada tipo de entrada debe poder configurar:

- Nombre.
- Descripción.
- Precio.
- Cupo.
- Cantidad máxima por compra.
- Fecha de inicio de venta.
- Fecha de finalización de venta.
- Estado activo o inactivo.

### Pagos

- Preparación completa para Mercado Pago.
- Uso de credenciales de prueba durante desarrollo.
- Proveedor de pago simulado para trabajar sin credenciales reales.
- Creación de orden pendiente.
- Creación de preferencia u orden de pago.
- Recepción de webhooks.
- Verificación del pago desde el backend.
- Actualización automática del estado de la orden.
- Emisión de tickets solo cuando el pago esté aprobado.
- Manejo de pagos rechazados, cancelados y vencidos.
- Idempotencia para evitar procesamiento duplicado.

### Tickets

- Generación automática.
- Código público único.
- Código QR único.
- Estado del ticket.
- Nombre del evento.
- Tipo de entrada.
- Nombre del titular.
- Fecha del evento.
- Visualización desde la web.
- Descarga o impresión.
- Reenvío por correo.

### Control de acceso QR

- Pantalla optimizada para celular.
- Acceso exclusivo para usuarios autorizados.
- Selección del evento.
- Lectura de QR mediante la cámara.
- Ingreso manual del código como alternativa.
- Verificación contra el backend.
- Confirmación visual de acceso válido.
- Rechazo de tickets usados, cancelados o inválidos.
- Registro de fecha y hora.
- Registro del usuario que validó.
- Prevención de doble uso.

### Panel administrativo

- Dashboard general.
- Gestión de eventos.
- Gestión de tipos de entrada.
- Gestión de órdenes.
- Gestión de pagos.
- Gestión de asistentes.
- Gestión de tickets.
- Gestión de validadores.
- Historial de accesos.
- Filtros y búsquedas.
- Exportación CSV.

---

## 4. Tipo de aplicación

La aplicación será una web responsive con enfoque mobile-first.

La experiencia móvil tendrá prioridad porque:

- Los compradores pueden adquirir entradas desde el celular.
- Los asistentes mostrarán el ticket desde el celular.
- El personal de acceso utilizará la cámara del teléfono para escanear códigos QR.

La aplicación también debe funcionar correctamente en escritorio para el panel administrativo.

---

## 5. Modelo de venta

La venta será directa al público.

El sistema podrá utilizarse para diferentes clases de eventos:

- Fiestas.
- Recitales.
- Conferencias.
- Eventos corporativos.
- Capacitaciones.
- Ferias.
- Eventos sociales.
- Otros eventos presenciales.

No se desarrollará inicialmente un marketplace con múltiples organizadores independientes.

---

## 6. Roles

### Visitante

Puede:

- Ver eventos.
- Consultar precios.
- Consultar disponibilidad.
- Iniciar registro o compra.

### Usuario

Puede:

- Registrarse.
- Iniciar sesión.
- Comprar o reservar entradas.
- Consultar sus órdenes.
- Consultar sus tickets.
- Mostrar el QR.
- Descargar o imprimir el ticket.
- Reenviar el ticket a su correo.

### Validador

Puede:

- Iniciar sesión.
- Acceder al lector QR.
- Seleccionar un evento.
- Escanear entradas.
- Ver el resultado de la validación.
- Consultar accesos recientes.

No puede modificar eventos, precios ni ventas.

### Administrador

Puede:

- Crear eventos.
- Editar eventos.
- Publicar eventos.
- Pausar eventos.
- Cancelar eventos.
- Crear tipos de entrada.
- Configurar precios y cupos.
- Consultar ventas.
- Consultar asistentes.
- Consultar pagos.
- Reenviar tickets.
- Cancelar tickets.
- Crear validadores.
- Exportar datos.
- Consultar estadísticas.

---

## 7. Flujo de entrada gratuita

1. El usuario abre el evento.
2. Selecciona la entrada gratuita.
3. Indica la cantidad permitida.
4. Inicia sesión o se registra.
5. Completa los datos requeridos.
6. El frontend envía la solicitud al backend.
7. El backend verifica el cupo.
8. Se crea una orden con total cero.
9. Se generan los tickets.
10. Se envía la confirmación.
11. Los tickets aparecen en “Mis entradas”.

La asignación debe realizarse dentro de una transacción para evitar sobreventa.

---

## 8. Flujo de entrada paga

1. El usuario abre el evento.
2. Selecciona VIP individual o VIP doble.
3. Indica la cantidad.
4. Inicia sesión o se registra.
5. Confirma sus datos.
6. El backend verifica disponibilidad.
7. Se crea una orden pendiente.
8. El stock queda reservado temporalmente.
9. El backend genera la operación de pago.
10. El usuario completa el pago en Mercado Pago.
11. Mercado Pago notifica al backend.
12. El backend consulta y verifica el pago.
13. Si el pago está aprobado:
   - La orden pasa a pagada.
   - Se generan los tickets.
   - Se envía la confirmación.
14. Si el pago falla o vence:
   - La orden se actualiza.
   - El stock reservado se libera.

El frontend nunca debe confirmar un pago por sí mismo.

---

## 9. Pase VIP doble

La entrada VIP doble representa dos accesos.

Para el MVP se generarán dos tickets individuales vinculados a una misma orden.

Motivo:

- Permite que las dos personas lleguen por separado.
- Simplifica la validación.
- Evita manejar un QR con múltiples consumos.

---

## 10. Flujo de validación QR

1. El validador inicia sesión.
2. Selecciona el evento.
3. Abre la cámara.
4. Escanea el QR.
5. El frontend envía el código al backend.
6. El backend verifica:
   - Que el ticket exista.
   - Que pertenezca al evento.
   - Que esté activo.
   - Que no haya sido usado.
   - Que la orden esté pagada o sea gratuita.
7. Si es válido:
   - Se marca como usado.
   - Se registra el acceso.
8. Si no es válido:
   - Se devuelve el motivo.
9. La pantalla muestra un resultado claro.

La validación debe realizarse en una transacción para evitar dos accesos simultáneos con el mismo ticket.

---

## 11. Arquitectura

### Estructura general

```text
App Venta Tickets Automatizada/
├── frontend/
├── backend/
├── skills/
├── docs/
├── PROYECTO.md
└── README.md
```

### Frontend

```text
frontend/
├── public/
├── src/
│   ├── api/
│   ├── assets/
│   ├── components/
│   ├── features/
│   │   ├── auth/
│   │   ├── events/
│   │   ├── orders/
│   │   ├── tickets/
│   │   ├── scanner/
│   │   └── admin/
│   ├── hooks/
│   ├── layouts/
│   ├── pages/
│   ├── router/
│   ├── services/
│   ├── store/
│   ├── types/
│   ├── utils/
│   ├── App.tsx
│   └── main.tsx
├── .env.example
├── package.json
└── vite.config.ts
```

### Backend

```text
backend/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── config/
│   ├── middlewares/
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── events/
│   │   ├── ticket-types/
│   │   ├── orders/
│   │   ├── payments/
│   │   ├── tickets/
│   │   ├── check-in/
│   │   └── admin/
│   ├── integrations/
│   │   ├── firebase/
│   │   ├── mercadopago/
│   │   └── email/
│   ├── shared/
│   ├── app.ts
│   └── server.ts
├── tests/
├── .env.example
├── package.json
└── tsconfig.json
```

---

## 12. Organización del backend

Cada módulo debe contener, cuando corresponda:

```text
module/
├── controller.ts
├── service.ts
├── repository.ts
├── routes.ts
├── schemas.ts
├── types.ts
└── errors.ts
```

### Responsabilidades

- **Routes:** define endpoints.
- **Controller:** recibe solicitudes y devuelve respuestas.
- **Service:** contiene reglas de negocio.
- **Repository:** accede a la base de datos.
- **Schemas:** valida datos de entrada.
- **Types:** define tipos internos.
- **Errors:** define errores específicos.

La lógica de negocio no debe quedar dentro de los controladores.

---

## 13. Tecnologías

### Frontend

- React.
- Vite.
- TypeScript.
- React Router.
- Tailwind CSS.
- TanStack Query para datos del servidor.
- React Hook Form para formularios.
- Zod para validaciones.
- Firebase SDK para autenticación.
- `html5-qrcode` para lectura de QR.
- Lucide React para iconos.

### Backend

- Node.js.
- Express.
- TypeScript.
- Prisma.
- PostgreSQL.
- Zod.
- Firebase Admin SDK.
- Mercado Pago SDK o API oficial.
- `qrcode`.
- Helmet.
- CORS.
- Rate limiting.
- Logger estructurado.

### Testing

- Vitest para frontend.
- Supertest para API.
- Vitest o Jest para backend.
- Playwright para pruebas end-to-end.

---

## 14. Decisión visual

Se utilizará Tailwind CSS.

Motivos:

- Facilita diseño mobile-first.
- Permite crear una interfaz personalizada.
- Evita depender del aspecto visual predeterminado de Bootstrap.
- Funciona bien con React.
- Permite reutilizar estilos.
- Reduce CSS manual.

La interfaz debe mantenerse limpia y sin exceso de efectos.

---

## 15. Autenticación

Se utilizará Firebase Authentication.

Funciones iniciales:

- Registro con correo y contraseña.
- Inicio de sesión con correo y contraseña.
- Inicio de sesión con Google.
- Recuperación de contraseña.
- Verificación de correo.

### Funcionamiento

1. El usuario se autentica en Firebase desde el frontend.
2. Firebase entrega un token.
3. El frontend envía el token al backend.
4. El backend lo verifica con Firebase Admin.
5. El backend busca o crea al usuario interno.
6. Los permisos se determinan desde la base de datos.

Los roles no deben confiarse al frontend.

---

## 16. Base de datos

Se utilizará PostgreSQL mediante Prisma.

### Entidades principales

#### User

- `id`
- `firebaseUid`
- `email`
- `displayName`
- `phone`
- `role`
- `status`
- `createdAt`
- `updatedAt`

#### Event

- `id`
- `publicId`
- `title`
- `slug`
- `description`
- `coverImageUrl`
- `venueName`
- `address`
- `startsAt`
- `endsAt`
- `salesStartAt`
- `salesEndAt`
- `capacity`
- `status`
- `createdAt`
- `updatedAt`

#### TicketType

- `id`
- `eventId`
- `name`
- `description`
- `price`
- `currency`
- `capacity`
- `maxPerOrder`
- `salesStartAt`
- `salesEndAt`
- `status`
- `sortOrder`
- `createdAt`
- `updatedAt`

#### Order

- `id`
- `publicId`
- `userId`
- `eventId`
- `status`
- `currency`
- `subtotal`
- `total`
- `paymentProvider`
- `externalReference`
- `expiresAt`
- `paidAt`
- `createdAt`
- `updatedAt`

#### OrderItem

- `id`
- `orderId`
- `ticketTypeId`
- `quantity`
- `unitPrice`
- `subtotal`

#### Payment

- `id`
- `orderId`
- `provider`
- `providerPaymentId`
- `status`
- `amount`
- `currency`
- `paymentMethod`
- `rawStatus`
- `approvedAt`
- `createdAt`
- `updatedAt`

#### Ticket

- `id`
- `publicId`
- `orderId`
- `ticketTypeId`
- `holderName`
- `holderEmail`
- `qrTokenHash`
- `status`
- `issuedAt`
- `usedAt`
- `createdAt`
- `updatedAt`

#### CheckIn

- `id`
- `ticketId`
- `eventId`
- `validatorUserId`
- `result`
- `checkedAt`
- `deviceInfo`
- `ipAddress`

#### PaymentWebhookEvent

- `id`
- `provider`
- `externalEventId`
- `eventType`
- `payload`
- `processed`
- `processedAt`
- `createdAt`

#### AuditLog

- `id`
- `userId`
- `action`
- `entityType`
- `entityId`
- `metadata`
- `createdAt`

---

## 17. Estados

### Evento

- `DRAFT`
- `PUBLISHED`
- `PAUSED`
- `CANCELLED`
- `FINISHED`

### Orden

- `PENDING`
- `AWAITING_PAYMENT`
- `PAID`
- `REJECTED`
- `CANCELLED`
- `EXPIRED`
- `REFUNDED`

### Pago

- `PENDING`
- `APPROVED`
- `REJECTED`
- `CANCELLED`
- `REFUNDED`

### Ticket

- `ACTIVE`
- `USED`
- `CANCELLED`
- `REFUNDED`
- `EXPIRED`

### Usuario

- `ACTIVE`
- `BLOCKED`

### Rol

- `USER`
- `VALIDATOR`
- `ADMIN`

---

## 18. Mercado Pago

La integración debe quedar desacoplada.

Crear una interfaz interna:

```ts
interface PaymentProvider {
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  getPayment(paymentId: string): Promise<PaymentResult>;
  processWebhook(payload: unknown, headers: Record<string, string>): Promise<void>;
}
```

Implementaciones:

- `MockPaymentProvider`
- `MercadoPagoPaymentProvider`

Durante el desarrollo se podrá utilizar el proveedor simulado.

La aplicación no debe almacenar:

- Número completo de tarjeta.
- Código de seguridad.
- Datos sensibles del medio de pago.

---

## 19. Correos

Crear una interfaz:

```ts
interface EmailService {
  sendTicketEmail(input: TicketEmailInput): Promise<void>;
  sendPaymentConfirmation(input: PaymentEmailInput): Promise<void>;
  sendEventCancellation(input: EventCancellationEmailInput): Promise<void>;
}
```

El proveedor concreto podrá definirse después.

No acoplar la lógica del sistema a Resend, Mailtrap, Brevo o SMTP.

---

## 20. Seguridad

Aplicar como mínimo:

- Validación con Zod.
- Verificación de tokens Firebase.
- Autorización por roles.
- Helmet.
- CORS restringido.
- Rate limiting.
- Variables de entorno.
- Hash o firma segura para QR.
- Webhooks verificados.
- Idempotencia.
- Transacciones para cupos y validaciones.
- Logs sin datos sensibles.
- Auditoría administrativa.
- No exponer secretos en el frontend.
- No usar IDs incrementales como códigos públicos.
- No confiar en el estado informado por el navegador.
- No confirmar pagos desde el frontend.

---

## 21. Reglas de negocio

1. Un ticket pago solo se emite con pago aprobado.
2. Una entrada gratuita genera una orden con total cero.
3. El cupo debe verificarse dentro de una transacción.
4. Las reservas pendientes deben vencer.
5. El stock reservado debe liberarse al vencer la orden.
6. Un ticket no puede utilizarse dos veces.
7. Un ticket solo sirve para su evento.
8. Un ticket cancelado no puede validarse.
9. Un usuario común no puede ingresar al panel.
10. Un validador no puede editar eventos.
11. Los webhooks deben ser idempotentes.
12. Los cambios sensibles deben registrarse.
13. El VIP doble genera dos tickets.
14. Los secretos deben almacenarse en variables de entorno.
15. El backend es la única fuente válida para pagos, cupos y accesos.

---

## 22. API inicial

### Autenticación y usuarios

- `POST /api/auth/sync`
- `GET /api/users/me`
- `PATCH /api/users/me`

### Eventos públicos

- `GET /api/events`
- `GET /api/events/:slug`

### Administración de eventos

- `POST /api/admin/events`
- `PATCH /api/admin/events/:id`
- `DELETE /api/admin/events/:id`
- `POST /api/admin/events/:id/publish`
- `POST /api/admin/events/:id/pause`

### Tipos de entrada

- `POST /api/admin/events/:eventId/ticket-types`
- `PATCH /api/admin/ticket-types/:id`
- `DELETE /api/admin/ticket-types/:id`

### Órdenes

- `POST /api/orders`
- `GET /api/orders/me`
- `GET /api/orders/:publicId`

### Pagos

- `POST /api/payments/:orderId/create`
- `POST /api/webhooks/mercadopago`
- `GET /api/payments/:orderId/status`

### Tickets

- `GET /api/tickets/me`
- `GET /api/tickets/:publicId`
- `POST /api/tickets/:publicId/resend`

### Validación

- `POST /api/check-in/validate`
- `GET /api/check-in/recent`
- `GET /api/check-in/event/:eventId/stats`

### Administración

- `GET /api/admin/dashboard`
- `GET /api/admin/orders`
- `GET /api/admin/attendees`
- `GET /api/admin/tickets`
- `GET /api/admin/check-ins`
- `GET /api/admin/export`

---

## 23. Pantallas

### Públicas

- Inicio.
- Eventos.
- Detalle de evento.
- Selección de entradas.
- Registro.
- Inicio de sesión.
- Recuperación de contraseña.
- Confirmación de compra.
- Resultado del pago.
- Mis entradas.
- Detalle del ticket.

### Validador

- Inicio de sesión.
- Selección de evento.
- Escáner QR.
- Resultado de validación.
- Accesos recientes.

### Administrador

- Dashboard.
- Eventos.
- Crear evento.
- Editar evento.
- Tipos de entrada.
- Órdenes.
- Pagos.
- Asistentes.
- Tickets.
- Validadores.
- Historial de accesos.
- Exportaciones.

---

## 24. Pruebas

### Unitarias

- Cálculo de totales.
- Reglas de cupo.
- Estados de órdenes.
- Estados de pagos.
- Emisión de tickets.
- Validación de QR.
- Vencimiento de reservas.

### Integración

- Creación de orden gratuita.
- Creación de orden paga.
- Procesamiento de webhook.
- Idempotencia.
- Emisión de tickets.
- Validación de acceso.
- Autorización por roles.

### End-to-end

- Registro con Google.
- Reserva gratuita.
- Compra simulada.
- Visualización del ticket.
- Escaneo del QR.
- Intento de doble acceso.
- Acceso administrativo.

---

## 25. Fases

### Fase 0 — Preparación

- Leer este documento.
- Revisar las skills.
- Confirmar estructura.
- Crear repositorio.
- Crear documentación inicial.

### Fase 1 — Base técnica

- Crear frontend con React, Vite y TypeScript.
- Crear backend con Express y TypeScript.
- Configurar Tailwind.
- Configurar ESLint y formato.
- Preparar variables de entorno.
- Crear estructura modular.
- Configurar Prisma.
- Conectar PostgreSQL.
- Crear endpoint de salud.
- Crear README.

### Fase 2 — Autenticación

- Configurar Firebase.
- Registro con correo.
- Login con correo.
- Login con Google.
- Middleware de autenticación.
- Sincronización de usuario interno.
- Roles.

### Fase 3 — Eventos

- CRUD de eventos.
- CRUD de tipos de entrada.
- Página pública.
- Filtros.
- Cupos.
- Publicación.

### Fase 4 — Órdenes

- Selección de entradas.
- Órdenes gratuitas.
- Órdenes pagas.
- Reserva de stock.
- Vencimiento.
- Liberación de cupos.

### Fase 5 — Pagos

- Proveedor simulado.
- Interfaz de pagos.
- Integración de Mercado Pago.
- Webhooks.
- Idempotencia.
- Estados.

### Fase 6 — Tickets

- Emisión.
- QR.
- Página del ticket.
- Descarga.
- Reenvío.

### Fase 7 — Control de acceso

- Escáner.
- Validación.
- Prevención de doble uso.
- Historial.
- Interfaz mobile-first.

### Fase 8 — Administración

- Dashboard.
- Ventas.
- Pagos.
- Asistentes.
- Tickets.
- Validadores.
- Exportación.

### Fase 9 — Calidad

- Pruebas.
- Seguridad.
- Responsive.
- Accesibilidad.
- Logs.
- Documentación.
- Deploy de demostración.

---

## 26. Fuera del MVP

No desarrollar inicialmente:

- Aplicación móvil nativa.
- WhatsApp.
- CRM comercial.
- Asientos numerados.
- Reventa de tickets.
- Marketplace multi-organizador.
- Facturación electrónica.
- Transferencia entre usuarios.
- Cupones complejos.
- Lista de espera.
- Venta de productos.
- División automática de pagos.
- Control offline completo.
- Suscripciones.
- Programa de afiliados.

---

## 27. Variables de entorno

### Frontend

```env
VITE_API_URL=
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

### Backend

```env
NODE_ENV=
PORT=
FRONTEND_URL=

DATABASE_URL=

FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

PAYMENT_PROVIDER=mock
MERCADOPAGO_PUBLIC_KEY=
MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_WEBHOOK_SECRET=

QR_SIGNING_SECRET=

EMAIL_PROVIDER=
EMAIL_API_KEY=
EMAIL_FROM=

ORDER_EXPIRATION_MINUTES=
```

Los archivos `.env` no deben subirse al repositorio.

Crear `.env.example` sin credenciales reales.

---

## 28. Criterios de aceptación

El MVP estará completo cuando:

1. Un administrador pueda crear y publicar un evento.
2. Pueda crear entrada gratuita, VIP individual y VIP doble.
3. Un usuario pueda registrarse con correo o Google.
4. Un usuario pueda solicitar una entrada gratuita.
5. Un usuario pueda iniciar una compra paga.
6. El sistema pueda usar pagos simulados.
7. Mercado Pago pueda activarse mediante configuración.
8. Un pago aprobado genere tickets.
9. Cada ticket tenga un QR único.
10. El usuario pueda consultar sus entradas.
11. Un validador pueda escanear desde un celular.
12. El sistema impida reutilizar un ticket.
13. El administrador pueda consultar ventas y accesos.
14. Los flujos críticos tengan pruebas.
15. El proyecto pueda desplegarse como demostración.

---

## 29. Instrucciones para Claude Code

1. Leer este archivo completo antes de modificar el proyecto.
2. Revisar las skills disponibles en `/skills`.
3. No cambiar el stack definido.
4. No utilizar Next.js.
5. No reemplazar Express por funciones serverless.
6. Mantener frontend y backend separados.
7. No implementar todo el sistema de una sola vez.
8. Trabajar por fases.
9. Detenerse al finalizar cada fase.
10. Informar qué archivos fueron creados o modificados.
11. Ejecutar las verificaciones disponibles.
12. No inventar requisitos.
13. No agregar funcionalidades fuera del alcance.
14. No guardar secretos.
15. No almacenar datos sensibles de tarjetas.
16. No confirmar pagos desde el frontend.
17. Mantener la lógica de negocio fuera de los controladores.
18. Crear pruebas para reglas críticas.
19. Mantener el diseño mobile-first.
20. Actualizar la documentación cuando cambie una decisión.

---

## 30. Primera instrucción recomendada para Claude Code

```text
Leé completo el archivo PROYECTO.md y revisá las skills disponibles en la carpeta /skills.

Trabajá únicamente en la Fase 1: Base técnica.

Antes de modificar archivos, explicá brevemente la estructura que vas a crear.

Creá:

- el frontend con React, Vite y TypeScript;
- el backend separado con Node.js, Express y TypeScript;
- la configuración de Tailwind CSS;
- la estructura modular indicada;
- Prisma y la configuración inicial de PostgreSQL;
- los archivos .env.example;
- un endpoint de salud en el backend;
- un README con instrucciones claras para ejecutar ambos proyectos.

No implementes todavía autenticación, eventos, pagos, tickets ni control QR.

Al finalizar:

- instalá las dependencias necesarias;
- ejecutá las verificaciones disponibles;
- informá los archivos creados;
- explicá cómo iniciar frontend y backend;
- detenete y esperá autorización antes de continuar.
```
