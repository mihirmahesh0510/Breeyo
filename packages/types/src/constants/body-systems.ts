export interface BodySystem {
  id: string;
  label: string;
  subFindings: readonly string[];
}

export const BODY_SYSTEMS: readonly BodySystem[] = [
  { id: 'eyes', label: 'Eyes', subFindings: ['Discharge', 'Redness', 'Opacity', 'Third eyelid prolapse'] },
  { id: 'ears', label: 'Ears', subFindings: ['Discharge', 'Odor', 'Inflammation', 'Mites', 'Hematoma'] },
  { id: 'skin_coat', label: 'Skin/Coat', subFindings: ['Hair loss', 'Lesions', 'Parasites', 'Dry/flaky', 'Hot spots', 'Lumps'] },
  { id: 'oral', label: 'Oral', subFindings: ['Tartar', 'Gingivitis', 'Broken teeth', 'Ulcers', 'Bad breath'] },
  { id: 'lymph_nodes', label: 'Lymph Nodes', subFindings: ['Enlarged submandibular', 'Enlarged prescapular', 'Enlarged popliteal', 'Generalized lymphadenopathy'] },
  { id: 'abdomen', label: 'Abdomen', subFindings: ['Distension', 'Pain on palpation', 'Mass', 'Organomegaly', 'Fluid wave'] },
  { id: 'heart_lungs', label: 'Heart/Lungs', subFindings: ['Murmur', 'Arrhythmia', 'Crackles', 'Wheezing', 'Cough', 'Dyspnea'] },
  { id: 'musculoskeletal', label: 'Musculoskeletal', subFindings: ['Lameness', 'Joint swelling', 'Crepitus', 'Muscle atrophy', 'Pain on manipulation'] },
] as const;
