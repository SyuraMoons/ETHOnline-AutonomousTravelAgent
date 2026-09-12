import type { Stay } from "@sh/contracts";
import {
  intBetween,
  pick,
  pickSome,
  roundPrice,
  streamFor,
} from "../lib/random.js";

// Deterministic hotel catalogue, one record per property.
//
// Property names are composed from neutral word lists rather than taken from
// real hotels. This dataset carries invented prices and invented availability,
// so attaching a real business's name to it would be fabricating a record about
// that business. Everything here is plainly fictional.

interface CityProfile {
  /** IATA code, matching flight destinations. */
  city: string;
  /** Multiplier on the base band — Tokyo is not Denpasar. */
  costIndex: number;
  areas: string[];
  /** Name fragments that read as local without naming a real property. */
  prefixes: string[];
  hotelCount: number;
}

const CITIES: CityProfile[] = [
  {
    city: "NRT",
    costIndex: 1.35,
    areas: ["Shinjuku", "Shibuya", "Asakusa", "Ginza", "Nakameguro", "Yanaka"],
    prefixes: [
      "Asagiri",
      "Kaiyo",
      "Hoshizora",
      "Midori",
      "Tsukiji",
      "Kogarashi",
      "Shirakaba",
    ],
    hotelCount: 22,
  },
  {
    city: "SIN",
    costIndex: 1.25,
    areas: [
      "Marina Bay",
      "Tiong Bahru",
      "Kampong Glam",
      "Orchard",
      "Chinatown",
      "Katong",
    ],
    prefixes: [
      "Peranakan",
      "Straits",
      "Lantern",
      "Tanjong",
      "Bougainvillea",
      "Merlion Gate",
      "Raffles Quay",
    ],
    hotelCount: 20,
  },
  {
    city: "DPS",
    costIndex: 0.78,
    areas: ["Seminyak", "Ubud", "Canggu", "Sanur", "Uluwatu", "Jimbaran"],
    prefixes: [
      "Bale",
      "Tirta",
      "Segara",
      "Amerta",
      "Padi",
      "Kirana",
      "Wanagiri",
    ],
    hotelCount: 24,
  },
  {
    city: "CGK",
    costIndex: 0.72,
    areas: ["Menteng", "Kemang", "Senayan", "Kuningan", "Kota Tua", "SCBD"],
    prefixes: [
      "Cendana",
      "Bintaro",
      "Melati",
      "Ancol",
      "Pasar Baru",
      "Kebayoran",
      "Tugu",
    ],
    hotelCount: 18,
  },
  {
    city: "BKK",
    costIndex: 0.82,
    areas: [
      "Sukhumvit",
      "Riverside",
      "Silom",
      "Ari",
      "Thonglor",
      "Rattanakosin",
    ],
    prefixes: [
      "Sala Thip",
      "Khlong",
      "Benjasiri",
      "Chao Phraya",
      "Lumphini",
      "Suan Dok",
      "Bang Rak",
    ],
    hotelCount: 20,
  },
  {
    city: "KUL",
    costIndex: 0.75,
    areas: [
      "Bukit Bintang",
      "KLCC",
      "Bangsar",
      "Chow Kit",
      "Damansara",
      "Brickfields",
    ],
    prefixes: [
      "Angsana",
      "Tanglin",
      "Sri Hartamas",
      "Rimba",
      "Selayang",
      "Bunga Raya",
      "Pudu",
    ],
    hotelCount: 18,
  },
  {
    city: "HKG",
    costIndex: 1.3,
    areas: [
      "Central",
      "Sheung Wan",
      "Tsim Sha Tsui",
      "Causeway Bay",
      "Wan Chai",
      "Sai Ying Pun",
    ],
    prefixes: [
      "Harbour Rise",
      "Pok Fu",
      "Tai Ping",
      "Lantau View",
      "Bonham",
      "Kennedy",
      "Sai Kung",
    ],
    hotelCount: 18,
  },
  {
    city: "SYD",
    costIndex: 1.2,
    areas: [
      "Surry Hills",
      "The Rocks",
      "Bondi",
      "Newtown",
      "Darlinghurst",
      "Manly",
    ],
    prefixes: [
      "Waratah",
      "Jacaranda",
      "Coogee",
      "Woolloomooloo",
      "Paperbark",
      "Gundawarra",
      "Banksia",
    ],
    hotelCount: 18,
  },
];

