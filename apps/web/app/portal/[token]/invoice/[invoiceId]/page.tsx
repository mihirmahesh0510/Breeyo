'use client';

// Plan 09-06 Task 2: the invoice deep-link entry (D-60, D-63, OWN-02).
// `PortalShell` already resolves `deepLink.type === 'INVOICE'` to the
// Invoices tab via `usePortalSession`, so this route renders the same
// `PortalBody` as the overview route -- only pre-opening the
// `InvoiceDetailSheet` for `invoiceId` differs, and every other tab (and
// the pet switcher) stays fully reachable afterward.
import { useParams } from 'next/navigation';
import { PortalShell } from '../../../../../src/features/owner-portal/components/PortalShell';
import { PortalBody } from '../../PortalBody';

export default function OwnerPortalInvoiceDeepLinkPage() {
  const params = useParams<{ token: string; invoiceId: string }>();
  const { token, invoiceId } = params;

  return (
    <PortalShell token={token}>
      {(context) => <PortalBody token={token} context={context} initialOpenInvoiceId={invoiceId} />}
    </PortalShell>
  );
}
