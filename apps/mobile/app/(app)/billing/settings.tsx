import React from 'react';
import { BillingSettingsScreen } from '../../../src/features/billing/screens/BillingSettingsScreen';

/**
 * `/billing/settings` — the D-29 billing settings form.
 *
 * Deliberately a sibling of `(tabs)`, not a child of it, matching
 * `patient/register`: this is a push-on-top-of-everything Admin screen, so it
 * gets the root stack's back button and header rather than keeping the bottom
 * tab bar visible underneath a form holding a live payment credential.
 *
 * It is reached from the gear affordance in the Billing dashboard header; there
 * is no `More` tab in this app and no drawer was invented for it (06-14 recorded
 * both). The tab route `(tabs)/billing.tsx` is untouched — converting it into a
 * directory is plan 06-15/06-18's job for the nested invoice routes, and doing
 * it here would collide with that work.
 */
export default function BillingSettingsRoute() {
  return <BillingSettingsScreen />;
}
