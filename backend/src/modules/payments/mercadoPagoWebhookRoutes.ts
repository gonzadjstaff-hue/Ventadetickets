import { Router } from "express";

import { mercadoPagoWebhookController } from "./mercadoPagoController.js";

/** Montado en la raíz de /api — ver app.ts. Ruta pública, sin auth de usuario; la autenticidad se valida por firma (x-signature), no por sesión. */
export const mercadoPagoWebhookRouter = Router();
mercadoPagoWebhookRouter.post("/webhooks/mercadopago", mercadoPagoWebhookController);
