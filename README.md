# Aya Waya

Sinhala "budget relief" form. Submitting it shows an image and saves the person's
name, network, phone number and time. Opening the page is also logged (time,
rough location, device, referrer, IP), with obvious bots filtered out.

## Setup on Vercel

1. **Storage** tab → Create Database → **Upstash for Redis** (Free) → connect to this project.
2. **Settings → Environment Variables** → add `ADMIN_KEY` = your password.
3. **Deployments** → ⋯ → **Redeploy**.

## See who submitted

```
https://<your-site>.vercel.app/admin?key=<ADMIN_KEY>
```

The admin page shows two tables: **Submissions** (people who filled the form)
and **Clicks** (everyone who opened the page). Each has a **Download CSV** link.
