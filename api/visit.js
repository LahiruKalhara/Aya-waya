import { redis, isConfigured, VISITS_KEY } from '../lib/redis.js';

const MAX_VISITS = 2000; // keep only the most recent, so storage stays bounded

// Obvious non-humans: link-preview fetchers, crawlers, scripts, monitors.
const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|slackbot|discord|twitterbot|linkedinbot|embedly|pinterest|preview|headless|phantom|curl|wget|python-requests|axios|go-http|java\/|okhttp|monitor|uptime|pingdom|lighthouse|semrush|ahrefs|bingpreview|yandex|baidu|duckduckbot|googlebot|google-inspectiontool/i;

function deviceLabel(ua) {
  if (!ua) return 'Unknown';
  const os =
    /Android/i.test(ua) ? 'Android' :
    /iPhone/i.test(ua) ? 'iPhone' :
    /iPad/i.test(ua) ? 'iPad' :
    /Windows/i.test(ua) ? 'Windows' :
    /Mac OS X|Macintosh/i.test(ua) ? 'Mac' :
    /Linux/i.test(ua) ? 'Linux' : 'Other';
  const browser =
    /Edg\//i.test(ua) ? 'Edge' :
    /SamsungBrowser/i.test(ua) ? 'Samsung' :
    /OPR\/|Opera/i.test(ua) ? 'Opera' :
    /Firefox/i.test(ua) ? 'Firefox' :
    /Chrome\//i.test(ua) ? 'Chrome' :
    /Safari/i.test(ua) ? 'Safari' : 'Browser';
  return `${os} ${browser}`;
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    if (!isConfigured) return new Response(null, { status: 204 });

    const h = request.headers;
    const ua = h.get('user-agent') || '';
    if (BOT_RE.test(ua)) return new Response(null, { status: 204 }); // filtered, not counted

    let body = {};
    try { body = await request.json(); } catch { /* beacon with no body is fine */ }

    const ipRaw = h.get('x-forwarded-for') || h.get('x-real-ip') || '';
    const ip = ipRaw.split(',')[0].trim();
    const country = h.get('x-vercel-ip-country') || '';
    let city = h.get('x-vercel-ip-city') || '';
    try { city = decodeURIComponent(city); } catch { /* leave as-is */ }

    const entry = {
      time: new Date().toISOString(),
      ip,
      loc: [city, country].filter(Boolean).join(', '),
      device: deviceLabel(ua),
      ua: ua.slice(0, 200),
      ref: String(body?.ref || '').slice(0, 300),
    };

    try {
      await redis('RPUSH', VISITS_KEY, JSON.stringify(entry));
      await redis('LTRIM', VISITS_KEY, -MAX_VISITS, -1);
    } catch (err) {
      console.error('Visit log failed:', err); // never block the page over logging
    }
    return new Response(null, { status: 204 });
  },
};
