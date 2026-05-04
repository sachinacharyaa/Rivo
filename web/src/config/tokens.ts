export const TOKENS = {
  PUSD: {
    symbol: "PUSD",
    mint: import.meta.env.VITE_PUSD_MINT_ADDRESS || "<PUSD_MINT_ADDRESS>",
    decimals: 6,
    isDefault: true,
  },
  USDC: {
    symbol: "USDC",
    mint: import.meta.env.VITE_USDC_MINT_ADDRESS || "<USDC_MINT_ADDRESS>",
    decimals: 6,
  },
  SOL: {
    symbol: "SOL",
    type: "native",
  },
} as const;

export type CheckoutToken = keyof typeof TOKENS;
