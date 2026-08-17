'use client';

// The positioned appointment block -- the nine-element anatomy from
// UI-SPEC § Appointment card/block anatomy, in fixed order: vet rail, time,
// pet name, owner name, service line, multi-pet caption, vet-initials chip,
// status badge (omitted for SCHEDULED), recurrence marker.
import type { CSSProperties } from 'react';
import { AppointmentStatus, APPOINTMENT_STATUS_LABELS } from '@breeyo/types';
import type { AppointmentWithDetails } from '@breeyo/types';
import type { ClinicVet } from '../../src/lib/useSchedule';
import { vetHueClassName } from './VetLegend';
import styles from './schedule.module.css';

const IST_TIME_ZONE = 'Asia/Kolkata';

function formatTime(date: Date): string {
  return date
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: IST_TIME_ZONE })
    .toUpperCase();
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const second = parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] ?? '';
  return `${first}${second}`.toUpperCase();
}

const STATUS_BADGE_CLASS: Partial<Record<AppointmentStatus, string>> = {
  [AppointmentStatus.CHECKED_IN]: styles.statusCheckedIn,
  [AppointmentStatus.COMPLETED]: styles.statusCompleted,
  [AppointmentStatus.CANCELLED]: styles.statusCancelled,
  [AppointmentStatus.NO_SHOW]: styles.statusNoShow,
};

export interface AppointmentBlockProps {
  appointment: AppointmentWithDetails;
  vets: ClinicVet[];
  style: CSSProperties;
  overflowCount: number;
  onOpen: (appointment: AppointmentWithDetails) => void;
  onOpenOverflow?: () => void;
}

export function AppointmentBlock({ appointment, vets, style, overflowCount, onOpen, onOpenOverflow }: AppointmentBlockProps) {
  const sortedVetIds = vets.map((v) => v.id).sort();
  const hueClass = vetHueClassName(appointment.vetId, sortedVetIds);
  const scheduledFor = new Date(appointment.scheduledFor);
  const primaryPet = appointment.pets[0]?.pet;
  const extraPetCount = Math.max(0, appointment.pets.length - 1);
  const isCancelled = appointment.status === AppointmentStatus.CANCELLED;
  const badgeClass = STATUS_BADGE_CLASS[appointment.status];
  const isRecurring = appointment.recurringSeriesId != null;

  const petName = primaryPet?.name ?? 'Appointment';
  const ownerName = appointment.owner.name;
  const serviceLabel = appointment.service
    ? `${appointment.service.name} · ${appointment.durationMinutes} min`
    : `Visit · ${appointment.durationMinutes} min`;
  const statusLabel = APPOINTMENT_STATUS_LABELS[appointment.status];

  const ariaLabel = `${formatTime(scheduledFor)}, ${petName}, ${ownerName}, ${serviceLabel}, with Dr. ${appointment.vet.name}, ${statusLabel}`;

  return (
    <button
      type="button"
      className={`${styles.block} ${isCancelled ? styles.blockCancelled : ''}`}
      style={style}
      onClick={() => onOpen(appointment)}
      aria-label={ariaLabel}
    >
      {/* 1. Vet rail -- 4px, hidden for a solo-vet clinic. */}
      {hueClass ? <span className={`${styles.blockVetRail} ${hueClass}`} aria-hidden="true" /> : null}

      <div className={styles.blockContent}>
        <div className={styles.blockTopRow}>
          {/* 2. Time. */}
          <span className={styles.blockTime}>{formatTime(scheduledFor)}</span>
          {/* 9. Recurrence marker, next to the time. */}
          {isRecurring ? (
            <svg
              className={styles.blockRecurrenceIcon}
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M17 2l4 4-4 4" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <path d="M7 22l-4-4 4-4" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          ) : null}
        </div>

        {/* 3. Pet name. */}
        <span className={`${styles.blockPetName} ${isCancelled ? styles.blockPetNameCancelled : ''}`}>{petName}</span>

        {/* 4. Owner name. */}
        <span className={styles.blockOwnerName}>{ownerName}</span>

        {/* 5. Service line. */}
        <span className={styles.blockServiceLine}>{serviceLabel}</span>

        {/* 6. Multi-pet indicator (D-21) -- pet names themselves live in the
            drawer, never on the block. */}
        {extraPetCount > 0 ? (
          <span className={styles.blockMultiPetCaption}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="15" r="4" />
              <circle cx="5" cy="8" r="2.2" />
              <circle cx="19" cy="8" r="2.2" />
              <circle cx="8.5" cy="4.5" r="2" />
              <circle cx="15.5" cy="4.5" r="2" />
            </svg>
            +{extraPetCount} more pets
          </span>
        ) : null}

        <div className={styles.blockBottomRow}>
          {/* 7. Vet-initials chip, hidden for a solo-vet clinic. */}
          {hueClass ? (
            <span className={`${styles.vetInitialsChip} ${hueClass}`}>{getInitials(appointment.vet.name)}</span>
          ) : (
            <span />
          )}

          {/* 8. Status badge -- omitted entirely for SCHEDULED. */}
          {appointment.status !== AppointmentStatus.SCHEDULED && badgeClass ? (
            <span className={`${styles.statusBadge} ${badgeClass}`}>{statusLabel}</span>
          ) : null}
        </div>
      </div>

      {overflowCount > 0 ? (
        <span
          role="button"
          tabIndex={0}
          className={styles.overflowChip}
          onClick={(event) => {
            event.stopPropagation();
            onOpenOverflow?.();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.stopPropagation();
              onOpenOverflow?.();
            }
          }}
          aria-label={`${overflowCount} more appointments in this slot`}
        >
          +{overflowCount}
        </span>
      ) : null}
    </button>
  );
}
