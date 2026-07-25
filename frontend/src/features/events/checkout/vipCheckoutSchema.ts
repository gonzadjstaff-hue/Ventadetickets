import { z } from "zod";

const E164_REGEX = /^\+[1-9]\d{7,14}$/;

const attendeeSchema = z.object({
  name: z.string().trim().min(1, "Falta el nombre del asistente.").max(120),
});

/**
 * `attendeeCount` fija la longitud exacta del array (1 para VIP Individual,
 * 2 para VIP Doble) — el mismo criterio que ya usa el backend
 * (`ticketType.ticketsPerUnit`), nunca una regla separada tipo "si es Doble
 * son 2 campos".
 */
export function buildVipCheckoutSchema(attendeeCount: 1 | 2) {
  return z.object({
    buyer: z.object({
      name: z.string().trim().min(1, "El nombre es obligatorio.").max(120),
      email: z.string().trim().toLowerCase().email("Ingresá un email válido."),
      whatsapp: z
        .string()
        .trim()
        .transform((value) => value.replace(/[\s\-().]/g, ""))
        .refine((value) => E164_REGEX.test(value), {
          message: "Ingresá un WhatsApp válido, con código de país (ej: +5491122334455).",
        }),
    }),
    attendees: z.array(attendeeSchema).length(attendeeCount),
  });
}

export type VipCheckoutFormValues = z.infer<ReturnType<typeof buildVipCheckoutSchema>>;
