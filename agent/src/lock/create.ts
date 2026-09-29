import BN from "bn.js";
import { Keypair, PublicKey } from "@solana/web3.js";
import { StreamType, buildStreamType, create, buildTransaction, type ICreateStreamData } from "@streamflow/stream";
import { signAndSend } from "../chain/send.js";
import { allowlistOf, sdkEnv, type LockContext } from "./env.js";
import { founderSchedule } from "./terms.js";

export interface CreateFounderVestingParams extends LockContext {
  sender: Keypair;
  mint: PublicKey;
  tokenProgram: PublicKey;
  amount: bigint;
  recipient: PublicKey;
  nowSec?: number;
  name?: string;
}

export function founderStreamData(p: {
  mint: PublicKey;
  tokenProgram: PublicKey;
  amount: bigint;
  recipient: PublicKey;
  nowSec: number;
  name?: string;
}): ICreateStreamData {
  const schedule = founderSchedule(p.nowSec, p.amount);
  const data: ICreateStreamData = {
    recipient: p.recipient.toBase58(),
    tokenId: p.mint.toBase58(),
    amount: new BN(p.amount.toString()),
    start: schedule.start,
    cliff: schedule.cliff,
    period: schedule.period,
    cliffAmount: schedule.cliffAmount,
    amountPerPeriod: schedule.amountPerPeriod,
    name: p.name ?? "Kestiv founder stake",
    canTopup: true,
    cancelableBySender: false,
    cancelableByRecipient: false,
    transferableBySender: false,
    transferableByRecipient: false,
    automaticWithdrawal: false,
    withdrawalFrequency: 0,
    canUpdateRate: false,
    canPause: false,
    tokenProgramId: p.tokenProgram,
  };
  // canTopup is true and cliffAmount is 0, so the SDK must classify this as a vesting contract, not a Lock.
  const type = buildStreamType({
    canTopup: data.canTopup,
    automaticWithdrawal: false,
    cancelableBySender: false,
    cancelableByRecipient: false,
    transferableBySender: false,
    transferableByRecipient: false,
    depositedAmount: data.amount,
    cliffAmount: data.cliffAmount,
    cliff: data.cliff,
    end: undefined,
  });
  if (type !== StreamType.Vesting) throw new Error("founder terms would be classified as a Lock, refusing to create");
  return data;
}

export async function createFounderVesting(p: CreateFounderVestingParams): Promise<{ streamId: string; signature: string }> {
  const data = founderStreamData({ ...p, nowSec: p.nowSec ?? Math.floor(Date.now() / 1000) });
  const env = sdkEnv(p);
  const built = await create(data, { publicKey: p.sender.publicKey }, env);
  const { transaction, blockhashWithExpiryBlockHeight } = await buildTransaction(
    built.instructions,
    { feePayer: p.sender.publicKey },
    env,
  );
  const signature = await signAndSend(transaction, p.sender, p.connection, allowlistOf(p), {
    extraSigners: built.signers ?? [],
    blockhash: blockhashWithExpiryBlockHeight,
  });
  if (!built.metadataPubKey) throw new Error("SDK did not return the stream id");
  return { streamId: built.metadataPubKey.toBase58(), signature };
}
