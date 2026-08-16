/**
 * WHA-02/WHA-05 — the send authorization gate (D-10, D-11, D-12, D-13).
 *
 * A single-purpose collaborator, shaped like `ConsultationLockService`: it
 * never reads a request object (so it stays unit-testable and route
 * permission enforcement — `requirePermission('SEND_WHATSAPP')` — stays at
 * the route layer, per 07-12). It has exactly one hard operational gate and
 * two advisory warnings:
 *
 * 1. HARD GATE (D-10/D-11): a REMINDER-category template is refused with a
 *    403 when the owner's global `remindersOptedOut` flag is set. This is
 *    keyed purely on `(clinicId, ownerId)` — there is no `petId` parameter
 *    anywhere in this file — so the gate is structurally impossible to
 *    bypass by messaging about a different pet on the same owner (D-11).
 *    TRANSACTIONAL templates (`invoice_delivery`, `booking_confirmation`)
 *    never hit this branch at all.
 * 2. WARN, NEVER BLOCK (D-13): missing or withdrawn WhatsApp consent
 *    (D-12: a withdrawn record is not "current") produces a
 *    `consentWarning` but never throws. The caller is responsible for
 *    surfacing it and — per D-13 — for auditing a send that proceeds anyway.
 * 3. WARN (advisory only): an owner preference row with `numberStatus`
 *    `INVALID` produces a `numberWarning` so the UI can render UI-SPEC's
 *    "This mobile number may not be on WhatsApp" copy. Never blocks either.
 */

import type { WaTemplateKey } from '@breeyo/types';
import { getTemplate } from './template-registry.js';
import type { WhatsAppRepository } from './whatsapp.repository.js';

export interface AuthorizeInput {
  clinicId: string;
  ownerId: string;
  templateKey: WaTemplateKey;
}

export interface AuthorizeResult {
  consentWarning: 'WHATSAPP_CONSENT_MISSING' | null;
  numberWarning: 'WHATSAPP_NUMBER_INVALID' | null;
}

function ownerOptedOutError() {
  const error = new Error('Owner has opted out of reminders') as Error & {
    statusCode: number;
    code: string;
  };
  error.statusCode = 403;
  error.code = 'OWNER_OPTED_OUT';
  return error;
}

export class SendAuthorizationService {
  constructor(private readonly repo: WhatsAppRepository) {}

  async authorize(input: AuthorizeInput): Promise<AuthorizeResult> {
    // Template lookup first — an unknown key is a 400 before any repository
    // call, matching `getTemplate`'s own TEMPLATE_UNKNOWN error shape.
    const def = getTemplate(input.templateKey);

    const pref = await this.repo.getOwnerPreference(input.clinicId, input.ownerId);

    // D-10/D-11: the ONE hard gate. REMINDER category only — TRANSACTIONAL
    // templates (invoice_delivery, booking_confirmation) are always attempted.
    if (def.category === 'REMINDER' && pref?.remindersOptedOut) {
      throw ownerOptedOutError();
    }

    // D-12/D-13: missing OR withdrawn consent warns, never blocks. The
    // repository's own query already excludes withdrawn rows, so "no current
    // consent" and "withdrawn consent" both surface identically here as null.
    const consent = await this.repo.getCurrentWhatsAppConsent(input.ownerId);
    const consentWarning = consent ? null : 'WHATSAPP_CONSENT_MISSING';

    const numberWarning = pref?.numberStatus === 'INVALID' ? 'WHATSAPP_NUMBER_INVALID' : null;

    return { consentWarning, numberWarning };
  }
}
