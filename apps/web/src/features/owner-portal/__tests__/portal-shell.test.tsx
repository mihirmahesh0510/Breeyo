// Plan 09-06 Task 1: owner-portal shell state matrix (D-46, D-52, D-56, D-57,
// D-58, D-60, D-63, D-64, D-65, D-79, OWN-01 to OWN-06).
//
// Unlike the dashboard's `AuthProvider`-wrapped tests, `PortalShell` is a
// PUBLIC, unauthenticated surface reached via a raw token in the URL --
// there is no JWT/session to seed here, and no `AuthProvider` wrapper is
// used anywhere in this file on purpose (T-09-13).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PortalShell } from '../components/PortalShell';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function mockSessionFetch(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/session')) {
        return jsonResponse(status, body);
      }
      throw new Error(`Unhandled fetch in test: ${url}`);
    }),
  );
}

function readySession(overrides: Record<string, unknown> = {}) {
  return {
    state: 'READY',
    data: {
      magicLinkId: 'link-1',
      defaultTab: 'OVERVIEW',
      ownerName: 'Asha Rao',
      pets: [{ petId: 'pet-1', name: 'Rocky', species: 'DOG', photoUrl: null, hasUnpaidInvoice: false }],
      totalDuePaise: 0,
      deepLink: null,
      restore: {
        lastTab: null,
        lastPetId: null,
        lastInvoiceId: null,
        lastVisitId: null,
        lastCheckoutSessionId: null,
        lastReturnState: null,
      },
      ...overrides,
    },
  };
}

function renderShell(token = 'tok-1') {
  return render(
    <PortalShell token={token}>
      {(ctx) => (
        <div>
          <div data-testid="active-tab">{ctx.activeTab}</div>
          <div data-testid="selected-pet">{ctx.selectedPetId ?? 'none'}</div>
        </div>
      )}
    </PortalShell>,
  );
}

describe('PortalShell trust and overview-first landing (D-46, D-56, D-65)', () => {
  it('shows the trust banner with secure/7-day/no-login copy once ready', async () => {
    mockSessionFetch(readySession());
    renderShell();

    await screen.findByTestId('active-tab');

    expect(screen.getByText(/secure clinic link/i)).toBeInTheDocument();
    expect(screen.getByText(/7 days/i)).toBeInTheDocument();
    expect(screen.getByText(/no login/i)).toBeInTheDocument();
  });

  it('defaults to the Overview tab when there is no deep link', async () => {
    mockSessionFetch(readySession());
    renderShell();

    expect(await screen.findByTestId('active-tab')).toHaveTextContent('OVERVIEW');
  });

  it('shows a validating state with trust copy before the session resolves', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    renderShell();

    expect(screen.getByText(/verifying your secure link/i)).toBeInTheDocument();
  });
});

describe('PortalShell tab bar (D-57, D-62)', () => {
  it('renders exactly Overview, Records, and Invoices tabs', async () => {
    mockSessionFetch(readySession());
    renderShell();

    await screen.findByTestId('active-tab');

    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Records' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Invoices' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /payments/i })).not.toBeInTheDocument();
  });
});

describe('PortalShell deep-link resolution (D-60, D-63)', () => {
  it('opens directly on Records when the link deep-links to a visit', async () => {
    mockSessionFetch(readySession({ deepLink: { type: 'VISIT', entityId: 'visit-1' } }));
    renderShell();

    expect(await screen.findByTestId('active-tab')).toHaveTextContent('RECORDS');
    // the rest of the portal remains reachable -- all tabs still render
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Invoices' })).toBeInTheDocument();
  });

  it('opens directly on Invoices when the link deep-links to an invoice', async () => {
    mockSessionFetch(readySession({ deepLink: { type: 'INVOICE', entityId: 'inv-1' } }));
    renderShell();

    expect(await screen.findByTestId('active-tab')).toHaveTextContent('INVOICES');
  });
});

describe('PortalShell pet switcher (D-58)', () => {
  it('does not render a pet switcher for a single-pet owner', async () => {
    mockSessionFetch(readySession());
    renderShell();

    await screen.findByTestId('active-tab');
    expect(screen.queryByRole('button', { name: /whiskers/i })).not.toBeInTheDocument();
  });

  it('switches the selected pet for a multi-pet owner without leaving the shell', async () => {
    mockSessionFetch(
      readySession({
        pets: [
          { petId: 'pet-1', name: 'Rocky', species: 'DOG', photoUrl: null, hasUnpaidInvoice: false },
          { petId: 'pet-2', name: 'Whiskers', species: 'CAT', photoUrl: null, hasUnpaidInvoice: true },
        ],
      }),
    );
    renderShell();

    expect(await screen.findByTestId('selected-pet')).toHaveTextContent('pet-1');

    fireEvent.click(screen.getByRole('button', { name: /whiskers/i }));

    await waitFor(() => expect(screen.getByTestId('selected-pet')).toHaveTextContent('pet-2'));
    // Still inside the same shell -- tabs remain rendered.
    expect(screen.getByRole('tab', { name: 'Records' })).toBeInTheDocument();
  });
});

describe('PortalShell persistent help actions (D-52, D-79)', () => {
  it('shows Call Clinic and WhatsApp Clinic on the ready screen', async () => {
    mockSessionFetch(readySession());
    renderShell();

    await screen.findByTestId('active-tab');
    expect(screen.getByRole('link', { name: /call clinic/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /whatsapp clinic/i })).toBeInTheDocument();
  });

  it('shows Call Clinic and WhatsApp Clinic on the invalid screen', async () => {
    mockSessionFetch({ state: 'INVALID' }, 403);
    renderShell();

    await waitFor(() => expect(screen.getByText(/this link is invalid/i)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /call clinic/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /whatsapp clinic/i })).toBeInTheDocument();
  });

  it('shows Call Clinic and WhatsApp Clinic on the expired screen', async () => {
    mockSessionFetch({ state: 'EXPIRED' });
    renderShell();

    await waitFor(() => expect(screen.getByText(/link has expired/i)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /call clinic/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /whatsapp clinic/i })).toBeInTheDocument();
  });
});

describe('PortalShell invalid vs expired states (OWN-04, OWN-06, T-09-16)', () => {
  it('renders the invalid state with no owner/pet data and no reissue CTA', async () => {
    mockSessionFetch({ state: 'INVALID' }, 403);
    renderShell();

    await waitFor(() => expect(screen.getByText(/this link is invalid/i)).toBeInTheDocument());
    expect(screen.queryByTestId('active-tab')).not.toBeInTheDocument();
    expect(screen.queryByText(/rocky/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /request new link/i })).not.toBeInTheDocument();
  });

  it('renders the expired state with a built-in reissue path and no owner/pet data', async () => {
    mockSessionFetch({ state: 'EXPIRED' });
    renderShell();

    await waitFor(() => expect(screen.getByText(/link has expired/i)).toBeInTheDocument());
    expect(screen.queryByTestId('active-tab')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request new link/i })).toBeInTheDocument();
  });
});
