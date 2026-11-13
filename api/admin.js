import crypto from 'node:crypto';
import { redis, isConfigured, SUBMISSIONS_KEY, VISITS_KEY } from '../lib/redis.js';

const ADMIN_KEY = process.env.ADMIN_KEY || '';

const sriLankaTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'medium',
});
const fmt = (iso) => sriLankaTime.format(new Date(iso));

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

function csvResponse(name, lines) {
  return new Response('﻿' + lines.join('\r\n'), { // BOM so Excel shows Sinhala correctly
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
}

async function loadList(key) {
  const raw = (await redis('LRANGE', key, 0, -1)) || [];
  return raw
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

function submissionsCsv(rows) {
  const lines = [['Name', 'Network', 'Phone', 'Time (Sri Lanka)'].map(csvCell).join(',')];
  for (const r of rows) {
    lines.push([r.name, r.network, r.phone || '', fmt(r.time)].map(csvCell).join(','));
  }
  return csvResponse('submissions.csv', lines);
}

function visitsCsv(rows) {
  const lines = [['Time (Sri Lanka)', 'Location', 'Device', 'Referrer', 'IP', 'User agent'].map(csvCell).join(',')];
  for (const r of rows) {
    lines.push([fmt(r.time), r.loc || '', r.device || '', r.ref || '', r.ip || '', r.ua || ''].map(csvCell).join(','));
  }
  return csvResponse('clicks.csv', lines);
}

function htmlResponse(subs, visits, key) {
  const k = encodeURIComponent(key);

  const subsNewest = [...subs].reverse();
  const subRows = subsNewest.map((r, i) => `
    <tr>
      <td>${subsNewest.length - i}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.network)}</td>
      <td>${escapeHtml(r.phone || '')}</td>
      <td>${escapeHtml(fmt(r.time))}</td>
    </tr>`).join('');

  const visitsNewest = [...visits].reverse();
  const visitRows = visitsNewest.map((r, i) => `
    <tr>
      <td>${visitsNewest.length - i}</td>
      <td>${escapeHtml(fmt(r.time))}</td>
      <td>${escapeHtml(r.loc || '')}</td>
      <td>${escapeHtml(r.device || '')}</td>
      <td title="${escapeHtml(r.ref || '')}">${escapeHtml((r.ref || '').slice(0, 40))}</td>
      <td>${escapeHtml(r.ip || '')}</td>
    </tr>`).join('');

  return new Response(`<!doctype html>
<html lang="si"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Submissions</title>
<style>
  body { font-family: 'Noto Sans Sinhala', system-ui, sans-serif; margin: 0; padding: 16px; background: #f4f1ea; color: #1f1f1f; }
  h1 { font-size: 1.3rem; margin: 0 0 4px; }
  h2 { font-size: 1.1rem; margin: 28px 0 8px; }
  a { color: #8a1c1c; }
  .muted { color: #6b645a; font-size: .85rem; margin: 0 0 8px; }
  .wrap { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; background: #fff; }
  th, td { padding: 8px 12px; border-bottom: 1px solid #e5e0d4; text-align: left; white-space: nowrap; }
  th { background: #8a1c1c; color: #fff; }
</style></head>
<body>
  <h1>අය වැය — Admin</h1>

  <h2>Submissions: ${subs.length}</h2>
  <p class="muted"><a href="/admin?key=${k}&format=csv">Download CSV</a></p>
  <div class="wrap"><table>
    <tr><th>#</th><th>නම</th><th>ජාලය</th><th>දුරකථන අංකය</th><th>වේලාව</th></tr>
    ${subRows || '<tr><td colspan="5">No submissions yet</td></tr>'}
  </table></div>

  <h2>Clicks: ${visits.length}</h2>
  <p class="muted">
    Everyone who opened the page. Obvious bots (link previews, crawlers) are not counted.
    A click shows the visit, not the person's name — names come only from submissions above.
    &nbsp;<a href="/admin?key=${k}&format=csv&what=visits">Download CSV</a>
  </p>
  <div class="wrap"><table>
    <tr><th>#</th><th>වේලාව</th><th>ස්ථානය</th><th>උපකරණය</th><th>Referrer</th><th>IP</th></tr>
    ${visitRows || '<tr><td colspan="6">No clicks yet</td></tr>'}
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
    if (!keyMatches(url.searchParams.get('key') || '')) return text('Forbidden', 403);
    if (!isConfigured) return text('Database not connected. Add Upstash Redis in Vercel > Storage, then redeploy.', 500);

    let subs, visits;
    try {
      [subs, visits] = await Promise.all([loadList(SUBMISSIONS_KEY), loadList(VISITS_KEY)]);
    } catch (err) {
      console.error('Load failed:', err);
      return text('Could not load data', 500);
    }

    if (url.searchParams.get('format') === 'csv') {
      return url.searchParams.get('what') === 'visits' ? visitsCsv(visits) : submissionsCsv(subs);
    }
    return htmlResponse(subs, visits, url.searchParams.get('key'));
  },
};
