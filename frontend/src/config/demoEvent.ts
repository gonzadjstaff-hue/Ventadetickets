/**
 * IDs de datos mockeados/seed hasta que exista un listado real de eventos
 * (Fase 3). Apuntan a las filas creadas por backend/prisma/seed.ts, no a
 * nombres — así el frontend nunca resuelve el evento ni el tipo de entrada
 * por texto.
 */
export const demoEvent = {
  eventPublicId: (import.meta.env.VITE_DEMO_EVENT_PUBLIC_ID as string | undefined) ?? "",
  generalTicketTypeId: (import.meta.env.VITE_DEMO_GENERAL_TICKET_TYPE_ID as string | undefined) ?? "",
  vipIndividualTicketTypeId: (import.meta.env.VITE_DEMO_VIP_INDIVIDUAL_TICKET_TYPE_ID as string | undefined) ?? "",
  vipDobleTicketTypeId: (import.meta.env.VITE_DEMO_VIP_DOBLE_TICKET_TYPE_ID as string | undefined) ?? "",
};
