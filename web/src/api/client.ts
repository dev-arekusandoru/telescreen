import createClient from "openapi-fetch";
import { NetworkError, toApiError } from "./errors";
import type { paths } from "./schema";

/** fetch wrapper: transport failures become NetworkError (AbortError passes through). */
const trackedFetch: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, init);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new NetworkError("Can't reach Telescreen", { cause });
  }
};

/**
 * Typed client for /api/v1. Paths are relative to the base URL, so write
 * `client.GET("/members")`, not `/api/v1/members`. Regenerate types with `pnpm openapi`.
 *
 * Prefer `unwrap(client.GET(...))` in query/mutation functions: it returns the
 * data or throws ApiError, which is what TanStack Query wants.
 */
export const client = createClient<paths>({
  // Absolute (same origin) because openapi-fetch builds `new Request(url)`, which
  // rejects relative URLs outside a browser (jsdom tests, Node).
  baseUrl: `${globalThis.location?.origin ?? "http://localhost"}/api/v1`,
  // Wrapped lazily so tests can stub the global fetch after import.
  fetch: (req) => trackedFetch(req),
});

interface FetchResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/** Await an openapi-fetch call and return its data, or throw ApiError from the `{ error }` body. */
export async function unwrap<T>(request: Promise<FetchResult<T>>): Promise<T> {
  const { data, error, response } = await request;
  if (!response.ok) throw toApiError(response.status, error);
  return data as T;
}
