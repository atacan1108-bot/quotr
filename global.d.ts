import messages from './messages/nl.json'

// Enables compile-time errors from useTranslations()/getTranslations() for
// any key that doesn't exist in messages/nl.json — the definitive
// "did I forget a translation key" check for Phase 5, catching mistakes at
// `tsc` time instead of a runtime blank string.
declare module 'next-intl' {
  interface AppConfig {
    Messages: typeof messages
  }
}
