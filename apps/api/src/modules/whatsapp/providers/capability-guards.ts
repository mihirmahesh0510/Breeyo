/**
 * WHA-04 — Capability guards.
 *
 * Pure functions that take a provider's `capabilities` object as data, so no
 * code here (or anywhere that calls it) branches on provider identity. Both
 * `SimulatorProvider` and `CloudApiProvider` call the same guards with the
 * same numbers — that is what makes the simulator's constraints identical to
 * the real Cloud API (Anti-Pattern A2, 07-RESEARCH § Pattern 1).
 *
 * Every violation throws `WaSendError` with `retryable: false`: a limit
 * breach is a programming error (a caller building a payload the provider
 * will never accept), not a transient failure — retrying it would just fail
 * again, so BullMQ must not spend an attempt on it.
 */

import { WA_CAPABILITY_LIMITS, WA_TEMPLATE_KEYS, type WaCapabilities, type WaListRow } from '@breeyo/types';
import { WaSendError, type WaButtonSpec } from './wa-provider.port.js';

/**
 * At most `caps.maxQuickReplyButtons` buttons, each with a title at most
 * `caps.maxButtonTitleChars` characters and an id at most
 * `WA_CAPABILITY_LIMITS.maxButtonIdChars` characters (a Cloud API hard limit,
 * not a per-provider capability, so it is read from the shared constant
 * rather than threaded through every `WaCapabilities` object).
 */
export function assertButtonLimits(buttons: WaButtonSpec[] | undefined, caps: WaCapabilities): void {
  if (!buttons || buttons.length === 0) return;

  if (buttons.length > caps.maxQuickReplyButtons) {
    throw new WaSendError(
      'TEMPLATE_PARAM_MISMATCH',
      null,
      false,
      `${buttons.length} quick-reply buttons exceeds the ${caps.maxQuickReplyButtons}-button limit`,
    );
  }

  for (const button of buttons) {
    if (button.title.length > caps.maxButtonTitleChars) {
      throw new WaSendError(
        'TEMPLATE_PARAM_MISMATCH',
        null,
        false,
        `Button title "${button.title}" (${button.title.length} chars) exceeds the ${caps.maxButtonTitleChars}-character limit`,
      );
    }
    if (button.id.length > WA_CAPABILITY_LIMITS.maxButtonIdChars) {
      throw new WaSendError(
        'TEMPLATE_PARAM_MISMATCH',
        null,
        false,
        `Button id (${button.id.length} chars) exceeds the ${WA_CAPABILITY_LIMITS.maxButtonIdChars}-character limit`,
      );
    }
  }
}

/**
 * At most `caps.maxListRows` rows total, each with a title at most
 * `caps.maxListRowTitleChars` characters and an id at most
 * `WA_CAPABILITY_LIMITS.maxListRowIdChars` characters.
 */
export function assertListLimits(rows: WaListRow[] | undefined, caps: WaCapabilities): void {
  if (!rows || rows.length === 0) return;

  if (rows.length > caps.maxListRows) {
    throw new WaSendError(
      'TEMPLATE_PARAM_MISMATCH',
      null,
      false,
      `${rows.length} list rows exceeds the ${caps.maxListRows}-row limit`,
    );
  }

  for (const row of rows) {
    if (row.title.length > caps.maxListRowTitleChars) {
      throw new WaSendError(
        'TEMPLATE_PARAM_MISMATCH',
        null,
        false,
        `List row title "${row.title}" (${row.title.length} chars) exceeds the ${caps.maxListRowTitleChars}-character limit`,
      );
    }
    if (row.id.length > WA_CAPABILITY_LIMITS.maxListRowIdChars) {
      throw new WaSendError(
        'TEMPLATE_PARAM_MISMATCH',
        null,
        false,
        `List row id (${row.id.length} chars) exceeds the ${WA_CAPABILITY_LIMITS.maxListRowIdChars}-character limit`,
      );
    }
  }
}

/** Interactive body text (1024 chars) is stricter than a plain text body (4096 chars). */
export function assertBodyLength(text: string, max: number): void {
  if (text.length > max) {
    throw new WaSendError(
      'TEMPLATE_PARAM_MISMATCH',
      null,
      false,
      `Message body of ${text.length} characters exceeds the ${max}-character limit`,
    );
  }
}

/**
 * Both providers require pre-registered/approved templates
 * (`requiresRegisteredTemplates: true`) — validated against the shared
 * `WA_TEMPLATE_KEYS` constant so the registry and this guard can never
 * drift apart.
 */
export function assertRegisteredTemplate(key: string): void {
  if (!(WA_TEMPLATE_KEYS as readonly string[]).includes(key)) {
    throw new WaSendError(
      'TEMPLATE_NOT_AVAILABLE',
      null,
      false,
      `"${key}" is not a registered WhatsApp template`,
    );
  }
}

/**
 * The 24-hour customer service window: open only while `serviceWindowExpiresAt`
 * is a non-null timestamp in the future. `null` means no inbound message has
 * ever been received on the thread, so the window has never opened.
 */
export function isServiceWindowOpen(serviceWindowExpiresAt: Date | null): boolean {
  if (!serviceWindowExpiresAt) return false;
  return serviceWindowExpiresAt.getTime() > Date.now();
}
