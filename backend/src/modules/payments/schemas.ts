import { z } from "zod";

export const simulatePaymentSchema = z.object({
  result: z.enum(["approved", "pending", "rejected", "cancelled"]),
});

export type SimulatePaymentInput = z.infer<typeof simulatePaymentSchema>;
export type SimulatedResult = SimulatePaymentInput["result"];
