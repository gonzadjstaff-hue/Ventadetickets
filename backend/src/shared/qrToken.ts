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

/** Prefijo y versión exactos del contenido codificado en el QR del ticket. */
const QR_PAYLOAD_PREFIX = "pulse-ticket:v1:";

/**
 * Longitud exacta que produce `randomBytes(32).toString("base64url")`: 32
 * bytes en base64url sin padding son siempre 43 caracteres. Si `generateQrToken`
 * cambia el tamaño del token, este valor (y el de abajo) deben actualizarse.
 */
const QR_TOKEN_LENGTH = 43;

/** Alfabeto base64url (sin padding), tal cual lo produce Buffer#toString("base64url"). */
const QR_TOKEN_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${QR_TOKEN_LENGTH}}$`);

/**
 * Valida y extrae el token crudo de un payload de QR escaneado. Exige
 * prefijo y versión exactos, y que el resto matchee carácter por carácter y
 * longitud exacta con lo que emite `generateQrToken`. Cualquier desvío
 * (formato, versión, longitud, caracteres fuera de base64url) se trata como
 * QR inválido: devuelve `null` en vez de tirar, para que el llamador decida
 * cómo responder sin loguear el payload crudo.
 */
export function parseQrPayload(payload: string): string | null {
  if (!payload.startsWith(QR_PAYLOAD_PREFIX)) return null;

  const token = payload.slice(QR_PAYLOAD_PREFIX.length);
  if (!QR_TOKEN_PATTERN.test(token)) return null;

  return token;
}

/** SHA-256 de un token crudo ya extraído, para comparar contra Ticket.qrTokenHash. */
export function hashQrToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
