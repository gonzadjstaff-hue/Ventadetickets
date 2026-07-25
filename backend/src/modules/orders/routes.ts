import { Router } from "express";

import { createVipOrderController, getOrderStatusController } from "./controller.js";

export const ordersRouter = Router();

ordersRouter.post("/:eventPublicId/orders/vip", createVipOrderController);
ordersRouter.get("/:eventPublicId/orders/:orderPublicId", getOrderStatusController);
