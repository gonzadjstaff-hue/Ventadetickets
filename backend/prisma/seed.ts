import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Seed de desarrollo. Usa upsert e IDs fijos y explícitos (prefijo "demo-")
 * para poder correrse varias veces sin duplicar filas, y para que sea obvio
 * a simple vista que estos registros no son datos reales de producción.
 */
async function main() {
  const event = await prisma.event.upsert({
    where: { id: "demo-event-pulse-2026" },
    update: {},
    create: {
      id: "demo-event-pulse-2026",
      publicId: "demo-event-pulse-2026-public",
      title: "Pulse Festival 2026",
      slug: "pulse-festival-2026",
      description:
        "Tres días de música, cultura y experiencias en Costanera Sur. Entrada general, VIP individual y VIP doble disponibles.",
      venueName: "Costanera Sur",
      address: "Av. Tristán Achával Rodríguez, Buenos Aires",
      startsAt: new Date("2026-11-14T21:00:00-03:00"),
      endsAt: new Date("2026-11-17T04:00:00-03:00"),
      salesStartAt: new Date("2026-06-01T00:00:00-03:00"),
      salesEndAt: new Date("2026-11-10T23:59:00-03:00"),
      capacity: 500,
      status: "PUBLISHED",
    },
  });

  await prisma.ticketType.upsert({
    where: { id: "demo-tt-general-2026" },
    update: {},
    create: {
      id: "demo-tt-general-2026",
      eventId: event.id,
      name: "General",
      description: "Acceso general al festival, gratuito.",
      price: 0,
      currency: "ARS",
      capacity: 500,
      maxPerOrder: 1,
      ticketsPerUnit: 1,
      salesStartAt: event.salesStartAt,
      salesEndAt: event.salesEndAt,
      status: "ACTIVE",
      sortOrder: 0,
    },
  });

  await prisma.ticketType.upsert({
    where: { id: "demo-tt-vip-individual-2026" },
    update: {},
    create: {
      id: "demo-tt-vip-individual-2026",
      eventId: event.id,
      name: "VIP Individual",
      description: "Ingreso prioritario, zona VIP exclusiva y barra premium.",
      price: 35000,
      currency: "ARS",
      capacity: 100,
      maxPerOrder: 4,
      ticketsPerUnit: 1,
      salesStartAt: event.salesStartAt,
      salesEndAt: event.salesEndAt,
      status: "ACTIVE",
      sortOrder: 1,
    },
  });

  await prisma.ticketType.upsert({
    where: { id: "demo-tt-vip-doble-2026" },
    update: {},
    create: {
      id: "demo-tt-vip-doble-2026",
      eventId: event.id,
      name: "VIP Doble",
      // capacity = unidades vendibles: 50 unidades x ticketsPerUnit 2 = hasta 100 tickets individuales.
      description: "Dos accesos VIP, mesa reservada y barra premium para dos.",
      price: 60000,
      currency: "ARS",
      capacity: 50,
      maxPerOrder: 2,
      ticketsPerUnit: 2,
      salesStartAt: event.salesStartAt,
      salesEndAt: event.salesEndAt,
      status: "ACTIVE",
      sortOrder: 2,
    },
  });

  // Usuario "sistema" fijo para atribuir los CheckIn del check-in MVP mientras
  // no existe autenticación de validadores. Ver DEV_VALIDATOR_USER_ID en
  // backend/src/modules/check-in/service.ts (mismo ID, a propósito no
  // importado desde ahí para mantener este script sin dependencias de src/).
  await prisma.user.upsert({
    where: { id: "demo-validator-mvp" },
    update: {},
    create: {
      id: "demo-validator-mvp",
      email: "validador-mvp@pulse.dev",
      displayName: "Validador MVP (demo)",
      role: "VALIDATOR",
    },
  });

  console.log("Seed de desarrollo aplicado: evento 'Pulse Festival 2026' con 3 tipos de entrada.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
