import { Keypair, SystemProgram, TransactionMessage, VersionedTransaction, type Connection } from "@solana/web3.js";
import bs58 from "bs58";
import { describe, expect, it, vi } from "vitest";
import { ALLOWED_PROGRAMS } from "../src/chain/allowlist.js";
import { extractIncoming } from "../src/chain/incoming.js";
import { signAndSend } from "../src/chain/send.js";

const payer = Keypair.generate();
const tx = () =>
  new VersionedTransaction(
    new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: "11111111111111111111111111111111",
      instructions: [SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 })],
    }).compileToV0Message(),
  );

describe("signAndSend onSigned", () => {
  it("fires with the real signature after signing and before the broadcast", async () => {
    const order: string[] = [];
    let announced = "";
    const conn = {
      sendRawTransaction: vi.fn(async (raw: Uint8Array) => {
        order.push("send");
        const sent = VersionedTransaction.deserialize(raw);
        expect(bs58.encode(sent.signatures[0]!)).toBe(announced);
        return announced;
      }),
      getLatestBlockhash: vi.fn(async () => ({ blockhash: "x", lastValidBlockHeight: 1 })),
      confirmTransaction: vi.fn(async () => ({ value: { err: null } })),
    } as unknown as Connection;
    const t = tx();
    await signAndSend(t, payer, conn, ALLOWED_PROGRAMS, {
      onSigned: (sig) => {
        order.push("signed");
        announced = sig;
      },
    });
    expect(order).toEqual(["signed", "send"]);
    expect(announced.length).toBeGreaterThan(60);
  });

  it("does not call onSigned when the guard rejects", async () => {
    const onSigned = vi.fn();
    const bad = new VersionedTransaction(
      new TransactionMessage({
        payerKey: payer.publicKey,
        recentBlockhash: "11111111111111111111111111111111",
        instructions: [{ programId: Keypair.generate().publicKey, keys: [], data: Buffer.alloc(0) } as never],
      }).compileToV0Message(),
    );
    await expect(signAndSend(bad, payer, {} as Connection, ALLOWED_PROGRAMS, { onSigned })).rejects.toThrow();
    expect(onSigned).not.toHaveBeenCalled();
  });
});

describe("extractIncoming", () => {
  const parsedTx = (ixs: unknown[], err: unknown = null) =>
    ({ blockTime: 5, meta: { err, innerInstructions: [] }, transaction: { message: { instructions: ixs } } }) as never;
  const transfer = (source: string, destination: string, lamports: number) => ({ program: "system", parsed: { type: "transfer", info: { source, destination, lamports } } });

  it("sums transfers into the wallet and picks the largest sender", () => {
    const r = extractIncoming(parsedTx([transfer("A", "W", 100), transfer("B", "W", 300), transfer("A", "Z", 999)]), "W", "sig");
    expect(r).toEqual({ sig: "sig", lamports: 400, sender: "B", ts: 5 });
  });

  it("ignores failed transactions, other programs and self transfers", () => {
    expect(extractIncoming(parsedTx([transfer("A", "W", 1)], { x: 1 }), "W", "s")).toBeNull();
    expect(extractIncoming(parsedTx([{ program: "spl-token", parsed: { type: "transfer" } }]), "W", "s")).toBeNull();
    expect(extractIncoming(parsedTx([transfer("W", "W", 1)]), "W", "s")).toBeNull();
  });
});
