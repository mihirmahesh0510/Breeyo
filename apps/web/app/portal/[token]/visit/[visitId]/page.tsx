'use client';

// Plan 09-06 Task 1: the visit deep-link entry (D-60, D-63, OWN-01).
// `PortalShell` already resolves `deepLink.type === 'VISIT'` to the Records
// tab via `usePortalSession`'s `resolveDeepLinkTab`, so this route renders
// the exact same shell + Records body as the overview route -- the
// `visitId` param only needs to pick out which visit to scroll to /
// highlight, and every other tab stays fully reachable afterward.
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PortalShell, type PortalShellRenderContext } from '../../../../../src/features/owner-portal/components/PortalShell';
import { VisitTimeline } from '../../../../../src/features/owner-portal/components/VisitTimeline';
import type { VisitCardEntry } from '../../../../../src/features/owner-portal/components/VisitCard';
import { apiClient } from '../../../../../src/lib/api';
import styles from '../../portal-page.module.css';

interface RecordsResponse {
  data: { visits: VisitCardEntry[] };
}

function VisitDeepLinkBody({
  token,
  visitId,
  context,
}: {
  token: string;
  visitId: string;
  context: PortalShellRenderContext;
}) {
  const [visits, setVisits] = useState<VisitCardEntry[] | null>(null);

  useEffect(() => {
    if (!context.selectedPetId) return;
    let cancelled = false;
    apiClient<RecordsResponse>(`/api/v1/owner-portal/${token}/records?petId=${context.selectedPetId}`)
      .then((response: RecordsResponse) => {
        if (!cancelled) setVisits(response.data.visits);
      })
      .catch(() => {
        if (!cancelled) setVisits([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token, context.selectedPetId]);

  // If the deep-linked visit belongs to a different pet in scope than the
  // one currently selected, `visits` simply will not contain it -- the
  // owner still sees that pet's timeline rather than an error, and can use
  // the pet switcher (still rendered by `PortalShell`) to find it.
  const hasTarget = visits?.some((visit) => visit.visitId === visitId) ?? true;

  return (
    <div className={styles.tabBody}>
      {!hasTarget ? (
        <p className={styles.stateText}>
          That visit is on a different pet -- use the pet switcher above to find it.
        </p>
      ) : null}
      <VisitTimeline visits={visits ?? []} />
    </div>
  );
}

export default function OwnerPortalVisitDeepLinkPage() {
  const params = useParams<{ token: string; visitId: string }>();
  const { token, visitId } = params;

  return (
    <PortalShell token={token}>
      {(context: PortalShellRenderContext) => (
        <VisitDeepLinkBody token={token} visitId={visitId} context={context} />
      )}
    </PortalShell>
  );
}
