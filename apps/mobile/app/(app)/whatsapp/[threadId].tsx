import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { WhatsAppAccessGate } from '../../../src/features/whatsapp/components/WhatsAppAccessGate';
import { WhatsAppThreadScreen } from '../../../src/features/whatsapp/screens/WhatsAppThreadScreen';

export default function WhatsAppThreadRoute() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();

  if (!threadId) return null;

  return (
    <WhatsAppAccessGate>
      <WhatsAppThreadScreen threadId={threadId} />
    </WhatsAppAccessGate>
  );
}
