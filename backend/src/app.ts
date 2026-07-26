import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { env } from "./config/env.js";
import { checkInRouter } from "./modules/check-in/routes.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { ordersRouter } from "./modules/orders/routes.js";
import { mercadoPagoCheckoutRouter } from "./modules/payments/mercadoPagoRoutes.js";
import { mercadoPagoWebhookRouter } from "./modules/payments/mercadoPagoWebhookRoutes.js";
import { paymentSimulatorRouter } from "./modules/payments/routes.js";
import { registrationsRouter } from "./modules/registrations/routes.js";

export function createApp(): Express {
  const app = express();

  // Render (y cualquier proxy inverso equivalente) entrega la app detrás de
  // un único hop de proxy: sin esto, express-rate-limit y req.ip verían
  // siempre la IP del proxy, no la del cliente real. "1" (no `true`) confía
  // exactamente en ese hop, nunca en cualquier X-Forwarded-For arbitrario.
  if (env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  app.use(helmet());
  app.use(
    cors({
      // Función en vez de un string fijo: permite el frontend local
      // (FRONTEND_URL, default http://localhost:5173) y, en producción, el
      // dominio de Vercel y cualquier otro origen agregado explícitamente en
      // CORS_ALLOWED_ORIGINS (ver config/env.ts) — nunca "*", porque request
      // sin un origen exacto no tendría sentido bloquear selectivamente acá.
      // Requests sin header Origin (curl, health checks, y el webhook
      // server-to-server de Mercado Pago) siempre pasan: CORS es una
      // restricción que solo aplican los navegadores, nunca protege al
      // webhook — esa autenticidad la da la firma x-signature, no CORS (ver
      // docs/DECISIONS.md).
      origin(origin, callback) {
        if (!origin || env.CORS_ALLOWED_ORIGINS_LIST.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
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

  // Checkout Pro de Mercado Pago (modo prueba). Igual patrón que los flags
  // ENABLE_MVP_*: si no está efectivamente disponible (falta el flag o
  // faltan credenciales/URLs — ver env.MERCADOPAGO_CHECKOUT_AVAILABLE en
  // config/env.ts), ninguna de las dos rutas se monta, así que responden 404
  // estándar de Express en vez de confirmar que la integración existe.
  if (env.MERCADOPAGO_CHECKOUT_AVAILABLE) {
    app.use("/api/events", mercadoPagoCheckoutRouter);
    app.use("/api", mercadoPagoWebhookRouter);
  }

  app.use(errorHandler);

  return app;
}
