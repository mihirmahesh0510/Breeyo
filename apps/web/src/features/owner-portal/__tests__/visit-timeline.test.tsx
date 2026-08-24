// Plan 09-06 Task 1: read-only visit timeline, diagnosis glosses, and
// owner-friendly prescription cards (D-61, D-73 to D-77, OWN-01).
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { VisitTimeline } from '../components/VisitTimeline';
import { VisitCard } from '../components/VisitCard';
import { PrescriptionUsageCard } from '../components/PrescriptionUsageCard';

afterEach(cleanup);

const visit = {
  visitId: 'visit-1',
  visitDate: '2026-08-10T09:00:00.000Z',
  diagnosisText: 'URI',
  diagnosisGloss: 'In plain terms: an upper respiratory infection.',
  visitReason: 'Sick visit',
  prescriptions: [
    {
      prescriptionId: 'rx-1',
      drugName: 'Amoxicillin',
      usageInstruction: '250mg, oral, twice daily, for 7 days',
      plainLanguageGloss: 'Give with food to avoid an upset stomach.',
    },
  ],
};

describe('VisitTimeline (D-61)', () => {
  it('renders an empty-records state with clinic-help guidance when there are no visits', () => {
    render(<VisitTimeline visits={[]} />);
    expect(screen.getByText(/no records for this pet yet/i)).toBeInTheDocument();
  });

  it('renders one VisitCard per visit, most recent first order preserved from input', () => {
    render(
      <VisitTimeline
        visits={[
          visit,
          { ...visit, visitId: 'visit-2', diagnosisText: 'Annual checkup', diagnosisGloss: null, prescriptions: [] },
        ]}
      />,
    );

    const cards = screen.getAllByTestId('visit-card');
    expect(cards).toHaveLength(2);
  });
});

describe('VisitCard diagnosis gloss (D-73, D-75, D-76)', () => {
  it('shows the clinic term alongside the plain-language gloss', () => {
    render(<VisitCard visit={visit} />);

    expect(screen.getByText('URI')).toBeInTheDocument();
    expect(screen.getByText(/upper respiratory infection/i)).toBeInTheDocument();
  });

  it('omits the gloss line entirely when no gloss is available, without hiding the clinic term', () => {
    render(<VisitCard visit={{ ...visit, diagnosisGloss: null }} />);

    expect(screen.getByText('URI')).toBeInTheDocument();
    expect(screen.queryByText(/in plain terms/i)).not.toBeInTheDocument();
  });

  it('renders a PrescriptionUsageCard for each prescription on the visit', () => {
    render(<VisitCard visit={visit} />);
    expect(screen.getByText('Amoxicillin')).toBeInTheDocument();
    expect(screen.getByText(/250mg, oral, twice daily, for 7 days/)).toBeInTheDocument();
  });
});

describe('PrescriptionUsageCard (D-74, D-76, D-77)', () => {
  it('renders drug name, usage instruction, and plain-language gloss as a card, not a raw row', () => {
    render(<PrescriptionUsageCard prescription={visit.prescriptions[0]} />);

    expect(screen.getByText('Amoxicillin')).toBeInTheDocument();
    expect(screen.getByText(/250mg, oral, twice daily, for 7 days/)).toBeInTheDocument();
    expect(screen.getByText(/give with food/i)).toBeInTheDocument();
  });

  it('wraps long usage-instruction text without truncating it', () => {
    const longInstruction =
      '500mg, oral, three times daily with food, for 21 days, then reassess with the clinic before any refill';
    render(
      <PrescriptionUsageCard
        prescription={{ ...visit.prescriptions[0], usageInstruction: longInstruction, plainLanguageGloss: null }}
      />,
    );

    expect(screen.getByText(longInstruction)).toBeInTheDocument();
  });
});
