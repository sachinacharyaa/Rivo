import type { Connection } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { getWallets } from "@wallet-standard/app";

type UmbraPaymentParams = {
  connection: Connection;
  wallet: Pick<WalletContextState, "publicKey">;
  recipientAddress: string;
  mintAddress: string;
  amount: number;
};

function toWsEndpoint(rpcUrl: string): string {
  if (rpcUrl.startsWith("https://")) return rpcUrl.replace("https://", "wss://");
  if (rpcUrl.startsWith("http://")) return rpcUrl.replace("http://", "ws://");
  return rpcUrl;
}

function networkFromEndpoint(endpoint: string): "mainnet" | "devnet" | "localnet" {
  const e = endpoint.toLowerCase();
  if (e.includes("mainnet")) return "mainnet";
  if (e.includes("localhost") || e.includes("127.0.0.1")) return "localnet";
  return "devnet";
}

function normalizeUmbraSimulationError(error: unknown): Error {
  const msg = error instanceof Error ? error.message : String(error);
  const low = msg.toLowerCase();
  if (
    low.includes("transaction simulation failed") ||
    low.includes("simulation failed") ||
    low.includes("custom program error")
  ) {
    return new Error(
      "Umbra transaction simulation failed. Ensure both buyer and creator are Umbra-registered on this network, the mint is supported by Umbra, and the buyer has enough token balance plus SOL for fees.",
    );
  }
  return error instanceof Error ? error : new Error(msg);
}

async function createUmbraClientForWallet({
  connection,
  wallet,
}: {
  connection: Connection;
  wallet: Pick<WalletContextState, "publicKey">;
}) {
  if (!wallet.publicKey) throw new Error("Connect wallet first");

  const sdk = (await import("@umbra-privacy/sdk")) as any;
  const wallets = getWallets().get();
  const expectedAddress = wallet.publicKey.toBase58();

  let connectedWallet: any = null;
  let account: any = null;
  for (const w of wallets) {
    const candidate = (w.accounts || []).find((a: any) => a.address === expectedAddress);
    if (candidate) {
      connectedWallet = w;
      account = candidate;
      break;
    }
  }

  if (!connectedWallet || !account) {
    throw new Error("Wallet Standard account not found. Reconnect Phantom and try again.");
  }

  const signer = sdk.createSignerFromWalletAccount(connectedWallet, account);
  const rpcUrl = connection.rpcEndpoint || "https://api.devnet.solana.com";
  const client = await sdk.getUmbraClient({
    signer,
    network: networkFromEndpoint(rpcUrl),
    rpcUrl,
    rpcSubscriptionsUrl: toWsEndpoint(rpcUrl),
    indexerApiEndpoint: import.meta.env.VITE_UMBRA_INDEXER_ENDPOINT || undefined,
    deferMasterSeedSignature: true,
  });

  return { sdk, client };
}

export async function ensureUmbraPrivatePayoutReady({
  connection,
  wallet,
}: {
  connection: Connection;
  wallet: Pick<WalletContextState, "publicKey">;
}): Promise<void> {
  const { sdk, client } = await createUmbraClientForWallet({ connection, wallet });
  const register = sdk.getUserRegistrationFunction({ client });
  try {
    await register({ confidential: true, anonymous: false });
  } catch (error) {
    throw normalizeUmbraSimulationError(error);
  }
}

export async function handleUmbraPrivatePayment({
  connection,
  wallet,
  recipientAddress,
  mintAddress,
  amount,
}: UmbraPaymentParams): Promise<string> {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid payment amount.");
  const { sdk, client } = await createUmbraClientForWallet({ connection, wallet });

  // Idempotent registration. Umbra account init + key setup if missing.
  const register = sdk.getUserRegistrationFunction({ client });
  // Keep checkout prover-free: anonymous registration requires a zkProver dependency.
  try {
    await register({ confidential: true, anonymous: false });
  } catch (error) {
    throw normalizeUmbraSimulationError(error);
  }

  // Private checkout rail: deposit buyer public balance into recipient encrypted balance.
  const deposit = sdk.getPublicBalanceToEncryptedBalanceDirectDepositorFunction({ client });
  let result: any;
  try {
    result = await deposit(recipientAddress, mintAddress, BigInt(Math.round(amount)));
  } catch (error) {
    throw normalizeUmbraSimulationError(error);
  }

  const signature =
    result?.callbackSignature ||
    result?.queueSignature ||
    result?.signature ||
    "";
  if (!signature) {
    throw new Error("Umbra payment submitted but no transaction signature returned.");
  }
  return signature;
}
