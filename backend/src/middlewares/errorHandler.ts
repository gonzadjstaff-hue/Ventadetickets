import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import { AppError } from "../shared/AppError.js";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Los datos enviados no son válidos.",
        fields: err.flatten().fieldErrors,
      },
    });
    return;
  }

  // No se loguea req.body: puede contener email/teléfono del asistente.
  console.error(`[unhandled_error] ${req.method} ${req.path}`, err instanceof Error ? err.message : err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Ocurrió un error inesperado." } });
}
