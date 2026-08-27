import type { Consultation, PrescriptionItem, Clinic, Pet, Owner } from '@breeyo/types';
import { colors } from '@breeyo/ui';

/**
 * Builds a traditional Rx prescription pad PDF in HTML format.
 * Includes clinic header, patient info, Rx symbol, numbered medications
 * with owner-friendly instructions, route, and dispensed/prescribed status.
 * Vet signature line at bottom.
 */
export function buildPrescriptionPadHtml(
  clinic: Clinic,
  consultation: Consultation,
  prescriptions: PrescriptionItem[],
  pet: Pet,
  owner: Owner,
  options?: { logoBase64?: string; vetName?: string; vetLicense?: string },
): string {
  const date = new Date(consultation.startedAt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const prescriptionItems = prescriptions
    .map(
      (rx, index) => `
      <div style="margin-bottom: 12px; padding: 8px 0; border-bottom: 1px dashed #ddd;">
        <div style="display: flex; align-items: flex-start;">
          <span style="font-size: 14px; font-weight: 700; color: #333; width: 24px;">${index + 1}.</span>
          <div style="flex: 1;">
            <div style="font-size: 14px; font-weight: 600; color: #1C1B1F;">
              ${escapeHtml(rx.drugName)}
              <span style="font-size: 11px; color: #666; font-weight: 400;"> ${rx.strength ? escapeHtml(rx.strength) : ''} ${escapeHtml(rx.formulation)}</span>
            </div>
            <div style="margin-top: 4px; font-size: 12px; color: #333;">
              <strong>Route:</strong> ${escapeHtml(rx.route)} |
              <strong>Frequency:</strong> ${escapeHtml(rx.frequency)} |
              <strong>Duration:</strong> ${escapeHtml(rx.duration)}
            </div>
            ${rx.ownerInstructions ? `
              <div style="margin-top: 4px; font-size: 12px; color: ${colors.secondary}; background: #FFF8E1; padding: 4px 8px; border-radius: 4px;">
                ${escapeHtml(rx.ownerInstructions)}
              </div>
            ` : ''}
            <div style="margin-top: 4px; font-size: 10px; color: #999;">
              ${rx.dispensed ? 'Dispensed' : 'Prescribed (not dispensed)'}
            </div>
          </div>
        </div>
      </div>
    `,
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #333; padding: 20px; max-width: 600px; margin: 0 auto; }
    .header { text-align: center; border-bottom: 3px double ${colors.primary}; padding-bottom: 12px; margin-bottom: 16px; }
    .header img { max-width: 50px; max-height: 50px; margin-bottom: 4px; }
    .clinic-name { font-size: 18px; font-weight: 700; color: ${colors.primary}; }
    .clinic-info { font-size: 10px; color: #666; }
    .patient-info { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; padding: 8px; background: #F5F0EB; border-radius: 8px; }
    .patient-field { flex: 1; min-width: 40%; }
    .patient-label { font-size: 9px; color: #999; text-transform: uppercase; }
    .patient-value { font-size: 12px; color: #333; }
    .rx-symbol { font-size: 32px; font-weight: 700; color: ${colors.primary}; font-family: serif; margin: 8px 0; }
    .prescription-list { margin-bottom: 16px; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 2px solid ${colors.primary}; }
    .signature-area { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 40px; }
    .signature-block { text-align: center; }
    .signature-line { width: 180px; border-top: 1px solid #333; padding-top: 4px; font-size: 10px; color: #666; }
    .date-line { font-size: 11px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    ${options?.logoBase64 ? `<img src="${options.logoBase64}" alt="" />` : ''}
    <div class="clinic-name">${escapeHtml(clinic.name)}</div>
    <div class="clinic-info">${escapeHtml(clinic.address)}</div>
    <div class="clinic-info">Phone: ${escapeHtml(clinic.contactPhone)}</div>
  </div>

  <div class="patient-info">
    <div class="patient-field">
      <div class="patient-label">Patient</div>
      <div class="patient-value"><strong>${escapeHtml(pet.name)}</strong> (${escapeHtml(pet.species)})</div>
    </div>
    <div class="patient-field">
      <div class="patient-label">Owner</div>
      <div class="patient-value">${escapeHtml(owner.name)}</div>
    </div>
    <div class="patient-field">
      <div class="patient-label">Date</div>
      <div class="patient-value">${date}</div>
    </div>
    <div class="patient-field">
      <div class="patient-label">Weight</div>
      <div class="patient-value">${pet.weight ? `${pet.weight} kg` : 'N/A'}</div>
    </div>
  </div>

  <div class="rx-symbol">Rx</div>

  <div class="prescription-list">
    ${prescriptionItems}
  </div>

  ${consultation.rxNotes ? `
  <div style="background: #FFF8E1; border: 1px solid #FFE082; border-radius: 8px; padding: 10px; margin-bottom: 16px;">
    <div style="font-size: 11px; font-weight: 600; color: ${colors.tertiary}; margin-bottom: 4px;">Prescription Notes</div>
    <p style="font-size: 12px; white-space: pre-wrap;">${escapeHtml(consultation.rxNotes)}</p>
  </div>
  ` : ''}

  <div class="footer">
    <div class="signature-area">
      <div class="date-line">Date: ${date}</div>
      <div class="signature-block">
        <div class="signature-line">
          ${options?.vetName ? escapeHtml(options.vetName) : 'Veterinarian'}<br/>
          ${options?.vetLicense ? `Lic. No. ${escapeHtml(options.vetLicense)}` : ''}
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
