import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup/vitestSetup.ts"],
    // Varios archivos de test usan transacciones Serializable de Postgres
    // (registro General, órdenes VIP) contra la misma base tickets_test, que
    // es chica. Con archivos corriendo en paralelo, Postgres puede abortar
    // transacciones de archivos distintos por falsos conflictos de
    // serialización (predicate locks a nivel de página en tablas chicas),
    // no por ningún bug real. Correr los archivos en serie lo elimina.
    fileParallelism: false,
  },
});
