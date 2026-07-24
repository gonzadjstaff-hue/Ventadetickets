import { createHash, randomBytes } from "node:crypto";

export interface GeneratedQrToken {
  /** Token crudo, de un solo uso para el cliente. Nunca persistir ni loguear. */
  token: string;
  /** SHA-256 del token: lo único que se guarda en Ticket.qrTokenHash. */
  hash: string;
}

/**
 * Genera un token aleatorio seguro para un ticket y su hash SHA-256.
 * El hash es unidireccional: una vez generado, el token crudo no se puede
 * recuperar a partir de lo guardado en la base. Por eso el llamador debe
 * devolverlo al cliente en la misma respuesta de creación (una sola vez) y
 * nunca loguearlo. El futuro servicio de envío de email/QR deberá recibir
 * este token durante la misma emisión del ticket, no después.
 */
export function generateQrToken(): GeneratedQrToken {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  return { token, hash };
}
