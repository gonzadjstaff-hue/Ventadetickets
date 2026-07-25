import type { NextFunction, Request, Response } from "express";

import { simulatePaymentSchema } from "./schemas.js";
import { processSimulatedPayment } from "./simulationService.js";

export async function simulatePaymentController(
  req: Request<{ orderPublicId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = simulatePaymentSchema.parse(req.body);
    const outcome = await processSimulatedPayment(req.params.orderPublicId, input.result);

    res.status(200).json(outcome);
  } catch (error) {
    next(error);
  }
}
