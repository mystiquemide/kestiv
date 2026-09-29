import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { ConfigError, inspectEnv, loadConfig, resolveRpc } from "../src/config.js";

const valid = () => ({
  KESTIV_KEYPAIR_PATH: "/tmp/secret-path-value.json",
  FOUNDER_WALLET: Keypair.generate().publicKey.toBase58(),
  KESTIV_MINT: Keypair.generate().publicKey.toBase58(),
  CLAWPUMP_API_KEY: "cp-secret-value",
  HELIUS_API_KEY: "helius-secret-value",
});

describe("loadConfig", () => {
  it("applies defaults", () => {
    const cfg = loadConfig(valid());
    expect(cfg.USEPOD_MODEL).toBe("deepseek-v4-flash");
    expect(cfg.STATUS_PORT).toBe(8787);
    expect(cfg.JUPITER_API_KEY).toBeUndefined();
  });

  it("names missing vars without leaking values", () => {
    const env = valid();
    delete (env as Partial<typeof env>).CLAWPUMP_API_KEY;
    delete (env as Partial<typeof env>).KESTIV_MINT;
    let err: unknown;
    try {
      loadConfig(env);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConfigError);
    const text = (err as Error).message;
    expect(text).toContain("CLAWPUMP_API_KEY");
    expect(text).toContain("KESTIV_MINT");
    for (const value of Object.values(env)) expect(text).not.toContain(value);
  });

  it("rejects an invalid pubkey and never prints it", () => {
    const bad = "not-a-real-pubkey-0OIl";
    let err: ConfigError | undefined;
    try {
      loadConfig({ ...valid(), FOUNDER_WALLET: bad });
    } catch (e) {
      err = e as ConfigError;
    }
    expect(err?.invalid).toEqual(["FOUNDER_WALLET"]);
    expect(err?.message).not.toContain(bad);
  });

  it("rejects an out-of-range port", () => {
    expect(() => loadConfig({ ...valid(), STATUS_PORT: "70000" })).toThrow(/STATUS_PORT/);
  });

  it("defaults to mainnet-beta and treats HELIUS_API_KEY as optional", () => {
    const env = valid();
    delete (env as Partial<typeof env>).HELIUS_API_KEY;
    const cfg = loadConfig(env);
    expect(cfg.SOLANA_CLUSTER).toBe("mainnet-beta");
    expect(cfg.HELIUS_API_KEY).toBeUndefined();
  });

  it("accepts devnet and rejects unknown clusters and bad RPC urls", () => {
    expect(loadConfig({ ...valid(), SOLANA_CLUSTER: "devnet" }).SOLANA_CLUSTER).toBe("devnet");
    expect(() => loadConfig({ ...valid(), SOLANA_CLUSTER: "testnet" })).toThrow(/SOLANA_CLUSTER/);
    expect(() => loadConfig({ ...valid(), SOLANA_RPC_URL: "not a url" })).toThrow(/SOLANA_RPC_URL/);
    expect(inspectEnv({ SOLANA_CLUSTER: "nope" }).SOLANA_CLUSTER).toBe("invalid");
  });
});

describe("resolveRpc", () => {
  it("prefers SOLANA_RPC_URL", () => {
    const r = resolveRpc({ SOLANA_CLUSTER: "devnet", SOLANA_RPC_URL: "https://rpc.example/x", HELIUS_API_KEY: "k" });
    expect(r).toEqual({ url: "https://rpc.example/x", kind: "custom" });
  });

  it("uses helius per cluster", () => {
    expect(resolveRpc({ SOLANA_CLUSTER: "mainnet-beta", HELIUS_API_KEY: "abc" })).toEqual({
      url: "https://mainnet.helius-rpc.com/?api-key=abc",
      kind: "helius",
    });
    expect(resolveRpc({ SOLANA_CLUSTER: "devnet", HELIUS_API_KEY: "abc" })).toEqual({
      url: "https://devnet.helius-rpc.com/?api-key=abc",
      kind: "helius",
    });
  });

  it("falls back to the public endpoint", () => {
    expect(resolveRpc({ SOLANA_CLUSTER: "mainnet-beta" })).toEqual({
      url: "https://api.mainnet-beta.solana.com",
      kind: "public",
    });
    expect(resolveRpc({ SOLANA_CLUSTER: "devnet" })).toEqual({ url: "https://api.devnet.solana.com", kind: "public" });
  });
});
