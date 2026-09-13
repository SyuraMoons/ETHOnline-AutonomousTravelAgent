// Chat thread
import { ChatDossierCard } from "./ChatDossierCard";
import { ChatFlightCard } from "./ChatFlightCard";
import { ChatRunSteps } from "./ChatRunSteps";
import { budgetNudgeText } from "./budgetNudge";
import type { ChatMessage } from "~~/types/autovoyage/plan";

export function ChatThread({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      {messages.map((m, i) =>
        m.from === "user" ? (
          <div key={m.id ?? i} className="flex flex-col items-end">
            <div className="max-w-[85%] rounded-lg rounded-tr-sm bg-av-blue px-4 py-2.5 text-[14px] leading-relaxed text-av-paper">
              {m.text}
            </div>
            <span className="mt-1 text-[11px] text-av-muted">{m.time}</span>
          </div>
        ) : (
          <div key={m.id ?? i} className="flex flex-col items-start gap-2">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-av-blue" />
              <span className="text-[13px] font-semibold text-av-text">Agent</span>
              <span className="text-[11px] text-av-muted">{m.time}</span>
            </div>
            {m.steps && m.steps.length > 0 ? <ChatRunSteps steps={m.steps} /> : null}
            {m.text ? (
              <div className="max-w-[85%] rounded-lg rounded-tl-sm bg-av-bg px-4 py-2.5 text-[14px] leading-relaxed text-av-text">
                {m.text}
              </div>
            ) : null}
            {m.results ? (
              <div className="flex w-full max-w-[560px] flex-col gap-2">
                {m.results.map((r, j) => (
                  <ChatFlightCard key={j} option={r} />
                ))}
              </div>
            ) : null}
            {m.dossier && m.id ? <ChatDossierCard messageId={m.id} dossier={m.dossier} booking={m.booking} /> : null}
            {m.budgetRequest ? (
              <div className="max-w-[85%] rounded-lg rounded-tl-sm bg-av-bg px-4 py-2.5 text-[14px] leading-relaxed text-av-text">
                {budgetNudgeText(m.budgetRequest.reasonNote)}
              </div>
            ) : null}
          </div>
        ),
      )}
    </div>
  );
}
