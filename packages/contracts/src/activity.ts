import { z } from "zod";

// Things to do at the destination. Same two-shape split as Stay: a catalogue
// record, and a priced offer bound to a specific start time.

export const ActivityPace = z.enum(["calm", "balanced", "adventurous"]);
export type ActivityPace = z.infer<typeof ActivityPace>;

export const ActivityCategory = z.enum([
  "culture",
  "food",
  "nature",
  "art",
  "nightlife",
  "wellness",
  "shopping",
]);
export type ActivityCategory = z.infer<typeof ActivityCategory>;

export const Activity = z.object({
  activityId: z.string(),
  city: z.string().length(3),
  name: z.string(),
  summary: z.string(),
  category: ActivityCategory,
  pace: ActivityPace,
  durationMinutes: z.number().int().positive(),
  priceMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
  indoor: z.boolean(),
  /** Local start times the activity runs at, "HH:mm". */
  startTimes: z.array(z.string()),
});
export type Activity = z.infer<typeof Activity>;

// One bookable slot. As with StayOffer, the first four fields are what
// itineraryHash will consume; the rest is presentational.
export const ActivityOffer = z.object({
  activityId: z.string(),
  startUtc: z.string().datetime(),
  priceMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),

  // Presentational below this line.
  name: z.string(),
  summary: z.string(),
  city: z.string().length(3),
  category: ActivityCategory,
  pace: ActivityPace,
  durationMinutes: z.number().int().positive(),
  indoor: z.boolean(),
});
export type ActivityOffer = z.infer<typeof ActivityOffer>;
