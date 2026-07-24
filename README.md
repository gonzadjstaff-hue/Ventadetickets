# App de Venta de Tickets Automatizada

Aplicación web mobile-first para publicar eventos, vender entradas y controlar el acceso mediante códigos QR. Ver [`project.md`](./project.md) para la especificación completa.

Este repositorio contiene dos aplicaciones independientes:

- **`frontend/`** — React + Vite + TypeScript + Tailwind CSS.
- **`backend/`** — Node.js + Express + TypeScript + Prisma + PostgreSQL.

## Estado actual

Fase 1 completada: base técnica (estructura, Tailwind, Prisma, endpoint de salud). Todavía **no** hay autenticación, eventos, pagos, tickets ni control de acceso QR implementados.

## Requisitos

- Node.js 20+
- PostgreSQL 14+

## Puesta en marcha

### Backend

```bash
cd backend
cp .env.example .env   # completar DATABASE_URL y demás variables
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev             # http://localhost:4000
```

Verificar que responde en `GET http://localhost:4000/api/health`.

### Frontend

```bash
cd frontend
cp .env.example .env   # completar VITE_API_URL y credenciales de Firebase
npm install
npm run dev              # http://localhost:5173
```

## Estructura del repositorio

```text
App Venta Tickets Automatizada/
├── frontend/
├── backend/
├── skills/
├── docs/
├── project.md
└── README.md
```

Detalle completo de la arquitectura, módulos, modelo de datos y fases del proyecto en [`project.md`](./project.md).
