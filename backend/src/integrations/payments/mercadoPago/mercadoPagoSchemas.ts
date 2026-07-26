import { z } from "zod";

/**
 * Body de la notificación de webhook de Mercado Pago. Formato documentado:
 * `{ action, api_version, data: { id }, date_created, id, live_mode, type,
 * user_id }` (fuente: Payment notifications de Checkout Pro, fecha de
 * consulta 2026-07-25). Se valida de forma tolerante (todo opcional salvo lo
 * mínimo indispensable): un campo extra o ausente no debe tirar un 500 antes
 * de poder registrar el intento — la validación de firma es la que decide si
 * se procesa, no la forma exacta del body.
 */
export const mercadoPagoWebhookBodySchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  type: z.string().optional(),
  action: z.string().optional(),
  live_mode: z.boolean().optional(),
  date_created: z.string().optional(),
  data: z
    .object({
      id: z.union([z.string(), z.number()]).optional(),
    })
    .optional(),
});

export type MercadoPagoWebhookBody = z.infer<typeof mercadoPagoWebhookBodySchema>;

/**
 * Mercado Pago también manda `data.id` (y a veces `type`/`id`) como query
 * string, incluso en el POST del webhook — el propio ejemplo oficial de
 * `WebhookSignatureValidator` lee `dataId` de `req.query['data.id']`, no del
 * body. Se validan ambas fuentes y se prioriza la de la query.
 */
export const mercadoPagoWebhookQuerySchema = z.object({
  "data.id": z.string().optional(),
  type: z.string().optional(),
  id: z.string().optional(),
});

export type MercadoPagoWebhookQuery = z.infer<typeof mercadoPagoWebhookQuerySchema>;
