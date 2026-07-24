const API_URL = import.meta.env.VITE_API_URL as string;

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
