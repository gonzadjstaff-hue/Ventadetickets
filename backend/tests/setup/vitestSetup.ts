import "dotenv/config";

import { resolveTestDatabaseUrl } from "./testDatabaseUrl.js";

// Se ejecuta antes de importar cualquier módulo de la app (incluido shared/prisma.ts),
// así que sobreescribir DATABASE_URL acá redirige toda la suite a la base de test.
process.env.DATABASE_URL = resolveTestDatabaseUrl();

// Habilitado por defecto para poder ejercitar el flujo de check-in en los
// tests. El test dedicado a "deshabilitado" lo fuerza de nuevo a "false"
// antes de importar la app, en su propio archivo (cada archivo de test corre
// en su registro de módulos aislado, así que no se pisan entre sí).
process.env.ENABLE_MVP_CHECKIN = "true";
