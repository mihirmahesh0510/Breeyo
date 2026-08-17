/**
 * The queue board's React-Native-free decision layer.
 *
 * `apps/mobile` cannot render a React Native component under test: vitest
 * runs the `node` environment with no Metro/Babel transform, so `import
 * 'react-native'` fails at parse time, and `react-test-renderer` is not
 * installed. `QueueBoard.tsx` imports `SectionList`/`View`/`StyleSheet` from
 * `react-native`, so a test that imports it directly hits that wall. The
 * billing feature's `builder-state.ts` and `lib/wizard-utils.ts` hit the same
 * wall and resolved it the same way: the decisions live here, in a plain
 * module `QueueBoard.tsx` imports from, and this file is what a test imports.
 */

import { QueueStatus } from '@breeyo/types';
import type { QueueBoard as QueueBoardType, QueueEntryWithPet } from '@breeyo/types';

export interface SectionData {
  title: string;
  status: QueueStatus;
  data: QueueEntryWithPet[];
}

/**
 * Builds the four (or fewer) queue sections in display order: Expected first
 * (D-13 — visible without leaving the queue screen), then In Consult,
 * Waiting, Done. Each section is omitted entirely when its group is empty.
 */
export function buildQueueSections(
  data: QueueBoardType,
  showDoneSection: boolean,
): SectionData[] {
  const result: SectionData[] = [];
  if (data.expected.length > 0) {
    result.push({
      title: 'Expected',
      status: QueueStatus.EXPECTED,
      data: data.expected,
    });
  }
  if (data.inConsult.length > 0) {
    result.push({
      title: 'In Consult',
      status: QueueStatus.IN_CONSULT,
      data: data.inConsult,
    });
  }
  if (data.waiting.length > 0) {
    result.push({
      title: 'Waiting',
      status: QueueStatus.WAITING,
      data: data.waiting,
    });
  }
  if (data.done.length > 0) {
    result.push({
      title: 'Done',
      status: QueueStatus.DONE,
      data: showDoneSection ? data.done : [],
    });
  }
  return result;
}

/** Whether the board has nothing to show across all four groups. */
export function isQueueBoardEmpty(data: QueueBoardType): boolean {
  return (
    data.expected.length === 0 &&
    data.inConsult.length === 0 &&
    data.waiting.length === 0 &&
    data.done.length === 0
  );
}

/**
 * Position and estimated wait are only meaningful for the Waiting section.
 * Expected rows (not yet in line) and every other section get neither — an
 * Expected patient isn't in line yet, so a position would be a lie.
 */
export function getItemPositionInfo(
  section: SectionData,
  index: number,
): { position?: number; estimatedWait?: string } {
  const position = section.status === QueueStatus.WAITING ? index + 1 : undefined;
  const estimatedWait =
    section.status === QueueStatus.WAITING && position
      ? `${position * 10} min`
      : undefined;
  return { position, estimatedWait };
}

export interface SectionHeaderProps {
  title: string;
  count: number;
  status: QueueStatus;
  collapsible: boolean;
  collapsed: boolean | undefined;
  onToggleCollapse: (() => void) | undefined;
}

/**
 * Only the Done section collapses. Expected is deliberately not collapsible
 * (and gets no `onToggleCollapse`) — it should not be hideable the way a
 * completed-visits section can be.
 */
export function getSectionHeaderProps(
  section: SectionData,
  doneCount: number,
  showDoneSection: boolean,
  toggleDoneSection: () => void,
): SectionHeaderProps {
  const isDone = section.status === QueueStatus.DONE;
  return {
    title: section.title,
    count: isDone ? doneCount : section.data.length,
    status: section.status,
    collapsible: isDone,
    collapsed: isDone ? !showDoneSection : undefined,
    onToggleCollapse: isDone ? toggleDoneSection : undefined,
  };
}

// `getNextStatus` deliberately has no `EXPECTED` case: tapping an expected
// row's badge must never silently advance the patient straight into the
// queue. Check-in is a real-world event that needs the confirmation sheet
// (`ExpectedActionSheet`) — the fallback `null` below is what makes that so.
export function getNextStatus(current: QueueStatus): QueueStatus | null {
  if (current === QueueStatus.WAITING) return QueueStatus.IN_CONSULT;
  if (current === QueueStatus.IN_CONSULT) return QueueStatus.DONE;
  return null;
}
