import type { NextFunction, Request, Response } from "express";

import { env } from "../../config/env.js";
import { createVipOrderSchema } from "./schemas.js";
import { createVipOrder, getOrderStatus } from "./service.js";

export async function createVipOrderController(
  req: Request<{ eventPublicId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = createVipOrderSchema.parse(req.body);
    const result = await createVipOrder(req.params.eventPublicId, input);

    res.status(201).json({
      orderPublicId: result.orderPublicId,
      eventPublicId: result.eventPublicId,
      ticketType: result.ticketTypeName,
      total: result.total.toNumber(),
      currency: result.currency,
      expiresAt: result.expiresAt.toISOString(),
      buyer: { name: result.buyerName, email: result.buyerEmail, whatsapp: result.buyerWhatsapp },
      attendees: result.attendees,
      status: result.status,
      // Presente solo cuando el simulador realmente está montado (ver app.ts):
      // así el frontend nunca ofrece controles de simulación que no van a funcionar.
      ...(env.ENABLE_MVP_PAYMENT_SIMULATOR ? { paymentSimulationAvailable: true } : {}),
      // Mismo criterio que arriba, para Mercado Pago: solo aparece si las
      // rutas de checkout/webhook están efectivamente montadas.
      ...(env.MERCADOPAGO_CHECKOUT_AVAILABLE ? { mercadoPagoCheckoutAvailable: true } : {}),
    });
  } catch (error) {
    next(error);
  }
}

export async function getOrderStatusController(
  req: Request<{ eventPublicId: string; orderPublicId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getOrderStatus(req.params.eventPublicId, req.params.orderPublicId);

    res.status(200).json({
      orderPublicId: result.orderPublicId,
      status: result.status,
      ticketType: result.ticketTypeName,
      total: result.total.toNumber(),
      currency: result.currency,
      expiresAt: result.expiresAt ? result.expiresAt.toISOString() : null,
      buyerName: result.buyerName,
      attendees: result.attendees,
      paymentStatus: result.paymentStatus,
      ...(result.tickets ? { tickets: result.tickets } : {}),
    });
  } catch (error) {
    next(error);
  }
}
