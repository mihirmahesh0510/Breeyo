'use client';

// Plan 09-06: the owner-portal overview-first route (D-46 to D-51, D-57,
// D-60, D-63, OWN-01, OWN-02). Deliberately a separate, simpler 'use
// client' page -- no `DashboardShell`, no `useAuth`, no Socket.IO; see
// `PortalShell.tsx`'s header comment for why.
//
// Body/data-fetching logic lives in the colocated `PortalBody.tsx` (not a
// Next.js route file) rather than here, so the invoice deep-link route can
// import and reuse it -- see that file's header comment for why it isn't
// inlined into this page module.
import { useParams } from 'next/navigation';
import { PortalShell } from '../../../src/features/owner-portal/components/PortalShell';
import { PortalBody } from './PortalBody';

export default function OwnerPortalOverviewPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  return (
    <PortalShell token={token}>{(context) => <PortalBody token={token} context={context} />}</PortalShell>
  );
}
