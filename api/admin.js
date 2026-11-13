import crypto from 'node:crypto';
import { redis, isConfigured, SUBMISSIONS_KEY } from '../lib/redis.js';

const ADMIN_KEY = process.env.ADMIN_KEY || '';

const sriLankaTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'medium',
});

function keyMatches(given) {
  if (!ADMIN_KEY || !given) return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(ADMIN_KEY).digest();
  return crypto.timingSafeEqual(a, b);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function csvCell(value) {
  let s = String(value);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // stop Excel from running formulas
  return '"' + s.replace(/"/g, '""') + '"';
}

function text(body, status) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

async function loadSubmissions() {
  const raw = (await redis('LRANGE', SUBMISSIONS_KEY, 0, -1)) || [];
  return raw
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

function csvResponse(rows) {
  const lines = [['Name', 'Network', 'Phone', 'Time (Sri Lanka)'].map(csvCell).join(',')];
  for (const r of rows) {
    lines.push([r.name, r.network, r.phone || '', sriLankaTime.format(new Date(r.time))].map(csvCell).join(','));
  }
  return new Response('﻿' + lines.join('\r\n'), { // BOM so Excel shows Sinhala correctly
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="submissions.csv"',
      'Cache-Control': 'no-store',
    },
  });
}

function htmlResponse(rows, key) {
  const newestFirst = [...rows].reverse();
  const tableRows = newestFirst.map((r, i) => `
    <tr>
      <td>${newestFirst.length - i}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.network)}</td>
      <td>${escapeHtml(r.phone || '')}</td>
      <td>${escapeHtml(sriLankaTime.format(new Date(r.time)))}</td>
    </tr>`).join('');

  return new Response(`<!doctype html>
<html lang="si"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Submissions</title>
<style>
  body { font-family: 'Noto Sans Sinhala', system-ui, sans-serif; margin: 0; padding: 16px; background: #f4f1ea; color: #1f1f1f; }
  h1 { font-size: 1.3rem; }
  a { color: #8a1c1c; }
  .wrap { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; background: #fff; }
  th, td { padding: 8px 12px; border-bottom: 1px solid #e5e0d4; text-align: left; white-space: nowrap; }
  th { background: #8a1c1c; color: #fff; }
</style></head>
<body>
  <h1>Submissions: ${rows.length}</h1>
  <p><a href="/admin?key=${encodeURIComponent(key)}&format=csv">Download CSV</a></p>
  <div class="wrap"><table>
    <tr><th>#</th><th>නම</th><th>ජාලය</th><th>දුරකථන අංකය</th><th>වේලාව</th></tr>
    ${tableRows || '<tr><td colspan="5">No submissions yet</td></tr>'}
  </table></div>
</body></html>`, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export default {
  async fetch(request) {
    if (request.method !== 'GET') return text('Method not allowed', 405);
    if (!ADMIN_KEY) return text('Set the ADMIN_KEY environment variable in Vercel, then redeploy.', 500);

    const url = new URL(request.url);
    const key = url.searchParams.get('key') || '';
    if (!keyMatches(key)) return text('Forbidden', 403);

    if (!isConfigured) return text('Database not connected. Add Upstash Redis in Vercel > Storage, then redeploy.', 500);

    let rows;
    try {
      rows = await loadSubmissions();
    } catch (err) {
      console.error('Load failed:', err);
      return text('Could not load submissions', 500);
    }
    return url.searchParams.get('format') === 'csv' ? csvResponse(rows) : htmlResponse(rows, key);
  },
};
