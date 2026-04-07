# 🍯 Tsavo Wild Honey — Deployment Guide (Render)

## What You're Deploying
- **Frontend** (`public/index.html`) → your website customers see
- **Backend** (`server/`) → handles orders, emails, and database
- **Database** (Supabase) → stores all orders

---

## Step 1 — Set Up Supabase (Database)

1. Go to https://supabase.com and sign up (free)
2. Click **New Project** → name it "tsavo-wild-honey"
3. Save your database password somewhere safe
4. Once created, go to **SQL Editor → New Query**
5. Paste the contents of `supabase-setup.sql` and click **Run**
6. Go to **Project Settings → API** and copy:
   - `Project URL` → this is your `SUPABASE_URL`
   - `service_role` secret key → this is your `SUPABASE_SERVICE_KEY`

---

## Step 2 — Set Up Resend (Emails)

1. Go to https://resend.com and sign up (free — 3,000 emails/month)
2. Go to **API Keys → Create API Key** → copy it → this is your `RESEND_API_KEY`
3. Go to **Domains → Add Domain** (e.g. tsavowildhoney.co.ke)
   - No domain yet? Use `onboarding@resend.dev` as your FROM_EMAIL for testing

---

## Step 3 — Push Code to GitHub

Render deploys directly from GitHub — no file uploads needed.

1. Go to https://github.com and sign up / log in
2. Click **New Repository** → name it `tsavo-wild-honey` → Create
3. Click **uploading an existing file**
4. Drag in all the contents of your `tsavo-wild-honey/` folder
5. Click **Commit changes**

Your code is now on GitHub.

---

## Step 4 — Deploy Backend on Render

1. Go to https://render.com and sign up with your GitHub account
2. Click **New → Web Service**
3. Click **Connect a repository** → select `tsavo-wild-honey`
4. Fill in the settings:
   - **Name:** tsavo-wild-honey
   - **Root Directory:** `server`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. Scroll down to **Environment Variables** and add each one:

| Key                  | Value                          |
|----------------------|--------------------------------|
| SUPABASE_URL         | https://xxxx.supabase.co       |
| SUPABASE_SERVICE_KEY | your-service-role-key          |
| RESEND_API_KEY       | re_xxxxxxxxxxxx                |
| YOUR_MPESA_NUMBER    | 07XXXXXXXX                     |
| YOUR_NAME            | Tsavo Wild Honey               |
| YOUR_EMAIL           | hello@tsavowildhoney.co.ke     |
| FROM_EMAIL           | orders@tsavowildhoney.co.ke    |
| PORT                 | 3000                           |

6. Click **Create Web Service** and wait ~2 minutes
7. Render gives you a URL like `https://tsavo-wild-honey.onrender.com`
   → **Copy this URL**

> ⚠️ Render free tier spins down after 15 min of inactivity. The first
> request after sleep takes ~30 seconds to wake — totally normal for a
> free plan. Customers won't notice since the page loads first.

---

## Step 5 — Update the Frontend

Open `public/index.html` and find the CONFIG block near the bottom:

```javascript
const CONFIG = {
  apiUrl: 'https://your-backend.railway.app', // ← replace with Render URL
  mpesaNumber: '07XX XXX XXX',                // ← your real M-Pesa number
  mpesaName: 'Tsavo Wild Honey',              // ← your name as shown on M-Pesa
  deliveryFee: 150
};
```

Replace with your real values, for example:
```javascript
const CONFIG = {
  apiUrl: 'https://tsavo-wild-honey.onrender.com',
  mpesaNumber: '0712345678',
  mpesaName: 'Jane Mwangi',
  deliveryFee: 150
};
```

---

## Step 6 — Host the Frontend on Netlify (Free)

1. Go to https://netlify.com and sign up
2. On the dashboard, drag and drop just the `public/` folder
3. Your site goes live at e.g. `tsavo-wild-honey.netlify.app`
4. To connect your own domain: **Site Settings → Domain Management → Add Domain**

---

## Step 7 — Test Everything

1. Open your Netlify site URL
2. Add a product to cart and go through the full checkout
3. Use a test M-Pesa code like `TEST1234`
4. Submit and verify:
   - ✅ Supabase → Table Editor → orders → new row appears
   - ✅ You received an order notification email
   - ✅ Customer received a confirmation email (if email was entered)

---

## Managing Your Orders

1. Go to supabase.com → your project → **Table Editor → orders**
2. Every order shows customer info, items, M-Pesa code, and status
3. Edit the `status` field to track progress

**Status flow:** `pending` → `confirmed` → `dispatched` → `delivered`

---

## Need Help?
Stuck on any step? Share the error message and I'll help fix it!
