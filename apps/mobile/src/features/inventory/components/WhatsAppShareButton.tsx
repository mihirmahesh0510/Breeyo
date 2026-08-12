import React, { useCallback, useState } from 'react';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Button, showToast } from '@breeyo/ui';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';

export interface WhatsAppShareButtonProps {
  clinicId: string | null | undefined;
  /** Optional, cosmetic only -- the shared text itself already has the
   *  clinic name baked in server-side (want-list.service.ts's
   *  generateWhatsAppText, D-28). Not required for the share to work. */
  clinicName?: string;
  testID?: string;
}

interface WantListTextResponse {
  data: { text: string };
}

type ShareState = 'default' | 'sharing' | 'shared';

/**
 * "Share via WhatsApp" (D-24/D-28): fetches the pre-formatted plain-text
 * want-list from GET /inventory/want-list/text, writes it to a temp file,
 * and opens the OS share sheet via expo-sharing (WhatsApp is one of the
 * apps the sheet offers, matching how Indian businesses actually share
 * lists -- there's no direct "send to WhatsApp" API, so the share sheet is
 * the correct integration point per D-24's own "Share via WhatsApp button"
 * framing, same approach already used for CSV export).
 */
export function WhatsAppShareButton({ clinicId, clinicName, testID }: WhatsAppShareButtonProps) {
  const { accessToken } = useAuth();
  const [state, setState] = useState<ShareState>('default');

  const handleShare = useCallback(async () => {
    if (!clinicId) return;
    setState('sharing');
    try {
      const response = await apiClient<WantListTextResponse>('/api/v1/inventory/want-list/text', {
        token: accessToken || undefined,
      });
      const filePath = `${FileSystem.documentDirectory}want-list.txt`;
      await FileSystem.writeAsStringAsync(filePath, response.data.text, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        throw new Error('Sharing is not available on this device');
      }
      await Sharing.shareAsync(filePath, {
        mimeType: 'text/plain',
        dialogTitle: clinicName ? `Want List - ${clinicName}` : 'Want List',
      });
      setState('shared');
      showToast('success', 'Want-list shared');
    } catch {
      setState('default');
      showToast('error', 'Could not share. Please try again.');
    }
  }, [clinicId, clinicName, accessToken]);

  return (
    <Button
      variant="filled"
      label={state === 'shared' ? 'Shared' : 'Share via WhatsApp'}
      icon="whatsapp"
      onPress={handleShare}
      loading={state === 'sharing'}
      disabled={state === 'sharing' || !clinicId}
      testID={testID}
    />
  );
}
