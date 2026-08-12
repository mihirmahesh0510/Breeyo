import type { PrismaClient } from '@prisma/client';
import { attachmentMetaSchema } from '@breeyo/validators';
import { MAX_FILES_PER_CONSULTATION } from '@breeyo/types';
import crypto from 'crypto';
import { writeAuditLog, AuditEvent } from '../../lib/audit-log.js';

export class AttachmentService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Generates a presigned upload URL and creates attachment record.
   * D-61: 10MB limit, 10 files per consultation.
   */
  async generateUploadUrl(
    consultationId: string,
    clinicId: string,
    uploadedBy: string,
    meta: unknown,
  ) {
    const parsed = attachmentMetaSchema.parse(meta);

    // Check file count limit
    const count = await this.prisma.consultationAttachment.count({
      where: { consultationId },
    });
    if (count >= MAX_FILES_PER_CONSULTATION) {
      const error = new Error(`Maximum ${MAX_FILES_PER_CONSULTATION} files per consultation`) as Error & { statusCode: number; code: string };
      error.statusCode = 400;
      error.code = 'FILE_LIMIT_EXCEEDED';
      throw error;
    }

    const s3Key = `clinics/${clinicId}/consultations/${consultationId}/${crypto.randomUUID()}-${parsed.fileName}`;

    // Create attachment record
    const attachment = await this.prisma.consultationAttachment.create({
      data: {
        consultationId,
        fileType: parsed.fileType,
        fileName: parsed.fileName,
        mimeType: parsed.mimeType,
        fileSizeBytes: parsed.fileSizeBytes,
        s3Key,
        uploadedBy,
        description: parsed.description ?? null,
      },
    });

    // In development, return a mock presigned URL
    // In production, this would use AWS S3 SDK
    const uploadUrl = process.env.NODE_ENV === 'production'
      ? `https://s3.ap-south-1.amazonaws.com/breeyo-uploads/${s3Key}`
      : `http://localhost:9000/breeyo-uploads/${s3Key}`;

    return {
      attachmentId: attachment.id,
      uploadUrl,
      s3Key,
      expiresIn: 900, // 15 minutes
    };
  }

  /**
   * Confirms upload completed and generates thumbnail if image.
   */
  async confirmUpload(attachmentId: string, clinicId: string, userId: string) {
    const attachment = await this.prisma.consultationAttachment.findUnique({
      where: { id: attachmentId },
      include: { consultation: { select: { clinicId: true } } },
    });

    if (!attachment || attachment.consultation.clinicId !== clinicId) {
      const error = new Error('Attachment not found') as Error & { statusCode: number; code: string };
      error.statusCode = 404;
      error.code = 'ATTACHMENT_NOT_FOUND';
      throw error;
    }

    // Generate presigned GET URL for viewing
    const s3Url = process.env.NODE_ENV === 'production'
      ? `https://s3.ap-south-1.amazonaws.com/breeyo-uploads/${attachment.s3Key}`
      : `http://localhost:9000/breeyo-uploads/${attachment.s3Key}`;

    const updated = await this.prisma.consultationAttachment.update({
      where: { id: attachmentId },
      data: { s3Url },
    });

    // EMR-07 / D-62: Audit trail for attachment uploads
    await writeAuditLog(this.prisma, AuditEvent.ATTACHMENT_UPLOADED, {
      userId,
      clinicId,
      metadata: {
        consultationId: attachment.consultationId,
        attachmentId,
        fileType: attachment.fileType,
      },
    });

    return updated;
  }

  /**
   * Returns all attachments for a consultation with presigned GET URLs.
   */
  async getAttachments(consultationId: string) {
    return this.prisma.consultationAttachment.findMany({
      where: { consultationId },
      orderBy: { uploadedAt: 'asc' },
    });
  }

  /**
   * Deletes an attachment record and schedules S3 object deletion.
   */
  async deleteAttachment(attachmentId: string, clinicId: string, userId: string) {
    const attachment = await this.prisma.consultationAttachment.findUnique({
      where: { id: attachmentId },
      include: { consultation: { select: { clinicId: true } } },
    });

    if (!attachment || attachment.consultation.clinicId !== clinicId) {
      const error = new Error('Attachment not found') as Error & { statusCode: number; code: string };
      error.statusCode = 404;
      error.code = 'ATTACHMENT_NOT_FOUND';
      throw error;
    }

    await this.prisma.consultationAttachment.delete({
      where: { id: attachmentId },
    });

    // TODO: Schedule S3 object deletion via queue job

    // EMR-07 / D-62: Audit trail for attachment deletions
    await writeAuditLog(this.prisma, AuditEvent.ATTACHMENT_DELETED, {
      userId,
      clinicId,
      metadata: {
        consultationId: attachment.consultationId,
        attachmentId,
      },
    });
  }
}
