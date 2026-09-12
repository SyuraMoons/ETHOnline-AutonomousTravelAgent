import type { SearchResult } from "@sh/contracts";

/**
 * A source of flight rows for data/cache/flights.json.
 *
 * The whole point of this interface is that the *origin* of the data is an
 * implementation detail. `loadCachedFlights()` reads a JSON array; nothing
 * downstream — not the supplier's pricing, not the planner, not the UI — knows
 * or cares whether the rows were generated, pulled from a vendor API, or
 * scraped. Swapping to a live source later means writing one new module here
 * and adding one line to the registry in `./index.ts`. Nothing else changes.
 *
 * Whatever a source returns is validated against the `SearchResult` schema by
 * the driver before anything is written, so a source that drifts from the
 * shared shape fails loudly at generation time rather than at request time.
 */
export interface FlightSource {
  /** Stable id, selected via FLIGHTS_SOURCE and recorded in the provenance file. */
  readonly id: string;
  /** One line shown in the generator's output. */
  readonly description: string;
  fetch(): Promise<SearchResult[]>;
}
