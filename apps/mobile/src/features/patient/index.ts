// Patient feature barrel export

// Registration (Plan 03)
export { RegisterPatientScreen } from './screens/RegisterPatientScreen';
export { SpeciesBreedPicker } from './components/SpeciesBreedPicker';
export { PetPhotoPicker } from './components/PetPhotoPicker';
export { ExistingOwnerCard } from './components/ExistingOwnerCard';
export {
  useRegisterPatient,
  useLookupOwner,
  useAddPet,
} from './hooks/usePatientRegister';

// Search & Profile (Plan 04)
export { usePatientSearch } from './hooks/usePatientSearch';
export { usePetProfile, useOwnerDetail, useRecentPatients, useUpdatePet } from './hooks/usePatientProfile';
export { PatientListItem } from './components/PatientListItem';
export { PatientSearchResults } from './components/PatientSearchResults';
export { RecentPatientsList } from './components/RecentPatientsList';
export { PetProfileCard } from './components/PetProfileCard';
export { VisitTimeline } from './components/VisitTimeline';
export { PatientListScreen } from './screens/PatientListScreen';
export { PatientDetailScreen } from './screens/PatientDetailScreen';
export { OwnerDetailScreen } from './screens/OwnerDetailScreen';
