import { describe, it, expect, beforeEach } from 'vitest';
import { useConsultationDraftStore } from '../useConsultationDraft';

/**
 * `useConsultationDraft.ts` only imports `zustand` and `@breeyo/types` --
 * no `react-native` import -- so unlike most of this feature's components
 * it is directly testable under vitest's plain `node` environment.
 *
 * Plan 10-03 Task 1 adds `syncedSnapshot`: the draft state last known to be
 * in sync with the server, used as the three-way-diff baseline when an
 * offline save persists locally (see `offlineConsultationDraftStore.ts`'s
 * `computeChangedFields`/`saveOfflineConsultationDraft`). Without this, an
 * offline device would have no way to tell the API's
 * `consultationOfflineReplay.service.ts` which fields IT actually touched
 * versus which fields simply arrived pre-populated from the last load.
 */
describe('useConsultationDraftStore syncedSnapshot (Plan 10-03 Task 1)', () => {
  beforeEach(() => {
    useConsultationDraftStore.getState().reset();
  });

  it('captures the loaded draft as the synced baseline on loadFromDraft', () => {
    useConsultationDraftStore.getState().loadFromDraft({
      id: 'c1',
      assessment: 'Loaded from server.',
      careInstructions: 'Loaded care instructions.',
    });

    const state = useConsultationDraftStore.getState();
    expect(state.syncedSnapshot.assessment).toBe('Loaded from server.');
    expect(state.syncedSnapshot.careInstructions).toBe('Loaded care instructions.');
  });

  it('does NOT move the baseline just because a field was edited locally', () => {
    useConsultationDraftStore.getState().loadFromDraft({ id: 'c1', assessment: 'Original.' });
    useConsultationDraftStore.getState().updateAssessment('Edited while offline.');

    const state = useConsultationDraftStore.getState();
    expect(state.assessment).toBe('Edited while offline.');
    expect(state.syncedSnapshot.assessment).toBe('Original.');
  });

  it('advances the baseline to the current draft once markSaved confirms the server has it', () => {
    useConsultationDraftStore.getState().loadFromDraft({ id: 'c1', assessment: 'Original.' });
    useConsultationDraftStore.getState().updateAssessment('Now confirmed synced.');
    useConsultationDraftStore.getState().markSaved();

    const state = useConsultationDraftStore.getState();
    expect(state.syncedSnapshot.assessment).toBe('Now confirmed synced.');
  });

  it('resets the baseline back to the initial empty draft on reset', () => {
    useConsultationDraftStore.getState().loadFromDraft({ id: 'c1', assessment: 'Something.' });
    useConsultationDraftStore.getState().reset();

    const state = useConsultationDraftStore.getState();
    expect(state.syncedSnapshot.assessment).toBe('');
  });
});
