/**
 * WHA-05: single source of truth for every WhatsApp React Query key.
 *
 * `threadsRoot(clinicId)` is designed as a strict prefix of every
 * `threads(clinicId, filter, search)` variant, so one
 * `queryClient.invalidateQueries({ queryKey: whatsappKeys.threadsRoot(clinicId) })`
 * call clears the inbox cache regardless of which filter chip or search term
 * was active when it was fetched -- this is what makes the socket hook's
 * invalidation total rather than a guess at which variant is stale.
 *
 * Every accessor returns a brand-new array on each call (no shared array is
 * ever handed out and mutated), so callers can never corrupt another
 * caller's key by mutating the one they were given.
 */

export const whatsappKeys = {
  get root() {
    return ['whatsapp'] as const;
  },

  threadsRoot: (clinicId: string) => ['whatsapp', clinicId, 'threads'] as const,

  threads: (clinicId: string, filter: string, search: string) =>
    ['whatsapp', clinicId, 'threads', filter, search] as const,

  thread: (clinicId: string, threadId: string) =>
    ['whatsapp', clinicId, 'thread', threadId] as const,

  bookings: (clinicId: string) => ['whatsapp', clinicId, 'bookings'] as const,

  booking: (clinicId: string, bookingId: string) =>
    ['whatsapp', clinicId, 'bookings', bookingId] as const,

  slots: (clinicId: string, date: string) => ['whatsapp', clinicId, 'slots', date] as const,

  config: (clinicId: string) => ['whatsapp', clinicId, 'config'] as const,
};
