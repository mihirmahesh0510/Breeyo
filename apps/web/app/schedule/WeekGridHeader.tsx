'use client';

// Sticky day-header band + week navigator + the socket reconnect caption
// strip (UI-SPEC § Web week grid, § Error states).
import type { ConnectionState } from '../../src/lib/useScheduleSocket';
import styles from './schedule.module.css';

const IST_TIME_ZONE = 'Asia/Kolkata';

function istDateKey(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: IST_TIME_ZONE });
}

function formatDayLabel(date: Date): string {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: IST_TIME_ZONE });
  const day = date.toLocaleDateString('en-US', { day: 'numeric', timeZone: IST_TIME_ZONE });
  return `${weekday} ${day}`;
}

export interface WeekGridHeaderProps {
  days: Date[];
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onThisWeek: () => void;
  connectionState: ConnectionState;
}

export function WeekGridHeader({ days, onPrevWeek, onNextWeek, onThisWeek, connectionState }: WeekGridHeaderProps) {
  const todayKey = istDateKey(new Date());
  const isCurrentWeek = days.some((day) => istDateKey(day) === todayKey);

  return (
    <div>
      {/* Real `<th scope="col">` day headers (UI-SPEC § Accessibility), laid
          out with the same grid-column template as the grid body below so
          each header cell sits directly above its column. */}
      <div className={`${styles.headerBand} ${styles.gridColumns}`} role="row">
        <th scope="col" className={styles.headerGutterCell}>
          <button type="button" className={styles.weekNavButton} onClick={onPrevWeek} aria-label="Previous week">
            ‹
          </button>
        </th>
        {days.map((day) => {
          const isToday = istDateKey(day) === todayKey;
          return (
            <th
              key={istDateKey(day)}
              scope="col"
              className={`${styles.dayHeaderCell} ${isToday ? styles.dayHeaderToday : ''}`}
            >
              <span className={isToday ? styles.dayHeaderTodayNumber : undefined}>{formatDayLabel(day)}</span>
            </th>
          );
        })}
      </div>
      <div className={styles.headerRow} style={{ marginBottom: 0, marginTop: 4 }}>
        <button type="button" className={styles.weekNavButton} onClick={onNextWeek} aria-label="Next week">
          ›
        </button>
        {!isCurrentWeek ? (
          <button type="button" className={styles.thisWeekButton} onClick={onThisWeek}>
            This Week
          </button>
        ) : null}
      </div>
      {connectionState === 'reconnecting' ? (
        <p className={styles.reconnectStrip} role="status">
          Live updates paused. Reconnecting…
        </p>
      ) : null}
    </div>
  );
}
