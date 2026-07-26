# App de Venta de Tickets Automatizada

## Objetivo

Aplicación web mobile-first para publicar eventos, vender entradas (gratuitas y pagas) y controlar el acceso mediante códigos QR. Ver [`project.md`](./project.md) para la especificación completa del proyecto.

## Stack

- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS v4 + React Router + TanStack Query + React Hook Form + Zod + `lucide-react`.
- **Backend:** Node.js + Express 5 + TypeScript + Prisma + PostgreSQL + Zod.
- **Base de datos:** PostgreSQL, corriendo en Docker en desarrollo.
- **Testing:** Vitest + Testing Library (frontend), Vitest + Supertest (backend).

## Estructura general

```text
App Venta Tickets Automatizada/
├── frontend/          React + Vite + TypeScript
│   └── src/
│       ├── api/                        cliente HTTP, llamadas al backend
│       ├── config/                     IDs de datos demo (env)
│       ├── features/events/landing/    landing "Pulse Event", registro General, entrada descargable
│       ├── features/events/checkout/   checkout VIP (comprador, asistentes, resumen, pago simulado o Mercado Pago)
│       ├── features/scanner/           lector de QR y pantalla de check-in
│       ├── pages/                      páginas (PulseEventLanding, CheckoutReturnPage, CheckInPage)
│       └── router/                     React Router (AppRouter)
├── backend/           Node.js + Express + TypeScript + Prisma
│   ├── prisma/
│   │   ├── schema.prisma               modelo de datos
│   │   ├── migrations/
│   │   └── seed.ts                     seed de desarrollo (idempotente)
│   └── src/
│       ├── modules/registrations/      registro General (gratuita)
│       ├── modules/check-in/           validación de QR (MVP sin autenticación)
│       ├── modules/orders/             creación y consulta de orden VIP, reserva de capacidad
│       ├── modules/payments/           simulador de pago (solo dev/tests), Checkout Pro/webhook de Mercado Pago, y emisión de tickets
│       ├── integrations/email/         envío del ticket por email (Resend o consola de desarrollo)
│       ├── integrations/payments/      proveedor de pago abstraído; mercadoPago/ es el único que importa el SDK oficial
│       ├── middlewares/errorHandler.ts
│       ├── shared/                     prisma client, AppError, generación/parseo de token de QR
│       └── config/env.ts
├── docs/              documentación del proyecto (este directorio)
├── project.md         especificación funcional completa
└── README.md
```

Detalle de arquitectura, modelo de datos, decisiones de diseño y estado de avance en [`docs/`](./docs/).

## Requisitos

- Node.js 20+
- Docker Desktop (para PostgreSQL en desarrollo) — ver [`docs/LOCAL_SETUP.md`](./docs/LOCAL_SETUP.md)

## Instalación

```bash
git clone <repo>
cd "App Venta Tickets Automatizada"

cd backend && npm install
cd ../frontend && npm install
```

## Cómo levantar el proyecto

Pasos completos (Docker, migraciones, seed, variables de entorno) en [`docs/LOCAL_SETUP.md`](./docs/LOCAL_SETUP.md). Resumen:

### Backend

```bash
cd backend
cp .env.example .env   # completar DATABASE_URL
npx prisma generate
npx prisma migrate deploy
npm run db:seed         # datos demo (evento + 3 tipos de entrada), idempotente
npm run dev              # http://localhost:4000
```

### Frontend

```bash
cd frontend
cp .env.example .env   # ver docs/LOCAL_SETUP.md para los valores correctos
npm run dev              # http://localhost:5173
```

## Comandos de lint, tests y build

Los mismos comandos existen en `backend/` y `frontend/`:

```bash
npm run lint
npm test
npm run build
```

El backend además tiene:

```bash
npx prisma validate           # valida backend/prisma/schema.prisma
npm run test:db:setup          # aplica migraciones a la base de test aislada (tickets_test)
```

Los tests del backend corren contra una base de datos separada de la de desarrollo (ver [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md#base-separada-para-tests)), no contra `tickets_db`.

## Estado actual

Implementado: la landing pública del evento demo, el **registro gratuito de entrada General**, **QR real** con entrada descargable, **envío por email** (General y VIP), **validación de acceso por QR** (check-in, MVP sin autenticación), la **venta de entradas VIP Individual y VIP Doble** (con pago simulado o con **Checkout Pro de Mercado Pago en modo prueba**) y la **descarga/compartir de entradas en PDF**. Detalle en [`docs/PROGRESS.md`](./docs/PROGRESS.md).

El registro General, el check-in y la venta VIP (Individual y Doble) están probados de punta a punta contra navegador real, además de la suite automatizada (**148 tests backend + 133 tests frontend**). La descarga/compartir de entradas en PDF y el checkout de Mercado Pago (ver [`docs/PROGRESS.md`](./docs/PROGRESS.md)) todavía **no** tuvieron prueba manual en navegador — solo automatizada; Mercado Pago además necesita credenciales de prueba reales y una URL pública, ver [`docs/LOCAL_SETUP.md`](./docs/LOCAL_SETUP.md).

Todavía **no** hay credenciales productivas de Mercado Pago, autenticación, WhatsApp, CRM, panel administrativo, reportes ni deploy.

## Funcionalidades pendientes

Ver [`docs/ROADMAP.md`](./docs/ROADMAP.md) para el orden sugerido. Resumen: validar Mercado Pago manualmente con credenciales de prueba → cron de expiración de órdenes → WhatsApp → CRM → administración y reportes → deploy.

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Arquitectura de frontend, backend, base de datos y flujo de registro General |
| [`docs/API.md`](./docs/API.md) | Endpoints disponibles, request/response, errores |
| [`docs/DATA_MODEL.md`](./docs/DATA_MODEL.md) | Modelos de Prisma y relaciones |
| [`docs/DECISIONS.md`](./docs/DECISIONS.md) | Decisiones de diseño tomadas y su razón |
| [`docs/PROGRESS.md`](./docs/PROGRESS.md) | Qué está hecho y qué falta |
| [`docs/ROADMAP.md`](./docs/ROADMAP.md) | Orden sugerido de las próximas fases |
| [`docs/LOCAL_SETUP.md`](./docs/LOCAL_SETUP.md) | Cómo levantar el entorno local paso a paso |
