import "dotenv/config";

import { execSync } from "node:child_process";

import { resolveTestDatabaseUrl } from "../tests/setup/testDatabaseUrl.js";

const testDatabaseUrl = resolveTestDatabaseUrl();

console.log("Aplicando migraciones contra la base de test...");
execSync("npx prisma migrate deploy", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: testDatabaseUrl },
});
console.log("Listo.");
