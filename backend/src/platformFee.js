/** Platform fee on each sale (percent of gross). */
export const PLATFORM_FEE_PERCENT = 3;

export function platformFeeFromTotal(total) {
  const t = typeof total === "bigint" ? total : BigInt(total);
  return (t * BigInt(PLATFORM_FEE_PERCENT)) / 100n;
}

export function creatorShareFromTotal(total) {
  const t = typeof total === "bigint" ? total : BigInt(total);
  return t - platformFeeFromTotal(t);
}

/** For admin metrics computed from JS number aggregates. */
export function platformFeeFromGross(gross) {
  return gross * (PLATFORM_FEE_PERCENT / 100);
}
