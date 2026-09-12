// Shared copy for the chat-side nudge shown when the agent has no valid authorization — the
// full authorize/allowance form lives in the sidebar (BudgetCard), not in chat.
export function budgetNudgeText(reasonNote?: string): string {
  return reasonNote
    ? `${reasonNote} — set your spending budget in the sidebar to continue.`
    : "Set your spending budget in the sidebar to continue.";
}
