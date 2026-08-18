/**
 * The queue mutation's React-Native-free optimistic-rebuild decision.
 *
 * `apps/mobile` cannot import `useQueueActions.ts` directly under vitest --
 * it pulls in `expo-haptics`, which fails to parse in the `node` test
 * environment the same way `react-native` does (no Metro/Babel transform).
 * See `queue-board-utils.ts` for the full explanation; this file follows the
 * same pattern so the rebuild logic is testable with plain objects.
 *
 * This is the fix for the bug 08-PATTERNS.md finding 4 flags: the rebuild
 * used to reconstruct exactly three arrays (`inConsult`, `waiting`, `done`)
 * by name, which silently dropped the entire `expected` group on every
 * optimistic mutation. All four groups are now carried through.
 */

import type { QueueBoard, QueueEntryWithPet, QueueStatus } from '@breeyo/types';

export function applyOptimisticStatusChange(
  board: QueueBoard,
  entryId: string,
  status: QueueStatus,
): QueueBoard {
  const allEntries = [
    ...board.expected,
    ...board.inConsult,
    ...board.waiting,
    ...board.done,
  ];
  const entry = allEntries.find((e) => e.id === entryId);
  if (!entry) return board;

  const updated = { ...entry, status: status as string } as QueueEntryWithPet;
  const removeEntry = (list: QueueEntryWithPet[]) =>
    list.filter((e) => e.id !== entryId);

  const newBoard: QueueBoard = {
    expected: removeEntry(board.expected),
    inConsult: removeEntry(board.inConsult),
    waiting: removeEntry(board.waiting),
    done: removeEntry(board.done),
  };

  if (status === 'IN_CONSULT') {
    newBoard.inConsult.push(updated);
  } else if (status === 'WAITING') {
    // D-11: early check-in flips an EXPECTED entry straight to WAITING.
    newBoard.waiting.push(updated);
  } else {
    // NO_SHOW and DONE both land in the closed `done` group.
    newBoard.done.push(updated);
  }

  return newBoard;
}
