import { z } from 'zod';
import { DASHBOARD_PANEL_ORDER } from './types.js';

const uuidSchema = z.string().uuid();
const browserRoleCodeSchema = z.enum(['ADMIN', 'FRONT_DESK', 'CLINICIAN']);
const dashboardPanelIdSchema = z.enum(DASHBOARD_PANEL_ORDER);

/**
 * Validates a full clinic+role browser access policy row/update payload
 * (D-15, D-16, D-19, D-21, D-22).
 */
export const browserAccessPolicySchema = z.object({
  clinicId: uuidSchema,
  roleCode: browserRoleCodeSchema,
  browserEnabled: z.boolean(),
  queueEnabled: z.boolean(),
  schedulingEnabled: z.boolean(),
  billingEnabled: z.boolean(),
  inventoryEnabled: z.boolean(),
  inventoryWriteEnabled: z.boolean(),
  usersEnabled: z.boolean(),
  updatedByUserId: uuidSchema.nullable(),
  updatedAt: z.string().datetime(),
});

/** Partial update payload an Admin submits when toggling one role's access. */
export const browserAccessPolicyUpdateSchema = browserAccessPolicySchema
  .omit({ updatedByUserId: true, updatedAt: true })
  .partial({
    browserEnabled: true,
    queueEnabled: true,
    schedulingEnabled: true,
    billingEnabled: true,
    inventoryEnabled: true,
    inventoryWriteEnabled: true,
    usersEnabled: true,
  });

/**
 * D-14: users may reorder the clinic-defined panel set but may not add,
 * remove, or rename core panels — the payload must be a permutation of the
 * exact locked panel-id set, nothing more and nothing less.
 */
export const dashboardPanelOrderSchema = z.object({
  panelOrder: z
    .array(dashboardPanelIdSchema)
    .length(DASHBOARD_PANEL_ORDER.length)
    .refine(
      (order) => new Set(order).size === DASHBOARD_PANEL_ORDER.length,
      'panelOrder must not contain duplicates',
    )
    .refine(
      (order) => DASHBOARD_PANEL_ORDER.every((panelId) => order.includes(panelId)),
      'panelOrder must include every core panel; core panels cannot be removed',
    ),
});

const dashboardQuickActionSchema = z.object({
  actionId: z.string().min(1),
  label: z.string().min(1),
  href: z.string().min(1),
});

const dashboardPanelSummarySchema = z.object({
  panelId: dashboardPanelIdSchema,
  title: z.string().min(1),
  itemCount: z.number().int().nonnegative(),
  quickActions: z.array(dashboardQuickActionSchema),
});

/** Cockpit home-surface response (D-01..D-13): ordered panels + generation time. */
export const cockpitResponseSchema = z.object({
  panelOrder: z.array(dashboardPanelIdSchema),
  panels: z.array(dashboardPanelSummarySchema),
  generatedAt: z.string().datetime(),
});

/**
 * D-40: live-sync freshness envelope. `data` is required once `status` is
 * `fresh` or `conflict`; `clientKnownUpdatedAt` is only meaningful once the
 * client has previously seen a version (i.e. not on first load).
 */
export const staleStateEnvelopeSchema = z.object({
  status: z.enum(['fresh', 'stale', 'conflict']),
  serverUpdatedAt: z.string().datetime(),
  clientKnownUpdatedAt: z.string().datetime().optional(),
});
