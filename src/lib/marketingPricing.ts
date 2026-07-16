/**
 * Marketing-page pricing display only — NOT the invoicing pricing engine
 * (src/lib/pricing.ts), which is untouched by this. These are just the two
 * numbers shown on the public landing page; there is no billing logic
 * behind them yet (per the task: buttons route to signup, nothing charges
 * anyone). Kept in one place so they're easy to change without touching
 * JSX or the translation files.
 */
export const MARKETING_PRICING = {
  free: { amount: 0 },
  premium: { amount: 12 },
} as const
