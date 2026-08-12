import { useState, useCallback, useRef } from 'react';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import { buildOwnerSummaryHtml } from '../templates/consultation-summary';
import { buildClinicalRecordHtml } from '../templates/clinical-record';
import { buildPrescriptionPadHtml } from '../templates/prescription-pad';
import {
  buildVaccinationCertificateHtml,
  type VaccinationCertificateData,
} from '../templates/vaccination-certificate';
import type {
  Consultation,
  PrescriptionItem,
  ConsultationAttachment,
  Pet,
  Owner,
  Clinic,
} from '@breeyo/types';

interface ConsultationDetailResponse {
  data: {
    consultation: Consultation;
    prescriptions: PrescriptionItem[];
    attachments: ConsultationAttachment[];
    pet: Pet;
    owner: Owner;
    clinic: Clinic;
    vet: { fullName: string; licenseNumber: string | null };
  };
}

interface CertificateResponse {
  data: VaccinationCertificateData & {
    clinic: Clinic;
  };
}

/**
 * Generates a PDF from HTML content and opens the native share sheet.
 * Uses expo-print for HTML-to-PDF conversion and expo-sharing for distribution.
 * Logo images should use base64 data URIs for iOS compatibility.
 */
async function generatePdf(html: string, filename: string): Promise<void> {
  // Generate PDF from HTML
  const { uri } = await Print.printToFileAsync({ html });

  // Move to meaningful filename in cache directory
  const pdfFilename = `${filename.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
  const destinationUri = `${FileSystem.cacheDirectory}${pdfFilename}`;

  await FileSystem.moveAsync({
    from: uri,
    to: destinationUri,
  });

  // Open native share sheet
  await Sharing.shareAsync(destinationUri, {
    mimeType: 'application/pdf',
    dialogTitle: `Share ${filename}`,
    UTI: 'com.adobe.pdf',
  });
}

interface UseGeneratePdfReturn {
  generateOwnerSummary: (consultationId: string) => Promise<void>;
  generateClinicalRecord: (consultationId: string) => Promise<void>;
  generatePrescriptionPad: (consultationId: string) => Promise<void>;
  generateVaccinationCertificate: (
    petId: string,
    vaccinationId: string,
  ) => Promise<void>;
  isGenerating: boolean;
  error: string | null;
}

export function useGeneratePdf(): UseGeneratePdfReturn {
  const { accessToken } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;

  const fetchConsultationDetail = useCallback(
    async (consultationId: string): Promise<ConsultationDetailResponse['data']> => {
      const response = await apiClient<ConsultationDetailResponse>(
        `/api/v1/consultations/${consultationId}/detail`,
        { token: tokenRef.current || undefined },
      );
      return response.data;
    },
    [],
  );

  const generateOwnerSummary = useCallback(
    async (consultationId: string): Promise<void> => {
      setIsGenerating(true);
      setError(null);
      try {
        const detail = await fetchConsultationDetail(consultationId);
        const html = buildOwnerSummaryHtml(
          detail.clinic,
          detail.consultation,
          detail.prescriptions,
          detail.pet,
          detail.owner,
          {
            vetName: detail.vet.fullName,
            vetLicense: detail.vet.licenseNumber || undefined,
          },
        );
        await generatePdf(
          html,
          `${detail.pet.name}_Summary_${formatDateForFilename(detail.consultation.startedAt)}`,
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to generate summary';
        setError(message);
        throw err;
      } finally {
        setIsGenerating(false);
      }
    },
    [fetchConsultationDetail],
  );

  const generateClinicalRecord = useCallback(
    async (consultationId: string): Promise<void> => {
      setIsGenerating(true);
      setError(null);
      try {
        const detail = await fetchConsultationDetail(consultationId);
        const html = buildClinicalRecordHtml(
          detail.clinic,
          detail.consultation,
          detail.consultation.vitals,
          detail.prescriptions,
          detail.attachments,
          detail.pet,
          detail.owner,
          {
            vetName: detail.vet.fullName,
            vetLicense: detail.vet.licenseNumber || undefined,
          },
        );
        await generatePdf(
          html,
          `${detail.pet.name}_Clinical_${formatDateForFilename(detail.consultation.startedAt)}`,
        );
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Failed to generate clinical record';
        setError(message);
        throw err;
      } finally {
        setIsGenerating(false);
      }
    },
    [fetchConsultationDetail],
  );

  const generatePrescriptionPad = useCallback(
    async (consultationId: string): Promise<void> => {
      setIsGenerating(true);
      setError(null);
      try {
        const detail = await fetchConsultationDetail(consultationId);
        const html = buildPrescriptionPadHtml(
          detail.clinic,
          detail.consultation,
          detail.prescriptions,
          detail.pet,
          detail.owner,
          {
            vetName: detail.vet.fullName,
            vetLicense: detail.vet.licenseNumber || undefined,
          },
        );
        await generatePdf(
          html,
          `${detail.pet.name}_Prescription_${formatDateForFilename(detail.consultation.startedAt)}`,
        );
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Failed to generate prescription';
        setError(message);
        throw err;
      } finally {
        setIsGenerating(false);
      }
    },
    [fetchConsultationDetail],
  );

  const generateVaccinationCertificate = useCallback(
    async (petId: string, vaccinationId: string): Promise<void> => {
      setIsGenerating(true);
      setError(null);
      try {
        const response = await apiClient<CertificateResponse>(
          `/api/v1/pets/${petId}/vaccinations/${vaccinationId}/certificate`,
          { token: tokenRef.current || undefined },
        );

        const { clinic, ...certificateData } = response.data;
        const html = buildVaccinationCertificateHtml(clinic, certificateData);
        await generatePdf(
          html,
          `${certificateData.pet.name}_Vaccination_Certificate_${formatDateForFilename(certificateData.vaccination.administeredAt)}`,
        );
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Failed to generate vaccination certificate';
        setError(message);
        throw err;
      } finally {
        setIsGenerating(false);
      }
    },
    [],
  );

  return {
    generateOwnerSummary,
    generateClinicalRecord,
    generatePrescriptionPad,
    generateVaccinationCertificate,
    isGenerating,
    error,
  };
}

function formatDateForFilename(date: Date): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
