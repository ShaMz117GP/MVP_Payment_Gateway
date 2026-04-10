import type {
  ApiErrorResponse,
} from "../types/api";
import type {
  CreatePaymentRequest,
  CreatePaymentResult,
  PaymentHistoryEntry,
  PaymentSummary,
} from "../types/payment";

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/$/, "");
}

export function buildApiUrl(baseUrl: string, path: string): string {
  return `${normalizeBaseUrl(baseUrl)}${path}`;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.body = body;
  }
}

type ProcessorMode = "success" | "decline" | "timeout";

async function request<TResponse>(
  baseUrl: string,
  path: string,
  init?: RequestInit
): Promise<TResponse> {
  const response = await fetch(buildApiUrl(baseUrl, path), init);
  const text = await response.text();
  const parsed = text ? tryParseJson(text) : null;

  if (!response.ok) {
    const errorMessage = extractErrorMessage(parsed) ?? `${response.status} ${response.statusText}`;
    throw new ApiClientError(errorMessage, response.status, parsed);
  }

  return parsed as TResponse;
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function extractErrorMessage(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const body = parsed as ApiErrorResponse;
  return typeof body.error === "string" ? body.error : null;
}

export async function createPayment(
  baseUrl: string,
  idempotencyKey: string,
  payload: CreatePaymentRequest
): Promise<CreatePaymentResult> {
  return request<CreatePaymentResult>(baseUrl, "/payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
}

export async function getPaymentById(baseUrl: string, id: string): Promise<PaymentSummary> {
  return request<PaymentSummary>(baseUrl, `/payments/${id}`);
}

export async function getPaymentHistory(baseUrl: string, id: string): Promise<PaymentHistoryEntry[]> {
  return request<PaymentHistoryEntry[]>(baseUrl, `/payments/${id}/history`);
}

export async function authorisePayment(
  baseUrl: string,
  id: string,
  mode?: ProcessorMode
): Promise<unknown> {
  const headers: Record<string, string> = {};
  if (mode) {
    headers["X-Processor-Mode"] = mode;
  }

  return request<unknown>(baseUrl, `/payments/${id}/authorise`, {
    method: "POST",
    headers,
  });
}

export async function capturePayment(baseUrl: string, id: string): Promise<unknown> {
  return request<unknown>(baseUrl, `/payments/${id}/capture`, {
    method: "POST",
  });
}

export async function refundPayment(baseUrl: string, id: string): Promise<unknown> {
  return request<unknown>(baseUrl, `/payments/${id}/refund`, {
    method: "POST",
  });
}
