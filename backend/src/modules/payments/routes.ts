import { Router } from "express";

import { simulatePaymentController } from "./controller.js";

export const paymentSimulatorRouter = Router();

paymentSimulatorRouter.post("/orders/:orderPublicId/simulate-payment", simulatePaymentController);
