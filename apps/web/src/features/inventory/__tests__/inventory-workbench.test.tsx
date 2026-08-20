// Plan 09-03 Task 2: browser inventory workbench UI, against 09-CONTEXT.md
// D-18, D-20, D-26, D-30 to D-37 and 09-UI-SPEC.md's module-depth contract.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { writeSession, clearSession } from '../../../lib/auth-store';
import { AuthProvider } from '../../../lib/AuthProvider';
import InventoryPage from '../../../../app/inventory/page';

const mockRouterReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockRouterReplace, push: vi.fn() }),
  usePathname: () => '/inventory',
}));

afterEach(() => {
  cleanup();
  clearSession();
  mockRouterReplace.mockClear();
  vi.unstubAllGlobals();
});

function seedSession() {
  writeSession({
    accessToken: 'test-token',
    userId: 'user-1',
    userName: 'Priya Admin',
    activeClinicId: 'clinic-1',
  });
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const cockpitBody = {
  data: {
    panelOrder: ['ALERTS', 'INVENTORY'],
    panels: [
      { panelId: 'ALERTS', title: 'Alerts & Exceptions', itemCount: 0, quickActions: [] },
      { panelId: 'INVENTORY', title: 'Inventory', itemCount: 1, quickActions: [] },
    ],
    generatedAt: new Date().toISOString(),
  },
};

function stockAndBatchesBody(writeAllowed: boolean) {
  return {
    data: {
      tab: 'stock',
      scanningBoundaryMessage: 'Barcode scanning stays mobile-first. Use the mobile app to scan and update stock on the floor.',
      stockAndBatches: {
        tab: 'stock',
        tabLabel: 'Stock & Batches',
        writeAllowed,
        rows: [
          {
            itemId: 'item_1',
            name: 'Amoxicillin 250mg Tab',
            category: 'medicine',
            unit: 'tablets',
            currentStock: 40,
            parLevel: 50,
            isLowStock: true,
            nextExpiry: '2027-01-01T00:00:00.000Z',
            batches: [{ batchId: 'batch_1', lotNumber: 'LOT-A', expiryDate: '2027-01-01T00:00:00.000Z', currentQty: 40 }],
            safeActions: writeAllowed ? ['receive', 'adjust'] : [],
          },
        ],
      },
    },
  };
}

function analyticsBody() {
  return {
    data: {
      tab: 'analytics',
      scanningBoundaryMessage: 'Barcode scanning stays mobile-first. Use the mobile app to scan and update stock on the floor.',
      analytics: {
        tab: 'analytics',
        tabLabel: 'Analytics',
        stockTurnover: [{ itemId: 'item_1', itemName: 'Amoxicillin 250mg Tab', dispensedLast30Days: 12 }],
        expiryRisk: [
          { batchId: 'batch_1', itemId: 'item_1', itemName: 'Amoxicillin 250mg Tab', lotNumber: 'LOT-A', expiryDate: '2026-09-01T00:00:00.000Z', currentQty: 40 },
        ],
        lowStock: [{ id: 'item_1', name: 'Amoxicillin 250mg Tab', category: 'medicine', unit: 'tablets', sellingPrice: 5.5, parLevel: 50, currentStock: 5 }],
        exportActions: [
          { actionId: 'export-csv', label: 'Export CSV' },
          { actionId: 'export-pdf', label: 'Export PDF' },
        ],
      },
    },
  };
}

/** Routes each fetch by a substring of its URL, regardless of call order. */
function mockFetchByUrl(map: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const key = Object.keys(map).find((candidate) => url.includes(candidate));
      if (!key) {
        throw new Error(`Unhandled fetch in test: ${url}`);
      }
      return jsonResponse(200, map[key]);
    }),
  );
}

describe('Inventory workbench default tab and scanning boundary (D-32, D-37)', () => {
  it('lands on Stock & Batches by default and shows the mobile-first scanning boundary copy', async () => {
    seedSession();
    mockFetchByUrl({
      'web-dashboard/cockpit': cockpitBody,
      'inventory/web/workbench': stockAndBatchesBody(true),
    });

    render(
      <AuthProvider>
        <InventoryPage />
      </AuthProvider>,
    );

    const stockTab = await screen.findByRole('tab', { name: 'Stock & Batches' });
    expect(stockTab).toHaveAttribute('aria-selected', 'true');

    await screen.findByText('Amoxicillin 250mg Tab');
    expect(screen.getByText(/use mobile scanner for barcode capture/i)).toBeInTheDocument();
  });
});

describe('Inventory workbench D-18/D-20 write gating', () => {
  it('shows Add Stock / Remove Stock inline actions for a caller with writeAllowed=true', async () => {
    seedSession();
    mockFetchByUrl({
      'web-dashboard/cockpit': cockpitBody,
      'inventory/web/workbench': stockAndBatchesBody(true),
    });

    render(
      <AuthProvider>
        <InventoryPage />
      </AuthProvider>,
    );

    await screen.findByText('Amoxicillin 250mg Tab');
    expect(screen.getByRole('button', { name: 'Add Stock' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Stock' })).toBeInTheDocument();
  });

  it('hides (not disables) Add Stock / Remove Stock for Front Desk without writeAllowed (D-18)', async () => {
    seedSession();
    mockFetchByUrl({
      'web-dashboard/cockpit': cockpitBody,
      'inventory/web/workbench': stockAndBatchesBody(false),
    });

    render(
      <AuthProvider>
        <InventoryPage />
      </AuthProvider>,
    );

    await screen.findByText('Amoxicillin 250mg Tab');
    expect(screen.queryByRole('button', { name: 'Add Stock' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Stock' })).not.toBeInTheDocument();
    // Not merely disabled -- absent entirely (D-20's "hidden, not locked").
    expect(screen.queryByText(/add stock/i)).not.toBeInTheDocument();
  });
});

describe('Inventory workbench risky stock-change confirmation (D-34, D-24)', () => {
  it('requires a reason and shows the acting user before applying a stock decrease', async () => {
    seedSession();
    mockFetchByUrl({
      'web-dashboard/cockpit': cockpitBody,
      'inventory/web/workbench': stockAndBatchesBody(true),
    });

    render(
      <AuthProvider>
        <InventoryPage />
      </AuthProvider>,
    );

    await screen.findByText('Amoxicillin 250mg Tab');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Stock' }));

    // Step 1: reason capture, no confirmation dialog yet.
    const reasonSelect = await screen.findByLabelText(/reason/i);
    expect(reasonSelect).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    fireEvent.change(reasonSelect, { target: { value: 'damage' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 2: strong confirmation with actor visibility.
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByTestId('actor-timestamp')).toHaveTextContent('Priya Admin');
  });
});

describe('Inventory workbench analytics export actions (D-36)', () => {
  it('exposes Export CSV and Export PDF on the Analytics tab', async () => {
    seedSession();
    mockFetchByUrl({
      'web-dashboard/cockpit': cockpitBody,
      'inventory/web/workbench': analyticsBody(),
    });

    render(
      <AuthProvider>
        <InventoryPage />
      </AuthProvider>,
    );

    fireEvent.click(await screen.findByRole('tab', { name: 'Analytics' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Export PDF' })).toBeInTheDocument();
    });
  });
});
