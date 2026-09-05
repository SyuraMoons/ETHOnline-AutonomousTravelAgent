import { z } from "zod";
import { SearchResult } from "./flights.js";

export const PlanRequest = z.object({
  mandateId: z.string(),
  origin: z.string(),
  destination: z.string(),
  departDate: z.string(),
  returnDate: z.string().optional(),
  budgetHbar: z.number(),
});
export type PlanRequest = z.infer<typeof PlanRequest>;

export const Plan = z.object({
  planId: z.string(),
  itineraryHash: z.string(),
  legs: z.array(SearchResult),
  totalPriceHbar: z.number(),
  refusals: z.array(z.string()),
  createdAt: z.string().datetime(),
});
export type Plan = z.infer<typeof Plan>;

export type PlanInput = Omit<Plan, "itineraryHash">;
