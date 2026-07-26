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
  /**
   * Orígenes adicionales permitidos por CORS, separados por coma (ej. el
   * dominio de producción del frontend en Vercel, y opcionalmente URLs de
   * preview). FRONTEND_URL siempre queda permitido — esto suma orígenes
   * extra sin reemplazarlo, para no perder la compatibilidad con
   * http://localhost:5173 en desarrollo. Ver CORS_ALLOWED_ORIGINS_LIST más
   * abajo y backend/src/app.ts.
   */
  CORS_ALLOWED_ORIGINS: z.preprocess(emptyToUndefined, z.string().optional()),
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
  /**
   * Minutos que una Order VIP reserva capacidad en estado PENDING antes de
   * expirar. Ya estaba documentada en .env.example sin usarse; ahora la lee
   * modules/orders/. Reutilizada tal cual en vez de crear otra variable.
   */
  ORDER_EXPIRATION_MINUTES: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(15)),
  /**
   * MVP temporal: habilita POST /api/dev/orders/:orderPublicId/simulate-payment,
   * que aprueba/rechaza/cancela pagos de mentira y (si aprueba) emite tickets
   * reales. Debe existir solo en desarrollo/tests — nunca en producción, no
   * hay ningún proveedor de pago real detrás. Deshabilitado por defecto:
   * solo el string exacto "true" lo activa. Ver modules/payments/.
   */
  ENABLE_MVP_PAYMENT_SIMULATOR: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  /**
   * Reservado para elegir entre proveedores de pago reales cuando exista más
   * de uno. Hoy no tiene efecto en el código: el gate funcional real es
   * ENABLE_MERCADOPAGO_CHECKOUT (mismo patrón que los flags ENABLE_MVP_*) —
   * ver docs/DECISIONS.md.
   */
  PAYMENT_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["mock", "mercadopago"]).default("mock")),
  /**
   * Habilita Checkout Pro de Mercado Pago como recorrido de pago real para
   * VIP (además del simulador, que sigue disponible). Solo el string exacto
   * "true" lo activa. Aun activado, la integración solo queda efectivamente
   * disponible si además están completas las credenciales — ver
   * MERCADOPAGO_CHECKOUT_AVAILABLE más abajo. Nunca lanza en credenciales
   * faltantes: el backend debe poder arrancar igual.
   */
  ENABLE_MERCADOPAGO_CHECKOUT: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  MERCADOPAGO_ACCESS_TOKEN: z.preprocess(emptyToUndefined, z.string().optional()),
  /**
   * No se usa en el backend: Checkout Pro por redirección simple (sin
   * MercadoPago.js/Bricks) no necesita la public key en ningún request del
   * servidor. Se declara igual porque el enunciado la pide y para no romper
   * si en el futuro se agrega Checkout Bricks/API transparente del lado del
   * frontend — ver docs/DECISIONS.md.
   */
  MERCADOPAGO_PUBLIC_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  MERCADOPAGO_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  /**
   * Declarada porque el enunciado la pide, pero no wireada: el SDK oficial de
   * Mercado Pago no expone una forma soportada de redirigir sus requests a
   * una base URL distinta de https://api.mercadopago.com. Reservada por si
   * más adelante se necesita (ej. un proxy de test).
   */
  MERCADOPAGO_API_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  MERCADOPAGO_REQUEST_TIMEOUT_MS: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(8000)),
  /** URL pública del frontend (sin barra final), usada para armar las back_urls de Checkout Pro. */
  APP_PUBLIC_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  /** URL pública del backend (sin barra final), usada para armar notification_url del webhook. */
  BACKEND_PUBLIC_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
});

export type Env = z.infer<typeof envSchema>;

const parsedEnv = envSchema.parse(process.env);

/**
 * Derivado, no leído directamente de process.env: Checkout Pro de Mercado
 * Pago solo queda realmente disponible si el flag está en "true" Y además
 * están completas todas las credenciales/URLs que hacen falta para operar
 * (access token, secret del webhook, URL pública del frontend y del
 * backend). Si falta cualquiera, la integración queda deshabilitada sin
 * romper el arranque — mismo espíritu que emptyToUndefined más arriba, pero
 * para una condición que depende de varias variables a la vez. Único lugar
 * del código que decide esto: app.ts (montaje de rutas) y el controller de
 * creación de orden (paymentSimulationAvailable-like flag) lo consultan acá,
 * nunca recalculan la condición por su cuenta.
 */
const MERCADOPAGO_CHECKOUT_AVAILABLE = Boolean(
  parsedEnv.ENABLE_MERCADOPAGO_CHECKOUT &&
    parsedEnv.MERCADOPAGO_ACCESS_TOKEN &&
    parsedEnv.MERCADOPAGO_WEBHOOK_SECRET &&
    parsedEnv.APP_PUBLIC_URL &&
    parsedEnv.BACKEND_PUBLIC_URL,
);

/**
 * Lista final de orígenes permitidos por CORS: FRONTEND_URL siempre incluido
 * (nunca hay que duplicarlo en CORS_ALLOWED_ORIGINS), más los orígenes
 * adicionales de CORS_ALLOWED_ORIGINS (si está definida), separados por coma,
 * recortados y sin duplicados. Único lugar que arma esta lista — app.ts la
 * consume tal cual, nunca recalcula el parseo por su cuenta.
 */
const CORS_ALLOWED_ORIGINS_LIST = Array.from(
  new Set(
    [parsedEnv.FRONTEND_URL, ...(parsedEnv.CORS_ALLOWED_ORIGINS?.split(",") ?? [])]
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  ),
);

export const env: Env & { MERCADOPAGO_CHECKOUT_AVAILABLE: boolean; CORS_ALLOWED_ORIGINS_LIST: string[] } = {
  ...parsedEnv,
  MERCADOPAGO_CHECKOUT_AVAILABLE,
  CORS_ALLOWED_ORIGINS_LIST,
};
