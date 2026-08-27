import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AttachmentService } from '../attachment.service.js';

function createMockPrisma() {
  return {
    consultation: {
      findFirst: vi.fn(),
    },
    consultationAttachment: {
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
    authAuditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

const CLINIC_ID = 'clinic_test_1';
const USER_ID = 'vet_test_1';
const CONSULTATION_ID = 'consult_test_1';
const ATTACHMENT_ID = 'attachment_test_1';

describe('AttachmentService', () => {
  let service: AttachmentService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AttachmentService(prisma);
  });

  describe('generateUploadUrl', () => {
    it('rejects and creates no attachment row when the consultation belongs to another clinic (AC-5)', async () => {
      prisma.consultation.findFirst.mockResolvedValue(null);

      await expect(
        service.generateUploadUrl(CONSULTATION_ID, CLINIC_ID, USER_ID, {
          fileType: 'xray',
          fileName: 'x.jpg',
          mimeType: 'image/jpeg',
          fileSizeBytes: 1024,
        }),
      ).rejects.toMatchObject({ code: 'CONSULTATION_NOT_FOUND', statusCode: 404 });

      expect(prisma.consultation.findFirst).toHaveBeenCalledWith({
        where: { id: CONSULTATION_ID, clinicId: CLINIC_ID },
        select: { id: true },
      });
      expect(prisma.consultationAttachment.count).not.toHaveBeenCalled();
      expect(prisma.consultationAttachment.create).not.toHaveBeenCalled();
    });

    it('creates the attachment when the consultation belongs to the caller clinic', async () => {
      prisma.consultation.findFirst.mockResolvedValue({ id: CONSULTATION_ID });
      prisma.consultationAttachment.count.mockResolvedValue(0);
      prisma.consultationAttachment.create.mockResolvedValue({ id: ATTACHMENT_ID });

      const result = await service.generateUploadUrl(CONSULTATION_ID, CLINIC_ID, USER_ID, {
        fileType: 'xray',
        fileName: 'x.jpg',
        mimeType: 'image/jpeg',
        fileSizeBytes: 1024,
      });

      expect(result.attachmentId).toBe(ATTACHMENT_ID);
      expect(prisma.consultationAttachment.create).toHaveBeenCalled();
    });
  });

  describe('confirmUpload', () => {
    it('writes an ATTACHMENT_UPLOADED audit log entry on success (EMR-07 / D-62)', async () => {
      prisma.consultationAttachment.findUnique.mockResolvedValue({
        id: ATTACHMENT_ID,
        consultationId: CONSULTATION_ID,
        fileType: 'xray',
        s3Key: 'clinics/x/consultations/y/z-file.jpg',
        consultation: { clinicId: CLINIC_ID },
      });
      prisma.consultationAttachment.update.mockResolvedValue({
        id: ATTACHMENT_ID,
        s3Url: 'http://localhost:9000/breeyo-uploads/x',
      });

      await service.confirmUpload(ATTACHMENT_ID, CLINIC_ID, USER_ID);

      expect(prisma.authAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            event: 'ATTACHMENT_UPLOADED',
            userId: USER_ID,
            clinicId: CLINIC_ID,
            metadata: expect.objectContaining({
              consultationId: CONSULTATION_ID,
              attachmentId: ATTACHMENT_ID,
              fileType: 'xray',
            }),
          }),
        }),
      );
    });

    it('rejects and does not audit when the attachment belongs to another clinic', async () => {
      prisma.consultationAttachment.findUnique.mockResolvedValue({
        id: ATTACHMENT_ID,
        consultation: { clinicId: 'other-clinic' },
      });

      await expect(
        service.confirmUpload(ATTACHMENT_ID, CLINIC_ID, USER_ID),
      ).rejects.toMatchObject({ code: 'ATTACHMENT_NOT_FOUND', statusCode: 404 });

      expect(prisma.authAuditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('deleteAttachment', () => {
    it('writes an ATTACHMENT_DELETED audit log entry on success (EMR-07 / D-62)', async () => {
      prisma.consultationAttachment.findUnique.mockResolvedValue({
        id: ATTACHMENT_ID,
        consultationId: CONSULTATION_ID,
        consultation: { clinicId: CLINIC_ID },
      });
      prisma.consultationAttachment.delete.mockResolvedValue({ id: ATTACHMENT_ID });

      await service.deleteAttachment(ATTACHMENT_ID, CLINIC_ID, USER_ID);

      expect(prisma.consultationAttachment.delete).toHaveBeenCalledWith({
        where: { id: ATTACHMENT_ID },
      });
      expect(prisma.authAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            event: 'ATTACHMENT_DELETED',
            userId: USER_ID,
            clinicId: CLINIC_ID,
            metadata: expect.objectContaining({
              consultationId: CONSULTATION_ID,
              attachmentId: ATTACHMENT_ID,
            }),
          }),
        }),
      );
    });

    it('rejects and does not audit when the attachment is not found', async () => {
      prisma.consultationAttachment.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteAttachment(ATTACHMENT_ID, CLINIC_ID, USER_ID),
      ).rejects.toMatchObject({ code: 'ATTACHMENT_NOT_FOUND', statusCode: 404 });

      expect(prisma.consultationAttachment.delete).not.toHaveBeenCalled();
      expect(prisma.authAuditLog.create).not.toHaveBeenCalled();
    });
  });
});
