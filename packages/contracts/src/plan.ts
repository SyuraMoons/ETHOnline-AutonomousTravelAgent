import { z } from "zod";
import { SearchResult } from "./flights.js";

export const PlanRequest = z.object({
  mandateId: z.string(),
  origin: z.string(),
  destination: z.string(),
  departDate: z.string(),
  returnDate: z.string().optional(),
  paxCount: z.number().int().positive(),
});
export type PlanRequest = z.infer<typeof PlanRequest>;

/**
 * The stay and activities as itineraryHash() consumes them — the economically
 * material fields only. Everything presentational (hotel name, star rating, the
 * activity's description) is deliberately absent: a supplier renaming a property
 * must not invalidate a human's approval, while a change to what is paid for must.
 */
export const PlanStay = z.object({
  hotelId: z.string(),
  checkInUtc: z.string().datetime(),
  checkOutUtc: z.string().datetime(),
  priceMinor: z.number().int(),
  currency: z.string(),
});
export type PlanStay = z.infer<typeof PlanStay>;

export const PlanActivity = z.object({
  activityId: z.string(),
  startUtc: z.string().datetime(),
  priceMinor: z.number().int(),
  currency: z.string(),
});
export type PlanActivity = z.infer<typeof PlanActivity>;

export const Plan = z.object({
  planId: z.string(),
  itineraryHash: z.string(),
  legs: z.array(SearchResult),
  /** Absent means the trip has no accommodation, which is a valid trip. */
  stay: PlanStay.nullish(),
  /**
   * Optional so a flight-only plan needs no ceremony. itineraryHash() normalises
   * absent and empty to the same thing, since they mean the same thing.
   */
  activities: z.array(PlanActivity).optional(),
  paxCount: z.number().int().positive(),
  fareTotalMinor: z.number().int(),
  currency: z.string(),
  refusals: z.array(z.string()),
  createdAt: z.string().datetime(),
});
export type Plan = z.infer<typeof Plan>;

// Input to itineraryHash() — everything in Plan except the hash itself.
export type PlanInput = Omit<Plan, "itineraryHash">;
