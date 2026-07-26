import { Router } from "express";

import { createMercadoPagoCheckoutController } from "./mercadoPagoController.js";

/** Montado bajo /api/events — ver app.ts. */
export const mercadoPagoCheckoutRouter = Router();
mercadoPagoCheckoutRouter.post("/:eventPublicId/orders/:orderPublicId/checkout/mercadopago", createMercadoPagoCheckoutController);
