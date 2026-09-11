import type { Activity, ActivityCategory, ActivityPace } from "@sh/contracts";
import {
  hashSeed,
  intBetween,
  pick,
  roundPrice,
  streamFor,
} from "../lib/random.js";

// Deterministic activity catalogue, one record per bookable experience.
//
// Names are composed rather than borrowed: the prices and availability here are
// invented, so naming a real operator would be fabricating a record about a real
// business.
//
// Two constraints keep the output from reading as machine-generated, which is
// what a glance at the data would otherwise reveal immediately:
//
//   - every template declares the times it can actually run at, so a sunrise
//     hike never starts at 16:00 and a night market never opens at 09:00
//   - every template declares the kind of place it needs, so a coastal kayak is
//     never scheduled somewhere landlocked

type PlaceTrait = "coastal" | "nature" | "urban" | "temple" | "market";

interface Place {
  name: string;
  traits: PlaceTrait[];
}

const EARLY = ["05:30", "06:00", "06:30"];
const MORNING = ["08:00", "09:00", "10:00"];
const MIDDAY = ["11:00", "12:00", "13:00"];
const AFTERNOON = ["14:00", "15:00", "16:00"];
const EVENING = ["17:30", "18:30", "19:30"];
const NIGHT = ["19:00", "20:00", "21:00"];

interface Template {
  category: ActivityCategory;
  pace: ActivityPace;
  /** {place} is filled from a place in this city that satisfies `requires`. */
  name: string;
  summary: string;
  durationMinutes: [number, number];
  /** USD cents, before the city cost index. */
  priceBand: [number, number];
  indoor: boolean;
  /** Slots this activity can genuinely run at. */
  slots: string[];
  /** A place must have at least one of these traits. */
  requires: PlaceTrait[];
}

const TEMPLATES: Template[] = [
  {
    category: "nature",
    pace: "calm",
    name: "Forest bathing at {place}",
    summary: "Slow guided walk under old trees, phones away",
    durationMinutes: [150, 260],
    priceBand: [3200, 6800],
    indoor: false,
    slots: MORNING,
    requires: ["nature"],
  },
  {
    category: "culture",
    pace: "calm",
    name: "{place} morning temple walk",
    summary: "Early visit before the crowds, with a local historian",
    durationMinutes: [90, 160],
    priceBand: [2200, 5200],
    indoor: false,
    slots: EARLY,
    requires: ["temple"],
  },
  {
    category: "art",
    pace: "calm",
    name: "{place} immersive art rooms",
    summary: "Digital installation you walk through barefoot",
    durationMinutes: [90, 140],
    priceBand: [2600, 5400],
    indoor: true,
    slots: [...MIDDAY, ...AFTERNOON],
    requires: ["urban"],
  },
  {
    category: "wellness",
    pace: "calm",
    name: "Bathhouse afternoon at {place}",
    summary: "Thermal pools, cold plunge, quiet room",
    durationMinutes: [120, 200],
    priceBand: [3000, 7800],
    indoor: true,
    slots: [...AFTERNOON, ...EVENING],
    requires: ["urban", "nature"],
  },
  {
    category: "food",
    pace: "calm",
    name: "Tea ceremony in {place}",
    summary: "Private host, two hours, no rushing",
    durationMinutes: [80, 130],
    priceBand: [3400, 7200],
    indoor: true,
    slots: MIDDAY,
    requires: ["urban", "temple"],
  },
  {
    category: "food",
    pace: "balanced",
    name: "{place} street food crawl",
    summary: "Six stops, one guide, come hungry",
    durationMinutes: [150, 220],
    priceBand: [3800, 8600],
    indoor: false,
    slots: EVENING,
    requires: ["market", "urban"],
  },
  {
    category: "culture",
    pace: "balanced",
    name: "{place} neighbourhood photo walk",
    summary: "Backstreets, markets, and a rooftop finish",
    durationMinutes: [120, 190],
    priceBand: [2800, 6200],
    indoor: false,
    slots: [...MORNING, ...AFTERNOON],
    requires: ["urban"],
  },
  {
    category: "shopping",
    pace: "balanced",
    name: "{place} craft market tour",
    summary: "Independent makers, ceramics, textiles",
    durationMinutes: [100, 170],
    priceBand: [1800, 4400],
    indoor: false,
    slots: MORNING,
    requires: ["market"],
  },
  {
    category: "art",
    pace: "balanced",
    name: "{place} gallery hop",
    summary: "Three small galleries and a printmaker's studio",
    durationMinutes: [130, 200],
    priceBand: [2400, 5600],
    indoor: true,
    slots: [...MIDDAY, ...AFTERNOON],
    requires: ["urban"],
  },
  {
    category: "nightlife",
    pace: "balanced",
    name: "{place} after dark",
    summary: "Listening bar, night market, last train home",
    durationMinutes: [160, 250],
    priceBand: [3600, 8800],
    indoor: true,
    slots: NIGHT,
    requires: ["urban"],
  },
  {
    category: "nature",
    pace: "adventurous",
    name: "Sunrise hike above {place}",
    summary: "Pre-dawn start, steep, worth it",
    durationMinutes: [240, 400],
    priceBand: [4200, 9800],
    indoor: false,
    slots: EARLY,
    requires: ["nature"],
  },
  {
    category: "nature",
    pace: "adventurous",
    name: "{place} coastal kayak",
    summary: "Sea caves and a beach landing for lunch",
    durationMinutes: [200, 330],
    priceBand: [4800, 11200],
    indoor: false,
    slots: MORNING,
    requires: ["coastal"],
  },
  {
    category: "food",
    pace: "adventurous",
    name: "Night market deep dive, {place}",
    summary: "The stalls locals queue at, nothing translated",
    durationMinutes: [150, 240],
    priceBand: [2600, 6400],
    indoor: false,
    slots: NIGHT,
    requires: ["market"],
  },
  {
    category: "culture",
    pace: "adventurous",
    name: "{place} cycling loop",
    summary: "Thirty kilometres through the old quarter and out",
    durationMinutes: [220, 360],
    priceBand: [3400, 7600],
    indoor: false,
    slots: MORNING,
    requires: ["urban", "nature"],
  },
  {
    category: "wellness",
    pace: "adventurous",
    name: "Dawn surf lesson at {place}",
    summary: "Beginner-friendly break, board included",
    durationMinutes: [150, 230],
    priceBand: [4000, 9000],
    indoor: false,
    slots: EARLY,
    requires: ["coastal"],
  },
];

