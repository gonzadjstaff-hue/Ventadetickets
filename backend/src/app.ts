import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { env } from "./config/env.js";
import { checkInRouter } from "./modules/check-in/routes.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { ordersRouter } from "./modules/orders/routes.js";
import { paymentSimulatorRouter } from "./modules/payments/routes.js";
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
  app.use("/api/events", ordersRouter);

  // MVP temporal, deshabilitado por defecto: ver ENABLE_MVP_CHECKIN en env.ts.
  // Cuando está apagado, el router directamente no se monta, así que la ruta
  // se comporta como si no existiera (404 estándar de Express) en vez de
  // devolver un error que confirme que la feature existe.
  if (env.ENABLE_MVP_CHECKIN) {
    app.use("/api/events", checkInRouter);
  }

  // MVP temporal, deshabilitado por defecto: ver ENABLE_MVP_PAYMENT_SIMULATOR
  // en env.ts. Nunca debe estar disponible en producción — no hay ningún
  // proveedor de pago real detrás, aprueba lo que se le pida.
  if (env.ENABLE_MVP_PAYMENT_SIMULATOR) {
    app.use("/api/dev", paymentSimulatorRouter);
  }

  app.use(errorHandler);

  return app;
}
