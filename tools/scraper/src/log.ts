// Tiny logger. No dependency: this tool's whole value is being easy to run and
// easy to debug, and a logging framework helps with neither.

const COLOR = process.stdout.isTTY && !process.env["NO_COLOR"];
const ESC = "\x1b";
const paint = (code: string, text: string): string => (COLOR ? `${ESC}[${code}m${text}${ESC}[0m` : text);

export const log = {
  info: (msg: string): void => console.log(`${paint("36", "[scraper]")} ${msg}`),
  warn: (msg: string): void => console.warn(`${paint("33", "[warn]")}    ${msg}`),
  error: (msg: string): void => console.error(`${paint("31", "[error]")}   ${msg}`),
  step: (msg: string): void => console.log(`\n${paint("1", `-- ${msg}`)}`),
  detail: (msg: string): void => console.log(`          ${paint("90", msg)}`),
};

/** Randomised politeness delay. Sequential by default — we are a guest here. */
export async function politeDelay(minMs = 2000, maxMs = 5000): Promise<void> {
  const ms = Math.floor(minMs + Math.random() * (maxMs - minMs));
  log.detail(`waiting ${(ms / 1000).toFixed(1)}s before next request`);
  await new Promise(resolve => setTimeout(resolve, ms));
}