interface CityProfile {
  city: string;
  costIndex: number;
  places: Place[];
  count: number;
}

const CITIES: CityProfile[] = [
  {
    city: "NRT",
    costIndex: 1.3,
    count: 26,
    places: [
      { name: "Okutama", traits: ["nature"] },
      { name: "Yanaka", traits: ["urban", "temple"] },
      { name: "Shimokitazawa", traits: ["urban", "market"] },
      { name: "Kamakura", traits: ["coastal", "temple", "nature"] },
      { name: "Nakameguro", traits: ["urban"] },
      { name: "Takao", traits: ["nature", "temple"] },
    ],
  },
  {
    city: "SIN",
    costIndex: 1.2,
    count: 22,
    places: [
      { name: "Tiong Bahru", traits: ["urban", "market"] },
      { name: "Pulau Ubin", traits: ["nature", "coastal"] },
      { name: "Kampong Glam", traits: ["urban", "market"] },
      { name: "Katong", traits: ["urban"] },
      { name: "the Southern Ridges", traits: ["nature"] },
      { name: "Little India", traits: ["urban", "market", "temple"] },
    ],
  },
  {
    city: "DPS",
    costIndex: 0.75,
    count: 28,
    places: [
      { name: "Ubud", traits: ["nature", "temple", "market"] },
      { name: "Sidemen", traits: ["nature"] },
      { name: "Amed", traits: ["coastal"] },
      { name: "Munduk", traits: ["nature"] },
      { name: "Canggu", traits: ["coastal", "urban"] },
      { name: "Nusa Lembongan", traits: ["coastal", "nature"] },
    ],
  },
  {
    city: "CGK",
    costIndex: 0.7,
    count: 20,
    places: [
      { name: "Kota Tua", traits: ["urban", "market"] },
      { name: "Kemang", traits: ["urban"] },
      { name: "Pulau Seribu", traits: ["coastal", "nature"] },
      { name: "Menteng", traits: ["urban"] },
      { name: "Glodok", traits: ["market", "urban", "temple"] },
      { name: "Ancol", traits: ["coastal"] },
    ],
  },
  {
    city: "BKK",
    costIndex: 0.78,
    count: 24,
    places: [
      { name: "Thonburi", traits: ["urban", "temple"] },
      { name: "Rattanakosin", traits: ["temple", "urban"] },
      { name: "Bang Krachao", traits: ["nature"] },
      { name: "Ari", traits: ["urban"] },
      { name: "Talat Noi", traits: ["urban", "market"] },
      { name: "Chatuchak", traits: ["market"] },
    ],
  },
  {
    city: "KUL",
    costIndex: 0.72,
    count: 20,
    places: [
      { name: "Bukit Nanas", traits: ["nature"] },
      { name: "Kampung Baru", traits: ["urban", "market"] },
      { name: "Batu Caves", traits: ["temple", "nature"] },
      { name: "Brickfields", traits: ["urban", "temple"] },
      { name: "Bangsar", traits: ["urban"] },
      { name: "Sekinchan", traits: ["coastal", "nature"] },
    ],
  },
  {
    city: "HKG",
    costIndex: 1.25,
    count: 22,
    places: [
      { name: "Sai Kung", traits: ["coastal", "nature"] },
      { name: "Sheung Wan", traits: ["urban", "market"] },
      { name: "Lamma Island", traits: ["coastal", "nature"] },
      { name: "Tai O", traits: ["coastal", "market"] },
      { name: "Dragon's Back", traits: ["nature"] },
      { name: "Yau Ma Tei", traits: ["urban", "market", "temple"] },
    ],
  },
  {
    city: "SYD",
    costIndex: 1.15,
    count: 22,
    places: [
      { name: "Bondi", traits: ["coastal", "urban"] },
      { name: "the Blue Mountains", traits: ["nature"] },
      { name: "Newtown", traits: ["urban", "market"] },
      { name: "Manly", traits: ["coastal"] },
      { name: "Barangaroo", traits: ["urban"] },
      { name: "the Royal National Park", traits: ["nature", "coastal"] },
    ],
  },
];

