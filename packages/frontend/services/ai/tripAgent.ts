// Tool-calling variant of travelAgent.ts, for the autonomous multi-step run
// (services/autovoyage/autonomousRun.ts owns the loop and every guardrail — this file only
// wraps one OpenRouter chat-completions call with a fixed tool list).
//
// The money invariant from travelAgent.ts still holds: the model never sees an HBAR amount,
// never chooses whether to pay, and never confirms a booking — every mandate check happens in
// TypeScript before autonomousRun.ts executes a tool. What the model DOES see, deliberately,
// is the USD fare (priceMinor) on each search result, because picking the best-value flight
// pair is the one judgment call this run asks it to make. Never surface an HBAR figure to it.
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";

export type TripAgentMessage = ChatCompletionMessageParam;

export class TripAgentError extends Error {}

function client(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new TripAgentError("OPENROUTER_API_KEY is not set");
  return new OpenAI({ apiKey, baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1" });
}

const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_flights",
      description:
        "Search real, paid flight inventory in one direction. Each call costs real money — you may call this " +
        "at most twice in a run (typically once outbound, once return). Never call it a third time.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          origin: { type: "string", description: "Origin city or airport code" },
          destination: { type: "string", description: "Destination city or airport code" },
          departDate: { type: "string", description: "ISO 8601 date, e.g. 2026-11-12" },
          paxCount: { type: "integer", minimum: 1, description: "Number of travellers" },
        },
        required: ["origin", "destination", "departDate", "paxCount"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_itinerary",
      description:
        "Record a short day-by-day plan of activity suggestions for the trip. This is free and NOT a real " +
        "booking — never include prices or claim anything is reserved. Call this once, after you have picked " +
        "a flight pair, and before finalize.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "array",
            items: {
              type: "object",
              properties: {
                dayNumber: { type: "integer", minimum: 1 },
                date: { type: "string", description: "ISO 8601 date" },
                title: { type: "string" },
                notes: { type: "string" },
                suggestions: { type: "array", items: { type: "string" } },
              },
              required: ["dayNumber", "date", "title", "notes", "suggestions"],
              additionalProperties: false,
            },
          },
        },
        required: ["days"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finalize",
      description:
        "End the run: report which searched flight offer(s) to book and a short summary. Call this only after " +
        "at least one search_flights call and one draft_itinerary call.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          outboundOfferId: { type: "string", description: "offerId of the chosen outbound flight" },
          inboundOfferId: { type: ["string", "null"], description: "offerId of the chosen return flight, or null" },
          summary: { type: "string", description: "One or two sentences explaining the choice" },
        },
        required: ["outboundOfferId", "inboundOfferId", "summary"],
        additionalProperties: false,
      },
    },
  },
];

function systemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return (
    `You are the AutoVoyage autonomous travel agent. Today is ${today}; resolve relative ` +
    "dates against it and never ask the user for the year. Work through the user's brief on " +
    "your own using the tools available — do not ask the user follow-up questions, make " +
    "reasonable assumptions instead. " +
    "Call search_flights for the outbound leg, and again for the return leg only if the trip " +
    "is a round trip — at most twice total, ever. After searching, call draft_itinerary once " +
    "with a short suggested day plan (no prices, no booking claims — these are ideas, not " +
    "reservations). Then call finalize, naming the offerId(s) of the flight(s) you'd book. " +
    "Never invent or mention HBAR amounts, fares beyond what search_flights returned, or " +
    "booking confirmations — you have no access to payment or booking systems."
  );
}

/** One model turn: returns the assistant message (content and/or tool_calls). The caller
 * appends it to the transcript and, for each tool call, a role:"tool" result before calling
 * this again — standard OpenAI tool-calling loop. */
export async function runTripAgentStep(messages: TripAgentMessage[]) {
  const completion = await client().chat.completions.create({
    model: process.env.OPENROUTER_MODEL ?? "openai/gpt-5.6-luna",
    messages: [{ role: "system", content: systemPrompt() }, ...messages],
    tools: TOOLS,
    tool_choice: "auto",
  });

  const message = completion.choices[0]?.message;
  if (!message) throw new TripAgentError("model returned no message");
  return message;
}
