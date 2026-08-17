import { describe, it, expect } from 'vitest';
import { QueueStatus } from '@breeyo/types';
import type { QueueBoard as QueueBoardType, QueueEntryWithPet } from '@breeyo/types';
import {
  buildQueueSections,
  isQueueBoardEmpty,
  getItemPositionInfo,
  getSectionHeaderProps,
} from '../../lib/queue-board-utils';
import type { SectionData } from '../../lib/queue-board-utils';
import { applyOptimisticStatusChange } from '../../lib/queue-optimistic';

/**
 * `apps/mobile` runs vitest in a `node` environment with no Metro/Babel
 * transform, so `import 'react-native'` fails at parse time (confirmed:
 * importing `QueueBoard.tsx` or `useQueueActions.ts` directly -- both pull in
 * `react-native`/`expo-haptics` -- throws `Expected 'from', got 'typeOf'`
 * from Vite's SSR transform), and `react-test-renderer` is not installed.
 * The billing feature's `builder-state.ts` and `lib/wizard-utils.ts` hit the
 * same wall and resolved it the same way: the section-building decisions and
 * the optimistic-rebuild decision live in RN-free `lib/*.ts` modules that
 * `QueueBoard.tsx`/`useQueueActions.ts` import from, and this file exercises
 * those modules directly with plain objects instead of through a renderer.
 */

let idCounter = 0;

function makeEntry(overrides: Partial<QueueEntryWithPet> = {}): QueueEntryWithPet {
  idCounter += 1;
  const id = overrides.id ?? `entry-${idCounter}`;
  return {
    id,
    clinicId: 'clinic-1',
    petId: `pet-${idCounter}`,
    checkedInBy: 'staff-1',
    treatingVetId: null,
    status: QueueStatus.WAITING,
    position: 0,
    isEmergency: false,
    visitReason: null,
    checkedInAt: new Date('2026-08-16T09:00:00.000Z'),
    calledAt: null,
    completedAt: null,
    archivedAt: null,
    updatedAt: new Date('2026-08-16T09:00:00.000Z'),
    queuePriorityAt: new Date('2026-08-16T09:00:00.000Z'),
    appointmentId: null,
    pet: {
      id: `pet-${idCounter}`,
      name: `Pet ${idCounter}`,
      species: 'DOG',
      owner: {
        id: `owner-${idCounter}`,
        name: `Owner ${idCounter}`,
        mobile: '9876543210',
      },
    },
    ...overrides,
  };
}

function makeBoard(overrides: Partial<QueueBoardType> = {}): QueueBoardType {
  return {
    expected: [],
    inConsult: [],
    waiting: [],
    done: [],
    ...overrides,
  };
}

describe('buildQueueSections', () => {
  it('renders the Expected section first, above In Consult, Waiting, Done', () => {
    const board = makeBoard({
      expected: [makeEntry({ status: QueueStatus.EXPECTED })],
      inConsult: [makeEntry({ status: QueueStatus.IN_CONSULT })],
      waiting: [makeEntry({ status: QueueStatus.WAITING })],
      done: [makeEntry({ status: QueueStatus.DONE })],
    });

    const sections = buildQueueSections(board, true);

    expect(sections.map((s) => s.title)).toEqual([
      'Expected',
      'In Consult',
      'Waiting',
      'Done',
    ]);
  });

  it('omits the Expected section when there are no expected entries', () => {
    const board = makeBoard({
      inConsult: [makeEntry({ status: QueueStatus.IN_CONSULT })],
    });

    const sections = buildQueueSections(board, true);

    expect(sections.find((s) => s.title === 'Expected')).toBeUndefined();
  });

  it('keeps Waiting section positions unaffected by the presence of an Expected section', () => {
    const board = makeBoard({
      expected: [makeEntry(), makeEntry()],
      waiting: [makeEntry(), makeEntry(), makeEntry()],
    });

    const sections = buildQueueSections(board, true);
    const waitingSection = sections.find((s) => s.title === 'Waiting')!;

    const positions = waitingSection.data.map((item, index) =>
      getItemPositionInfo(waitingSection, index).position,
    );
    expect(positions).toEqual([1, 2, 3]);
  });
});

