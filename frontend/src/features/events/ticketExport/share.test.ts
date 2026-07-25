import { afterEach, describe, expect, it, vi } from "vitest";

import { shareFile, supportsFileShare } from "./share";

function fakeFile(): File {
  return new File(["pdf-fake"], "pulse-event-general-t1.pdf", { type: "application/pdf" });
}

describe("supportsFileShare", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("false si navigator.share no existe", () => {
    vi.stubGlobal("navigator", {});
    expect(supportsFileShare()).toBe(false);
  });

  it("false si existe navigator.share pero no navigator.canShare", () => {
    vi.stubGlobal("navigator", { share: vi.fn() });
    expect(supportsFileShare()).toBe(false);
  });

  it("true si existen tanto navigator.share como navigator.canShare", () => {
    vi.stubGlobal("navigator", { share: vi.fn(), canShare: vi.fn() });
    expect(supportsFileShare()).toBe(true);
  });
});

describe("shareFile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("'unsupported' si el navegador no soporta compartir archivos", async () => {
    vi.stubGlobal("navigator", {});
    const outcome = await shareFile(fakeFile(), "Mi entrada");
    expect(outcome).toBe("unsupported");
  });

  it("'unsupported' si canShare devuelve false para este archivo (nunca intenta compartir)", async () => {
    const share = vi.fn();
    vi.stubGlobal("navigator", { share, canShare: vi.fn().mockReturnValue(false) });

    const outcome = await shareFile(fakeFile(), "Mi entrada");

    expect(outcome).toBe("unsupported");
    expect(share).not.toHaveBeenCalled();
  });

  it("'shared' y llama a navigator.share con el File exacto (nunca una URL)", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, canShare: vi.fn().mockReturnValue(true) });
    const file = fakeFile();

    const outcome = await shareFile(file, "Mi entrada");

    expect(outcome).toBe("shared");
    expect(share).toHaveBeenCalledWith({ files: [file], title: "Mi entrada" });
    const [args] = share.mock.calls[0] as [{ url?: string; files: File[] }];
    expect(args.url).toBeUndefined();
  });

  it("'cancelled' si el usuario cierra el selector nativo (AbortError), no se trata como error", async () => {
    const abortError = new DOMException("cancelled", "AbortError");
    const share = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal("navigator", { share, canShare: vi.fn().mockReturnValue(true) });

    const outcome = await shareFile(fakeFile(), "Mi entrada");

    expect(outcome).toBe("cancelled");
  });

  it("'failed' ante cualquier otro error real de la API", async () => {
    const share = vi.fn().mockRejectedValue(new Error("algo se rompió"));
    vi.stubGlobal("navigator", { share, canShare: vi.fn().mockReturnValue(true) });

    const outcome = await shareFile(fakeFile(), "Mi entrada");

    expect(outcome).toBe("failed");
  });
});
