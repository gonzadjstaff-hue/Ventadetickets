import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./shared/prisma.js";

const app = createApp();

// "0.0.0.0" explícito: Render (y proxies inversos equivalentes) enrutan al
// contenedor por su IP interna, no por "localhost" — sin esto, Node ya
// escucha en todas las interfaces por defecto al omitir el host, pero
// dejarlo explícito documenta la intención y evita depender de ese default.
const server = app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`Backend listening on http://0.0.0.0:${env.PORT}`);
});

/**
 * Cierre controlado ante SIGTERM/SIGINT (Render manda SIGTERM al reciclar o
 * detener una instancia): deja de aceptar conexiones nuevas, espera a que
 * Express termine las que ya estaban en curso, y recién ahí cierra la
 * conexión de Prisma — evita cortar una query a mitad de camino por un
 * shutdown abrupto.
 */
function shutdown(signal: NodeJS.Signals): void {
  console.log(`${signal} recibido, cerrando el servidor...`);
  server.close(() => {
    prisma
      .$disconnect()
      .catch((error: unknown) => {
        console.error("Error al desconectar Prisma durante el shutdown", error);
      })
      .finally(() => {
        process.exit(0);
      });
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
