import type { Prisma } from "@prisma/client";

/**
 * Unidades ya reservadas (no tickets: `TicketType.capacity` son unidades
 * vendibles, ver docs/DATA_MODEL.md) para un TicketType, contando:
 * - OrderItem de órdenes PAID;
 * - OrderItem de órdenes PENDING cuya reserva todavía no venció.
 *
 * No cuentan: CANCELLED, EXPIRED, ni PENDING con expiresAt ya pasado (esas
 * unidades vuelven a estar disponibles sin necesidad de tocar la fila).
 *
 * Debe llamarse con el `tx` de la transacción que va a crear la nueva orden
 * (nunca con una lectura suelta fuera de ella), para que la comprobación de
 * cupo y la creación de la orden sean atómicas bajo aislamiento Serializable.
 */
export async function countReservedUnits(
  tx: Prisma.TransactionClient,
  ticketTypeId: string,
  now: Date,
): Promise<number> {
  const paidAggregate = await tx.orderItem.aggregate({
    _sum: { quantity: true },
    where: { ticketTypeId, order: { status: "PAID" } },
  });

  const pendingAggregate = await tx.orderItem.aggregate({
    _sum: { quantity: true },
    where: {
      ticketTypeId,
      order: {
        status: "PENDING",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    },
  });

  return (paidAggregate._sum.quantity ?? 0) + (pendingAggregate._sum.quantity ?? 0);
}
