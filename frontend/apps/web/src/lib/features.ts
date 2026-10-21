/** Feature switches. Pricing was parked on 2026-10-20 and opened again on 2026-10-21 (Omar); set NEXT_PUBLIC_FF_ESTIMATE=false to hide it. */
export const FEATURES = {
  estimate: process.env.NEXT_PUBLIC_FF_ESTIMATE !== "false",
};
