import { PublicKey, type Connection } from "@solana/web3.js";
import { decodeStream } from "@streamflow/stream";
import type { Cluster } from "../config.js";
import { streamflowProgramId } from "./env.js";

// Offsets of two flags the SDK's decoded Stream omits (see the account layout in the SDK).
const OFFSET_PAUSABLE = 539;
const OFFSET_CAN_UPDATE_RATE = 540;

export interface VestingFlags {
  canTopup: boolean;
  cancelableBySender: boolean;
  cancelableByRecipient: boolean;
  transferableBySender: boolean;
  transferableByRecipient: boolean;
  automaticWithdrawal: boolean;
  canUpdateRate: boolean;
  pausable: boolean;
}

export interface FounderVesting {
  streamId: string;
  recipient: string;
  sender: string;
  mint: string;
  depositedAmount: bigint;
  withdrawnAmount: bigint;
  start: number;
  end: number;
  period: number;
  amountPerPeriod: bigint;
  cliff: number;
  cliffAmount: bigint;
  closed: boolean;
  flags: VestingFlags;
}

export const REQUIRED_FLAGS: VestingFlags = {
  canTopup: true,
  cancelableBySender: false,
  cancelableByRecipient: false,
  transferableBySender: false,
  transferableByRecipient: false,
  automaticWithdrawal: false,
  canUpdateRate: false,
  pausable: false,
};

export function parseVestingAccount(streamId: string, data: Buffer): FounderVesting {
  const s = decodeStream(data);
  return {
    streamId,
    recipient: s.recipient.toBase58(),
    sender: s.sender.toBase58(),
    mint: s.mint.toBase58(),
    depositedAmount: BigInt(s.depositedAmount.toString()),
    withdrawnAmount: BigInt(s.withdrawnAmount.toString()),
    start: s.start.toNumber(),
    end: s.end.toNumber(),
    period: s.period.toNumber(),
    amountPerPeriod: BigInt(s.amountPerPeriod.toString()),
    cliff: s.cliff.toNumber(),
    cliffAmount: BigInt(s.cliffAmount.toString()),
    closed: s.closed,
    flags: {
      canTopup: s.canTopup,
      cancelableBySender: s.cancelableBySender,
      cancelableByRecipient: s.cancelableByRecipient,
      transferableBySender: s.transferableBySender,
      transferableByRecipient: s.transferableByRecipient,
      automaticWithdrawal: s.automaticWithdrawal,
      canUpdateRate: data[OFFSET_CAN_UPDATE_RATE] !== 0,
      pausable: data[OFFSET_PAUSABLE] !== 0,
    },
  };
}

export async function readFounderVesting(
  connection: Connection,
  cluster: Cluster,
  streamId: string,
): Promise<FounderVesting> {
  const info = await connection.getAccountInfo(new PublicKey(streamId), "confirmed");
  if (!info) throw new Error(`stream ${streamId} not found`);
  if (!info.owner.equals(streamflowProgramId(cluster))) {
    throw new Error(`stream ${streamId} is not owned by the Streamflow program for ${cluster}`);
  }
  return parseVestingAccount(streamId, info.data);
}

export interface ExpectedTerms {
  recipient: string;
  mint: string;
  sender: string;
}

export class LockTermsError extends Error {
  readonly violations: string[];

  constructor(violations: string[]) {
    super(`vesting contract violates founder lock terms: ${violations.join("; ")}`);
    this.name = "LockTermsError";
    this.violations = violations;
  }
}

export function assertLockTerms(stream: FounderVesting, expected: ExpectedTerms): void {
  const bad: string[] = [];
  if (stream.recipient !== expected.recipient) bad.push("recipient mismatch");
  if (stream.mint !== expected.mint) bad.push("mint mismatch");
  if (stream.sender !== expected.sender) bad.push("sender mismatch");
  if (stream.closed) bad.push("stream is closed");
  for (const key of Object.keys(REQUIRED_FLAGS) as (keyof VestingFlags)[]) {
    if (stream.flags[key] !== REQUIRED_FLAGS[key]) bad.push(`${key} must be ${REQUIRED_FLAGS[key]}`);
  }
  if (bad.length) throw new LockTermsError(bad);
}
