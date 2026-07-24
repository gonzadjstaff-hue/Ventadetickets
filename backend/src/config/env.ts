import "dotenv/config";
import { z } from "zod";

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
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
