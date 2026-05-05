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

export async function handleUmbraPrivatePayment({
  connection,
  wallet,
  recipientAddress,
  mintAddress,
  amount,
}: UmbraPaymentParams): Promise<string> {
  if (!wallet.publicKey) throw new Error("Connect wallet first");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid payment amount.");

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

  // Idempotent registration. Umbra account init + key setup if missing.
  const register = sdk.getUserRegistrationFunction({ client });
  await register({ confidential: true, anonymous: true });

  // Private checkout rail: deposit buyer public balance into recipient encrypted balance.
  const deposit = sdk.getPublicBalanceToEncryptedBalanceDirectDepositorFunction({ client });
  const result = await deposit(recipientAddress, mintAddress, BigInt(Math.round(amount)));

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
