import { z } from "zod";

/**
 * Límite superior defensivo, holgado por encima de los 59 caracteres exactos
 * que produce el formato real (`pulse-ticket:v1:` + 43 del token). El formato
 * exacto se valida después con parseQrPayload; esto solo evita procesar
 * strings arbitrariamente largos antes de llegar ahí.
 */
const QR_PAYLOAD_MAX_LENGTH = 80;

export const checkInSchema = z.object({
  qrPayload: z
    .string()
    .min(1, "Falta el contenido del QR.")
    .max(QR_PAYLOAD_MAX_LENGTH, "El contenido del QR no es válido."),
});

export type CheckInInput = z.infer<typeof checkInSchema>;
