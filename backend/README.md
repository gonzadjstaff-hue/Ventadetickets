# Backend — App Venta de Tickets Automatizada

API en Node.js + Express + TypeScript. Persistencia con PostgreSQL vía Prisma.

## Requisitos

- Node.js 20+
- PostgreSQL 14+

## Configuración

1. Copiar `.env.example` a `.env` y completar los valores (al menos `DATABASE_URL`).
2. Instalar dependencias:

   ```bash
   npm install
   ```

3. Generar el cliente de Prisma y aplicar el esquema:

   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   ```

## Scripts

| Comando         | Descripción                                   |
| --------------- | ---------------------------------------------- |
| `npm run dev`    | Levanta el servidor en modo desarrollo (watch). |
| `npm run build`  | Compila TypeScript a `dist/`.                   |
| `npm start`      | Ejecuta la build compilada.                     |
| `npm run lint`   | Corre ESLint.                                   |
| `npm run format` | Formatea el código con Prettier.                |
| `npm test`       | Corre las pruebas con Vitest + Supertest.       |

## Endpoint de salud

`GET /api/health` devuelve `{ status: "ok", timestamp }` para verificar que el servicio está arriba.

## Estructura

Ver `PROYECTO.md` (raíz del repo) para el detalle de la arquitectura modular (`src/modules`, `src/integrations`, `src/shared`). En esta fase los módulos de dominio están vacíos: se completan en las fases siguientes.
