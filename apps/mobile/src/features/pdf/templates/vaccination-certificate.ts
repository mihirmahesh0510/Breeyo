import type { Clinic, Pet, Owner } from '@breeyo/types';

/**
 * Certificate data from the API endpoint:
 * GET /api/v1/pets/:petId/vaccinations/:id/certificate
 */
export interface VaccinationCertificateData {
  pet: Pet;
  owner: Owner;
  vaccination: {
    vaccineName: string;
    batchNumber: string | null;
    manufacturer: string | null;
    expiryDate: Date | null;
    administeredAt: Date;
    administeredBy: string;
    administeredByName: string;
    administeredByLicense: string | null;
    nextDueDate: Date | null;
  };
}

/**
 * Builds a formal vaccination certificate PDF in HTML format.
 * Includes clinic header, pet details (name, species, breed, age, weight, microchip),
 * owner details, vaccine info (name, batch/lot, manufacturer, expiry, administered date,
 * next due date), vet name + license. Suitable for rabies compliance documentation.
 */
export function buildVaccinationCertificateHtml(
  clinic: Clinic,
  certificateData: VaccinationCertificateData,
  options?: { logoBase64?: string },
): string {
  const { pet, owner, vaccination } = certificateData;

  const adminDate = new Date(vaccination.administeredAt).toLocaleDateString(
    'en-IN',
    { day: '2-digit', month: 'long', year: 'numeric' },
  );
  const nextDueDate = vaccination.nextDueDate
    ? new Date(vaccination.nextDueDate).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : 'N/A';
  const expiryDate = vaccination.expiryDate
    ? new Date(vaccination.expiryDate).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : 'N/A';

  const petAge = pet.birthYear
    ? `${new Date().getFullYear() - pet.birthYear} year(s)`
    : 'N/A';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #333; padding: 24px; max-width: 600px; margin: 0 auto; }
    .header { text-align: center; padding-bottom: 16px; margin-bottom: 16px; }
    .header img { max-width: 60px; max-height: 60px; margin-bottom: 8px; }
    .clinic-name { font-size: 20px; font-weight: 700; color: #2E7D32; }
    .clinic-info { font-size: 11px; color: #666; }
    .certificate-title { text-align: center; font-size: 18px; font-weight: 700; color: #1C1B1F; text-transform: uppercase; letter-spacing: 2px; margin: 16px 0; border-top: 3px solid #2E7D32; border-bottom: 3px solid #2E7D32; padding: 8px 0; }
    .info-table { width: 100%; margin-bottom: 16px; }
    .info-table td { padding: 6px 8px; font-size: 12px; vertical-align: top; }
    .info-table .label { color: #666; font-weight: 500; width: 140px; }
    .info-table .value { color: #1C1B1F; font-weight: 400; }
    .section-title { font-size: 13px; font-weight: 700; color: #2E7D32; margin: 16px 0 8px 0; padding-bottom: 4px; border-bottom: 1px solid #E8F5E9; }
    .certification-box { background: #F5F0EB; border: 2px solid #2E7D32; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center; }
    .certification-text { font-size: 13px; line-height: 1.6; color: #333; }
    .certification-text strong { color: #2E7D32; }
    .footer { margin-top: 30px; padding-top: 16px; border-top: 2px solid #2E7D32; }
    .signature-area { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 40px; }
    .signature-block { text-align: center; }
    .signature-line { width: 200px; border-top: 1px solid #333; padding-top: 4px; font-size: 11px; color: #333; }
    .seal-area { width: 80px; height: 80px; border: 2px dashed #CAC4D0; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #CAC4D0; }
    .stamp-text { font-size: 9px; color: #999; text-align: center; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="header">
    ${options?.logoBase64 ? `<img src="${options.logoBase64}" alt="" />` : ''}
    <div class="clinic-name">${escapeHtml(clinic.name)}</div>
    <div class="clinic-info">${escapeHtml(clinic.address)}</div>
    <div class="clinic-info">Phone: ${escapeHtml(clinic.contactPhone)}</div>
  </div>

  <div class="certificate-title">Vaccination Certificate</div>

  <!-- Pet Details -->
  <div class="section-title">Animal Details</div>
  <table class="info-table">
    <tr>
      <td class="label">Name</td>
      <td class="value"><strong>${escapeHtml(pet.name)}</strong></td>
    </tr>
    <tr>
      <td class="label">Species</td>
      <td class="value">${escapeHtml(pet.species)}</td>
    </tr>
    <tr>
      <td class="label">Breed</td>
      <td class="value">${pet.breed ? escapeHtml(pet.breed) : 'N/A'}</td>
    </tr>
    <tr>
      <td class="label">Age</td>
      <td class="value">${petAge}</td>
    </tr>
    <tr>
      <td class="label">Weight</td>
      <td class="value">${pet.weight ? `${pet.weight} kg` : 'N/A'}</td>
    </tr>
    <tr>
      <td class="label">Color / Markings</td>
      <td class="value">${pet.color ? escapeHtml(pet.color) : 'N/A'}</td>
    </tr>
    <tr>
      <td class="label">Microchip ID</td>
      <td class="value">${pet.microchipId ? escapeHtml(pet.microchipId) : 'N/A'}</td>
    </tr>
  </table>

  <!-- Owner Details -->
  <div class="section-title">Owner Details</div>
  <table class="info-table">
    <tr>
      <td class="label">Name</td>
      <td class="value">${escapeHtml(owner.name)}</td>
    </tr>
    <tr>
      <td class="label">Contact</td>
      <td class="value">${escapeHtml(owner.mobile)}</td>
    </tr>
    <tr>
      <td class="label">Address</td>
      <td class="value">${owner.address ? escapeHtml(owner.address) : 'N/A'}</td>
    </tr>
  </table>

  <!-- Vaccination Details -->
  <div class="section-title">Vaccination Details</div>
  <table class="info-table">
    <tr>
      <td class="label">Vaccine</td>
      <td class="value"><strong>${escapeHtml(vaccination.vaccineName)}</strong></td>
    </tr>
    <tr>
      <td class="label">Batch / Lot Number</td>
      <td class="value">${vaccination.batchNumber ? escapeHtml(vaccination.batchNumber) : 'N/A'}</td>
    </tr>
    <tr>
      <td class="label">Manufacturer</td>
      <td class="value">${vaccination.manufacturer ? escapeHtml(vaccination.manufacturer) : 'N/A'}</td>
    </tr>
    <tr>
      <td class="label">Vaccine Expiry Date</td>
      <td class="value">${expiryDate}</td>
    </tr>
    <tr>
      <td class="label">Date Administered</td>
      <td class="value"><strong>${adminDate}</strong></td>
    </tr>
    <tr>
      <td class="label">Next Due Date</td>
      <td class="value"><strong>${nextDueDate}</strong></td>
    </tr>
  </table>

  <!-- Certification Statement -->
  <div class="certification-box">
    <p class="certification-text">
      This is to certify that the above-described animal has been vaccinated against
      <strong>${escapeHtml(vaccination.vaccineName)}</strong>
      on <strong>${adminDate}</strong>
      at <strong>${escapeHtml(clinic.name)}</strong>.
    </p>
  </div>

  <!-- Footer with Signature -->
  <div class="footer">
    <div class="signature-area">
      <div>
        <div class="seal-area">Seal</div>
        <div class="stamp-text">Clinic Seal</div>
      </div>
      <div class="signature-block">
        <div class="signature-line">
          ${vaccination.administeredByName ? escapeHtml(vaccination.administeredByName) : 'Veterinarian'}<br/>
          ${vaccination.administeredByLicense ? `Reg. No. ${escapeHtml(vaccination.administeredByLicense)}` : ''}
        </div>
        <div style="font-size: 10px; color: #666; margin-top: 2px;">Veterinary Surgeon</div>
      </div>
    </div>
    <div style="text-align: center; margin-top: 16px; font-size: 9px; color: #999;">
      This certificate is issued by ${escapeHtml(clinic.name)} and is valid for regulatory compliance purposes.
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
