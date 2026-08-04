import { z } from 'zod';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf', 'application/dicom'] as const;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const ROUTES_OF_ADMINISTRATION = [
  'Oral', 'Injectable (IV)', 'Injectable (IM)', 'Injectable (SC)',
  'Topical', 'Eye Drops', 'Ear Drops', 'Inhalation', 'Rectal',
] as const;

export const prescriptionItemSchema = z.object({
  drugId: z.string().nullable().optional(),
  drugName: z.string().min(1, 'Drug name is required').max(200),
  formulationId: z.string().nullable().optional(),
  formulation: z.string().min(1, 'Formulation is required'),
  strength: z.string().min(1, 'Strength is required'),
  dosage: z.string().min(1, 'Dosage is required'),
  dosageMg: z.number().positive().nullable().optional(),
  route: z.enum(ROUTES_OF_ADMINISTRATION),
  frequency: z.string().min(1, 'Frequency is required'),
  duration: z.string().min(1, 'Duration is required'),
  durationDays: z.number().int().positive().nullable().optional(),
  clinicalInstructions: z.string().max(1000).nullable().optional(),
  ownerInstructions: z.string().max(1000).nullable().optional(),
  dispensed: z.boolean().default(false),
  inventoryItemId: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0),
});

export const attachmentMetaSchema = z.object({
  fileName: z.string().min(1, 'File name is required').max(255),
  mimeType: z.enum(ALLOWED_MIME_TYPES, {
    errorMap: () => ({ message: 'File type not allowed. Accepted: JPEG, PNG, PDF, DICOM' }),
  }),
  fileSizeBytes: z.number().int().positive().max(MAX_FILE_SIZE_BYTES, 'File size cannot exceed 10MB'),
  fileType: z.enum(['lab_report', 'xray', 'ultrasound', 'ecg', 'photo', 'other']),
  description: z.string().max(500).optional(),
});

export type PrescriptionItemInput = z.infer<typeof prescriptionItemSchema>;
export type AttachmentMetaInput = z.infer<typeof attachmentMetaSchema>;
