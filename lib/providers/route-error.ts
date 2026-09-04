/**
 * A failed call to one of this app's own routes, carrying the status alongside
 * the public message. Every provider client throws this so callers can tell a
 * transient outage — worth trying again on its own — from a settled refusal
 * that will fail identically forever.
 *
 * Status 0 means the request never reached the network.
 */
export class RouteError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'RouteError';
  }
}

/** Duck-typed: a status survives even when the error crossed a mock or a wrapper. */
export function routeStatus(error: unknown): number | undefined {
  if (error === null || typeof error !== 'object') return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}
