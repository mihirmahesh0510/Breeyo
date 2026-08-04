import type { VisitType } from '../emr.js';

export interface QuickPickChipSet {
  subjective: readonly string[];
  plan: readonly string[];
}

export const QUICK_PICK_CHIPS: Record<VisitType, QuickPickChipSet> = {
  general: {
    subjective: [
      'Vomiting', 'Diarrhea', 'Lethargy', 'Loss of appetite',
      'Coughing', 'Sneezing', 'Itching', 'Limping',
      'Eye discharge', 'Ear discharge', 'Weight loss',
      'Increased thirst', 'Frequent urination', 'Behavioral change',
    ],
    plan: ['Follow-up', 'Lab Retest', 'Diet Change', 'Exercise Restriction', 'Referral', 'Other'],
  },
  surgery: {
    subjective: [
      'Pre-surgical assessment', 'Post-operative check', 'Incision check',
      'Suture removal', 'Wound assessment', 'Drain check',
    ],
    plan: ['Follow-up', 'Suture Removal', 'Post-op Recheck', 'Drain Removal', 'Exercise Restriction', 'Wound Care'],
  },
  vaccination: {
    subjective: [
      'Routine vaccination', 'Booster due', 'Puppy/kitten series',
      'Rabies vaccination', 'Travel vaccination', 'Adverse reaction follow-up',
    ],
    plan: ['Next Booster', 'Reaction Monitoring', 'Follow-up', 'Other'],
  },
};
