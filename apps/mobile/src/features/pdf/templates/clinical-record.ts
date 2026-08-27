import type {
  Consultation,
  VitalsData,
  PrescriptionItem,
  ConsultationAttachment,
  Pet,
  Owner,
  Clinic,
} from '@breeyo/types';
import { colors } from '@breeyo/ui';

/**
 * Builds a full clinical record PDF in HTML format with all SOAP sections,
 * vitals, body system exam findings, prescriptions with clinical dosage,
 * attachments list, referral, and addenda.
 */
export function buildClinicalRecordHtml(
  clinic: Clinic,
  consultation: Consultation,
  vitals: VitalsData | null,
  prescriptions: PrescriptionItem[],
  attachments: ConsultationAttachment[],
  pet: Pet,
  owner: Owner,
  options?: { logoBase64?: string; vetName?: string; vetLicense?: string },
): string {
  const date = new Date(consultation.startedAt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const time = new Date(consultation.startedAt).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const prescriptionRows = prescriptions
    .map(
      (rx, index) => `
      <tr>
        <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">${index + 1}</td>
        <td style="padding: 6px; border: 1px solid #ddd;">
          <strong>${escapeHtml(rx.drugName)}</strong><br/>
          <span style="font-size: 10px; color: #666;">${escapeHtml(rx.formulation)} ${rx.strength ? `- ${escapeHtml(rx.strength)}` : ''}</span>
        </td>
        <td style="padding: 6px; border: 1px solid #ddd;">${escapeHtml(rx.dosage)}${rx.dosageMg ? ` (${rx.dosageMg} mg)` : ''}</td>
        <td style="padding: 6px; border: 1px solid #ddd;">${escapeHtml(rx.route)}</td>
        <td style="padding: 6px; border: 1px solid #ddd;">${escapeHtml(rx.frequency)}</td>
        <td style="padding: 6px; border: 1px solid #ddd;">${escapeHtml(rx.duration)}</td>
        <td style="padding: 6px; border: 1px solid #ddd;">${rx.clinicalInstructions ? escapeHtml(rx.clinicalInstructions) : '-'}</td>
      </tr>
    `,
    )
    .join('');

  const bodySystemsHtml = consultation.objective?.bodySystems
    ?.map(
      (sys) => `
      <tr>
        <td style="padding: 6px; border: 1px solid #ddd; font-weight: 500;">${escapeHtml(sys.system)}</td>
        <td style="padding: 6px; border: 1px solid #ddd;">
          <span style="color: ${sys.status === 'normal' ? colors.success : '#B3261E'}; font-weight: 500;">
            ${sys.status === 'normal' ? 'Normal' : 'Abnormal'}
          </span>
        </td>
        <td style="padding: 6px; border: 1px solid #ddd;">
          ${sys.findings.length > 0 ? sys.findings.map(escapeHtml).join(', ') : '-'}
          ${sys.notes ? `<br/><em style="font-size: 10px; color: #666;">${escapeHtml(sys.notes)}</em>` : ''}
        </td>
      </tr>
    `,
    )
    .join('') || '';

  const addendaHtml = consultation.addenda
    ?.map(
      (addendum) => `
      <div style="background: #F5F0EB; padding: 8px; border-radius: 4px; margin-bottom: 6px;">
        <div style="font-size: 10px; color: #666;">
          ${new Date(addendum.addedAt).toLocaleDateString('en-IN')} - ${escapeHtml(addendum.addedByName)}
        </div>
        <p style="font-size: 12px; margin-top: 4px;">${escapeHtml(addendum.text)}</p>
      </div>
    `,
    )
    .join('') || '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #333; line-height: 1.4; padding: 16px; font-size: 11px; }
    .header { text-align: center; border-bottom: 2px solid ${colors.primary}; padding-bottom: 12px; margin-bottom: 12px; }
    .header img { max-width: 50px; max-height: 50px; margin-bottom: 4px; }
    .clinic-name { font-size: 18px; font-weight: 700; color: ${colors.primary}; }
    .clinic-info { font-size: 10px; color: #666; }
    .doc-title { text-align: center; font-size: 14px; font-weight: 700; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; }
    .section { margin-bottom: 12px; page-break-inside: avoid; }
    .section-title { font-size: 12px; font-weight: 700; color: ${colors.primary}; background: #E8F5E9; padding: 4px 8px; border-left: 3px solid ${colors.primary}; margin-bottom: 6px; }
    .info-row { display: flex; flex-wrap: wrap; gap: 4px; }
    .info-cell { flex: 1; min-width: 30%; padding: 4px 0; }
    .info-label { font-size: 9px; color: #999; text-transform: uppercase; }
    .info-value { font-size: 11px; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 11px; }
    th { background: #E8F5E9; padding: 6px; text-align: left; font-size: 10px; font-weight: 600; border: 1px solid #ddd; }
    .vitals-grid { display: flex; flex-wrap: wrap; gap: 8px; }
    .vital-box { flex: 1; min-width: 22%; background: #F5F0EB; border-radius: 4px; padding: 8px; text-align: center; }
    .vital-value { font-size: 16px; font-weight: 700; color: #1C1B1F; }
    .vital-unit { font-size: 10px; color: #666; }
    .vital-label { font-size: 9px; color: #999; text-transform: uppercase; margin-top: 2px; }
    .soap-content { padding: 6px 0; white-space: pre-wrap; }
    .footer { margin-top: 20px; padding-top: 12px; border-top: 2px solid ${colors.primary}; }
    .signature-line { margin-top: 30px; border-top: 1px solid #333; width: 200px; text-align: center; padding-top: 4px; font-size: 10px; }
  </style>
</head>
<body>
  <div class="header">
    ${options?.logoBase64 ? `<img src="${options.logoBase64}" alt="" />` : ''}
    <div class="clinic-name">${escapeHtml(clinic.name)}</div>
    <div class="clinic-info">${escapeHtml(clinic.address)} | ${escapeHtml(clinic.contactPhone)}</div>
  </div>

  <div class="doc-title">Clinical Record</div>

  <!-- Patient & Visit Info -->
  <div class="section">
    <div class="info-row">
      <div class="info-cell">
        <div class="info-label">Patient</div>
        <div class="info-value"><strong>${escapeHtml(pet.name)}</strong></div>
      </div>
      <div class="info-cell">
        <div class="info-label">Species/Breed</div>
        <div class="info-value">${escapeHtml(pet.species)}${pet.breed ? ` / ${escapeHtml(pet.breed)}` : ''}</div>
      </div>
      <div class="info-cell">
        <div class="info-label">Weight</div>
        <div class="info-value">${pet.weight ? `${pet.weight} kg` : 'N/A'}</div>
      </div>
    </div>
    <div class="info-row">
      <div class="info-cell">
        <div class="info-label">Owner</div>
        <div class="info-value">${escapeHtml(owner.name)} (${escapeHtml(owner.mobile)})</div>
      </div>
      <div class="info-cell">
        <div class="info-label">Date / Time</div>
        <div class="info-value">${date} at ${time}</div>
      </div>
      <div class="info-cell">
        <div class="info-label">Visit Type</div>
        <div class="info-value" style="text-transform: capitalize;">${consultation.visitType}</div>
      </div>
    </div>
  </div>

  <!-- Vitals -->
  ${vitals ? `
  <div class="section">
    <div class="section-title">Vitals</div>
    <div class="vitals-grid">
      <div class="vital-box">
        <div class="vital-value">${vitals.weightKg != null ? vitals.weightKg.toFixed(1) : '-'}</div>
        <div class="vital-unit">kg</div>
        <div class="vital-label">Weight</div>
      </div>
      <div class="vital-box">
        <div class="vital-value">${vitals.temperatureC != null ? vitals.temperatureC.toFixed(1) : '-'}</div>
        <div class="vital-unit">\u00B0C</div>
        <div class="vital-label">Temperature</div>
      </div>
      <div class="vital-box">
        <div class="vital-value">${vitals.heartRateBpm != null ? vitals.heartRateBpm : '-'}</div>
        <div class="vital-unit">bpm</div>
        <div class="vital-label">Heart Rate</div>
      </div>
      <div class="vital-box">
        <div class="vital-value">${vitals.respiratoryRate != null ? vitals.respiratoryRate : '-'}</div>
        <div class="vital-unit">/min</div>
        <div class="vital-label">Resp. Rate</div>
      </div>
    </div>
  </div>
  ` : ''}

  <!-- Subjective -->
  ${consultation.subjective ? `
  <div class="section">
    <div class="section-title">Subjective</div>
    ${consultation.subjective.ownerReports ? `
      <p style="font-size: 10px; color: #666; margin-bottom: 2px;">Owner Reports:</p>
      <div class="soap-content">${escapeHtml(consultation.subjective.ownerReports)}</div>
    ` : ''}
    ${consultation.subjective.history ? `
      <p style="font-size: 10px; color: #666; margin-bottom: 2px; margin-top: 4px;">History:</p>
      <div class="soap-content">${escapeHtml(consultation.subjective.history)}</div>
    ` : ''}
    ${consultation.subjective.chips.length > 0 ? `
      <p style="font-size: 10px; color: #666; margin-top: 4px;">Presenting Signs: ${consultation.subjective.chips.map(escapeHtml).join(', ')}</p>
    ` : ''}
  </div>
  ` : ''}

  <!-- Objective - Body Systems -->
  ${consultation.objective && consultation.objective.bodySystems.length > 0 ? `
  <div class="section">
    <div class="section-title">Objective - Physical Examination</div>
    <table>
      <thead>
        <tr>
          <th>Body System</th>
          <th>Status</th>
          <th>Findings</th>
        </tr>
      </thead>
      <tbody>${bodySystemsHtml}</tbody>
    </table>
    ${consultation.objective.notes ? `
      <p style="margin-top: 6px; font-size: 10px; color: #666;">Additional Notes:</p>
      <div class="soap-content">${escapeHtml(consultation.objective.notes)}</div>
    ` : ''}
  </div>
  ` : ''}

  <!-- Assessment -->
  ${consultation.assessment ? `
  <div class="section">
    <div class="section-title">Assessment</div>
    <div class="soap-content">${escapeHtml(consultation.assessment)}</div>
  </div>
  ` : ''}

  <!-- Plan -->
  ${consultation.plan ? `
  <div class="section">
    <div class="section-title">Plan</div>
    ${consultation.plan.actionItems.length > 0 ? `
      <ul style="padding-left: 16px; margin-top: 4px;">
        ${consultation.plan.actionItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
    ` : ''}
    ${consultation.plan.freeText ? `
      <div class="soap-content" style="margin-top: 4px;">${escapeHtml(consultation.plan.freeText)}</div>
    ` : ''}
  </div>
  ` : ''}

  <!-- Prescriptions -->
  ${prescriptions.length > 0 ? `
  <div class="section">
    <div class="section-title">Prescriptions</div>
    <table>
      <thead>
        <tr>
          <th style="width: 20px;">#</th>
          <th>Drug</th>
          <th>Dosage</th>
          <th>Route</th>
          <th>Frequency</th>
          <th>Duration</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>${prescriptionRows}</tbody>
    </table>
  </div>
  ` : ''}

  <!-- Referral -->
  ${consultation.referral ? `
  <div class="section">
    <div class="section-title">Referral</div>
    <div class="info-row">
      <div class="info-cell">
        <div class="info-label">Specialist</div>
        <div class="info-value">${escapeHtml(consultation.referral.specialistType)}</div>
      </div>
      <div class="info-cell">
        <div class="info-label">Urgency</div>
        <div class="info-value" style="text-transform: capitalize;">${consultation.referral.urgency}</div>
      </div>
    </div>
    <p style="margin-top: 4px;">${escapeHtml(consultation.referral.reason)}</p>
  </div>
  ` : ''}

  <!-- Attachments -->
  ${attachments.length > 0 ? `
  <div class="section">
    <div class="section-title">Attachments</div>
    <ul style="padding-left: 16px;">
      ${attachments.map((att) => `<li>${escapeHtml(att.fileName)} (${escapeHtml(att.fileType)})</li>`).join('')}
    </ul>
  </div>
  ` : ''}

  <!-- Care Instructions -->
  ${consultation.careInstructions ? `
  <div class="section">
    <div class="section-title">Care Instructions</div>
    <div class="soap-content">${escapeHtml(consultation.careInstructions)}</div>
  </div>
  ` : ''}

  <!-- Follow-up -->
  ${consultation.followUpDate ? `
  <div class="section">
    <div class="section-title">Follow-up</div>
    <p>Date: <strong>${new Date(consultation.followUpDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</strong></p>
    ${consultation.followUpReason ? `<p>Reason: ${escapeHtml(consultation.followUpReason)}</p>` : ''}
  </div>
  ` : ''}

  <!-- Addenda -->
  ${consultation.addenda && consultation.addenda.length > 0 ? `
  <div class="section">
    <div class="section-title">Addenda</div>
    ${addendaHtml}
  </div>
  ` : ''}

  <!-- Footer / Signature -->
  <div class="footer">
    <div class="info-row">
      <div class="info-cell">
        ${consultation.durationMinutes ? `<p>Duration: ${consultation.durationMinutes} minutes</p>` : ''}
        ${consultation.finalizedAt ? `<p>Finalized: ${new Date(consultation.finalizedAt).toLocaleDateString('en-IN')}</p>` : ''}
      </div>
      <div class="info-cell" style="text-align: right;">
        <div class="signature-line" style="display: inline-block;">
          ${options?.vetName ? escapeHtml(options.vetName) : 'Veterinarian'}
          ${options?.vetLicense ? `<br/>Lic. ${escapeHtml(options.vetLicense)}` : ''}
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
