import { z } from "zod";

const E164_REGEX = /^\+[1-9]\d{7,14}$/;

export const generalRegistrationSchema = z.object({
  ticketTypeId: z.string().min(1, "Falta el tipo de entrada."),
  firstName: z.string().trim().min(1, "El nombre es obligatorio.").max(120),
  lastName: z.string().trim().min(1, "El apellido es obligatorio.").max(120),
  email: z.string().trim().toLowerCase().email("Ingresá un email válido."),
  phone: z
    .string()
    .trim()
    .transform((value) => value.replace(/[\s\-().]/g, ""))
    .refine((value) => E164_REGEX.test(value), {
      message: "Ingresá un WhatsApp válido, con código de país (ej: +5491122334455).",
    }),
  acceptedTerms: z
    .boolean()
    .refine((value) => value === true, { message: "Tenés que aceptar los términos para continuar." }),
});

export type GeneralRegistrationInput = z.infer<typeof generalRegistrationSchema>;
