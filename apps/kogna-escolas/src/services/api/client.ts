import { env } from "@/config/env";
import type { ApiErrorPayload } from "@/types/api";
import { getStoredToken } from "./authStorage";

type ApiRequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  timeoutMs?: number;
};

export class ApiError extends Error {
  status: number;
  payload?: ApiErrorPayload;

  constructor(message: string, status: number, payload?: ApiErrorPayload) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function buildUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${env.apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

async function parseResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (response.status === 204) return null;
  if (contentType.includes("application/json")) return response.json();
  return response.text();
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), options.timeoutMs ?? 20000);
  const token = getStoredToken();

  try {
    const response = await fetch(buildUrl(path), {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const payload = await parseResponse(response);

    if (!response.ok) {
      const errorPayload =
        typeof payload === "object" && payload !== null ? (payload as ApiErrorPayload) : undefined;
      const message =
        errorPayload?.error || errorPayload?.message || `Erro ${response.status} ao chamar a API`;

      if (response.status === 401 && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("kogna:unauthorized"));
      }

      throw new ApiError(message, response.status, errorPayload);
    }

    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("Tempo limite excedido ao chamar a API", 408);
    }

    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
