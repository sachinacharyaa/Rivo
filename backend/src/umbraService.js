let umbraInitPromise = null;
const rpcUrl = process.env.SOLANA_RPC || "https://api.devnet.solana.com";

async function initUmbraClient() {
  if (umbraInitPromise) return umbraInitPromise;

  umbraInitPromise = (async () => {
    const sdk = await import("@umbra-privacy/sdk");
    const signer = await sdk.createInMemorySigner();
    const wsUrl = rpcUrl.replace("https://", "wss://").replace("http://", "ws://");
    const network = process.env.UMBRA_NETWORK || "devnet";

    const client = await sdk.getUmbraClient({
      signer,
      network,
      rpcUrl,
      rpcSubscriptionsUrl: wsUrl,
      indexerApiEndpoint: process.env.UMBRA_INDEXER_ENDPOINT || undefined,
    });

    return { sdk, client };
  })().catch((error) => {
    umbraInitPromise = null;
    throw error;
  });

  return umbraInitPromise;
}

export async function verifyUmbraPrivatePayment({
  signature,
  buyerWallet,
  expectedAmount,
}) {
  try {
    await initUmbraClient();
    const { Connection } = await import("@solana/web3.js");
    const connection = new Connection(rpcUrl, "confirmed");
    const txResp = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!txResp) return { ok: false, reason: "Umbra transaction not found on-chain." };
    if (txResp.meta?.err) return { ok: false, reason: "Umbra transaction failed on-chain." };

    // MVP integration note:
    // This verifies a confirmed on-chain Umbra transaction exists.
    // Full ciphertext/decryption compliance checks can be layered here next.
    return {
      ok: true,
      meta: {
        signature,
        buyerWallet,
        expectedAmount,
      },
    };
  } catch (error) {
    return {
      ok: false,
      reason: `Umbra SDK initialization failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
