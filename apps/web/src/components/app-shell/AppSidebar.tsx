'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { DashboardPanelId } from '@breeyo/types';
import styles from './AppSidebar.module.css';

interface NavItem {
  id: string;
  label: string;
  href: string;
  /** Present for every route except Home: gates visibility on the matching cockpit panel. */
  panelId?: DashboardPanelId;
}

// 09-UI-SPEC.md "Dashboard Navigation": Home, Queue, Scheduling, Billing,
// Inventory, Users, and Settings when authorized. Settings has no dedicated
// browser-access module code of its own in Phase 9 (D-19's toggle set is
// QUEUE/SCHEDULING/BILLING/INVENTORY/INVENTORY_WRITE/USERS) and clinic
// settings are already Admin-only via `MANAGE_CLINIC_SETTINGS` (Phase 1), so
// it shares the USERS panel's gate here rather than inventing a new one.
const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', href: '/dashboard' },
  { id: 'queue', label: 'Queue', href: '/queue', panelId: 'QUEUE' },
  { id: 'scheduling', label: 'Scheduling', href: '/schedule', panelId: 'SCHEDULING' },
  { id: 'billing', label: 'Billing', href: '/billing', panelId: 'BILLING' },
  { id: 'inventory', label: 'Inventory', href: '/inventory', panelId: 'INVENTORY' },
  { id: 'users', label: 'Users', href: '/users', panelId: 'USERS' },
  { id: 'settings', label: 'Settings', href: '/settings', panelId: 'USERS' },
];

export interface AppSidebarProps {
  /** The cockpit's current `panels[].panelId` list -- re-derived by the caller on every fetch, never cached for the session. */
  visiblePanelIds: DashboardPanelId[];
}

/**
 * D-20: renders only the routes the caller is authorized for right now --
 * no lock icons, no "ask an admin" teaser rows for the rest. Because
 * `visiblePanelIds` always comes from the latest cockpit response (see
 * `useDashboardCockpit`), a module an Admin revokes mid-session (D-83)
 * disappears from this list within one fetch cycle, with no separate cache
 * to invalidate here.
 */
export function AppSidebar({ visiblePanelIds }: AppSidebarProps) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => !item.panelId || visiblePanelIds.includes(item.panelId));

  return (
    <nav className={styles.sidebar} aria-label="Dashboard navigation">
      <ul className={styles.list}>
        {items.map((item) => {
          const isActive = pathname === item.href;
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className={isActive ? `${styles.link} ${styles.active}` : styles.link}
                aria-current={isActive ? 'page' : undefined}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
