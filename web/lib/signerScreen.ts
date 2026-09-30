/**
 * What the signer does with each instruction, as the terminal on the home page shows it.
 * The discriminators are the first 8 bytes of the real instruction data (agent/src/chain/allowlist.ts and the
 * devnet update and cancel instructions in agent/test/fixtures/streamflow-instructions.json).
 */
export const SIGNER_ROWS = [
  { name: "Jupiter swap, SOL to token", verdict: "allowed", detail: "" },
  { name: "Streamflow create", verdict: "allowed", detail: "181ec828051c0777" },
  { name: "Streamflow top up", verdict: "allowed", detail: "7e2a314ee197634d" },
  { name: "Streamflow update", verdict: "refused", detail: "dbc858b09e3ffd7f" },
  { name: "Streamflow cancel", verdict: "refused", detail: "e8dbdf29dbecdcbe" },
  { name: "Any other Streamflow call", verdict: "refused", detail: "" },
  { name: "Any other program", verdict: "refused", detail: "" },
] as const;

const pad = (s: string, n: number) => s.padEnd(n, " ");

export function signerLines(): string[] {
  const w = Math.max(...SIGNER_ROWS.map((r) => r.name.length)) + 2;
  return ["$ what the signer will sign", "", ...SIGNER_ROWS.map((r) => `${pad(r.name, w)}${r.verdict === "refused" ? " refused " : " allowed "}${r.detail}`.trimEnd()), "", "No sell. No cancel. No transfer."];
}