const SUFFIXES = [
  "House",
  "Residences",
  "Hotel",
  "Quarters",
  "Lodge",
  "Rooms",
  "Collection",
  "Stay",
];

const ROOM_TYPES_BY_STAR: Record<number, string[]> = {
  2: ["Standard Twin", "Compact Double", "Standard Double"],
  3: ["Superior Double", "Standard King", "Deluxe Twin"],
  4: ["Deluxe King", "Executive Twin", "Premier Double"],
  5: ["Deluxe King", "Junior Suite", "Panorama Suite", "Corner Suite"],
};

const AMENITIES = [
  "Free WiFi",
  "Breakfast included",
  "Airport transfer",
  "Pool",
  "Gym",
  "Onsen",
  "Rooftop bar",
  "Laundry",
  "Co-working desk",
  "Family rooms",
  "Airport shuttle",
  "Spa",
];

/** Nightly rate band by star rating, in USD cents before the city index. */
const BASE_BAND: Record<number, [number, number]> = {
  2: [3200, 5800],
  3: [5600, 9400],
  4: [9200, 16800],
  5: [17500, 42000],
};

const CURRENCY = "USD";

export function generateStays(seed: number): Stay[] {
  const stays: Stay[] = [];

  for (const profile of CITIES) {
    // Names come from a deterministically shuffled cross-product rather than
    // two independent picks. Picking prefix and suffix separately collides far
    // more often than it looks like it should — with 7 prefixes and 8 suffixes
    // across 20 hotels, a repeat is likely, and two properties sharing a name
    // in one city is an obvious tell.
    const names = shuffled(
      profile.prefixes.flatMap((prefix) =>
        SUFFIXES.map((suffix) => `${prefix} ${suffix}`),
      ),
      streamFor(`${profile.city}:names`, seed),
    );
    if (names.length < profile.hotelCount) {
      throw new Error(
        `${profile.city}: ${profile.hotelCount} hotels wanted but only ${names.length} distinct names available`,
      );
    }

    for (let index = 0; index < profile.hotelCount; index += 1) {
      // Seeded per property, so adding a city never renumbers another one and
      // raising hotelCount only appends.
      const hotelId = `htl_${profile.city.toLowerCase()}_${String(index + 1).padStart(3, "0")}`;
      const rand = streamFor(hotelId, seed);

      // The first four properties in every city take one tier each, so a city
      // always has something at every star level. Left purely to the random
      // draw, Tokyo came out with zero five-star hotels — plausible as a dice
      // roll, implausible as a city, and it makes "find me somewhere nice in
      // Tokyo" return nothing.
      //
      // The rest skew towards 3-4 stars, which is what a real city's inventory
      // looks like and keeps the mandate story interesting: most affordable,
      // some not.
      const roll = rand();
      const starRating =
        index < 4
          ? index + 2
          : roll < 0.18
            ? 2
            : roll < 0.52
              ? 3
              : roll < 0.85
                ? 4
                : 5;

      const [low, high] = BASE_BAND[starRating]!;
      const baseNightlyPriceMinor = roundPrice(
        (low + rand() * (high - low)) * profile.costIndex,
        100,
      );

      stays.push({
        hotelId,
        city: profile.city,
        name: names[index]!,
        area: pick(rand, profile.areas),
        starRating,
        roomType: pick(rand, ROOM_TYPES_BY_STAR[starRating]!),
        baseNightlyPriceMinor,
        currency: CURRENCY,
        // Cheaper rooms are far more often non-refundable.
        refundable: rand() < (starRating >= 4 ? 0.7 : 0.35),
        maxGuests:
          starRating >= 4 ? intBetween(rand, 2, 4) : intBetween(rand, 2, 3),
        amenities: pickSome(rand, AMENITIES, intBetween(rand, 3, 6)),
      });
    }
  }

  return stays;
}

/** Fisher-Yates with a seeded stream, so the order is stable per seed. */
function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export const STAY_CITIES = CITIES.map((profile) => profile.city);
export const STAY_COUNT = CITIES.reduce(
  (total, profile) => total + profile.hotelCount,
  0,
);
