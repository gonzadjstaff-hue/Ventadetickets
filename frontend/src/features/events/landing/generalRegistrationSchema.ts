import { z } from "zod";

const E164_REGEX = /^\+[1-9]\d{7,14}$/;

export const generalRegistrationFormSchema = z.object({
  firstName: z.string().trim().min(1, "Ingresá tu nombre."),
  lastName: z.string().trim().min(1, "Ingresá tu apellido."),
  email: z.string().trim().toLowerCase().email("Ingresá un email válido."),
  phone: z
    .string()
    .trim()
    .transform((value) => value.replace(/[\s\-().]/g, ""))
    .pipe(z.string().regex(E164_REGEX, "Ingresá un WhatsApp válido con código de país (ej: +5491122334455).")),
  acceptedTerms: z
    .boolean()
    .refine((value) => value === true, { message: "Tenés que aceptar los términos para continuar." }),
});

export type GeneralRegistrationFormValues = z.infer<typeof generalRegistrationFormSchema>;
