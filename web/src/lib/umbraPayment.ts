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

function readUmbraNetworkOverride(): "mainnet" | "devnet" | "localnet" | null {
  const raw = String(import.meta.env.VITE_UMBRA_NETWORK || "")
    .trim()
    .toLowerCase();
  if (raw === "mainnet" || raw === "devnet" || raw === "localnet") return raw;
  return null;
}

function networkFromEndpoint(endpoint: string): "mainnet" | "devnet" | "localnet" | null {
  const e = endpoint.toLowerCase();
  if (e.includes("localhost") || e.includes("127.0.0.1")) return "localnet";
  if (e.includes("mainnet")) return "mainnet";
  if (e.includes("devnet")) return "devnet";
  return null;
}

function networkFromGenesisHash(genesisHash: string): "mainnet" | "devnet" | "localnet" | null {
  // Official Solana genesis hashes:
  // mainnet-beta => 5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp
  // devnet       => EtWTRABZaYq6iMfeYKouRu166VU2xqa1
  // testnet      => 4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z
  if (genesisHash === "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp") return "mainnet";
  if (genesisHash === "EtWTRABZaYq6iMfeYKouRu166VU2xqa1") return "devnet";
  return null;
}

async function resolveUmbraNetwork(connection: Connection, rpcUrl: string): Promise<"mainnet" | "devnet" | "localnet"> {
  const override = readUmbraNetworkOverride();
  if (override) return override;

  const byEndpoint = networkFromEndpoint(rpcUrl);
  if (byEndpoint) return byEndpoint;

  try {
    const hash = await connection.getGenesisHash();
    const byHash = networkFromGenesisHash(hash);
    if (byHash) return byHash;
  } catch {
    // Fall through to safe default below.
  }

  return "devnet";
}

function normalizeUmbraSimulationError(error: unknown): Error {
  const rawMsg = error instanceof Error ? error.message : String(error);
  const stage = (error as any)?.stage;
  const simulationLogs: string[] | undefined =
    (error as any)?.simulationLogs ||
    (error as any)?.context?.simulationLogs;
  const briefLogs = simulationLogs?.slice(-6).join("\n");

  const low = rawMsg.toLowerCase();
  const isSimFail =
    low.includes("transaction simulation failed") ||
    low.includes("simulation failed") ||
    low.includes("custom program error");

  if (!isSimFail) return error instanceof Error ? error : new Error(rawMsg);

  return new Error(
    `Umbra transaction simulation failed` +
      (stage ? ` (stage: ${stage})` : "") +
      `. Ensure buyer + recipient are registered on this network and the mint has an active Umbra pool. Raw error: ${rawMsg}` +
      (briefLogs ? `\nSimulation logs (tail):\n${briefLogs}` : ""),
  );
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
  const network = await resolveUmbraNetwork(connection, rpcUrl);
  const client = await sdk.getUmbraClient({
    signer,
    network,
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
    // Some RPCs/validators can reject during preflight simulation even when the transaction
    // would succeed. Retry with preflight skipped to unblock private checkout.
    const rawMsg = error instanceof Error ? error.message : String(error);
    const low = rawMsg.toLowerCase();
    const isSimFail =
      low.includes("transaction simulation failed") ||
      low.includes("simulation failed") ||
      low.includes("custom program error");

    if (isSimFail) {
      try {
        result = await deposit(recipientAddress, mintAddress, BigInt(Math.round(amount)), {
          skipPreflight: true,
          // Be forgiving when the callback is slow; still fail fast on real errors.
          maxRetries: 3,
        });
      } catch (error2) {
        throw normalizeUmbraSimulationError(error2);
      }
    } else {
      // Non-simulation failures should not be retried with skipPreflight.
      throw normalizeUmbraSimulationError(error);
    }
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
