type RuntimeTokens = {
  PUSD: { symbol: "PUSD"; mint: string; decimals: number; isDefault: true };
  USDC: { symbol: "USDC"; mint: string; decimals: number };
  AUDD: { symbol: "AUDD"; mint: string; decimals: number };
  SOL: { symbol: "SOL"; mint: string; decimals: number };
};

export const TOKENS: RuntimeTokens = {
  PUSD: {
    symbol: "PUSD",
    mint: import.meta.env.VITE_PUSD_MINT_ADDRESS || "6r8BmwjTEqYKciEuye1QWN8LqEp4sHhRUDjj2Y23t2aY",
    decimals: 6,
    isDefault: true,
  },
  USDC: {
    symbol: "USDC",
    mint: import.meta.env.VITE_USDC_MINT_ADDRESS || "<USDC_MINT_ADDRESS>",
    decimals: 6,
  },
  AUDD: {
    symbol: "AUDD",
    mint: import.meta.env.VITE_AUDD_MINT_ADDRESS || "<AUDD_MINT_ADDRESS>",
    decimals: 6,
  },
  SOL: {
    symbol: "SOL",
    // Umbra operates on token mints; use wrapped SOL mint for SOL-priced private checkout.
    mint: import.meta.env.VITE_WSOL_MINT_ADDRESS || "So11111111111111111111111111111111111111112",
    decimals: 9,
  },
};

export type CheckoutToken = keyof typeof TOKENS;

export async function syncTokensFromBackend() {
  const isProd = import.meta.env.PROD;
  const base = import.meta.env.VITE_API_URL || (isProd ? "/api" : "http://localhost:4000/api");
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/tokens`);
    if (!response.ok) return;
    const data = (await response.json()) as Partial<RuntimeTokens>;
    if (data?.PUSD?.mint && data.PUSD.mint !== TOKENS.PUSD.mint) {
      TOKENS.PUSD.mint = data.PUSD.mint;
    }
    if (typeof data?.PUSD?.decimals === "number") {
      TOKENS.PUSD.decimals = data.PUSD.decimals;
    }
    if (data?.USDC?.mint && data.USDC.mint !== TOKENS.USDC.mint) {
      TOKENS.USDC.mint = data.USDC.mint;
    }
    if (typeof data?.USDC?.decimals === "number") {
      TOKENS.USDC.decimals = data.USDC.decimals;
    }
    if (data?.AUDD?.mint && data.AUDD.mint !== TOKENS.AUDD.mint) {
      TOKENS.AUDD.mint = data.AUDD.mint;
    }
    if (typeof data?.AUDD?.decimals === "number") {
      TOKENS.AUDD.decimals = data.AUDD.decimals;
    }
  } catch {
    // Keep local token constants if remote token endpoint is unavailable.
  }
}
