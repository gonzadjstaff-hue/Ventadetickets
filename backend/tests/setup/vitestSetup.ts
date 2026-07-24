import "dotenv/config";

import { resolveTestDatabaseUrl } from "./testDatabaseUrl.js";

// Se ejecuta antes de importar cualquier módulo de la app (incluido shared/prisma.ts),
// así que sobreescribir DATABASE_URL acá redirige toda la suite a la base de test.
process.env.DATABASE_URL = resolveTestDatabaseUrl();