describe('isQueueBoardEmpty', () => {
  it('accounts for all four groups: a board with only expected entries is not empty', () => {
    const board = makeBoard({ expected: [makeEntry({ status: QueueStatus.EXPECTED })] });
    expect(isQueueBoardEmpty(board)).toBe(false);
  });

  it('is empty when all four groups are empty', () => {
    expect(isQueueBoardEmpty(makeBoard())).toBe(true);
  });
});

describe('getItemPositionInfo', () => {
  it('gives Expected rows no position and no wait estimate', () => {
    const section: SectionData = {
      title: 'Expected',
      status: QueueStatus.EXPECTED,
      data: [makeEntry({ status: QueueStatus.EXPECTED })],
    };

    const info = getItemPositionInfo(section, 0);

    expect(info.position).toBeUndefined();
    expect(info.estimatedWait).toBeUndefined();
  });
});

describe('getSectionHeaderProps', () => {
  it('marks the Expected section header as not collapsible with no onToggleCollapse', () => {
    const section: SectionData = {
      title: 'Expected',
      status: QueueStatus.EXPECTED,
      data: [makeEntry({ status: QueueStatus.EXPECTED })],
    };
    const toggleDoneSection = () => {};

    const props = getSectionHeaderProps(section, 0, true, toggleDoneSection);

    expect(props.collapsible).toBe(false);
    expect(props.onToggleCollapse).toBeUndefined();
  });
});

describe('applyOptimisticStatusChange', () => {
  it('moves an EXPECTED entry to WAITING, leaving inConsult and done untouched', () => {
    const expectedEntry = makeEntry({ status: QueueStatus.EXPECTED });
    const inConsultEntry = makeEntry({ status: QueueStatus.IN_CONSULT });
    const doneEntry = makeEntry({ status: QueueStatus.DONE });
    const board = makeBoard({
      expected: [expectedEntry],
      inConsult: [inConsultEntry],
      done: [doneEntry],
    });

    const result = applyOptimisticStatusChange(board, expectedEntry.id, QueueStatus.WAITING);

    expect(result.expected).toEqual([]);
    expect(result.waiting.map((e) => e.id)).toEqual([expectedEntry.id]);
    expect(result.waiting[0].status).toBe(QueueStatus.WAITING);
    expect(result.inConsult).toEqual([inConsultEntry]);
    expect(result.done).toEqual([doneEntry]);
  });

  it('moves an EXPECTED entry to NO_SHOW into the done group', () => {
    const expectedEntry = makeEntry({ status: QueueStatus.EXPECTED });
    const board = makeBoard({ expected: [expectedEntry] });

    const result = applyOptimisticStatusChange(board, expectedEntry.id, QueueStatus.NO_SHOW);

    expect(result.expected).toEqual([]);
    expect(result.done.map((e) => e.id)).toEqual([expectedEntry.id]);
    expect(result.done[0].status).toBe(QueueStatus.NO_SHOW);
  });

  it('rolls back to a board deep-equal to the pre-mutation board, including expected', () => {
    const expectedEntry = makeEntry({ status: QueueStatus.EXPECTED });
    const waitingEntry = makeEntry({ status: QueueStatus.WAITING });
    const inConsultEntry = makeEntry({ status: QueueStatus.IN_CONSULT });
    const doneEntry = makeEntry({ status: QueueStatus.DONE });
    const board = makeBoard({
      expected: [expectedEntry],
      waiting: [waitingEntry],
      inConsult: [inConsultEntry],
      done: [doneEntry],
    });
    const snapshot = JSON.parse(JSON.stringify(board));

    // Simulate onMutate's optimistic write...
    const mutated = applyOptimisticStatusChange(board, expectedEntry.id, QueueStatus.WAITING);
    expect(mutated).not.toEqual(board);

    // ...then onError's rollback: `previous` (the original `board`) must be
    // byte-identical to the pre-mutation snapshot -- the rebuild must never
    // have mutated its input, or the rollback would restore a corrupted board.
    expect(JSON.parse(JSON.stringify(board))).toEqual(snapshot);
    expect(board.expected).toHaveLength(1);
    expect(board.waiting).toHaveLength(1);
    expect(board.inConsult).toHaveLength(1);
    expect(board.done).toHaveLength(1);
  });
});
