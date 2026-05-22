import { api } from "./api";

/** Must match backend `RIPPLE_FEE_WALLET` default in `backend/src/app.js`. */
export const DEFAULT_PLATFORM_FEE_WALLET = "G6DKYcQnySUk1ZYYuR1HMovVscWjAtyDQb6GhqrvJYnw";

let cachedFeeWallet: string | null = null;

/** Platform fee recipient — from API (production) or `VITE_RIPPLE_FEE_WALLET` / default. */
export async function getPlatformFeeWallet(): Promise<string> {
  const fromBuild = String(import.meta.env.VITE_RIPPLE_FEE_WALLET || "").trim();
  if (fromBuild) return fromBuild;
  if (cachedFeeWallet) return cachedFeeWallet;
  try {
    const { data } = await api.get<{ platformFeeWallet?: string }>("/config");
    const w = String(data.platformFeeWallet || "").trim();
    if (w) {
      cachedFeeWallet = w;
      return w;
    }
  } catch {
    // API unreachable — use default
  }
  return DEFAULT_PLATFORM_FEE_WALLET;
}
