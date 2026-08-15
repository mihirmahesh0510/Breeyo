/**
 * WHA-05 / D-14, D-16 — `ClinicConfigService`: read and update of the
 * per-clinic WhatsApp/simulator configuration (`WhatsAppClinicConfig`).
 *
 * `getConfig` delegates to `WhatsAppRepository.getOrCreateClinicConfig` so a
 * clinic that never opened the Config screen still gets working Beta
 * defaults (SIMULATOR/NORMAL/auto-reply on/10s/30min/2 attempts/3 days) —
 * there is no separate "has this clinic been configured yet?" branch
 * anywhere in this file.
 *
 * `updateConfig` validates through `clinicConfigSchema.partial()` — the
 * EXACT schema `sendTemplateSchema`'s siblings live in
 * (`packages/validators/src/whatsapp.ts`), so the bounds
 * (`autoReplyDelaySeconds` 3-60, `slotDurationMinutes` 10-120, D-14) live in
 * exactly one place. This service never re-implements them; it only calls
 * `.parse()`, which throws the schema's own `ZodError` on an out-of-bounds
 * value — the same error shape `error-handler.ts`'s global `ZodError`
 * branch already converts to a 400 `VALIDATION_ERROR`, so a caller (the
 * controller, or this suite's own unit tests) needs no special-casing.
 * `.partial()` is used rather than the full schema because a PATCH may send
 * just one field (e.g. only `autoReplyDelaySeconds`) — Zod's `.partial()`
 * still enforces every present field's own bound, it just stops requiring
 * every field to be present.
 *
 * `deliveryMode` is deliberately a single per-clinic global control here,
 * never a per-owner or per-thread override (D-16, matching UI-SPEC's
 * SimulatorControlCard) — there is no `ownerId`/`threadId` parameter
 * anywhere in this file, structurally the same guarantee
 * `send-authorization.service.ts`'s header comment makes for its own gate.
 */

import { clinicConfigSchema } from './whatsapp.schema.js';
import type { WhatsAppRepository, UpdateClinicConfigInput } from './whatsapp.repository.js';

/** A PATCH may send any subset of `clinicConfigSchema`'s fields; every field
 * present still carries its own bound (D-14). */
const clinicConfigUpdateSchema = clinicConfigSchema.partial();

export class ClinicConfigService {
  constructor(private readonly repo: WhatsAppRepository) {}

  /** Read-or-create — a clinic that never visited the Config screen still
   * gets a working row on its very first read. */
  async getConfig(clinicId: string) {
    return this.repo.getOrCreateClinicConfig(clinicId);
  }

  /** Throws the schema's `ZodError` on an out-of-bounds/invalid value
   * BEFORE the repository is ever called — no partial write on a rejected
   * input. A clinic may PATCH before it has ever GET-ed its config, so this
   * ensures the row exists (the same read-or-create `getConfig` uses)
   * before updating it — `WhatsAppRepository.updateClinicConfig` is a plain
   * `update`, which would otherwise 500 on a clinic's very first write. */
  async updateConfig(clinicId: string, input: unknown) {
    const parsed = clinicConfigUpdateSchema.parse(input);
    await this.repo.getOrCreateClinicConfig(clinicId);
    return this.repo.updateClinicConfig(clinicId, parsed as UpdateClinicConfigInput);
  }
}
