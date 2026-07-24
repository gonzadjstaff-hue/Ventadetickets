import type { NextFunction, Request, Response } from "express";

import { generalRegistrationSchema } from "./schemas.js";
import { registerGeneralTicket } from "./service.js";

export async function createGeneralRegistration(
  req: Request<{ eventPublicId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = generalRegistrationSchema.parse(req.body);
    const result = await registerGeneralTicket(req.params.eventPublicId, input);

    res.status(201).json({
      attendeeName: result.attendeeName,
      orderPublicId: result.orderPublicId,
      ticketPublicId: result.ticketPublicId,
      ticketToken: result.ticketToken,
      ticketType: result.ticketTypeName,
      message: "¡Listo! Tu entrada General quedó confirmada.",
      emailStatus: result.emailStatus,
      emailSent: result.emailStatus === "sent",
    });
  } catch (error) {
    next(error);
  }
}
