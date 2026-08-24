// Plan 09-07 Task 2: OWN-07 — upcoming vaccination/deworming due dates and
// next scheduled appointment on the owner portal Overview tab (D-49,
// D-73 to D-77).
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { UpcomingCareCard } from '../components/UpcomingCareCard';
import { OwnerSummaryCard } from '../components/OwnerSummaryCard';

afterEach(cleanup);

describe('UpcomingCareCard — vaccinations (OWN-07)', () => {
  it('renders vaccine names and nextVaccinationDue dates', () => {
    render(
      <UpcomingCareCard
        vaccinations={[{ vaccineName: 'Rabies', nextDueDate: '2026-09-20T04:30:00.000Z', status: 'upcoming' }]}
        deworming={null}
        nextAppointment={null}
      />,
    );

    expect(screen.getByText('Rabies')).toBeInTheDocument();
    expect(screen.getByText(/20 sept 2026/i)).toBeInTheDocument();
  });

  it('shows overdue styling for an overdue vaccination', () => {
    render(
      <UpcomingCareCard
        vaccinations={[{ vaccineName: 'Rabies', nextDueDate: '2026-07-01T00:00:00.000Z', status: 'overdue' }]}
        deworming={null}
        nextAppointment={null}
      />,
    );

    const badge = screen.getByTestId('vaccination-status-overdue');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent(/overdue/i);
  });

  it('shows due-soon (warning) styling for a due-soon vaccination', () => {
    render(
      <UpcomingCareCard
        vaccinations={[{ vaccineName: 'DHPPi Booster', nextDueDate: '2026-08-24T00:00:00.000Z', status: 'dueSoon' }]}
        deworming={null}
        nextAppointment={null}
      />,
    );

    const badge = screen.getByTestId('vaccination-status-dueSoon');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent(/due soon/i);
  });

  it('shows a reassuring empty-state message when there are no upcoming vaccinations', () => {
    render(<UpcomingCareCard vaccinations={[]} deworming={null} nextAppointment={null} />);

    expect(screen.getByText(/no vaccinations due right now/i)).toBeInTheDocument();
  });
});

describe('UpcomingCareCard — deworming (OWN-07)', () => {
  it('renders the drug name and next due date', () => {
    render(
      <UpcomingCareCard
        vaccinations={[]}
        deworming={{ drugName: 'Fenbendazole', nextDueDate: '2026-09-01T00:00:00.000Z', status: 'upcoming' }}
        nextAppointment={null}
      />,
    );

    expect(screen.getByText('Fenbendazole')).toBeInTheDocument();
    expect(screen.getByText(/1 sept 2026/i)).toBeInTheDocument();
  });

  it('renders a reassuring message when there is no deworming record', () => {
    render(<UpcomingCareCard vaccinations={[]} deworming={null} nextAppointment={null} />);

    expect(screen.getByText(/no deworming due right now/i)).toBeInTheDocument();
  });
});

describe('UpcomingCareCard — next appointment (OWN-07)', () => {
  it('renders the appointment date, reason, and staff name', () => {
    render(
      <UpcomingCareCard
        vaccinations={[]}
        deworming={null}
        nextAppointment={{
          scheduledAt: '2026-08-15T05:00:00.000Z',
          reason: 'Annual checkup',
          staffName: 'Dr. Asha Rao',
        }}
      />,
    );

    expect(screen.getByText(/annual checkup/i)).toBeInTheDocument();
    expect(screen.getByText(/dr\. asha rao/i)).toBeInTheDocument();
    expect(screen.getByText(/15 aug 2026/i)).toBeInTheDocument();
  });

  it('renders a reassuring message when there is no upcoming appointment', () => {
    render(<UpcomingCareCard vaccinations={[]} deworming={null} nextAppointment={null} />);

    expect(screen.getByText(/no upcoming appointment scheduled/i)).toBeInTheDocument();
  });
});

describe('OwnerSummaryCard — UpcomingCareCard integration (D-49, OWN-07)', () => {
  it('renders UpcomingCareCard alongside the existing due/recent-visit sections', () => {
    render(
      <OwnerSummaryCard
        totalDuePaise={0}
        recentVisit={null}
        careDates={{
          vaccinations: [{ vaccineName: 'Rabies', nextDueDate: '2026-09-20T00:00:00.000Z', status: 'upcoming' }],
          deworming: null,
          nextAppointment: null,
        }}
      />,
    );

    expect(screen.getByTestId('upcoming-care-card')).toBeInTheDocument();
    expect(screen.getByText('Rabies')).toBeInTheDocument();
  });

  it('still renders UpcomingCareCard even when there is no due amount and no recent visit', () => {
    render(
      <OwnerSummaryCard
        totalDuePaise={0}
        recentVisit={null}
        careDates={{ vaccinations: [], deworming: null, nextAppointment: null }}
      />,
    );

    expect(screen.getByTestId('upcoming-care-card')).toBeInTheDocument();
  });
});
