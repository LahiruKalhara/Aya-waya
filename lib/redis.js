// Minimal Upstash Redis client over its REST API (no dependencies).
// The Vercel <-> Upstash integration sets KV_REST_API_URL / KV_REST_API_TOKEN.
const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const SUBMISSIONS_KEY = 'submissions';
export const VISITS_KEY = 'visits';
export const isConfigured = Boolean(REST_URL && REST_TOKEN);

export async function redis(...command) {
  if (!isConfigured) throw new Error('Redis is not configured');
  const res = await fetch(REST_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}` },
    body: JSON.stringify(command),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `Redis HTTP ${res.status}`);
  return data.result;
}
