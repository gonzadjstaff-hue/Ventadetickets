/**
 * Wrapper fino sobre la Web Share API (nivel 2, con archivos). Sin
 * dependencia nueva: es una API nativa del navegador, no de un paquete.
 */

interface NavigatorWithFileShare extends Navigator {
  share: (data: ShareData) => Promise<void>;
  canShare: (data: ShareData) => boolean;
}

function getFileShareNavigator(): NavigatorWithFileShare | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & Partial<NavigatorWithFileShare>;
  if (typeof nav.share !== "function" || typeof nav.canShare !== "function") return null;
  return nav as NavigatorWithFileShare;
}

/**
 * Chequeo liviano para decidir si mostrar el botón "Compartir" — no requiere
 * tener el archivo real todavía (evita armar el PDF solo para decidir si
 * mostrar el botón). El chequeo preciso con el archivo real pasa en
 * `shareFile`, justo antes de compartir.
 */
export function supportsFileShare(): boolean {
  return getFileShareNavigator() !== null;
}

export type ShareOutcome = "shared" | "cancelled" | "unsupported" | "failed";

/** Comparte un único archivo. Nunca comparte una URL ni ningún dato del token por fuera del archivo mismo. */
export async function shareFile(file: File, title: string): Promise<ShareOutcome> {
  const nav = getFileShareNavigator();
  if (!nav) return "unsupported";

  try {
    if (!nav.canShare({ files: [file] })) return "unsupported";
  } catch {
    return "unsupported";
  }

  try {
    await nav.share({ files: [file], title });
    return "shared";
  } catch (error) {
    // El usuario cerró el selector nativo de "compartir": no es un error.
    // `DOMException` (lo que realmente rechaza `navigator.share()`) no
    // extiende `Error` en el spec, así que se chequea `.name` directamente
    // en vez de filtrar primero por `instanceof Error`.
    const name = (error as { name?: unknown } | null)?.name;
    if (name === "AbortError") return "cancelled";
    return "failed";
  }
}
