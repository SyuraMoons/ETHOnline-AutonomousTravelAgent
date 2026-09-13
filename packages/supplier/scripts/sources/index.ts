import { generatedSource } from "./generated.js";
import type { FlightSource } from "./types.js";

export type { FlightSource } from "./types.js";

export interface SourceOptions {
  seed: number;
  startDate: string;
}

/**
 * The registry the driver selects from via FLIGHTS_SOURCE.
 *
 * Adding a live source is a two-step change and touches nothing else:
 *   1. write ./amadeus.ts (or ./scrape.ts) exporting a FlightSource
 *   2. add one line here
 *
 * A live source belongs behind this same interface precisely because it is the
 * unreliable one: it runs offline as a one-off job, its output is committed,
 * and the request path never depends on it being reachable.
 */
export function resolveSource(
  id: string,
  options: SourceOptions,
): FlightSource {
  switch (id) {
    case "generated":
      return generatedSource(options);
    default:
      throw new Error(`Unknown FLIGHTS_SOURCE "${id}". Available: generated`);
  }
}
