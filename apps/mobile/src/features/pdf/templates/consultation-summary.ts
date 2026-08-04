import type { Consultation, PrescriptionItem, Pet, Owner, Clinic } from '@breeyo/types';

/**
 * Builds an owner-friendly consultation summary PDF in HTML format.
 * Includes pet name, date, diagnosis, prescriptions with clear dosage instructions,
 * care instructions, and follow-up date. Excludes clinical vitals and SOAP detail.
 */
export function buildOwnerSummaryHtml(
  clinic: Clinic,
  consultation: Consultation,
  prescriptions: PrescriptionItem[],
  pet: Pet,
  owner: Owner,
  options?: { logoBase64?: string },
): string {
  const date = new Date(consultation.startedAt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const followUpDate = consultation.followUpDate
    ? new Date(consultation.followUpDate).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : null;

  const prescriptionRows = prescriptions
    .map(
      (rx, index) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${index + 1}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">
          <strong>${rx.drugName}</strong> ${rx.strength ? `(${rx.strength})` : ''}
        </td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${rx.ownerInstructions || rx.frequency}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${rx.duration}</td>
      </tr>
    `,
    )
    .join('');

  const careInstructions = consultation.careInstructions || '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #333; line-height: 1.5; padding: 20px; }
    .header { text-align: center; border-bottom: 2px solid #2E7D32; padding-bottom: 16px; margin-bottom: 20px; }
    .header img { max-width: 60px; max-height: 60px; margin-bottom: 8px; }
    .clinic-name { font-size: 20px; font-weight: 700; color: #2E7D32; }
    .clinic-info { font-size: 12px; color: #666; margin-top: 4px; }
    .section { margin-bottom: 16px; }
    .section-title { font-size: 14px; font-weight: 600; color: #2E7D32; border-bottom: 1px solid #E8F5E9; padding-bottom: 4px; margin-bottom: 8px; }
    .info-grid { display: flex; flex-wrap: wrap; gap: 8px; }
    .info-item { flex: 1; min-width: 45%; }
    .info-label { font-size: 11px; color: #999; text-transform: uppercase; }
    .info-value { font-size: 13px; color: #333; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background-color: #E8F5E9; padding: 8px; text-align: left; font-size: 12px; font-weight: 600; color: #2E7D32; }
    td { font-size: 12px; }
    .care-box { background-color: #FFF8E1; border: 1px solid #FFE082; border-radius: 8px; padding: 12px; margin-top: 8px; }
    .care-box-title { font-size: 13px; font-weight: 600; color: #E65100; margin-bottom: 4px; }
    .followup-box { background-color: #E3F2FD; border: 1px solid #90CAF9; border-radius: 8px; padding: 12px; margin-top: 8px; text-align: center; }
    .followup-date { font-size: 16px; font-weight: 700; color: #1565C0; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #eee; text-align: center; font-size: 11px; color: #999; }
  </style>
</head>
<body>
  <div class="header">
    ${options?.logoBase64 ? `<img src="${options.logoBase64}" alt="Clinic Logo" />` : ''}
    <div class="clinic-name">${escapeHtml(clinic.name)}</div>
    <div class="clinic-info">${escapeHtml(clinic.address)}</div>
    <div class="clinic-info">Phone: ${escapeHtml(clinic.contactPhone)}</div>
  </div>

  <div style="text-align: center; margin-bottom: 16px;">
    <div style="font-size: 16px; font-weight: 600;">Consultation Summary</div>
    <div style="font-size: 12px; color: #666;">Date: ${date}</div>
  </div>

  <div class="section">
    <div class="section-title">Patient & Owner</div>
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">Pet Name</div>
        <div class="info-value">${escapeHtml(pet.name)}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Species / Breed</div>
        <div class="info-value">${escapeHtml(pet.species)}${pet.breed ? ` / ${escapeHtml(pet.breed)}` : ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Owner</div>
        <div class="info-value">${escapeHtml(owner.name)}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Contact</div>
        <div class="info-value">${escapeHtml(owner.mobile)}</div>
      </div>
    </div>
  </div>

  ${consultation.assessment ? `
  <div class="section">
    <div class="section-title">Diagnosis</div>
    <p style="font-size: 13px;">${escapeHtml(consultation.assessment)}</p>
  </div>
  ` : ''}

  ${prescriptions.length > 0 ? `
  <div class="section">
    <div class="section-title">Prescribed Medications</div>
    <table>
      <thead>
        <tr>
          <th style="width: 30px;">#</th>
          <th>Medication</th>
          <th>Instructions</th>
          <th style="width: 70px;">Duration</th>
        </tr>
      </thead>
      <tbody>
        ${prescriptionRows}
      </tbody>
    </table>
  </div>
  ` : ''}

  ${careInstructions ? `
  <div class="section">
    <div class="care-box">
      <div class="care-box-title">Care Instructions</div>
      <p style="font-size: 12px; white-space: pre-wrap;">${escapeHtml(careInstructions)}</p>
    </div>
  </div>
  ` : ''}

  ${followUpDate ? `
  <div class="section">
    <div class="followup-box">
      <div style="font-size: 12px; color: #666;">Follow-up Visit</div>
      <div class="followup-date">${followUpDate}</div>
      ${consultation.followUpReason ? `<div style="font-size: 11px; color: #666; margin-top: 4px;">${escapeHtml(consultation.followUpReason)}</div>` : ''}
    </div>
  </div>
  ` : ''}

  <div class="footer">
    <p>This is a computer-generated summary. For any concerns, please contact the clinic.</p>
    <p>${escapeHtml(clinic.name)} | ${escapeHtml(clinic.contactPhone)}</p>
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
