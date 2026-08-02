import React from 'react';
import { View, Text } from 'react-native';

// --- Config (D-36: 2-tap check-in flow) ---

export const CHECK_IN_FLOW_CONFIG = {
  title: '2-Tap Check-In Flow',
  steps: ['Select Patient', 'Confirm Check-In'],
};

// --- Stub Components ---

function CheckInStep({ step, description, testID }: { step: string; description: string; testID?: string }) {
  return React.createElement(
    View,
    { style: { flex: 1, padding: 16 }, testID },
    React.createElement(Text, { style: { fontSize: 28, fontWeight: '400' } }, step),
    React.createElement(Text, { style: { fontSize: 16, marginTop: 8, color: '#49454F' } }, description),
  );
}

// --- Stories ---

export default {
  title: 'Wireframes/Queue/CheckInFlow',
  component: CheckInStep,
};

/** Tap 1: FAB opens bottom sheet with search + recent patients list */
export const Step1_SelectPatient = () =>
  React.createElement(CheckInStep, {
    step: 'Step 1: Select Patient',
    description: 'Bottom sheet with SearchBar + recent patients list. Tap a patient to proceed, or search by name/phone.',
    testID: 'checkin-step1-select',
  });

/** Tap 2: Confirm check-in with patient card + optional reason */
export const Step2_ConfirmCheckIn = () =>
  React.createElement(CheckInStep, {
    step: 'Step 2: Confirm Check-In',
    description: 'Patient card (Avatar + name + species) + optional "Reason for visit" TextInput + "Check In" button.',
    testID: 'checkin-step2-confirm',
  });

/** Tap 2 variant: New patient selected, shows mini registration form */
export const Step2_NewPatient = () =>
  React.createElement(CheckInStep, {
    step: 'Step 2: New Patient',
    description: 'Mini registration form (owner phone + pet name + species chip selector) + "Check In" button.',
    testID: 'checkin-step2-new',
  });

/** Standard states */
export const Empty = () =>
  React.createElement(CheckInStep, {
    step: 'Check-In Flow',
    description: 'No recent patients. Search bar is focused.',
    testID: 'checkin-empty',
  });

export const Loading = () =>
  React.createElement(CheckInStep, {
    step: 'Check-In Flow',
    description: 'Searching for patient...',
    testID: 'checkin-loading',
  });

export const Populated = () =>
  React.createElement(CheckInStep, {
    step: 'Check-In Flow',
    description: '3 recent patients shown. Search results populated.',
    testID: 'checkin-populated',
  });

export const Error = () =>
  React.createElement(CheckInStep, {
    step: 'Check-In Flow',
    description: 'Failed to load patients. Retry button shown.',
    testID: 'checkin-error',
  });
