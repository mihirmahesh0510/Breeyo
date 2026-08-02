import type { NotificationItemData } from '../../organisms/NotificationList/NotificationList';

export const mockNotifications: NotificationItemData[] = [
  {
    id: 'n1',
    module: 'queue',
    title: 'Patient checked in',
    message: 'Tiger (Cat) checked in by front desk',
    timestamp: '2 min ago',
    read: false,
  },
  {
    id: 'n2',
    module: 'inventory',
    title: 'Low stock alert',
    message: 'Amoxicillin 250mg is below par level (5 remaining)',
    timestamp: '15 min ago',
    read: false,
  },
  {
    id: 'n3',
    module: 'billing',
    title: 'Overdue invoice',
    message: 'Invoice #INV-0045 for Rs 2,500 is 3 days overdue',
    timestamp: '1h ago',
    read: false,
  },
  {
    id: 'n4',
    module: 'whatsapp',
    title: 'Message delivery failed',
    message:
      'Vaccination reminder to Rajesh Kumar could not be delivered',
    timestamp: '2h ago',
    read: true,
  },
  {
    id: 'n5',
    module: 'emr',
    title: 'Consultation finalized',
    message: 'Dr. Mehta finalized consultation for Bruno (Dog)',
    timestamp: '3h ago',
    read: true,
  },
  {
    id: 'n6',
    module: 'scheduling',
    title: 'Upcoming appointment',
    message: 'Max (Labrador) has an appointment at 3:00 PM today',
    timestamp: '4h ago',
    read: true,
  },
  {
    id: 'n7',
    module: 'queue',
    title: 'Queue status changed',
    message: 'Bella (Persian Cat) moved to In Consult',
    timestamp: '5h ago',
    read: true,
  },
  {
    id: 'n8',
    module: 'system',
    title: 'Backup complete',
    message: 'Daily database backup completed successfully',
    timestamp: 'Yesterday',
    read: true,
  },
];

export const emptyNotifications: NotificationItemData[] = [];

export const ERROR_MESSAGE =
  'Failed to load notifications. Please try again.';
