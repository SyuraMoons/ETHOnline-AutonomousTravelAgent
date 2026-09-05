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

export const Plan = z.object({
  planId: z.string(),
  itineraryHash: z.string(),
  legs: z.array(SearchResult),
  paxCount: z.number().int().positive(),
  fareTotalMinor: z.number().int(),
  currency: z.string(),
  refusals: z.array(z.string()),
  createdAt: z.string().datetime(),
});
export type Plan = z.infer<typeof Plan>;

// Input to itineraryHash() — everything in Plan except the hash itself.
export type PlanInput = Omit<Plan, "itineraryHash">;
