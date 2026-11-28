import { eventSharePath, eventShareTitle } from '../../../shared/event-share';
import { Firestore, type Env } from '../firestore';

const farmSite = 'https://havat-ravve.web.app';
const fileHost = 'havat-ravve-api.meniviner.workers.dev';
const inlinePhoto = /^data:image\/(jpeg|png|webp);base64,([a-z\d+/]+={0,2})$/i;
const redirectScript = 'location.replace(document.getElementById("event").href)';
const headers = {
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

const html = (value: string) => value.replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]!);

function imageUrl(raw: string, origin: string, shareUrl: string) {
  if (raw.startsWith('data:')) return raw.length <= 400_000 && inlinePhoto.test(raw) ? shareUrl + '?image=1' : '';
  // Old sample assets and uploaded farm event photos are the two stored URL shapes.
  if (/^\/assets\/[a-z\d_-]+\.(?:webp|png|jpe?g)$/i.test(raw)) return farmSite + raw;
  try {
    const url = new URL(raw);
    if ((url.origin === 'https://' + fileHost || url.origin === origin) && !url.username && !url.password &&
        /^\/v1\/files\/event\/[a-z\d_-]{1,128}\/[a-z\d_-]{32}\.(?:webp|png|jpg)$/i.test(url.pathname)) return url.origin + url.pathname;
  } catch { /* A missing or unsupported photo leaves a text preview. */ }
  return '';
}

function unavailable(head: boolean, status: number) {
  return new Response(head ? null : 'האירוע אינו זמין לשיתוף.', { status, headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' } });
}

/** Public social preview of an already-published event, including older inline cover images. */
export async function publicEventShare(request: Request, env: Env, eventId: string): Promise<Response> {
  const head = request.method === 'HEAD';
  if (!head && request.method !== 'GET') return new Response(null, { status: 405, headers: { ...headers, allow: 'GET, HEAD' } });
  if (!eventId || eventId.length > 1500 || eventId === '.' || eventId === '..' || /[\/\u0000-\u001f]/.test(eventId)) return unavailable(head, 404);
  try {
    if (env.HIT_LIMITER && !(await env.HIT_LIMITER.limit({ key: 'event-share:' + (request.headers.get('cf-connecting-ip') || 'local') })).success) {
      return new Response(null, { status: 429, headers: { ...headers, 'retry-after':'60' } });
    }
    const [doc] = await new Firestore(env).getMany('events', [eventId], ['published','title','shareWords','image']);
    if (doc?.data.published !== true || typeof doc.data.title !== 'string') return unavailable(head, 404);
    const url = new URL(request.url);
    const shareUrl = url.origin + eventSharePath(eventId);
    const raw = typeof doc.data.image === 'string' ? doc.data.image : '';
    if (url.searchParams.get('image') === '1') {
      const match = raw.length <= 400_000 && inlinePhoto.exec(raw);
      if (!match) return unavailable(head, 404);
      const binary = atob(match[2]);
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      return new Response(head ? null : bytes, { headers: { ...headers, 'content-type':'image/' + match[1].toLowerCase(), 'content-length':String(bytes.length), 'content-security-policy':"default-src 'none'; sandbox" } });
    }
    const words = typeof doc.data.shareWords === 'string' ? doc.data.shareWords.trim() : '';
    const title = html(eventShareTitle({ title:doc.data.title, shareWords:words }));
    const photo = imageUrl(raw, url.origin, shareUrl);
    const target = env.FIRESTORE_EMULATOR_HOST ? 'http://localhost:5050/app/events/' + encodeURIComponent(eventId) + '?emulator' : farmSite + '/app/events/' + encodeURIComponent(eventId);
    const tags = [
      '<meta property="og:type" content="website"><meta property="og:locale" content="he_IL"><meta property="og:site_name" content="חוות רווה">',
      '<meta property="og:title" content="' + title + '"><meta property="og:url" content="' + html(shareUrl) + '">',
      words ? '<meta property="og:description" content="' + html(words) + '">' : '',
      photo ? '<meta property="og:image" content="' + html(photo) + '"><meta property="og:image:alt" content="' + html(doc.data.title) + '">' : '',
      '<meta name="twitter:card" content="' + (photo ? 'summary_large_image' : 'summary') + '">',
    ].join('');
    const page = '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + '</title>' + tags + '</head><body><main><h1>' + title + '</h1><p><a id="event" href="' + html(target) + '">פתיחת האירוע בחוות רווה</a></p></main><script>' + redirectScript + '</script></body></html>';
    return new Response(head ? null : page, { headers: { ...headers, 'content-type':'text/html; charset=utf-8', 'content-security-policy':"default-src 'none'; script-src 'sha256-LaEGqRTlrfoLskyYJ8+M4mmRZVv6NimHolEhYbhhf4o='; base-uri 'none'; frame-ancestors 'none'" } });
  } catch {
    return unavailable(head, 503);
  }
}
