'use client';

// The 400px right-side appointment detail drawer: check-in/move/cancel
// actions, the series-aware three-way cancel dialog, and the "cancelled
// elsewhere" inline notice that does NOT auto-close (UI-SPEC § Real-time
// sync, § Destructive confirmations). Mirrors mobile's
// `AppointmentQuickSheet.tsx` step for step, adapted to a drawer.
import { useEffect, useState } from 'react';
import { AppointmentStatus } from '@breeyo/types';
import type { AppointmentWithDetails } from '@breeyo/types';
import { useUpdateAppointmentStatus, useCancelAppointment } from '../../src/lib/useSchedule';
import styles from './schedule.module.css';

const IST_TIME_ZONE = 'Asia/Kolkata';

function formatTimeRange(scheduledFor: Date, durationMinutes: number): string {
  const end = new Date(scheduledFor.getTime() + durationMinutes * 60 * 1000);
  const format = (date: Date) =>
    date
      .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: IST_TIME_ZONE })
      .toUpperCase();
  return `${format(scheduledFor)} – ${format(end)}`;
}

function formatLongDate(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: IST_TIME_ZONE,
  });
}

export interface AppointmentDrawerProps {
  appointment: AppointmentWithDetails | null;
  onClose: () => void;
  onMove: (appointment: AppointmentWithDetails) => void;
  /** True when a realtime event reported this exact appointment cancelled by someone else. */
  cancelledElsewhere?: boolean;
}

type CancelDialogMode = 'none' | 'single' | 'series';

export function AppointmentDrawer({ appointment, onClose, onMove, cancelledElsewhere = false }: AppointmentDrawerProps) {
  const [cancelDialog, setCancelDialog] = useState<CancelDialogMode>('none');
  const updateStatus = useUpdateAppointmentStatus();
  const cancelAppointment = useCancelAppointment();

  useEffect(() => {
    setCancelDialog('none');
  }, [appointment?.id]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (cancelDialog !== 'none') {
          setCancelDialog('none');
        } else {
          onClose();
        }
      }
    }
    if (appointment) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [appointment, cancelDialog, onClose]);

  if (!appointment) {
    return null;
  }

  const scheduledFor = new Date(appointment.scheduledFor);
  const primaryPet = appointment.pets[0]?.pet;
  const petName = primaryPet?.name ?? 'This appointment';
  const isScheduled = appointment.status === AppointmentStatus.SCHEDULED;
  const isRecurring = appointment.recurringSeriesId != null;
  const actionsDisabled = cancelledElsewhere;

  function handleCheckIn() {
    if (!appointment) return;
    updateStatus.mutate(appointment.id, AppointmentStatus.CHECKED_IN).then(() => onClose());
  }

  function openCancelDialog() {
    setCancelDialog(isRecurring ? 'series' : 'single');
  }

  function handleCancelOne() {
    if (!appointment) return;
    cancelAppointment.mutate({ appointmentId: appointment.id, scope: 'ONE' }).then(() => {
      setCancelDialog('none');
      onClose();
    });
  }

  function handleCancelAllSeries() {
    if (!appointment) return;
    cancelAppointment.mutate({ appointmentId: appointment.id, scope: 'SERIES' }).then(() => {
      setCancelDialog('none');
      onClose();
    });
  }

  return (
    <>
      <div className={styles.drawerOverlay} onClick={onClose} />
      <div className={styles.drawerPanel} role="dialog" aria-modal="true" aria-label="Appointment detail">
        <div className={styles.drawerHeader}>
          <h2 className={styles.drawerTitle}>{petName}</h2>
          <button type="button" className={styles.drawerCloseButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.drawerBody}>
          {cancelledElsewhere ? (
            <p className={styles.inlineNoticeStrip} role="status">
              This appointment was just cancelled by someone else.
            </p>
          ) : null}

          <p className={styles.detailLine}>
            {formatTimeRange(scheduledFor, appointment.durationMinutes)}, {formatLongDate(scheduledFor)}
          </p>
          <p className={styles.detailLine}>{appointment.owner.name}</p>
          <p className={styles.detailLineMuted}>{appointment.owner.mobile}</p>
          <p className={styles.detailLineMuted}>
            {appointment.service?.name ?? 'Visit'} · {appointment.durationMinutes} min
          </p>
          <p className={styles.detailLineMuted}>with Dr. {appointment.vet.name}</p>
          <p className={styles.detailLineMuted}>Source: {appointment.source}</p>
          {isRecurring ? <p className={styles.detailLineMuted}>Part of a repeating series</p> : null}

          {appointment.pets.length > 1 ? (
            <>
              <p className={styles.sectionTitle}>Pets on this visit</p>
              {appointment.pets.map((petRef) => (
                <p key={petRef.id} className={styles.petListRow}>
                  {petRef.pet.name}
                </p>
              ))}
            </>
          ) : null}

          {isScheduled ? (
            <div className={styles.actionStack}>
              <button
                type="button"
                className={styles.buttonFilled}
                onClick={handleCheckIn}
                disabled={actionsDisabled || updateStatus.isPending}
              >
                Check In Now
              </button>
              <button
                type="button"
                className={styles.buttonOutlined}
                onClick={() => onMove(appointment)}
                disabled={actionsDisabled}
              >
                Move Appointment
              </button>
              <button
                type="button"
                className={styles.buttonDestructive}
                onClick={openCancelDialog}
                disabled={actionsDisabled}
              >
                Cancel Appointment
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {cancelDialog === 'single' ? (
        <div className={styles.dialogOverlay} role="dialog" aria-modal="true">
          <div className={styles.dialogCard}>
            <h3 className={styles.dialogTitle}>Cancel this appointment?</h3>
            <p className={styles.dialogBody}>
              {petName} at {formatTimeRange(scheduledFor, appointment.durationMinutes)} on {formatLongDate(scheduledFor)} will
              be cancelled. {appointment.owner.name} gets a WhatsApp update.
            </p>
            <div className={styles.dialogButtonStack}>
              <button type="button" className={styles.buttonOutlined} onClick={() => setCancelDialog('none')}>
                Keep Appointment
              </button>
              <button
                type="button"
                className={styles.buttonDestructive}
                onClick={handleCancelOne}
                disabled={cancelAppointment.isPending}
              >
                Cancel Appointment
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelDialog === 'series' ? (
        <div className={styles.dialogOverlay} role="dialog" aria-modal="true">
          <div className={styles.dialogCard}>
            <h3 className={styles.dialogTitle}>Cancel repeat appointments?</h3>
            <p className={styles.dialogBody}>This is 1 of a repeating series for {petName}.</p>
            <div className={styles.dialogButtonStack}>
              <button type="button" className={styles.buttonOutlined} onClick={() => setCancelDialog('none')}>
                Keep All
              </button>
              <button type="button" className={styles.buttonOutlined} onClick={handleCancelOne}>
                Cancel This One
              </button>
              <button
                type="button"
                className={styles.buttonDestructive}
                onClick={handleCancelAllSeries}
                disabled={cancelAppointment.isPending}
              >
                {/* `AppointmentWithDetails` doesn't carry the series' total
                    occurrence count (mobile's `AppointmentQuickSheet.tsx`
                    makes the same simplification -- its `LABEL_CANCEL_ALL`
                    is the bare 'Cancel All', not UI-SPEC's literal
                    'Cancel All {n}'), so this reads the same as the already
                    -committed mobile copy rather than fabricating a number. */}
                Cancel All
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
