/** Live SOL/USD for admin metrics (CoinGecko public API). */
export async function fetchSolUsdPrice(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { solana?: { usd?: number } };
    const usd = data?.solana?.usd;
    return typeof usd === "number" && usd > 0 ? usd : null;
  } catch {
    return null;
  }
}

export function solToUsd(sol: number, solUsd: number | null): number | null {
  if (solUsd == null || !Number.isFinite(sol)) return null;
  return sol * solUsd;
}
