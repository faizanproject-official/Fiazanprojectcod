# COD Realistic — Shopify 1-Click Cash on Delivery App

A real, embedded Shopify app (ReleaseIT style) that adds a 1-click Cash-on-Delivery order form
to your product pages, creates real orders in Shopify, and protects you from fake orders.

## Features

- **Embedded admin app** — runs inside Shopify admin (App Bridge + Polaris), no external domain visible
- **1-click COD form on product pages** — auto-installed via script tag, no theme editing
- **Real orders** — creates Shopify orders with payment status "Pending" and a `COD` tag
- **Form Designer** — texts, colors, fields (name/phone/address/city/notes), quantity limit, live preview
- **Fraud Prevention** — duplicate phone detection, daily limits, Pakistan phone validation, block list
- **COD Orders log** — every order, flagged order and blocked attempt with search
- **Analytics** — orders, estimated revenue, form views, conversion rate, top products
- **App Proxy ready** — form submits through `your-store.myshopify.com/apps/cod/...` so your customers never see the app domain
- **GDPR webhooks** — customers/data_request, customers/redact, shop/redact, app/uninstalled

## Stack

- Node.js 20 + Express (`@shopify/shopify-app-express`)
- React 18 + Polaris 13 + App Bridge v4 (embedded admin)
- PostgreSQL (Railway) for sessions + data (in-memory fallback for local dev)
- Vite build, Dockerfile for Railway deploy

## Deploy to Railway (short version)

1. Push this folder to GitHub (or upload via Railway).
2. Railway → New Project → Deploy from GitHub repo → deploy.
3. Add **PostgreSQL** service in the same project. In your app service variables add:
   `DATABASE_URL = ${{Postgres.DATABASE_URL}}`
4. Add variables: `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL` (your Railway domain),
   `SCOPES=write_draft_orders,read_draft_orders,read_orders,read_products,write_script_tags,read_script_tags`
5. In Shopify Partners → your app → Configuration:
   - App URL: `https://your-app.up.railway.app`
   - Allowed redirection URL: `https://your-app.up.railway.app/api/auth/callback`
   - App proxy: subpath `cod`, prefix `apps`, proxy URL `https://your-app.up.railway.app/proxy`
6. Install: open `https://your-app.up.railway.app/api/auth?shop=your-store.myshopify.com`

Full step-by-step guide (Roman Urdu): **SETUP-GUIDE-URDU.md**

## Local development

```bash
npm install
npm run build          # builds admin UI into server/public/admin
npm start              # requires env vars (see .env.example)
```

## Structure

```
server/            Express server (OAuth, webhooks, admin API, app proxy, widget)
web/admin/         Embedded admin UI (React + Polaris + App Bridge)
server/public/     Built admin UI + cod-widget.js storefront script
Dockerfile         Railway deploy
railway.json       Railway config (healthcheck /health)
```
