import React from 'react';
import { WhatsAppAccessGate } from '../../../src/features/whatsapp/components/WhatsAppAccessGate';
import { WhatsAppInboxScreen } from '../../../src/features/whatsapp/screens/WhatsAppInboxScreen';

export default function WhatsAppInboxRoute() {
  return (
    <WhatsAppAccessGate>
      <WhatsAppInboxScreen />
    </WhatsAppAccessGate>
  );
}
