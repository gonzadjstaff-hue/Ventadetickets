import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { env } from "./config/env.js";
import { checkInRouter } from "./modules/check-in/routes.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { registrationsRouter } from "./modules/registrations/routes.js";

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_URL,
    }),
  );
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/api/events", registrationsRouter);

  // MVP temporal, deshabilitado por defecto: ver ENABLE_MVP_CHECKIN en env.ts.
  // Cuando está apagado, el router directamente no se monta, así que la ruta
  // se comporta como si no existiera (404 estándar de Express) en vez de
  // devolver un error que confirme que la feature existe.
  if (env.ENABLE_MVP_CHECKIN) {
    app.use("/api/events", checkInRouter);
  }

  app.use(errorHandler);

  return app;
}
