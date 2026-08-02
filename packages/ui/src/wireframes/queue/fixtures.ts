import type { QueuePatient } from '../../organisms/QueueCard/QueueCard';
import type { StatusVariant } from '../../organisms/QueueCard/QueueCard';

export interface QueueEntry {
  id: string;
  patient: QueuePatient;
  status: StatusVariant;
  position: number;
  waitTime: string;
  checkInTime: string;
}

export const MOCK_PATIENTS: QueuePatient[] = [
  { name: 'Priya Sharma', petName: 'Buddy', species: 'Dog' },
  { name: 'Rahul Patel', petName: 'Luna', species: 'Cat' },
  { name: 'Anita Desai', petName: 'Max', species: 'Dog' },
  { name: 'Vikram Singh', petName: 'Whiskers', species: 'Cat' },
  { name: 'Meera Nair', petName: 'Rocky', species: 'Dog' },
  { name: 'Suresh Kumar', petName: 'Coco', species: 'Parrot' },
];

export const MOCK_QUEUE_ENTRIES: QueueEntry[] = [
  {
    id: 'q-001',
    patient: MOCK_PATIENTS[0],
    status: 'inConsult',
    position: 1,
    waitTime: '0 min',
    checkInTime: '09:00',
  },
  {
    id: 'q-002',
    patient: MOCK_PATIENTS[1],
    status: 'waiting',
    position: 2,
    waitTime: '12 min',
    checkInTime: '09:15',
  },
  {
    id: 'q-003',
    patient: MOCK_PATIENTS[2],
    status: 'waiting',
    position: 3,
    waitTime: '8 min',
    checkInTime: '09:20',
  },
  {
    id: 'q-004',
    patient: MOCK_PATIENTS[3],
    status: 'waiting',
    position: 4,
    waitTime: '3 min',
    checkInTime: '09:25',
  },
  {
    id: 'q-005',
    patient: MOCK_PATIENTS[4],
    status: 'done',
    position: 5,
    waitTime: '-',
    checkInTime: '08:30',
  },
  {
    id: 'q-006',
    patient: MOCK_PATIENTS[5],
    status: 'noShow',
    position: 6,
    waitTime: '-',
    checkInTime: '08:45',
  },
];

export const EMPTY_QUEUE: QueueEntry[] = [];

export const ERROR_MESSAGE = 'Failed to load queue. Please try again.';
