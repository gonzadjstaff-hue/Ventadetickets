import { z } from "zod";

const E164_REGEX = /^\+[1-9]\d{7,14}$/;

/**
 * Acotado a 1–2: los únicos TicketType existentes hoy (VIP Individual,
 * VIP Doble) tienen ticketsPerUnit 1 y 2. El match exacto contra
 * ticketType.ticketsPerUnit se valida en el service, después de resolver el
 * TicketType — acá solo se descartan cantidades disparatadas antes de tocar
 * la base.
 */
const attendeeSchema = z.object({
  name: z.string().trim().min(1, "El nombre del asistente es obligatorio.").max(120),
});

export const createVipOrderSchema = z.object({
  ticketTypeId: z.string().min(1, "Falta el tipo de entrada."),
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
  attendees: z
    .array(attendeeSchema)
    .min(1, "Falta cargar al menos un asistente.")
    .max(2, "Cantidad de asistentes no soportada."),
});

export type CreateVipOrderInput = z.infer<typeof createVipOrderSchema>;
