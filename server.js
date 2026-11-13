const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || crypto.randomBytes(6).toString('hex');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'submissions.jsonl');
const NETWORKS = ['Dialog', 'Mobitel', 'Hutch', 'Airtel', 'Other'];
const MAX_BODY = 10 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

fs.mkdirSync(DATA_DIR, { recursive: true });

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

function readSubmissions() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return fs.readFileSync(DATA_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
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

const sriLankaTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'medium',
});

function handleSubmit(req, res) {
  const chunks = [];
  let size = 0;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size <= MAX_BODY) chunks.push(chunk);
  });
  req.on('end', () => {
    if (size > MAX_BODY) return send(res, 413, 'Too large');

    let data;
    try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(res, 400, 'Bad JSON'); }

    const name = String(data.name || '').trim().slice(0, 100);
    const network = NETWORKS.includes(data.network) ? data.network : 'Other';
    if (!name) return send(res, 400, 'Name required');

    const entry = { name, network, time: new Date().toISOString() };
    fs.appendFile(DATA_FILE, JSON.stringify(entry) + '\n', (err) => {
      if (err) {
        console.error('Save failed:', err);
        return send(res, 500, 'Save failed');
      }
      send(res, 200, JSON.stringify({ ok: true }), 'application/json');
    });
  });
}

function adminPage(res) {
  const rows = readSubmissions().reverse();
  const key = encodeURIComponent(ADMIN_KEY);
  const tableRows = rows.map((r, i) => `
    <tr>
      <td>${rows.length - i}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.network)}</td>
      <td>${escapeHtml(sriLankaTime.format(new Date(r.time)))}</td>
    </tr>`).join('');

  send(res, 200, `<!doctype html>
<html lang="si"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
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
  <p><a href="/admin.csv?key=${key}">Download CSV</a></p>
  <div class="wrap"><table>
    <tr><th>#</th><th>නම</th><th>ජාලය</th><th>වේලාව</th></tr>
    ${tableRows || '<tr><td colspan="4">No submissions yet</td></tr>'}
  </table></div>
</body></html>`, 'text/html; charset=utf-8');
}

function adminCsv(res) {
  const lines = [['Name', 'Network', 'Time (Sri Lanka)'].map(csvCell).join(',')];
  for (const r of readSubmissions()) {
    lines.push([r.name, r.network, sriLankaTime.format(new Date(r.time))].map(csvCell).join(','));
  }
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="submissions.csv"',
  });
  res.end('﻿' + lines.join('\r\n')); // BOM so Excel shows Sinhala correctly
}

function serveStatic(pathname, res) {
  if (pathname === '/') pathname = '/index.html';
  let filePath;
  try {
    filePath = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(pathname)));
  } catch {
    return send(res, 400, 'Bad request');
  }
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden');

  fs.readFile(filePath, (err, buf) => {
    if (err) return send(res, 404, 'Not found');
    send(res, 200, buf, MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const isAdmin = url.searchParams.get('key') === ADMIN_KEY;

  if (req.method === 'POST' && url.pathname === '/api/submit') return handleSubmit(req, res);
  if (req.method === 'GET' && url.pathname === '/admin') return isAdmin ? adminPage(res) : send(res, 403, 'Forbidden');
  if (req.method === 'GET' && url.pathname === '/admin.csv') return isAdmin ? adminCsv(res) : send(res, 403, 'Forbidden');
  if (req.method === 'GET') return serveStatic(url.pathname, res);
  send(res, 405, 'Method not allowed');
}).listen(PORT, () => {
  console.log(`Site:   http://localhost:${PORT}/`);
  console.log(`Admin:  http://localhost:${PORT}/admin?key=${ADMIN_KEY}`);
  if (!process.env.ADMIN_KEY) console.log('(Set the ADMIN_KEY environment variable to keep the same admin key between restarts.)');
});
