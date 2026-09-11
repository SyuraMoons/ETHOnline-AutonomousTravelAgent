import type { RouteQuery } from "../routes.config.js";

/**
 * One way of getting raw, unnormalised rows for a single route query.
 *
 * Adapters return whatever shape the upstream gives them. Normalisation and
 * validation happen once, in normalize.ts, so a new adapter never has to
 * reimplement the output contract — and a site changing its payload shape is a
 * change in one mapping function, not scattered through fetch code.
 */
export interface FlightSource {
  readonly name: string;
  fetchRoute(query: RouteQuery): Promise<unknown[]>;
  /** Release long-lived resources (a browser held open across queries). */
  close?(): Promise<void>;
}

/** Thrown when a host actively refuses us. Never retried — logged and skipped. */
export class BlockedError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BlockedError";
  }
}

/** Thrown when a recipe is missing or still holds placeholders. */
export class RecipeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecipeError";
  }
}
