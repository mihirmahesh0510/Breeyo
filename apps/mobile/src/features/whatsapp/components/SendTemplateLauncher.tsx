import React, { useState } from 'react';
import { Button } from '@breeyo/ui';
import { WA_TEMPLATE_STAFF_NAMES } from '@breeyo/types';
import type { WaContextType, WaTemplateKey } from '@breeyo/types';
import { TemplateSendSheet } from './TemplateSendSheet';

/**
 * WHA-02 / D-18, Pitfall 8: the one reusable trigger component that owns a
 * `TemplateSendSheet`'s visibility, so any surface adds WhatsApp sending in
 * one line -- UI-SPEC's Context Send Bottom Sheet is opened "from invoice
 * detail, pet profile, reminder cards, booking records, and document
 * views," and this is the single component all five wire through with
 * different props rather than five bespoke sheets.
 *
 * 07-16 wires this into the one surface that exists today outside the
 * WhatsApp module itself: the pet profile (`PatientDetailScreen.tsx`), with
 * `follow_up_reminder`, `vaccine_due`, and `deworming_due`. A reminder-card
 * or clinical-document surface would wire in the same way if/when a
 * standalone one exists to attach it to.
 *
 * ────────────────────────────────────────────────────────────────────────
 * PHASE 6 INTEGRATION HOOK -- read this before building an invoice-detail
 * screen. Do NOT build an invoice-detail/list screen in Phase 7 (Pitfall 8,
 * D-18) -- Phase 6 owns it. When Phase 6's invoice-detail screen exists, it
 * wires this exact component in with:
 *
 *   <SendTemplateLauncher
 *     templateKey="invoice_delivery"
 *     contextType="INVOICE"
 *     contextId={invoice.id}                 // opaque to this component
 *     owner={{ id: owner.id, name: owner.name, mobile: owner.mobile }}
 *     pet={{ id: pet.id, name: pet.name }}    // optional, if the invoice is pet-scoped
 *     prefilledVariables={{
 *       invoice_number: invoice.number,
 *       amount: formattedAmount,
 *       due_date: formattedDueDate,
 *       // D-23: omit `payment_link` entirely (do not pass an empty
 *       // string) once the invoice is paid -- TemplateSendSheet only
 *       // renders variables actually present in `prefilledVariables`, and
 *       // the template itself renders no payment CTA without it.
 *       ...(invoice.status !== 'PAID' ? { payment_link: invoice.paymentLink } : {}),
 *     }}
 *     label="Send Invoice"
 *   />
 *
 * D-18: invoice_delivery is link-only in Beta -- there is no `media` prop
 * anywhere on this component or on `TemplateSendSheet`, so no PDF or other
 * attachment can be threaded through this launcher for any template.
 * ────────────────────────────────────────────────────────────────────────
 */
export interface SendTemplateLauncherProps {
  templateKey: WaTemplateKey;
  owner: { id: string; name: string; mobile: string };
  pet?: { id: string; name: string };
  contextType: WaContextType;
  contextId?: string;
  prefilledVariables: Record<string, string>;
  label?: string;
  disabled?: boolean;
  /**
   * Advisory-only signals (D-13: missing consent never blocks a send) that
   * a caller MAY already have from its own context -- e.g. a thread screen
   * that already fetched `WhatsAppThreadSummary.numberStatus`. There is no
   * `GET`-shaped read endpoint in this API for a single owner's
   * `remindersOptedOut`/consent state outside of a thread (only
   * `WhatsAppThreadSummary.numberStatus` exists, and that requires already
   * knowing a `threadId`), so this launcher cannot fetch these itself for a
   * caller with no thread context, such as the pet profile. Omit them and
   * the sheet renders with no warning -- exactly D-13's behavior for an
   * owner this caller has no signal about.
   */
  optedOut?: boolean;
  numberInvalid?: boolean;
  consentWarning?: boolean;
  onSuccess?: (messageId: string) => void;
}

export function SendTemplateLauncher({
  templateKey,
  owner,
  pet,
  contextType,
  contextId,
  prefilledVariables,
  label,
  disabled,
  optedOut,
  numberInvalid,
  consentWarning,
  onSuccess,
}: SendTemplateLauncherProps) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Button
        variant="outlined"
        label={label ?? `Send ${WA_TEMPLATE_STAFF_NAMES[templateKey]}`}
        onPress={() => setVisible(true)}
        disabled={disabled}
        testID={`send-template-launcher-${templateKey}`}
      />
      <TemplateSendSheet
        visible={visible}
        onDismiss={() => setVisible(false)}
        templateKey={templateKey}
        owner={owner}
        pet={pet}
        contextType={contextType}
        contextId={contextId}
        prefilledVariables={prefilledVariables}
        consentWarning={consentWarning}
        optedOut={optedOut}
        numberInvalid={numberInvalid}
        onSuccess={(messageId) => {
          setVisible(false);
          onSuccess?.(messageId);
        }}
      />
    </>
  );
}
