import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { InvoiceBuilderScreen } from '../../../src/features/billing/screens/InvoiceBuilderScreen';
import { BUILDER_COPY } from '../../../src/features/billing/lib/builder-copy';

/**
 * The standalone builder (D-03's second creation path) — a counter sale or a
 * missed charge, with no consultation behind it.
 *
 * A thin delegate in the shape `patient/register.tsx` set. The optional params
 * are read here rather than in the screen because Expo Router owns them: the
 * builder is also mounted from the consultation picker, which supplies an
 * `invoiceId`, and a screen that read the router directly could not be mounted
 * any other way.
 */
export default function NewInvoiceRoute() {
  const { invoiceId, consultationId, petId, ownerId } = useLocalSearchParams<{
    invoiceId?: string;
    consultationId?: string;
    petId?: string;
    ownerId?: string;
  }>();

  return (
    <>
      <Stack.Screen options={{ title: BUILDER_COPY.screenTitleStandalone }} />
      <InvoiceBuilderScreen
        invoiceId={invoiceId}
        consultationId={consultationId}
        petId={petId}
        ownerId={ownerId}
      />
    </>
  );
}
