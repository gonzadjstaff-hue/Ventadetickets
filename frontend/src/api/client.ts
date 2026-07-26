/**
 * VITE_API_URL: URL pública del backend, sin `/api` al final (ver
 * docs/LOCAL_SETUP.md). En desarrollo, si no está definida, cae a
 * `http://localhost:4000` como red de seguridad; en producción/preview NO
 * hay fallback — si falta, se prefiere fallar fuerte al arrancar en vez de
 * apuntar en silencio a localhost (que ahí sería siempre incorrecto). Ver
 * docs/DEPLOYMENT.md.
 */
const configuredApiUrl = import.meta.env.VITE_API_URL as string | undefined;
const API_URL = configuredApiUrl ?? (import.meta.env.DEV ? "http://localhost:4000" : undefined);

if (!API_URL) {
  throw new Error(
    "VITE_API_URL no está configurada. Definila en las variables de entorno del entorno de despliegue (ver docs/DEPLOYMENT.md).",
  );
}

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string[] | undefined>;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly fields?: Record<string, string[] | undefined>;

  constructor(status: number, message: string, code?: string, fields?: Record<string, string[] | undefined>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const isJson = response.headers.get("content-type")?.includes("application/json") ?? false;
  const body = isJson ? ((await response.json()) as ApiErrorBody | T) : undefined;

  if (!response.ok) {
    const errorBody = body as ApiErrorBody | undefined;
    throw new ApiError(
      response.status,
      errorBody?.error?.message ?? "Ocurrió un error inesperado.",
      errorBody?.error?.code,
      errorBody?.error?.fields,
    );
  }

  return body as T;
}
