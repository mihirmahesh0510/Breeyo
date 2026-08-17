'use client';

// D-25's 7-day by 30-minute grid -- the first real screen in `apps/web`.
// Full `role="grid"`/`role="row"`/`role="gridcell"` semantics, disabled
// non-working/blocked cells, a live now-line on today's column, and arrow-key
// cell navigation (UI-SPEC § Web week grid, § Accessibility).
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { AppointmentWithDetails } from '@breeyo/types';
import type { RowBounds, PlacedBlock } from '../../src/lib/week-grid';
import { placeAppointments } from '../../src/lib/week-grid';
import type { ClinicVet, ResolvedAvailabilityEntry } from '../../src/lib/useSchedule';
import { AppointmentBlock } from './AppointmentBlock';
import styles from './schedule.module.css';

const IST_TIME_ZONE = 'Asia/Kolkata';
const ROW_HEIGHT_PX = 64; // matches schedule.module.css's --spacing-5xl row height
const NOW_LINE_REFRESH_MS = 60_000;

function istDateKey(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: IST_TIME_ZONE });
}

function istMinutesOfDay(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: IST_TIME_ZONE,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

function formatHourLabel(minutes: number): string {
  const anchor = new Date(Date.UTC(2000, 0, 1, Math.floor(minutes / 60), minutes % 60));
  return anchor
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' })
    .toUpperCase()
    .replace(':00', ':00');
}

function isRowBookable(dayAvailability: ResolvedAvailabilityEntry[], rowStartMinutes: number): boolean {
  if (dayAvailability.length === 0) {
    // No data yet (or no vets configured) -- don't pre-emptively disable.
    return true;
  }
  return dayAvailability.some((entry) => {
    if (!entry.hours) return false;
    const withinHours = rowStartMinutes >= entry.hours.openMinutes && rowStartMinutes < entry.hours.closeMinutes;
    if (!withinHours) return false;
    const blocked = entry.blockedRanges.some(
      (range) => rowStartMinutes >= range.startMinutes && rowStartMinutes < range.endMinutes,
    );
    return !blocked;
  });
}

export interface WeekGridProps {
  days: Date[];
  bounds: RowBounds;
  appointments: AppointmentWithDetails[];
  vets: ClinicVet[];
  availabilityByDay: ResolvedAvailabilityEntry[][];
  onOpenAppointment: (appointment: AppointmentWithDetails) => void;
  onOpenCell: (dayIndex: number, startMinutes: number) => void;
  showSkeleton?: boolean;
}

export function WeekGrid({
  days,
  bounds,
  appointments,
  vets,
  availabilityByDay,
  onOpenAppointment,
  onOpenCell,
  showSkeleton = false,
}: WeekGridProps) {
  const [now, setNow] = useState(() => new Date());
  const [focusedCell, setFocusedCell] = useState<{ dayIndex: number; rowIndex: number }>({
    dayIndex: 0,
    rowIndex: 0,
  });
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());

  // The now-line repositions every 60s -- cleared on unmount so no orphaned
  // timer keeps a closed grid instance alive.
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), NOW_LINE_REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  const placed: PlacedBlock[] = placeAppointments(appointments, days, bounds);
  const todayKey = istDateKey(now);
  const todayDayIndex = days.findIndex((d) => istDateKey(d) === todayKey);
  const nowMinutes = istMinutesOfDay(now);
  const nowWithinGrid = nowMinutes >= bounds.startMinutes && nowMinutes <= bounds.endMinutes;

  const rows = Array.from({ length: bounds.rowCount }, (_, i) => bounds.startMinutes + i * 30);

  function registerCell(dayIndex: number, rowIndex: number, el: HTMLButtonElement | null) {
    const key = `${dayIndex}-${rowIndex}`;
    if (el) {
      cellRefs.current.set(key, el);
    } else {
      cellRefs.current.delete(key);
    }
  }

  function focusCell(dayIndex: number, rowIndex: number) {
    const clampedDay = Math.max(0, Math.min(6, dayIndex));
    const clampedRow = Math.max(0, Math.min(bounds.rowCount - 1, rowIndex));
    setFocusedCell({ dayIndex: clampedDay, rowIndex: clampedRow });
    cellRefs.current.get(`${clampedDay}-${clampedRow}`)?.focus();
  }

  function handleCellKeyDown(event: KeyboardEvent<HTMLButtonElement>, dayIndex: number, rowIndex: number) {
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        focusCell(dayIndex, rowIndex - 1);
        break;
      case 'ArrowDown':
        event.preventDefault();
        focusCell(dayIndex, rowIndex + 1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        focusCell(dayIndex - 1, rowIndex);
        break;
      case 'ArrowRight':
        event.preventDefault();
        focusCell(dayIndex + 1, rowIndex);
        break;
      case 'Enter':
        event.preventDefault();
        onOpenCell(dayIndex, bounds.startMinutes + rowIndex * 30);
        break;
      default:
        break;
    }
  }

  return (
    <div className={styles.gridScrollContainer}>
      <div className={styles.gridInner}>
        <div className={`${styles.grid} ${styles.gridColumns}`} role="grid" aria-label="Appointment schedule, 7 day week">
          {rows.map((rowStartMinutes, rowIndex) => {
            const isHour = rowStartMinutes % 60 === 0;
            return (
              <div role="row" key={rowStartMinutes} style={{ display: 'contents' }}>
                <div
                  role="gridcell"
                  className={`${styles.timeGutterCell} ${!isHour ? styles.timeGutterCellHalf : ''}`}
                  style={{ gridRow: rowIndex + 1, gridColumn: 1, height: ROW_HEIGHT_PX }}
                >
                  {isHour ? formatHourLabel(rowStartMinutes) : ''}
                </div>

                {days.map((day, dayIndex) => {
                  const dayAvailability = availabilityByDay[dayIndex] ?? [];
                  const bookable = isRowBookable(dayAvailability, rowStartMinutes);
                  const isFocused = focusedCell.dayIndex === dayIndex && focusedCell.rowIndex === rowIndex;
                  const key = istDateKey(day);

                  return (
                    <button
                      key={`${key}-${rowStartMinutes}`}
                      ref={(el) => registerCell(dayIndex, rowIndex, el)}
                      type="button"
                      role="gridcell"
                      disabled={!bookable}
                      aria-disabled={!bookable}
                      tabIndex={isFocused ? 0 : -1}
                      className={[
                        styles.cell,
                        !isHour ? styles.cellHalf : '',
                        bookable ? styles.cellBookable : styles.cellDisabled,
                        isFocused ? styles.cellFocused : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{ gridRow: rowIndex + 1, gridColumn: dayIndex + 2, height: ROW_HEIGHT_PX }}
                      onFocus={() => setFocusedCell({ dayIndex, rowIndex })}
                      onKeyDown={(event) => handleCellKeyDown(event, dayIndex, rowIndex)}
                      onClick={() => bookable && onOpenCell(dayIndex, rowStartMinutes)}
                      aria-label={bookable ? `Book ${formatHourLabel(rowStartMinutes)}` : 'Not available'}
                    >
                      {bookable ? (
                        <span className={styles.cellPlusGlyph} aria-hidden="true">
                          +
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}

          {showSkeleton
            ? Array.from({ length: 6 }, (_, i) => (
                <div
                  key={`skeleton-${i}`}
                  className={styles.skeletonBlock}
                  style={{
                    gridRow: `${(i % 4) + 1} / span 2`,
                    gridColumn: (i % 7) + 2,
                    margin: 4,
                    height: ROW_HEIGHT_PX * 2 - 8,
                  }}
                  aria-hidden="true"
                />
              ))
            : placed.map((block) => {
                const top = block.rowIndex * ROW_HEIGHT_PX;
                const height = block.rowSpan * ROW_HEIGHT_PX;
                const widthPct = 100 / block.columnCount;
                const leftPct = block.columnIndex * widthPct;

                return (
                  <div
                    key={block.appointment.id}
                    style={{
                      gridRow: `${block.rowIndex + 1} / span ${block.rowSpan}`,
                      gridColumn: block.dayIndex + 2,
                      position: 'relative',
                      pointerEvents: 'none',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        height,
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        pointerEvents: 'auto',
                        padding: 1,
                        boxSizing: 'border-box',
                      }}
                    >
                      <AppointmentBlock
                        appointment={block.appointment}
                        vets={vets}
                        overflowCount={block.overflowCount}
                        onOpen={onOpenAppointment}
                        onOpenOverflow={() => onOpenAppointment(block.appointment)}
                        style={{ position: 'absolute', inset: 0 }}
                      />
                    </div>
                  </div>
                );
              })}

          {todayDayIndex !== -1 && nowWithinGrid && !showSkeleton ? (
            <div
              style={{
                gridRow: `${Math.floor((nowMinutes - bounds.startMinutes) / 30) + 1}`,
                gridColumn: todayDayIndex + 2,
                position: 'relative',
                pointerEvents: 'none',
              }}
              aria-hidden="true"
            >
              <div
                className={styles.nowLine}
                style={{
                  top: ((nowMinutes - bounds.startMinutes) % 30) * (ROW_HEIGHT_PX / 30),
                }}
              >
                <span className={styles.nowDot} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
