export const eventSharePath = (eventId: string) => '/v1/events/' + encodeURIComponent(eventId) + '/share';

export function eventShareTitle(event: { title: string; shareWords?: string }) {
  return ['חוות רווה', event.title.trim(), event.shareWords?.trim()].filter(Boolean).join(' · ');
}
