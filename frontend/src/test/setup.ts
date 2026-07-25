import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = "";
  readonly scrollMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];

  observe = () => {};
  unobserve = () => {};
  disconnect = () => {};
  takeRecords = () => [];
}

vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

// jsdom no implementa URL.createObjectURL/revokeObjectURL. Usado por la
// descarga ZIP conjunta de VIP Doble (ver ticketZip.ts) — un stub estable
// alcanza para los tests, no hace falta un Blob real ni una URL real.
if (!("createObjectURL" in URL)) {
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:mock-url", revokeObjectURL: () => {} }));
} else {
  URL.createObjectURL = vi.fn(() => "blob:mock-url");
  URL.revokeObjectURL = vi.fn();
}
