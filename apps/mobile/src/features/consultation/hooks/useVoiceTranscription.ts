import { useState, useRef, useCallback, useEffect } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

/**
 * Common veterinary drug names for contextual recognition hints.
 * These help the speech recognition engine better identify medical terminology.
 */
const CONTEXTUAL_STRINGS = [
  'Amoxicillin', 'Cephalexin', 'Metronidazole', 'Enrofloxacin', 'Doxycycline',
  'Meloxicam', 'Carprofen', 'Tramadol', 'Prednisolone', 'Dexamethasone',
  'Ivermectin', 'Fipronil', 'Praziquantel', 'Fenbendazole', 'Pyrantel',
  'Ranitidine', 'Omeprazole', 'Ondansetron', 'Maropitant', 'Metoclopramide',
  'Atenolol', 'Pimobendan', 'Furosemide', 'Enalapril', 'Amlodipine',
  'subcutaneous', 'intramuscular', 'intravenous', 'per os', 'topical',
  'BID', 'TID', 'SID', 'QID', 'PRN',
  'mg/kg', 'ml', 'mg', 'IU',
  'Dhppi', 'Rabies', 'Bordetella', 'Leptospirosis', 'Parvo',
];

/**
 * Drug names that should be capitalized in transcription output.
 */
const DRUG_NAMES_LOWERCASE = CONTEXTUAL_STRINGS
  .filter((s) => /^[A-Z]/.test(s) && !/^(BID|TID|SID|QID|PRN|IU)$/.test(s))
  .map((name) => name.toLowerCase());

/**
 * Formats medical terms in transcribed text:
 * - Capitalizes known drug names
 * - Formats temperature units (e.g., "102 f" -> "102\u00B0F")
 * - Formats weight units (e.g., "5 kg" -> "5 kg")
 * - Capitalizes standard abbreviations (BID, TID, etc.)
 */
export function formatMedicalTerms(text: string): string {
  let formatted = text;

  // Capitalize known drug names
  for (const drugLower of DRUG_NAMES_LOWERCASE) {
    const regex = new RegExp(`\\b${drugLower}\\b`, 'gi');
    formatted = formatted.replace(regex, (match) => {
      return match.charAt(0).toUpperCase() + match.slice(1).toLowerCase();
    });
  }

  // Format temperature: "102 f" or "102 F" -> "102\u00B0F"
  formatted = formatted.replace(
    /(\d+(?:\.\d+)?)\s*(?:degree[s]?\s*)?[fF](?:ahrenheit)?(?=\s|$|[.,])/g,
    '$1\u00B0F',
  );
  formatted = formatted.replace(
    /(\d+(?:\.\d+)?)\s*(?:degree[s]?\s*)?[cC](?:elsius|entigrade)?(?=\s|$|[.,])/g,
    '$1\u00B0C',
  );

  // Capitalize standard abbreviations
  const abbreviations = ['bid', 'tid', 'sid', 'qid', 'prn', 'iu'];
  for (const abbr of abbreviations) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    formatted = formatted.replace(regex, abbr.toUpperCase());
  }

  // Format mg/kg units
  formatted = formatted.replace(/(\d+(?:\.\d+)?)\s*mg\s*(?:per|\/)\s*kg/gi, '$1 mg/kg');

  return formatted;
}

export type SoapFieldName =
  | 'subjective.ownerReports'
  | 'subjective.history'
  | 'objective.notes'
  | 'assessment'
  | 'plan.freeText'
  | 'careInstructions'
  | 'rxNotes';

interface UseVoiceTranscriptionOptions {
  onTranscript?: (text: string, targetField: SoapFieldName) => void;
}

interface UseVoiceTranscriptionReturn {
  isRecording: boolean;
  transcript: string;
  interimTranscript: string;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  error: string | null;
  setLastFocusedField: (field: SoapFieldName) => void;
  lastFocusedField: SoapFieldName;
}

export function useVoiceTranscription(
  options: UseVoiceTranscriptionOptions = {},
): UseVoiceTranscriptionReturn {
  const { onTranscript } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const lastFocusedFieldRef = useRef<SoapFieldName>('subjective.ownerReports');
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const setLastFocusedField = useCallback((field: SoapFieldName) => {
    lastFocusedFieldRef.current = field;
  }, []);

  // Handle speech recognition results
  useSpeechRecognitionEvent('result', (event) => {
    const results = event.results;
    if (!results || results.length === 0) return;

    const latestResult = results[results.length - 1];
    if (!latestResult) return;

    const rawText = latestResult.transcript || '';

    if (event.isFinal || !latestResult.confidence || latestResult.confidence > 0) {
      const formatted = formatMedicalTerms(rawText);
      setTranscript(formatted);
      setInterimTranscript('');

      if (event.isFinal && onTranscriptRef.current) {
        onTranscriptRef.current(formatted, lastFocusedFieldRef.current);
      }
    } else {
      setInterimTranscript(rawText);
    }
  });

  // Handle speech recognition errors
  useSpeechRecognitionEvent('error', (event) => {
    const errorMessage = event.error || 'Speech recognition error';
    console.warn('[VoiceTranscription] Error:', errorMessage);
    setError(errorMessage);
    setIsRecording(false);
  });

  // Handle recognition end
  useSpeechRecognitionEvent('end', () => {
    setIsRecording(false);
  });

  const startRecording = useCallback(async () => {
    setError(null);
    setTranscript('');
    setInterimTranscript('');

    try {
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) {
        setError('Microphone permission denied. Please enable in Settings.');
        return;
      }

      ExpoSpeechRecognitionModule.start({
        lang: 'hi-IN',
        interimResults: true,
        continuous: true,
        contextualStrings: CONTEXTUAL_STRINGS,
      });

      setIsRecording(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start recording';
      console.warn('[VoiceTranscription] Start error:', message);
      setError(message);
    }
  }, []);

  const stopRecording = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch (err) {
      console.warn('[VoiceTranscription] Stop error:', err);
    }
    setIsRecording(false);
  }, []);

  return {
    isRecording,
    transcript,
    interimTranscript,
    startRecording,
    stopRecording,
    error,
    setLastFocusedField,
    lastFocusedField: lastFocusedFieldRef.current,
  };
}
