'use client';

// D-21, D-28: the admin-only full user-management module -- role/browser
// access toggles, active/inactive status, and D-24's visible actor+timestamp
// metadata. Home's `UserManagementMiniPanel` is the awareness surface (D-11);
// this is where the actual changes happen.
import { useCallback, useEffect, useState } from 'react';
import type { ClinicBrowserAccessPolicy } from '@breeyo/types';
import { useRequireAuth } from '../../src/lib/useRequireAuth';
import { useAuth, handleUnauthorized } from '../../src/lib/AuthProvider';
import { apiClient } from '../../src/lib/api';
import { useDashboardCockpit } from '../../src/features/dashboard/hooks/useDashboardCockpit';
import { DashboardShell } from '../../src/components/app-shell/DashboardShell';
import { HighRiskConfirmDialog } from '../../src/features/dashboard/components/HighRiskConfirmDialog';
import styles from './users.module.css';

interface StaffMember {
  userId: string;
  fullName: string;
  email: string;
  roleNames: string[];
  isActive: boolean;
}

interface PendingStatusChange {
  member: StaffMember;
  nextActive: boolean;
}

export default function UsersPage() {
  const { ready } = useRequireAuth();
  const { accessToken, user } = useAuth();
  // D-83: if `usersEnabled` is revoked while this page is open, the very
  // next cockpit fetch this hook makes redirects away from here -- not only
  // on this user's next login.
  const cockpit = useDashboardCockpit({ currentModulePanelId: 'USERS' });

  const [members, setMembers] = useState<StaffMember[]>([]);
  const [policies, setPolicies] = useState<ClinicBrowserAccessPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [pendingStatusChange, setPendingStatusChange] = useState<PendingStatusChange | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [membersResponse, policyResponse] = await Promise.all([
        apiClient<{ data: StaffMember[] }>('/api/v1/web-dashboard/users', { token: accessToken }),
        apiClient<{ data: ClinicBrowserAccessPolicy[] }>('/api/v1/web-dashboard/access-policy', { token: accessToken }),
      ]);
      setMembers(membersResponse.data);
      setPolicies(policyResponse.data);
    } catch (err) {
      if (!handleUnauthorized(err)) {
        setError(err as Error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmStatusChange = useCallback(async () => {
    if (!pendingStatusChange || !accessToken) {
      return;
    }
    setIsSubmitting(true);
    try {
      await apiClient(`/api/v1/web-dashboard/users/${pendingStatusChange.member.userId}/status`, {
        method: 'PATCH',
        token: accessToken,
        body: JSON.stringify({ isActive: pendingStatusChange.nextActive }),
      });
      setPendingStatusChange(null);
      await load();
    } catch (err) {
      if (!handleUnauthorized(err)) {
        setError(err as Error);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [pendingStatusChange, accessToken, load]);

  // D-19: Front Desk's module toggles only -- Clinician's row has no
  // exception path (D-15) and is rendered read-only below.
  const toggleModule = useCallback(
    async (policy: ClinicBrowserAccessPolicy, field: keyof ClinicBrowserAccessPolicy) => {
      if (!accessToken || policy.roleCode === 'CLINICIAN') {
        return;
      }
      try {
        await apiClient(`/api/v1/web-dashboard/access-policy/${policy.roleCode}`, {
          method: 'PATCH',
          token: accessToken,
          body: JSON.stringify({ [field]: !policy[field] }),
        });
        await load();
      } catch (err) {
        if (!handleUnauthorized(err)) {
          setError(err as Error);
        }
      }
    },
    [accessToken, load],
  );

  if (!ready) {
    return null;
  }

  const visiblePanelIds = cockpit.data?.panels.map((panel) => panel.panelId) ?? [];

  return (
    <DashboardShell visiblePanelIds={visiblePanelIds} userName={user?.fullName ?? ''} roleLabel="Admin">
      <main className={styles.page}>
        <h1 className={styles.title}>Users</h1>

        {error ? (
          <p className={styles.errorText}>Could not refresh live clinic data. Retry this panel or reopen the module.</p>
        ) : null}
        {isLoading ? <p>Loading…</p> : null}

        <section aria-label="Staff">
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Roles</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.userId}>
                  <td>{member.fullName}</td>
                  <td>{member.roleNames.join(', ')}</td>
                  <td>{member.isActive ? 'Active' : 'Inactive'}</td>
                  <td>
                    <button
                      type="button"
                      className={styles.actionButton}
                      onClick={() => setPendingStatusChange({ member, nextActive: !member.isActive })}
                    >
                      {member.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section aria-label="Browser access by role">
          <h2 className={styles.sectionTitle}>Browser Access</h2>
          {policies.map((policy) => (
            <div key={policy.roleCode} className={styles.policyRow}>
              <span className={styles.policyRole}>{policy.roleCode}</span>
              <label>
                <input
                  type="checkbox"
                  checked={policy.browserEnabled}
                  disabled={policy.roleCode === 'CLINICIAN'}
                  onChange={() => toggleModule(policy, 'browserEnabled')}
                />
                Browser access
              </label>
              {policy.updatedByUserId ? (
                <span className={styles.metaRow}>
                  Last changed {new Date(policy.updatedAt).toLocaleString()}
                </span>
              ) : null}
            </div>
          ))}
        </section>

        <HighRiskConfirmDialog
          open={pendingStatusChange !== null}
          title={pendingStatusChange?.nextActive ? 'Reactivate user' : 'Deactivate user'}
          message={`Update access for ${pendingStatusChange?.member.fullName ?? ''}? Hidden modules will disappear immediately.`}
          confirmLabel={pendingStatusChange?.nextActive ? 'Reactivate' : 'Deactivate'}
          isLoading={isSubmitting}
          onConfirm={confirmStatusChange}
          onCancel={() => setPendingStatusChange(null)}
        />
      </main>
    </DashboardShell>
  );
}
