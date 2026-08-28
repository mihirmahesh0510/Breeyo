import type { OwnerPortalPrescriptionCard, OwnerPortalVisitSummary } from '@breeyo/types';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import { AccessScopeService, type OwnerPortalTokenScope } from './access-scope.service.js';

export interface PortalVisitEntry extends OwnerPortalVisitSummary {
  prescriptions: OwnerPortalPrescriptionCard[];
}

export interface PortalRecordsResult {
  visits: PortalVisitEntry[];
}

/**
 * A small, Beta-scope glossary (D-75, D-76): expands the shorthand an owner
 * is most likely to see in `assessment` text into one plain-language clause.
 * Deliberately not an NLP system — D-77 bans a "heavy coaching product", so
 * an unrecognized term just gets no gloss rather than a guess.
 */
const DIAGNOSIS_GLOSS_TERMS: ReadonlyArray<{ pattern: RegExp; gloss: string }> = [
  { pattern: /\bURI\b/i, gloss: 'an upper respiratory infection' },
  { pattern: /\bUTI\b/i, gloss: 'a urinary tract infection' },
  { pattern: /\bGI\b/i, gloss: 'a gastrointestinal issue' },
  { pattern: /\bOA\b/i, gloss: 'osteoarthritis (joint wear)' },
  { pattern: /\bCKD\b/i, gloss: 'chronic kidney disease' },
  { pattern: /\bOtitis\b/i, gloss: 'an ear infection' },
  { pattern: /\bDermatitis\b/i, gloss: 'a skin irritation' },
];

function buildDiagnosisGloss(assessment: string | null): string | null {
  if (!assessment) return null;
  const match = DIAGNOSIS_GLOSS_TERMS.find((entry) => entry.pattern.test(assessment));
  return match ? `In plain terms: ${match.gloss}.` : null;
}

function humanizeVisitType(visitType: string | null): string | null {
  if (!visitType) return null;
  const label = visitType.replace(/_/g, ' ').trim();
  if (!label) return null;
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} visit`;
}

function buildUsageInstruction(rx: {
  dosage: string;
  route: string;
  frequency: string;
  duration: string | null;
}): string {
  const parts = [rx.dosage, rx.route, rx.frequency].filter(Boolean);
  const base = parts.join(', ');
  return rx.duration ? `${base}, for ${rx.duration}` : base;
}

interface ConsultationHistoryRow {
  id: string;
  startedAt: Date;
  assessment: string | null;
  visitType: string | null;
  prescriptions: Array<{
    id: string;
    drugName: string;
    dosage: string;
    route: string;
    frequency: string;
    duration: string | null;
    ownerInstructions: string | null;
  }>;
}

/**
 * Read-only visit-timeline projection: diagnosis + prescription usage cards
 * ONLY (OWN-01, D-73 to D-77). The Prisma `select` below is the enforcement
 * point — it never asks for `subjective`, `objective`, `plan`,
 * `careInstructions`, `referral`, `rxNotes`, or `addenda`, so a clinician's
 * SOAP free-text and internal notes are structurally unreachable from this
 * service, not merely omitted by convention. Same posture on prescriptions:
 * `clinicalInstructions` (vet-facing) is never selected — only
 * `ownerInstructions` (already written for the owner) becomes
 * `plainLanguageGloss`.
 */
export class PortalRecordsService {
  constructor(
    private readonly db: TenantPrismaClient,
    private readonly accessScopeService: AccessScopeService,
  ) {}

  async getRecords(scope: OwnerPortalTokenScope, petId: string): Promise<PortalRecordsResult | null> {
    if (!(await this.accessScopeService.isPetInScope(this.db, scope, petId))) {
      return null;
    }

    const consultations = (await this.db.consultation.findMany({
      where: { petId, status: 'finalized' },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        startedAt: true,
        assessment: true,
        visitType: true,
        prescriptions: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            drugName: true,
            dosage: true,
            route: true,
            frequency: true,
            duration: true,
            ownerInstructions: true,
          },
        },
      },
    })) as ConsultationHistoryRow[];

    const visits: PortalVisitEntry[] = consultations.map((consultation) => ({
      visitId: consultation.id,
      visitDate: consultation.startedAt.toISOString(),
      diagnosisText: consultation.assessment,
      diagnosisGloss: buildDiagnosisGloss(consultation.assessment),
      visitReason: humanizeVisitType(consultation.visitType),
      prescriptions: consultation.prescriptions.map((rx) => ({
        prescriptionId: rx.id,
        drugName: rx.drugName,
        usageInstruction: buildUsageInstruction(rx),
        plainLanguageGloss: rx.ownerInstructions ?? null,
      })),
    }));

    return { visits };
  }
}
