import type { NextFunction, Request, Response } from "express";

import { checkInSchema } from "./schemas.js";
import { checkInTicket } from "./service.js";

export async function createCheckIn(
  req: Request<{ eventPublicId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = checkInSchema.parse(req.body);
    const outcome = await checkInTicket(req.params.eventPublicId, input.qrPayload, req.get("user-agent"));

    res.status(200).json(outcome);
  } catch (error) {
    next(error);
  }
}