const CURRENCY = "USD";

export function generateActivities(seed: number): Activity[] {
  const activities: Activity[] = [];

  for (const profile of CITIES) {
    // Templates are cycled rather than sampled, so every city gets a spread of
    // paces and categories instead of a random clump — a city with no calm
    // options would just look broken to the planner.
    //
    // The starting offset comes from the city, so when a city's count is not a
    // multiple of the template list the surplus lands on a different pace each
    // time. Without this every city ends up with an identical pace split.
    const offset = hashSeed(profile.city) % TEMPLATES.length;

    // Template+place pairs already used in this city, so the same experience at
    // the same location is not emitted twice under different ids.
    const usedPlaces = new Map<number, Set<string>>();

    let produced = 0;
    let step = 0;
    // Enough cycles to try every template against every place; `count` is a
    // ceiling, not a quota, so a city short on suitable places simply offers less.
    const maxSteps = TEMPLATES.length * (profile.places.length + 1);

    while (produced < profile.count && step < maxSteps) {
      const templateIndex = (step + offset) % TEMPLATES.length;
      const template = TEMPLATES[templateIndex]!;
      step += 1;

      // Only somewhere the activity could actually happen. If a city has no
      // suitable place the template is SKIPPED, not relocated — Bangkok has no
      // coast, so it should simply offer no sea kayaking rather than advertise
      // it somewhere inland.
      const suitable = profile.places.filter((place) =>
        template.requires.some((trait) => place.traits.includes(trait)),
      );
      if (suitable.length === 0) continue;

      const activityId = `act_${profile.city.toLowerCase()}_${String(produced + 1).padStart(3, "0")}`;
      const rand = streamFor(activityId, seed);

      // Once every suitable place for this template is used, skip it rather
      // than repeating: two ids describing the same experience at the same
      // place is the clearest tell that data was generated. A city with one
      // stretch of coast therefore offers one sea kayak, not four.
      const used = usedPlaces.get(templateIndex) ?? new Set<string>();
      const unused = suitable.filter((place) => !used.has(place.name));
      if (unused.length === 0) continue;

      const place = pick(rand, unused);
      used.add(place.name);
      usedPlaces.set(templateIndex, used);

      const [minDuration, maxDuration] = template.durationMinutes;
      const [low, high] = template.priceBand;

      activities.push({
        activityId,
        city: profile.city,
        name: template.name.replace("{place}", place.name),
        summary: template.summary,
        category: template.category,
        pace: template.pace,
        // Rounded to five minutes: nothing is scheduled to the minute.
        durationMinutes:
          Math.round(intBetween(rand, minDuration, maxDuration) / 5) * 5,
        priceMinor: roundPrice(
          (low + rand() * (high - low)) * profile.costIndex,
          100,
        ),
        currency: CURRENCY,
        indoor: template.indoor,
        startTimes: pickSlots(rand, template.slots),
      });
      produced += 1;
    }
  }

  return activities;
}

/** Two or three slots from the template's own window, ordered and distinct. */
function pickSlots(rand: () => number, slots: string[]): string[] {
  const wanted = Math.min(intBetween(rand, 2, 3), slots.length);
  const chosen = new Set<string>();
  let guard = 0;
  while (chosen.size < wanted && guard < 50) {
    chosen.add(pick(rand, slots));
    guard += 1;
  }
  return [...chosen].sort();
}

export const ACTIVITY_CITIES = CITIES.map((profile) => profile.city);
export const ACTIVITY_COUNT = CITIES.reduce(
  (total, profile) => total + profile.count,
  0,
);
