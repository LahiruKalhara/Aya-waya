import { redis, isConfigured, SUBMISSIONS_KEY } from '../lib/redis.js';

const NETWORKS = ['Dialog', 'Mobitel', 'Hutch', 'Airtel', 'Other'];
const MAX_BODY = 10 * 1024;

export default {
  async fetch(request) {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    if (!isConfigured) return new Response('Storage not configured', { status: 500 });

    const text = await request.text();
    if (text.length > MAX_BODY) return new Response('Too large', { status: 413 });

    let data;
    try { data = JSON.parse(text); } catch { return new Response('Bad JSON', { status: 400 }); }

    const name = String(data?.name || '').trim().slice(0, 100);
    const network = NETWORKS.includes(data?.network) ? data.network : 'Other';
    const phone = String(data?.phone || '').replace(/[^0-9+]/g, '').slice(0, 15);
    if (!name) return new Response('Name required', { status: 400 });

    const entry = { name, network, phone, time: new Date().toISOString() };
    try {
      await redis('RPUSH', SUBMISSIONS_KEY, JSON.stringify(entry));
    } catch (err) {
      console.error('Save failed:', err);
      return new Response('Save failed', { status: 500 });
    }
    return Response.json({ ok: true });
  },
};
