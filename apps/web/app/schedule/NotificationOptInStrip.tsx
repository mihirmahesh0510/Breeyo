'use client';

// The foreground-only browser notification opt-in (D-26/D-29, RESEARCH
// anti-pattern A6). This deliberately calls ONLY `Notification.
// requestPermission()` -- there is no background delivery worker
// registration, no push-messaging manifest entry, and no push-messaging
// application key of any kind anywhere in this file. D-26 scopes real push
// to staff Expo devices; this strip only raises an in-tab `Notification`
// while the page happens to be open, driven by the `appointments` list that
// the page's own already-open Socket.IO connection keeps refreshed
// (`useScheduleSocket`'s realtime events trigger the same refetch this
// component reads from -- no second socket connection here).
import { useEffect, useRef, useState } from 'react';
import { STARTING_SOON_LEAD_MINUTES } from '@breeyo/types';
import type { AppointmentWithDetails } from '@breeyo/types';
import type { ConnectionState } from '../../src/lib/useScheduleSocket';
import styles from './schedule.module.css';

const IST_TIME_ZONE = 'Asia/Kolkata';
const DISMISS_KEY = 'breeyo.web.schedule.notificationStripDismissed';

// A single, contained sessionStorage access point for this one dismissal
// flag -- following `auth-store.ts`'s own `typeof window === 'undefined'`
// guard discipline rather than adding a second ad hoc storage pattern
// elsewhere in the app.
function readDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.sessionStorage.getItem(DISMISS_KEY) === '1';
}

function writeDismissed(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(DISMISS_KEY, '1');
}

function formatTime(date: Date): string {
  return date
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: IST_TIME_ZONE })
    .toUpperCase();
}

export interface NotificationOptInStripProps {
  connectionState: ConnectionState;
  appointments: AppointmentWithDetails[];
}

export function NotificationOptInStrip({ appointments }: NotificationOptInStripProps) {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [dismissed, setDismissed] = useState(false);
  const notifiedIds = useRef(new Set<string>());

  useEffect(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') {
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission);
    setDismissed(readDismissed());
  }, []);

  // Foreground-only: whenever the (socket-refreshed) appointment list
  // changes, raise a `new Notification(...)` for anything starting within
  // the lead window that hasn't already been announced this session. There
  // is no background delivery path -- closing the tab stops this entirely.
  useEffect(() => {
    if (permission !== 'granted' || typeof Notification === 'undefined') return;

    const now = Date.now();
    const leadMs = STARTING_SOON_LEAD_MINUTES * 60 * 1000;

    for (const appointment of appointments) {
      if (notifiedIds.current.has(appointment.id)) continue;
      const scheduledFor = new Date(appointment.scheduledFor).getTime();
      const minutesUntil = scheduledFor - now;
      if (minutesUntil > 0 && minutesUntil <= leadMs) {
        const pet = appointment.pets[0]?.pet.name ?? 'Patient';
        const time = formatTime(new Date(appointment.scheduledFor));
        new Notification(`Appointment in ${STARTING_SOON_LEAD_MINUTES} min`, {
          body: `${pet} (${appointment.owner.name}) at ${time} with Dr. ${appointment.vet.name}.`,
        });
        notifiedIds.current.add(appointment.id);
      }
    }
  }, [appointments, permission]);

  async function handleTurnOnAlerts() {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }

  function handleDismiss() {
    writeDismissed();
    setDismissed(true);
  }

  if (permission === 'unsupported' || permission === 'granted' || permission === 'denied' || dismissed) {
    return null;
  }

  return (
    <div className={styles.notificationStrip} role="status">
      <span>Get a browser alert when an appointment is starting soon on this tab.</span>
      <div className={styles.notificationStripActions}>
        <button type="button" className={styles.buttonOutlined} onClick={handleTurnOnAlerts}>
          Turn On Alerts
        </button>
        <button
          type="button"
          className={styles.notificationDismissButton}
          onClick={handleDismiss}
          aria-label="Dismiss notification prompt"
        >
          ×
        </button>
      </div>
    </div>
  );
}
