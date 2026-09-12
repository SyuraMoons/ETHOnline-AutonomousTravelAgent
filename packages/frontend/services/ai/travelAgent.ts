// One bounded LLM call per turn: the agent either *chats* (greeting, question,
// asking for a missing trip detail) or *plans* (it has enough to search flights).
// The model never sees or returns a price and never confirms a booking (see
// AGENTS.md "Target Build" — LLM never touches money); the schema below has no
// price field at all. Provider is OpenRouter (OpenAI-compatible), isolated here
// so the provider/model can change without touching the /api/plan route.
import OpenAI from "openai";

export type AgentTurnMessage = { role: "user" | "assistant"; content: string };

export type Trip = {
  origin: string;
  destination: string;
  departDate: string; // ISO date, e.g. "2026-11-12"
  returnDate?: string;
  paxCount: number;
};

export type AgentTurn = {
  intent: "chat" | "plan";
  reply: string;
  trip: Trip | null;
};

export class AgentTurnError extends Error {}

function systemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return (
    `You are the AutoVoyage travel planning agent. Today is ${today}; resolve ` +
    "relative dates against it and never ask the user for the year. " +
    "Set intent=plan only when you have origin, destination, departure date and " +
    "passenger count — then fill trip with ISO 8601 dates. Otherwise set " +
    "intent=chat with trip=null, and use reply to answer the user or ask for the " +
    "single most important missing detail. " +
    "Never invent or mention prices, fares, or booking confirmations — you have " +
    "no access to pricing or booking systems."
  );
}

// Strict structured-output mode requires every key in `properties` to also
// appear in `required` — optional fields are expressed as nullable, not by
// omission (one-way trip -> returnDate: null; chat turn -> trip: null).
const TURN_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["chat", "plan"] },
    reply: { type: "string", description: "Short conversational reply to show the user." },
    trip: {
      type: ["object", "null"],
      properties: {
        origin: { type: "string" },
        destination: { type: "string" },
        departDate: { type: "string", description: "ISO 8601 date, e.g. 2026-11-12" },
        returnDate: { type: ["string", "null"], description: "ISO 8601 date, null if one-way" },
        paxCount: { type: "integer", minimum: 1 },
      },
      required: ["origin", "destination", "departDate", "returnDate", "paxCount"],
      additionalProperties: false,
    },
  },
  required: ["intent", "reply", "trip"],
  additionalProperties: false,
} as const;

function client(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new AgentTurnError("OPENROUTER_API_KEY is not set");
  return new OpenAI({ apiKey, baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1" });
}

export async function runAgentTurn(messages: AgentTurnMessage[]): Promise<AgentTurn> {
  if (messages.length === 0) throw new AgentTurnError("no messages to respond to");

  const completion = await client().chat.completions.create({
    model: process.env.OPENROUTER_MODEL ?? "openai/gpt-5.6-luna",
    messages: [{ role: "system", content: systemPrompt() }, ...messages],
    response_format: {
      type: "json_schema",
      json_schema: { name: "agent_turn", strict: true, schema: TURN_SCHEMA },
    },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new AgentTurnError("model returned no content");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AgentTurnError("model returned invalid JSON");
  }

  const { intent, reply, trip } = parsed as {
    intent?: string;
    reply?: string;
    trip?: (Partial<Trip> & { returnDate?: string | null }) | null;
  };

  if (!reply || (intent !== "chat" && intent !== "plan")) {
    throw new AgentTurnError("model output missing intent or reply");
  }

  // Only a planning turn has to carry a usable trip; a chat turn legitimately
  // has none (a greeting, or a question back to the user).
  if (intent === "chat") return { intent, reply, trip: null };

  if (
    !trip?.origin ||
    !trip.destination ||
    !trip.departDate ||
    typeof trip.paxCount !== "number" ||
    trip.paxCount < 1
  ) {
    throw new AgentTurnError("model planned a trip but left required fields empty");
  }

  return {
    intent,
    reply,
    trip: {
      origin: trip.origin,
      destination: trip.destination,
      departDate: trip.departDate,
      returnDate: trip.returnDate ?? undefined,
      paxCount: trip.paxCount,
    },
  };
}
