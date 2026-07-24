import "dotenv/config";
import { z } from "zod";

/**
 * Trata strings vacíos como si la variable no estuviera definida. Sin esto,
 * los placeholders vacíos que ya vienen en .env.example (ej. EMAIL_API_KEY=)
 * se parsearían como el string "" en vez de activar los valores por
 * defecto/opcionales, y podrían romper el arranque o activar una integración
 * a medio configurar.
 */
function emptyToUndefined(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1),
  /**
   * MVP temporal: habilita POST /api/events/:eventPublicId/check-ins, que
   * modifica el estado real de los tickets. Deshabilitado por defecto porque
   * todavía no existe autenticación de validadores. Solo el string exacto
   * "true" lo activa; cualquier otro valor (incluido undefined) lo deja
   * apagado. Ver backend/src/modules/check-in/.
   */
  ENABLE_MVP_CHECKIN: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  /**
   * MVP de email para la entrada General (ver backend/src/integrations/email/).
   * "resend" envía de verdad vía Resend (requiere EMAIL_API_KEY y EMAIL_FROM);
   * "console" es un modo seguro de desarrollo que arma el contenido pero solo
   * lo loguea (resumen sin datos sensibles), sin pegarle a ningún proveedor
   * real. Sin definir, o con la configuración incompleta, la integración
   * queda deshabilitada — nunca se intenta ni se rompe el arranque.
   */
  EMAIL_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["resend", "console"]).optional()),
  EMAIL_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  EMAIL_FROM: z.preprocess(emptyToUndefined, z.string().optional()),
  /**
   * Zona horaria usada para formatear fecha y horario del evento en el email
   * (nunca la del servidor, implícita). Temporal: hoy hay un solo evento
   * demo. Cuando el sistema soporte múltiples eventos reales, esto debe
   * guardarse por Event (ej. Event.timezone), no como variable global única.
   */
  EVENT_TIMEZONE: z.preprocess(emptyToUndefined, z.string().default("America/Argentina/Buenos_Aires")),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
