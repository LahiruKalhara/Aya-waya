# Aya Waya

Sinhala "budget relief" form. Submitting it shows an image and saves the person's
name, network and time. The phone number is never sent or stored.

## Setup on Vercel

1. **Storage** tab → Create Database → **Upstash for Redis** (Free) → connect to this project.
2. **Settings → Environment Variables** → add `ADMIN_KEY` = your password.
3. **Deployments** → ⋯ → **Redeploy**.

## See who submitted

```
https://<your-site>.vercel.app/admin?key=<ADMIN_KEY>
```

Add `&format=csv` (or click **Download CSV**) to get an Excel-friendly file.
