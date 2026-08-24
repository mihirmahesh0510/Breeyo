import type { OwnerPortalCheckoutReturnState } from '@breeyo/types';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import type { BillingActor } from '../billing/invoice.repository.js';
import type { PaymentService } from '../billing/payment.service.js';
import { AccessScopeService, type OwnerPortalTokenScope } from './access-scope.service.js';

export interface PortalCheckoutPetBreakdownEntry {
  petId: string;
  petName: string | null;
  invoiceIds: string[];
  amountPaise: number;
}

export interface PortalCheckoutPaymentLink {
  paymentLinkId: string;
  shortUrl: string;
  expiresAt: string;
  amountPaise: number;
}

export interface PortalCheckoutResult {
  checkoutSessionId: string;
  amountDuePaise: number;
  petBreakdown: PortalCheckoutPetBreakdownEntry[];
  paymentLink: PortalCheckoutPaymentLink;
  returnState: OwnerPortalCheckoutReturnState;
}

interface CheckoutInvoiceRow {
  id: string;
  petId: string | null;
  createdById: string;
  balancePaise: number;
  pet: { name: string } | null;
}

/**
 * Combined one-or-many-invoice checkout (OWN-03, D-59, D-66, D-69, D-70).
 *
 * This service builds the `OwnerPortalCheckoutSession` snapshot and the
 * pet/invoice breakdown, but it does NOT create the Razorpay payment link
 * itself — that would be a second payment system alongside billing's. It
 * delegates to `PaymentService.createPaymentLink` (one invoice) or
 * `PaymentService.createCombinedPaymentLink` (multiple invoices), the exact
 * same methods staff-initiated checkout already uses (06-CONTEXT.md D-27,
 * D-39).
 *
 * `PaymentService.createPaymentLink`/`createCombinedPaymentLink` require a
 * `BillingActor` (`{ userId, userName }`) because `Payment.recordedById` is
 * a FK to `User` — an owner has no `User` row. Mirroring
 * `scheduling/owner-action.service.ts`'s precedent for the same problem
 * (an owner-triggered cancel with no owner `User` row), the invoice's own
 * `createdById` (the staff member who created it) stands in as the actor;
 * the real actor is an owner via the public portal, not staff, and that is
 * `userName` here for the audit trail even though `PaymentService` itself
 * never persists `userName`.
 */
export class PortalCheckoutService {
  constructor(
    private readonly db: TenantPrismaClient,
    private readonly accessScopeService: AccessScopeService,
    private readonly paymentService: Pick<PaymentService, 'createPaymentLink' | 'createCombinedPaymentLink'>,
  ) {}

  async createCheckout(
    scope: OwnerPortalTokenScope,
    selectedInvoiceIds: string[],
  ): Promise<PortalCheckoutResult | null> {
    const uniqueIds = [...new Set(selectedInvoiceIds)];

    if (!this.accessScopeService.areInvoicesInScope(scope, uniqueIds)) {
      return null;
    }

    const invoices = (await this.db.invoice.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        petId: true,
        createdById: true,
        balancePaise: true,
        pet: { select: { name: true } },
      },
    })) as CheckoutInvoiceRow[];

    // Belt-and-suspenders on top of the scope check above: every id must
    // actually resolve inside this clinic. A count mismatch here would mean
    // an id that is in `allowedInvoiceIds` but no longer exists (voided/
    // deleted) — refuse rather than checkout against a partial set.
    if (invoices.length !== uniqueIds.length) {
      return null;
    }

    const petBreakdown = this.buildPetBreakdown(invoices);
    const amountDuePaise = invoices.reduce((sum, invoice) => sum + invoice.balancePaise, 0);

    const checkoutSession = await this.db.ownerPortalCheckoutSession.create({
      data: {
        magicLinkId: scope.magicLinkId,
        selectedInvoiceIdsJson: uniqueIds,
        petBreakdownJson: petBreakdown,
        amountDuePaise,
        returnState: 'pending',
      },
    });

    const actor: BillingActor = { userId: invoices[0].createdById, userName: 'Owner Portal' };

    const paymentLink =
      uniqueIds.length === 1
        ? await this.paymentService.createPaymentLink(scope.clinicId, uniqueIds[0], actor)
        : await this.paymentService.createCombinedPaymentLink(scope.clinicId, uniqueIds, actor);

    await this.db.ownerPortalCheckoutSession.update({
      where: { id: (checkoutSession as { id: string }).id },
      data: { razorpayPaymentLinkId: paymentLink.paymentLinkId },
    });

    return {
      checkoutSessionId: (checkoutSession as { id: string }).id,
      amountDuePaise,
      petBreakdown,
      paymentLink: {
        paymentLinkId: paymentLink.paymentLinkId,
        shortUrl: paymentLink.shortUrl,
        expiresAt: paymentLink.expiresAt.toISOString(),
        amountPaise: paymentLink.amountPaise,
      },
      returnState: 'pending',
    };
  }

  private buildPetBreakdown(invoices: CheckoutInvoiceRow[]): PortalCheckoutPetBreakdownEntry[] {
    const byPet = new Map<string, PortalCheckoutPetBreakdownEntry>();

    for (const invoice of invoices) {
      const petId = invoice.petId ?? 'unassigned';
      const entry = byPet.get(petId);
      if (entry) {
        entry.invoiceIds.push(invoice.id);
        entry.amountPaise += invoice.balancePaise;
      } else {
        byPet.set(petId, {
          petId,
          petName: invoice.pet?.name ?? null,
          invoiceIds: [invoice.id],
          amountPaise: invoice.balancePaise,
        });
      }
    }

    return [...byPet.values()];
  }
}
