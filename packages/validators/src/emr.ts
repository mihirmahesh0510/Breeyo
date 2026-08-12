import { z } from 'zod';
import { prescriptionItemSchema } from './prescription.js';

export const createConsultationSchema = z.object({
  petId: z.string().min(1, 'Pet ID is required'),
  queueEntryId: z.string().optional(),
  visitType: z.enum(['general', 'surgery', 'vaccination']),
});

export const saveDraftSchema = z.object({
  vitals: z.object({
    weightKg: z.number().positive().max(500).nullable().optional(),
    temperatureC: z.number().min(30).max(50).nullable().optional(),
    heartRateBpm: z.number().int().positive().max(1000).nullable().optional(),
    respiratoryRate: z.number().int().positive().max(200).nullable().optional(),
  }).partial().optional(),
  subjective: z.object({
    ownerReports: z.string().max(5000).optional(),
    history: z.string().max(5000).optional(),
    chips: z.array(z.string()).optional(),
  }).partial().optional(),
  objective: z.object({
    bodySystems: z.array(z.object({
      system: z.string(),
      status: z.enum(['normal', 'abnormal']),
      findings: z.array(z.string()),
      notes: z.string().max(2000),
    })).optional(),
    notes: z.string().max(5000).optional(),
  }).partial().optional(),
  assessment: z.string().max(5000).optional(),
  plan: z.object({
    actionItems: z.array(z.string()).optional(),
    freeText: z.string().max(5000).optional(),
  }).partial().optional(),
  careInstructions: z.string().max(2000).optional(),
  referral: z.object({
    specialistType: z.string().min(1),
    reason: z.string().min(1).max(1000),
    urgency: z.enum(['routine', 'urgent']),
  }).nullable().optional(),
  rxNotes: z.string().max(2000).optional(),
  prescriptions: z.array(prescriptionItemSchema).optional(),
});

export const finalizeConsultationSchema = z.object({
  followUpDate: z.string().datetime().optional(),
  followUpReason: z.string().max(500).optional(),
});

export const addendumSchema = z.object({
  text: z.string().min(1, 'Addendum text is required').max(5000),
});

export type CreateConsultationInput = z.infer<typeof createConsultationSchema>;
export type SaveDraftInput = z.infer<typeof saveDraftSchema>;
export type FinalizeConsultationInput = z.infer<typeof finalizeConsultationSchema>;
export type AddendumInput = z.infer<typeof addendumSchema>;
