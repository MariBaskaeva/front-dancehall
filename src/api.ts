export const API_BASE = "/api/v1";
const REQUEST_TIMEOUT_MS = 10_000;

export const STYLES = ["FEMALE", "MALE"] as const;
export const ERAS = ["OLD", "MIDDLE", "EARLY_NEW", "NEW", "UNKNOWN"] as const;

export type StepStyle = (typeof STYLES)[number];
export type StepEra = (typeof ERAS)[number];

export interface Author {
  id: string;
  slug: string;
  name: string;
}

export interface Step {
  id: string;
  slug: string;
  name: string;
  style: StepStyle;
  era: StepEra;
  author: Author | null;
}

export interface StepPage {
  content: Step[];
  page: PageMetadata;
}

export interface PageMetadata {
  number: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface StepFilters {
  q: string;
  styles: StepStyle[];
  eras: StepEra[];
  authors: string[];
  page: number;
}

export type ApiErrorKind = "http" | "network" | "timeout" | "invalid";

export class ApiError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    public readonly status?: number,
    public readonly detail?: string,
  ) {
    super(detail ?? kind);
    this.name = "ApiError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const isUuid = (value: unknown): value is string =>
  isString(value) &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const isBoundedString = (value: unknown, maxLength: number): value is string =>
  typeof value === "string" && value.length <= maxLength;

export const isAuthor = (value: unknown): value is Author =>
  isRecord(value) &&
  isUuid(value.id) &&
  isBoundedString(value.slug, 255) &&
  isBoundedString(value.name, 200);

export const isStep = (value: unknown): value is Step =>
  isRecord(value) &&
  isUuid(value.id) &&
  isBoundedString(value.slug, 255) &&
  isBoundedString(value.name, 200) &&
  STYLES.includes(value.style as StepStyle) &&
  ERAS.includes(value.era as StepEra) &&
  (value.author === null || isAuthor(value.author));

const isNonNegativeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && typeof value === "number" && value >= 0;

export const isStepPage = (value: unknown): value is StepPage =>
  isRecord(value) &&
  Array.isArray(value.content) &&
  value.content.every(isStep) &&
  isRecord(value.page) &&
  isNonNegativeInteger(value.page.number) &&
  isNonNegativeInteger(value.page.size) &&
  value.page.size >= 1 &&
  isNonNegativeInteger(value.page.totalElements) &&
  isNonNegativeInteger(value.page.totalPages);

const isAuthorCollection = (value: unknown): value is { items: Author[] } =>
  isRecord(value) && Array.isArray(value.items) && value.items.every(isAuthor);

function errorDetail(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.message === "string" && value.message.trim())
    return value.message;
  if (typeof value.error === "string" && value.error.trim()) return value.error;
  return undefined;
}

async function request<T>(
  path: string,
  guard: (value: unknown) => value is T,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });

  try {
    if (signal?.aborted) controller.abort();
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!response.ok) {
      let detail: string | undefined;
      if (contentType.includes("application/json")) {
        try {
          detail = errorDetail(await response.json());
        } catch {
          // HTTP status remains useful even when the error body is malformed.
        }
      }
      throw new ApiError("http", response.status, detail);
    }
    if (!contentType.includes("application/json"))
      throw new ApiError("invalid");
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ApiError("invalid");
    }
    if (!guard(data)) throw new ApiError("invalid");
    return data;
  } catch (error) {
    if (timedOut) throw new ApiError("timeout");
    if (signal?.aborted) throw error;
    if (error instanceof ApiError) throw error;
    throw new ApiError("network");
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export function stepQuery(filters: StepFilters): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  filters.styles.forEach((style) => params.append("style", style));
  filters.eras.forEach((era) => params.append("era", era));
  filters.authors.forEach((author) => params.append("author", author));
  params.set("page", String(filters.page));
  params.set("size", "20");
  return params.toString();
}

export const listSteps = (filters: StepFilters, signal?: AbortSignal) =>
  request(`/steps?${stepQuery(filters)}`, isStepPage, signal);

export const getStep = (slug: string, signal?: AbortSignal) =>
  request(`/steps/${encodeURIComponent(slug)}`, isStep, signal);

export const listAuthors = (signal?: AbortSignal) =>
  request("/authors", isAuthorCollection, signal);
