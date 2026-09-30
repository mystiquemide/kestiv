/**
 * What the signer does with each instruction, as the terminal on the home page shows it.
 * The discriminators are the first 8 bytes of the real instruction data (agent/src/chain/allowlist.ts and the
 * devnet update and cancel instructions in agent/test/fixtures/jupiter-lock-create.json and the Jupiter Lock IDL).
 */
export const SIGNER_ROWS = [
  { name: "Jupiter swap, SOL to token", verdict: "allowed", detail: "" },
  { name: "Jupiter Lock create", verdict: "allowed", detail: "b59b68b7b680232f" },
  { name: "Jupiter Lock change recipient", verdict: "refused", detail: "1af27fffed6d2fce" },
  { name: "Jupiter Lock cancel", verdict: "refused", detail: "d9e90d038f6535c9" },
  { name: "Any other Jupiter Lock call", verdict: "refused", detail: "" },
  { name: "Any other program", verdict: "refused", detail: "" },
] as const;

const pad = (s: string, n: number) => s.padEnd(n, " ");

export function signerLines(): string[] {
  const w = Math.max(...SIGNER_ROWS.map((r) => r.name.length)) + 2;
  return ["$ what the signer will sign", "", ...SIGNER_ROWS.map((r) => `${pad(r.name, w)}${r.verdict === "refused" ? " refused " : " allowed "}${r.detail}`.trimEnd()), "", "No sell. No cancel. No transfer."];
}
