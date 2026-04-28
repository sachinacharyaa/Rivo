import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";

export const RIVO_FEE_WALLET =
  "G6DKYcQnySUk1ZYYuR1HMovVscWjAtyDQb6GhqrvJYnw";

// Backward-compat alias for existing imports.
export const RIPPLE_FEE_WALLET = RIVO_FEE_WALLET;

type PaymentParams = {
  connection: Connection;
  wallet: Pick<WalletContextState, "publicKey" | "sendTransaction">;
  productPriceSol: number;
  creatorAddress: string;
  platformAddress?: string;
};

type PaymentQuote = {
  totalLamports: bigint;
  feeLamports: bigint;
  creatorLamports: bigint;
  totalSol: string;
  feeSol: string;
  creatorSol: string;
};

function lamportsToSolString(lamports: bigint): string {
  const whole = lamports / BigInt(LAMPORTS_PER_SOL);
  const fraction = (lamports % BigInt(LAMPORTS_PER_SOL))
    .toString()
    .padStart(9, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
}

function parseSolToLamports(value: number): bigint {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Product price must be a positive SOL amount.");
  }
  const fixed = value.toFixed(9);
  const [wholePart, fracPart = ""] = fixed.split(".");
  const wholeLamports = BigInt(wholePart) * BigInt(LAMPORTS_PER_SOL);
  const fracLamports = BigInt(fracPart.padEnd(9, "0").slice(0, 9));
  return wholeLamports + fracLamports;
}

export function getPaymentQuote(productPriceSol: number): PaymentQuote {
  const totalLamports = parseSolToLamports(productPriceSol);
  const feeLamports = totalLamports / 100n;
  const creatorLamports = totalLamports - feeLamports;
  return {
    totalLamports,
    feeLamports,
    creatorLamports,
    totalSol: lamportsToSolString(totalLamports),
    feeSol: lamportsToSolString(feeLamports),
    creatorSol: lamportsToSolString(creatorLamports),
  };
}

function bigintToNumberSafe(value: bigint, label: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} is too large to safely convert to a JS number.`);
  }
  return Number(value);
}

export async function handlePayment({
  connection,
  wallet,
  productPriceSol,
  creatorAddress,
  platformAddress = RIVO_FEE_WALLET,
}: PaymentParams): Promise<string> {
  if (!wallet.publicKey) {
    throw new Error("Connect wallet first");
  }

  const creatorPubKey = new PublicKey(creatorAddress);
  const platformPubKey = new PublicKey(platformAddress);
  const quote = getPaymentQuote(productPriceSol);

  // Build a single transaction with split payment transfers.
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: creatorPubKey,
      lamports: bigintToNumberSafe(quote.creatorLamports, "creatorLamports"),
    }),
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: platformPubKey,
      lamports: bigintToNumberSafe(quote.feeLamports, "feeLamports"),
    }),
  );

  const latest = await connection.getLatestBlockhash();
  tx.recentBlockhash = latest.blockhash;
  tx.feePayer = wallet.publicKey;

  // Pre-check balance using an RPC fee estimate (prevents Phantom simulation reverts).
  const balanceLamports = BigInt(await connection.getBalance(wallet.publicKey, "confirmed"));
  let networkFeeLamports = 0n;
  try {
    const feeResp = await connection.getFeeForMessage(tx.compileMessage());
    // getFeeForMessage can return null/unknown on some clusters.
    networkFeeLamports = BigInt(feeResp.value ?? 0);
  } catch {
    // Fallback: keep the pre-check conservative.
    networkFeeLamports = 200_000n;
  }

  // Keep extra headroom so Phantom simulation/preflight doesn't fail.
  // Phantom often uses a higher fee estimate than `getFeeForMessage`.
  const minNetworkFeeLamports = 200_000n; // ~0.0002 SOL
  const effectiveNetworkFeeLamports = networkFeeLamports > minNetworkFeeLamports ? networkFeeLamports : minNetworkFeeLamports;
  const feeBufferLamports = 200_000n; // extra safety
  const requiredLamports = quote.totalLamports + effectiveNetworkFeeLamports + feeBufferLamports;
  if (balanceLamports < requiredLamports) {
    throw new Error(
      `Insufficient balance for checkout. Need about ${lamportsToSolString(requiredLamports)} SOL (price + network fee + safety).`,
    );
  }

  const signature = await wallet.sendTransaction(tx, connection, {
    // Allow simulation so Phantom can display the balance changes breakdown.
    // (We also do a conservative balance pre-check before sending.)
    skipPreflight: false,
  });
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");

  return signature;
}
