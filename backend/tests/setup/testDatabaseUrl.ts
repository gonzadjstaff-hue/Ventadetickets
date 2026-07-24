const TEST_DATABASE_NAME = "tickets_test";

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function assertSafeTestUrl(testUrl: string, devUrl: string | undefined): void {
  const testDbName = new URL(testUrl).pathname.replace(/^\//, "");

  if (!testDbName.toLowerCase().includes("test")) {
    throw new Error(
      `Me niego a correr tests contra una base llamada "${testDbName}": no contiene "test" en el nombre. ` +
        "Configurá DATABASE_URL_TEST apuntando a una base de test dedicada, o dejá que se derive automáticamente.",
    );
  }

  if (devUrl && testUrl === devUrl) {
    throw new Error(
      "DATABASE_URL_TEST no puede ser igual a DATABASE_URL: correrías los tests contra la base de desarrollo.",
    );
  }
}

/**
 * Resuelve la URL de conexión que deben usar los tests, sin tocar backend/.env.
 * Prioridad: DATABASE_URL_TEST explícita si existe; si no, se deriva de
 * DATABASE_URL reemplazando el nombre de la base por "tickets_test" (misma
 * instancia de Postgres, mismas credenciales, base separada).
 */
export function resolveTestDatabaseUrl(): string {
  const devUrl = process.env.DATABASE_URL;
  const explicitTestUrl = process.env.DATABASE_URL_TEST;

  const testUrl = explicitTestUrl ?? (devUrl ? withDatabaseName(devUrl, TEST_DATABASE_NAME) : undefined);

  if (!testUrl) {
    throw new Error(
      "No pude resolver una base de datos de test: definí DATABASE_URL_TEST o DATABASE_URL en backend/.env.",
    );
  }

  assertSafeTestUrl(testUrl, devUrl);
  return testUrl;
}
