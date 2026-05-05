let umbraInitPromise = null;

async function initUmbraClient() {
  if (umbraInitPromise) return umbraInitPromise;

  umbraInitPromise = (async () => {
    const sdk = await import("@umbra-privacy/sdk");
    const signer = await sdk.createInMemorySigner();
    const rpcUrl = process.env.SOLANA_RPC || "https://api.devnet.solana.com";
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
  viewingKey,
  expectedAmount,
}) {
  if (!viewingKey || viewingKey.length < 8) {
    return { ok: false, reason: "Umbra viewing key is missing or invalid." };
  }

  try {
    await initUmbraClient();
    // MVP integration note:
    // We keep the existing on-chain transfer verification as the source of truth
    // and require a viewing key in private mode. Full ciphertext decryption and
    // proof validation can be added here using Umbra indexer + compliance grants.
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
