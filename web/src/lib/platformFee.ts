/** Must match `PLATFORM_FEE_PERCENT` in `backend/src/platformFee.js`. */
export const PLATFORM_FEE_PERCENT = 3;

export function platformFeeFromTotal(total: bigint): bigint {
  return (total * BigInt(PLATFORM_FEE_PERCENT)) / 100n;
}

export function creatorShareFromTotal(total: bigint): bigint {
  return total - platformFeeFromTotal(total);
}
