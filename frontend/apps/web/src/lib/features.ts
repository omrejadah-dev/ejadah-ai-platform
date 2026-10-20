/** Feature switches. Pricing is parked for now (Omar, 2026-10-20): flip to true or set NEXT_PUBLIC_FF_ESTIMATE=true to bring it back. */
export const FEATURES = {
  estimate: process.env.NEXT_PUBLIC_FF_ESTIMATE === "true",
};
