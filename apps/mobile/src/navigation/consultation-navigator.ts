/**
 * Consultation Navigation Flow
 *
 * Defines navigation param types and helper functions for the
 * consultation lifecycle:
 *
 * Queue screen (existing)
 *   -> tap IN_CONSULT card -> ConsultationScreen (consultationId + petId)
 *   -> ResumeBanner tap -> ConsultationScreen (resume draft)
 * ConsultationScreen
 *   -> "End Consultation" -> ConsultationReviewScreen
 *   -> "View History" -> HistoryBottomSheet (overlay)
 * ConsultationReviewScreen
 *   -> "Edit" -> back to ConsultationScreen
 *   -> "Confirm & Finalize" -> [Follow-up sheet] -> finalize -> navigate to queue
 * Queue screen -> tap DONE card -> ConsultationDetailScreen
 * ConsultationDetailScreen
 *   -> "Share" -> ShareOptionsSheet
 *   -> "Add Addendum" -> inline addendum
 * Pet Profile (from Phase 3)
 *   -> tap visit in MedicalTimeline -> ConsultationDetailScreen
 */

import type { Router } from 'expo-router';

// ---------- Param Types ----------

export interface ConsultationScreenParams {
  consultationId?: string;
  petId?: string;
  queueEntryId?: string;
}

export interface ConsultationReviewParams {
  consultationId: string;
}

export interface ConsultationDetailParams {
  consultationId: string;
}

// ---------- Navigation Helpers ----------

/**
 * Navigate to ConsultationScreen to start or resume a consultation.
 * Entry point: Queue IN_CONSULT card tap or ResumeBanner tap.
 */
export function navigateToConsultation(
  router: Router,
  params: ConsultationScreenParams,
): void {
  router.push({
    pathname: '/consultation/[consultationId]' as const,
    params: {
      consultationId: params.consultationId || 'new',
      petId: params.petId || '',
      queueEntryId: params.queueEntryId || '',
    },
  });
}

/**
 * Navigate to ConsultationReviewScreen after ending consultation.
 */
export function navigateToReview(
  router: Router,
  params: ConsultationReviewParams,
): void {
  router.push({
    pathname: '/consultation/review' as const,
    params: { consultationId: params.consultationId },
  });
}

/**
 * Navigate to ConsultationDetailScreen for a finalized consultation.
 * Entry point: Queue DONE card tap or MedicalTimeline visit tap.
 */
export function navigateToConsultationDetail(
  router: Router,
  params: ConsultationDetailParams,
): void {
  router.push({
    pathname: '/consultation/detail/[consultationId]' as const,
    params: { consultationId: params.consultationId },
  });
}

/**
 * Navigate to PatientDetailScreen.
 */
export function navigateToPatientDetail(
  router: Router,
  petId: string,
): void {
  router.push({
    pathname: '/patient/[petId]' as const,
    params: { petId },
  });
}

/**
 * Navigate back to the queue after finalization.
 */
export function navigateToQueue(router: Router): void {
  // Pop back to queue root
  router.replace('/(app)/queue' as const);
}
