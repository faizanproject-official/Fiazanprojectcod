import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import getShopify, { getAppConfig } from './shopify.js';
import adminRoutes from './routes/admin.js';
import proxyRoutes from './routes/proxy.js';
import { initDb, closeDb, isPostgres, getSettings } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const APP_VERSION = '2.4.0';
const app = express();
app.set('trust proxy', 1);

// ============================================================
// BOOT-PROOF STARTUP
// The container NEVER crashes at startup. If configuration is
// incomplete it boots in SETUP MODE: /health still answers OK
// (so Railway healthcheck passes and there is no crash loop)
// and the app serves a diagnostics page that shows exactly
// which environment variables are missing.
// ============================================================
const boot = {
  missing: [],
  urlValue: process.env.SHOPIFY_APP_URL || '',
  urlError: null,
  appUrl: null,
  shopifyError: null,
  dbError: null,
  dbConnected: false,
};

// 1) Required variables
for (const key of ['SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET', 'SHOPIFY_APP_URL']) {
  if (!process.env[key] || !String(process.env[key]).trim()) boot.missing.push(key);
}

// 2) Validate SHOPIFY_APP_URL format
if (!boot.missing.includes('SHOPIFY_APP_URL')) {
  try {
    const u = new URL(String(process.env.SHOPIFY_APP_URL).trim());
    if (u.protocol !== 'https:') {
      boot.urlError = 'URL must start with https:// (Railway domains are always https)';
    } else if (u.pathname && u.pathname !== '/') {
      boot.urlError = 'URL must NOT contain a path — use only https://your-app.up.railway.app';
    } else {
      boot.appUrl = u;
    }
  } catch {
    boot.urlError = 'Not a valid URL (example: https://your-app.up.railway.app)';
  }
}

// 3) Database init FIRST — verifies DB reachability (flag used by shopify.js).
//    NEVER fatal, app keeps running either way.
try {
  await initDb();
  boot.dbConnected = isPostgres();
} catch (err) {
  boot.dbError = err.message || err.code || 'connection failed (check DATABASE_URL host/port/password)';
  console.error('[boot] DATABASE connection failed:', boot.dbError);
  console.error('[boot] App keeps running, but a working DATABASE_URL is needed for sessions/orders on Railway.');
}

// 4) Shopify init (only when config looks complete)
let shopify = null;
if (boot.missing.length === 0 && boot.appUrl) {
  try {
    shopify = getShopify();
  } catch (err) {
    boot.shopifyError = err.message;
    console.error('[boot] shopify init failed:', err.message);
  }
}

const setupMode = !shopify; // missing vars OR invalid URL OR shopify init failed

// ------------------------------------------------------------
// Health check (Railway) — always available, always 200
// ------------------------------------------------------------
app.get('/health', async (req, res) => {
  const payload = {
    ok: true,
    version: APP_VERSION,
    mode: setupMode ? 'setup' : 'live',
    db: !isPostgres() ? 'memory' : (boot.dbError ? 'postgres-error' : 'postgres'),
    missing: boot.missing.length ? boot.missing : undefined,
    urlError: boot.urlError || undefined,
    shopifyError: boot.shopifyError || undefined,
    dbError: boot.dbError || undefined,
    time: new Date().toISOString(),
  };
  // [v2.1] SECRET PROBE: /health?shop=YOURSHOP.myshopify.com
  // Railway mein DEPLOYED key+secret ko Shopify ke against directly test karta hai.
  const shopParam = String(req.query.shop || '').trim().toLowerCase();
  if (shopParam && !setupMode && shopify) {
    if (!/^[a-z0-9][a-z0-9\-]*\.myshopify\.com$/.test(shopParam)) {
      payload.secretCheck = 'invalid shop parameter';
    } else {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(`https://${shopParam}/admin/oauth/access_token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            grant_type: 'client_credentials',
            client_id: shopify.api.config.apiKey,
            client_secret: shopify.api.config.apiSecretKey,
          }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        const j = await r.json().catch(() => ({}));
        payload.secretCheck = r.ok && j.access_token
          ? 'SAHI - deployed key+secret are correct'
          : 'GHALAT: ' + (j.error_description || j.error || 'HTTP ' + r.status);
      } catch (e) {
        payload.secretCheck = 'probe failed: ' + e.message;
      }
    }
  }
  res.json(payload);
});

// ------------------------------------------------------------
// Exit-iframe page (official embedded-app OAuth pattern).
// [v2.2 FIX] Pehle ye page 3 dafa fire hota tha (immediately +
// 400ms + 1500ms) — is se 2 OAuth flows RACE karte the aur
// state cookie doosre flow ki state se overwrite ho jati thi
// -> "Invalid OAuth callback" (state mismatch). Ab SIRF EK
// dafa fire hota hai, aur redirectUri bhi same-origin ho to
// allowed hai (host param preserve hota hai).
// ------------------------------------------------------------
app.get('/exitiframe', (req, res) => {
  const origin = boot.appUrl ? boot.appUrl.origin : '';
  let target = String(req.query.redirectUri || '');
  const sameOriginAbsolute = origin && target.startsWith(origin + '/');
  // Sirf same-origin targets allow (open redirect se bachao)
  if (!sameOriginAbsolute && (!target.startsWith('/') || target.startsWith('//'))) {
    target = `/api/auth?shop=${encodeURIComponent(String(req.query.shop || ''))}`;
  }
  const absolute = target.startsWith('http') ? target : `${origin}${target}`;
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  res.send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Redirecting…</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;color:#5c5f62;background:#f1f1f1;margin:0;flex-direction:column;gap:14px}</style>
</head><body>
<p>Opening Shopify authentication…</p>
<a id="manual" href="${absolute}" target="_top" onclick="if(window.__oauthFired)return false;window.__oauthFired=true;" style="display:none;background:#5c5f62;color:#fff;padding:9px 18px;border-radius:8px;text-decoration:none;font-size:14px">Continue →</a>
<p style="font-size:12px;color:#8c9196;margin:0">Agar naya tab khule to usi tab mein aage barhein.</p>
<script>
(function () {
  var uri = ${JSON.stringify(absolute)};
  function go() {
    if (window.__oauthFired) return;
    window.__oauthFired = true;
    // Pehle direct top-level navigation try karo (sandboxed iframe mein throw ho sakta hai)
    try { window.top.location.href = uri; return; } catch (e) {}
    try { window.open(uri, '_top'); } catch (e) {}
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') go();
  else document.addEventListener('DOMContentLoaded', go);
  // Agar 4 second mein bhi navigate nahi hua to manual button dikha do
  // (auto re-fire NAHI — warna OAuth state race hoti hai)
  setTimeout(function () {
    var b = document.getElementById('manual');
    if (b) b.style.display = 'inline-block';
  }, 4000);
})();
</script>
</body></html>`);
});

// ------------------------------------------------------------
// SETUP MODE — friendly diagnostics page instead of a crash
// ------------------------------------------------------------
if (setupMode) {
  app.get(['/', '/setup'], (req, res) => {
    res.status(200).type('html').send(setupPageHtml(boot));
  });
  app.use((req, res) => {
    if (req.method === 'GET' && (req.headers.accept || '').includes('text/html')) {
      return res.status(200).type('html').send(setupPageHtml(boot));
    }
    res.status(503).json({
      ok: false,
      setup: true,
      message: 'App is in SETUP MODE — set environment variables in Railway to go live.',
      missing: boot.missing,
      urlError: boot.urlError,
      shopifyError: boot.shopifyError,
    });
  });
} else {
  const { url: appUrl } = getAppConfig();
  console.log(`[boot] App URL: ${appUrl.origin} (v${APP_VERSION})`);

  // ----------------------------------------------------------
  // [v2.3] Callback diagnostics — HMAC/state/cookie verdict.
  // compute ek dafa hota hai; console log + error page dono
  // usi result ko use karte hain. Error page par verdict
  // visible hai — Railway logs ke bina bhi diagnosis ho jati
  // hai (user sirf screenshot bhejta hai).
  // ----------------------------------------------------------
  const safeEqual = (a, b) => {
    const ab = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
  };
  const trunc = (s, n = 10) => (s ? `${String(s).slice(0, n)}…` : '—');
  const parseCookieJar = (cookieHeader) => {
    const jar = {};
    for (const part of String(cookieHeader || '').split(';')) {
      const idx = part.indexOf('=');
      if (idx > -1) jar[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
    }
    return jar;
  };
  const computeCallbackDiag = (req) => {
    const q = req.query || {};
    const secret = shopify.api.config.apiSecretKey;
    // 1) Query HMAC — bilkul wahi algorithm jo @shopify/shopify-api use karta hai
    const { hmac, signature, ...rest } = q;
    const sp = new URLSearchParams();
    Object.keys(rest)
      .sort((a, b) => a.localeCompare(b))
      .forEach((k) => sp.append(k, String(rest[k])));
    const localHmac = crypto
      .createHmac('sha256', secret)
      .update(sp.toString())
      .digest('hex');
    const hmacOk = !!hmac && safeEqual(localHmac, String(hmac));
    const tsDelta = q.timestamp ? Math.abs(Math.floor(Date.now() / 1000) - Number(q.timestamp)) : null;
    // 2) State cookies (shopify_app_state + shopify_app_state.sig)
    const jar = parseCookieJar(req.headers.cookie);
    const cookieState = jar['shopify_app_state'] || null;
    const cookieSig = jar['shopify_app_state.sig'] || null;
    let sigValid = false;
    if (cookieState && cookieSig) {
      const expectedSig = crypto.createHmac('sha256', secret).update(cookieState).digest('base64');
      sigValid = safeEqual(expectedSig, cookieSig);
    }
    const stateMatch = !!(cookieState && q.state && safeEqual(String(q.state), cookieState));
    return {
      hmacOk, localHmac, receivedHmac: String(hmac || ''),
      tsDelta, cookieState, cookieSig, sigValid, stateMatch,
      queryState: String(q.state || ''),
      shop: String(q.shop || ''),
      code: String(q.code || ''),
      cookieNames: Object.keys(jar),
    };
  };
  const stateVerdictOf = (d) =>
    d.stateMatch ? 'MATCH' : d.cookieState ? (d.sigValid ? 'MISMATCH' : 'SIG-INVALID') : 'COOKIE-MISSING';
  const callbackDiagnostics = (req, res, next) => {
    let d = null;
    try { d = computeCallbackDiag(req); } catch (e) {
      console.log('[diag] callback diag error:', e.message);
    }
    if (!d) return next();
    console.log(
      `[diag] callback: hmac=${d.hmacOk ? 'OK' : 'FAIL'} | state=${stateVerdictOf(d)} | timestampDelta=${d.tsDelta === null ? '?' : d.tsDelta + 's'} | shop=${d.shop || '?'} | cookies=[${d.cookieNames.join(',') || 'none'}]`
    );
    const tsStale = d.tsDelta !== null && d.tsDelta > 90;
    const hmacFail = !d.hmacOk; // hmac missing ya wrong
    const stateMismatch = d.cookieState && d.sigValid && !d.stateMatch;
    if (hmacFail || stateMismatch || tsStale) {
      // [v2.3] Library tak mat jaane do — wo khud sirf plain "Invalid OAuth
      // callback." text bhejta hai. Hum pehle hi rich diag page dikha dete
      // hain (verdict + wajah + Retry button).
      const fakeErr = {
        name: hmacFail ? 'HmacMismatch' : tsStale ? 'TimestampStale' : 'StateMismatch',
        message: `Intercepted pre-library: ${hmacFail ? 'query HMAC invalid/missing' : tsStale ? `timestamp ${d.tsDelta}s old (limit 90s)` : 'query state != state cookie'}`,
      };
      return renderOauthDiagPage(req, res, fakeErr);
    }
    // COOKIE-MISSING / SIG-INVALID -> library ko jaane do (wo fresh begin par
    // redirect karta hai = auto-heal, user ko kuch karna nahi parta)
    next();
  };
  const renderOauthDiagPage = (req, res, err) => {
    let d = null;
    try { d = computeCallbackDiag(req); } catch { /* ignore */ }
    const hmacVerdict = d ? (d.hmacOk ? 'OK' : 'FAIL') : 'unknown';
    const stateVerdict = d ? stateVerdictOf(d) : 'unknown';
    let wajah = '';
    let ilaj = '';
    if (hmacVerdict === 'FAIL') {
      wajah = 'HMAC mismatch — Railway ka SHOPIFY_API_SECRET Shopify ke real secret se different hai, YA request ki query transit mein tabdeel ho gayi.';
      ilaj = 'Railway par /health?shop=<aap ka shop> probe dobara chalayein — SAHI aana chahiye. Probe SAHI ho aur phir bhi ye page aaye to is page ka screenshot bhejein.';
    } else if (stateVerdict === 'MISMATCH') {
      wajah = 'State mismatch — 2 OAuth flows race kar gaye (Continue button double click, ya koi purana tab/authorize URL chal raha tha).';
      ilaj = 'Sab purane tabs band karein, phir neeche Retry button dabaein. Agar 2-3 koshishon par bhi yehi aaye to is page ka screenshot bhejein.';
    } else if (stateVerdict === 'COOKIE-MISSING') {
      wajah = 'State cookie callback tak nahi pahunchi — browser ne cookie block ki ya flow adhoora chhoot gaya.';
      ilaj = 'Chrome/Edge jaise normal browser mein kholein (in-app/private browser se bachein), phir Retry dabaein.';
    } else if (stateVerdict === 'SIG-INVALID') {
      wajah = 'State cookie ka signature verify nahi hua — deploy ke doran secret badla gaya ho sakta hai.';
      ilaj = 'Railway ko dobara deploy karein aur phir Retry dabaein.';
    } else if (hmacVerdict === 'OK' && stateVerdict === 'MATCH') {
      wajah = 'HMAC aur state dono sahi the — error aage token-exchange step par hua.';
      ilaj = 'Railway Deployments → Logs mein usi waqt ki lines copy karke bhejein.';
    } else {
      wajah = 'Diagnosis incomplete hai.';
      ilaj = 'Is page ka screenshot + Railway logs bhejein.';
    }
    const badge = (ok, label, value) => `
      <div class="row ${ok === 'OK' || ok === 'MATCH' ? 'good' : 'bad'}">
        <div class="k">${label}</div><div class="v">${value}</div>
      </div>`;
    const retryHref = d?.shop ? `/api/auth?shop=${encodeURIComponent(d.shop)}&embedded=0` : '/';
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    res.status(400).type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>OAuth Debug — COD Realistic</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;background:#0e1420;color:#e8edf5;padding:28px 14px}
.wrap{max-width:680px;margin:0 auto}
.badge{display:inline-block;background:#ef4444;color:#fff;font-weight:700;font-size:12px;letter-spacing:1px;padding:5px 12px;border-radius:999px;margin-bottom:12px}
h1{font-size:21px;margin-bottom:4px}
.err{color:#fca5a5;font-family:ui-monospace,Consolas,monospace;font-size:12.5px;margin-bottom:18px;word-break:break-word}
.row{display:flex;gap:12px;padding:10px 12px;border-radius:10px;margin-bottom:6px;font-size:13.5px}
.row.good{background:rgba(34,197,94,.08)}
.row.bad{background:rgba(239,68,68,.10)}
.row .k{width:150px;font-weight:700;flex-shrink:0}
.row .v{font-family:ui-monospace,Consolas,monospace;word-break:break-all}
.card{background:#161f30;border:1px solid #24314a;border-radius:14px;padding:18px;margin-bottom:14px}
.card h2{font-size:13px;text-transform:uppercase;letter-spacing:.8px;color:#8fa3c0;margin-bottom:10px}
.wajah{font-size:14px;line-height:1.6;margin-bottom:10px}
.ilaj{font-size:14px;line-height:1.6;color:#fbbf24}
.retry{display:inline-block;background:#22c55e;color:#04250f;font-weight:700;padding:11px 22px;border-radius:10px;text-decoration:none;font-size:14px;margin-top:6px}
.hint{color:#93a1b5;font-size:12px;margin-top:14px;line-height:1.6}
table{width:100%;border-collapse:collapse;font-size:12px}
td{padding:4px 6px;border-bottom:1px solid #24314a;font-family:ui-monospace,Consolas,monospace;word-break:break-all;color:#aebad0}
td:first-child{color:#7dd3fc;width:110px}
</style></head><body><div class="wrap">
<div class="badge">OAUTH DEBUG</div>
<h1>OAuth callback fail hua — ye page wajah batata hai</h1>
<div class="err">${esc(err?.name || 'Error')}: ${esc(err?.message || '')}</div>
<div class="card">
  <h2>Verdict</h2>
  ${badge(hmacVerdict, 'HMAC check', hmacVerdict + (hmacVerdict === 'FAIL' && d ? ` (expected ${trunc(d.localHmac, 12)} vs received ${trunc(d.receivedHmac, 12)})` : ''))}
  ${badge(stateVerdict, 'STATE check', stateVerdict + (d?.cookieState ? ` (cookie ${trunc(d.cookieState, 12)} vs query ${trunc(d.queryState, 12)})` : ''))}
  ${badge(d?.tsDelta !== null && d?.tsDelta !== undefined && d.tsDelta <= 90 ? 'OK' : 'FAIL', 'TIMESTAMP', d?.tsDelta != null ? `${d.tsDelta}s ago (limit 90s)` : 'missing')}
</div>
<div class="card">
  <h2>Wajah aur hal</h2>
  <p class="wajah"><b>Wajah:</b> ${esc(wajah)}</p>
  <p class="ilaj"><b>Hal:</b> ${esc(ilaj)}</p>
  <a class="retry" href="${retryHref}">↻ Dobara koshish karein (Retry)</a>
</div>
<div class="card">
  <h2>Technical details</h2>
  <table>
    <tr><td>shop</td><td>${esc(d?.shop || '—')}</td></tr>
    <tr><td>code</td><td>${esc(trunc(d?.code, 14))}</td></tr>
    <tr><td>hmac</td><td>${esc(trunc(d?.receivedHmac, 16))}</td></tr>
    <tr><td>state</td><td>${esc(trunc(d?.queryState, 16))}</td></tr>
    <tr><td>timestamp</td><td>${esc(String(req.query?.timestamp || '—'))}</td></tr>
    <tr><td>cookies</td><td>${esc(d?.cookieNames?.join(', ') || 'none received')}</td></tr>
  </table>
  <p class="hint">Screenshot mein ye poora page aana chahiye — isme sab verdict likhe hote hain. Ye page sirf tab dikhta hai jab OAuth fail ho; Retry button se aap fresh login try kar sakte hain.</p>
</div>
</div></body></html>`);
  };
  const callbackWithErrorDiag = async (req, res, next) => {
    try {
      await shopify.auth.callback()(req, res, next);
    } catch (err) {
      if (res.headersSent) return;
      const name = err?.name || '';
      const msg = String(err?.message || '');
      const oauthish = ['InvalidOAuthError', 'CookieNotFound', 'BotActivityDetected', 'InvalidHmacError', 'PrivateAppError'].includes(name)
        || /oauth|cookie|hmac/i.test(msg);
      if (!oauthish) return next(err);
      console.error('[diag] callback failed:', name || 'Error', '-', msg);
      renderOauthDiagPage(req, res, err);
    }
  };

  // ----------------------------------------------------------
  // Webhooks FIRST (needs raw body — do not parse JSON before)
  // ----------------------------------------------------------
  app.post(shopify.config.webhooks.path, shopify.processWebhooks({ webhookHandlers: shopify.config.webhooks.webhooks }));

  app.use(express.json({ limit: '1mb' }));
  // Capture raw body for proxy signature verification (POST)
  app.use((req, res, next) => {
    if (req.path.startsWith('/proxy') && req.method === 'POST') {
      req.rawBody = JSON.stringify(req.body || {});
    }
    next();
  });

  // ----------------------------------------------------------
  // Auth (OAuth)
  // [v2.2] RACE-PROOF begin: agar pehle se valid state cookie
  // maujood hai (double navigation se) to USI state ko reuse
  // karte hain — naya nonce mint karne se "Invalid OAuth
  // callback" (state mismatch) hota tha.
  // ----------------------------------------------------------
  const findExistingState = (req) => {
    try {
      const jar = {};
      for (const part of String(req.headers.cookie || '').split(';')) {
        const idx = part.indexOf('=');
        if (idx > -1) jar[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
      }
      const state = jar['shopify_app_state'];
      const sig = jar['shopify_app_state.sig'];
      if (!state || !sig) return null;
      const stateVal = decodeURIComponent(state);
      const expected = crypto
        .createHmac('sha256', shopify.api.config.apiSecretKey)
        .update(stateVal)
        .digest('base64');
      return safeEqual(expected, decodeURIComponent(sig)) ? stateVal : null;
    } catch {
      return null;
    }
  };

  app.get(shopify.config.auth.path, async (req, res, next) => {
    const shop = String(req.query.shop || '').trim().toLowerCase();
    // embedded=1 (iframe se aya) → library khud exitiframe par bhejegi
    if (req.query.embedded === '1' || !shop) {
      return shopify.auth.begin()(req, res, next);
    }
    const existingState = findExistingState(req);
    if (existingState) {
      // SAME state reuse — race-proof
      const cfg = shopify.api.config;
      const authorizeUrl = `https://${shop}/admin/oauth/authorize?` +
        new URLSearchParams({
          client_id: cfg.apiKey,
          scope: cfg.scopes.toString(),
          redirect_uri: `${cfg.hostScheme}://${cfg.hostName}${shopify.config.auth.callbackPath}`,
          state: existingState,
          'grant_options[]': '',
        }).toString();
      console.log(`[auth] state cookie REUSE (race-proof) for ${shop}`);
      return res.redirect(authorizeUrl);
    }
    return shopify.auth.begin()(req, res, next);
  });
  app.get(
    shopify.config.auth.callbackPath,
    callbackDiagnostics,
    callbackWithErrorDiag,
    async (req, res, next) => {
      try {
        const { session } = res.locals.shopify;
        // Register all webhooks for this shop
        for (const topic of Object.keys(shopify.config.webhooks.webhooks)) {
          try {
            await shopify.api.webhooks.register({ session, topic });
          } catch (err) {
            console.error(`[auth] webhook register failed for ${topic}:`, err.message);
          }
        }

        // Auto-inject storefront COD widget via script tag (skipped in Theme Editor mode — v2.4)
        const src = `${appUrl.origin}/storefront/cod-widget.js`;
        let themeMode = false;
        try {
          const s = await getSettings(session.shop);
          themeMode = !!(s && s.config && s.config.themeExtensionMode);
        } catch { /* default to creating */ }
        if (themeMode) {
          console.log(`[auth] themeExtensionMode ON — skipping script tag for ${session.shop}`);
        } else {
        const client = new shopify.api.clients.Rest({ session });
        const existing = await client.get({ path: 'script_tags' });
        if (!existing.body.script_tags.some((t) => t.src === src)) {
          await client.post({
            path: 'script_tags',
            data: { script_tag: { event: 'onload', src, displayScope: 'online_store' } },
          });
          console.log(`[auth] script tag created for ${session.shop}`);
        }
        }
        next();
      } catch (err) {
        console.error('[auth] after-auth error:', err.message);
        next();
      }
    },
    shopify.redirectToShopifyOrAppRoot()
  );

  // ----------------------------------------------------------
  // CSP for embedded admin frontend
  // ----------------------------------------------------------
  app.use(shopify.cspHeaders());

  // ----------------------------------------------------------
  // Admin API (session-token protected)
  // ----------------------------------------------------------
  // ----------------------------------------------------------
  // [v2.3] API token logging — 401 ka source trace karne ke
  // liye (token present tha ya MISSING tha).
  // ----------------------------------------------------------
  app.use('/api/*', (req, res, next) => {
    const auth = req.headers.authorization || '';
    const hasToken = auth.startsWith('Bearer ');
    console.log(`[api-auth] ${req.method} ${req.originalUrl} token=${hasToken ? 'present' : 'MISSING'}`);
    if (!hasToken) {
      // [v2.3] Pehle library chupke se /api/auth?shop=undefined par redirect
      // karti thi (shop=undefined -> error). Ab clean 401 + reauthorize header
      // — SPA ka api.js isse sahi shop ke sath re-auth shuru karta hai.
      const shop = String(req.query.shop || '');
      const reauth = `/api/auth${shop ? `?shop=${encodeURIComponent(shop)}` : ''}`;
      res.set('X-Shopify-API-Request-Failure-Reauthorize-Url', reauth);
      return res.status(401).json({ ok: false, error: 'session token missing' });
    }
    next();
  });
  app.use('/api/*', shopify.validateAuthenticatedSession());
  app.use('/api/admin', adminRoutes);

  // ----------------------------------------------------------
  // Storefront App Proxy routes (public, signature verified)
  // ----------------------------------------------------------
  app.use('/proxy', proxyRoutes);

  // ----------------------------------------------------------
  // Storefront COD widget (loaded via Shopify script tag)
  // ----------------------------------------------------------
  app.get('/storefront/cod-widget.js', (req, res) => {
    res.set('Content-Type', 'application/javascript; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=120');
    res.sendFile(path.join(__dirname, 'public', 'cod-widget.js'));
  });

  // ----------------------------------------------------------
  // Embedded Admin UI (built SPA)
  // ----------------------------------------------------------
  const adminDist = path.join(__dirname, 'public', 'admin');
  app.use(express.static(adminDist, { index: false }));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/proxy') || req.path.startsWith('/storefront')) {
      return next();
    }
    const indexFile = path.join(adminDist, 'index.html');
    if (!fs.existsSync(indexFile)) {
      return res.status(500).send('Admin UI is not built. Run: npm run build');
    }
    let html = fs.readFileSync(indexFile, 'utf8');
    html = html
      .replaceAll('__SHOPIFY_API_KEY__', process.env.SHOPIFY_API_KEY || '')
      .replaceAll('__APP_URL__', appUrl.origin);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });
}

// ------------------------------------------------------------
// Error handling
// ------------------------------------------------------------
app.use((err, req, res, next) => {
  console.error('[server] error:', err.message);
  if (res.headersSent) return;
  res.status(500).json({ ok: false, error: 'Internal error' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('==========================================');
  console.log(`  COD Realistic - Shopify App is running (v${APP_VERSION})`);
  console.log(`  Mode: ${setupMode ? 'SETUP (env vars missing)' : 'LIVE'}`);
  console.log(`  DB:   ${!isPostgres() ? 'in-memory (dev only!)' : (boot.dbError ? 'PostgreSQL ERROR - ' + boot.dbError : 'PostgreSQL OK')}`);
  console.log(`  Port: ${PORT}`);
  console.log('==========================================');
  if (setupMode) {
    console.log('  >>> Open this app URL in your browser to see the SETUP page <<<');
    console.log(`  >>> Missing variables: ${boot.missing.join(', ') || '(none)'} ${boot.urlError ? '| URL error: ' + boot.urlError : ''}`);
  }
});

process.on('SIGTERM', async () => {
  server.close();
  await closeDb();
  process.exit(0);
});

// ============================================================
// SETUP / DIAGNOSTICS PAGE (self-contained HTML)
// ============================================================
function setupPageHtml(boot) {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const maskKey = (v) => (v ? v.slice(0, 6) + '••••••••' + v.slice(-4) : '');

  const row = (ok, label, value, note) => `
    <div class="row ${ok ? 'ok' : 'bad'}">
      <div class="mark">${ok ? '✓' : '✗'}</div>
      <div class="info">
        <div class="label">${esc(label)}</div>
        <div class="value">${esc(value || '— not set —')}</div>
        ${note ? `<div class="note">${esc(note)}</div>` : ''}
      </div>
    </div>`;

  const keySet = !boot.missing.includes('SHOPIFY_API_KEY');
  const secretSet = !boot.missing.includes('SHOPIFY_API_SECRET');
  const urlOk = !!boot.appUrl;
  const scopes = process.env.SCOPES || 'write_draft_orders,read_draft_orders,read_orders,read_products,write_script_tags,read_script_tags (default)';
  const dbSet = !!process.env.DATABASE_URL;

  let dbRow;
  if (!dbSet) {
    dbRow = `<div class="row warn"><div class="mark">!</div><div class="info">
      <div class="label">DATABASE_URL</div><div class="value">— not set —</div>
      <div class="note">App chalay ga lekin data restart par reset ho jayega. Railway mein PostgreSQL service add karke variable set karein.</div></div></div>`;
  } else if (boot.dbError) {
    dbRow = `<div class="row bad"><div class="mark">✗</div><div class="info">
      <div class="label">DATABASE_URL (connection FAILED)</div><div class="value">${esc(process.env.DATABASE_URL)}</div>
      <div class="note">${esc(boot.dbError)}</div></div></div>`;
  } else {
    dbRow = `<div class="row ok"><div class="mark">✓</div><div class="info">
      <div class="label">DATABASE_URL (connected)</div><div class="value">PostgreSQL is ready</div></div></div>`;
  }

  const extraErrors = [];
  if (boot.urlError) extraErrors.push(`<div class="err">SHOPIFY_APP_URL problem: ${esc(boot.urlError)}</div>`);
  if (boot.shopifyError) extraErrors.push(`<div class="err">Shopify init problem: ${esc(boot.shopifyError)}</div>`);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="25">
<title>COD Realistic — Setup Required</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
         background: #0e1420; color: #e8edf5; min-height: 100vh; padding: 32px 16px; }
  .wrap { max-width: 760px; margin: 0 auto; }
  .badge { display: inline-block; background: #f59e0b; color: #1a1205; font-weight: 700;
           font-size: 12px; letter-spacing: 1px; padding: 5px 12px; border-radius: 999px; margin-bottom: 14px; }
  h1 { font-size: 26px; margin-bottom: 6px; }
  .sub { color: #93a1b5; margin-bottom: 26px; line-height: 1.5; }
  .card { background: #161f30; border: 1px solid #24314a; border-radius: 14px; padding: 20px; margin-bottom: 18px; }
  .card h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .8px; color: #8fa3c0; margin-bottom: 14px; }
  .row { display: flex; gap: 14px; align-items: flex-start; padding: 11px 10px; border-radius: 10px; margin-bottom: 6px; }
  .row.ok { background: rgba(34,197,94,.07); }
  .row.bad { background: rgba(239,68,68,.09); }
  .row.warn { background: rgba(245,158,11,.09); }
  .mark { width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
          font-weight: 800; font-size: 14px; flex-shrink: 0; }
  .row.ok .mark { background: #22c55e; color: #04250f; }
  .row.bad .mark { background: #ef4444; color: #fff; }
  .row.warn .mark { background: #f59e0b; color: #231602; }
  .label { font-weight: 700; font-size: 14px; }
  .value { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 13px; color: #aebad0;
           word-break: break-all; margin-top: 3px; }
  .note { font-size: 12.5px; color: #93a1b5; margin-top: 4px; line-height: 1.5; }
  ol { padding-left: 20px; line-height: 1.9; font-size: 14.5px; }
  code { background: #0b111c; border: 1px solid #24314a; border-radius: 6px; padding: 2px 7px;
         font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 13px; color: #7dd3fc; word-break: break-all; }
  .block { background: #0b111c; border: 1px solid #24314a; border-radius: 10px; padding: 14px;
           font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 13px;
           line-height: 1.9; color: #a5f3a5; overflow-x: auto; white-space: pre; }
  .err { background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.4); color: #fca5a5;
         border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-top: 8px; }
  .hint { color: #93a1b5; font-size: 12.5px; margin-top: 12px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="badge">SETUP REQUIRED</div>
  <h1>COD Realistic — Shopify App</h1>
  <p class="sub">Server chal raha hai (Railway crash khatam), lekin app ko LIVE hone ke liye environment variables chahiye.<br>
  Ye page har 25 second mein khud refresh hota hai — variables set karne ke baad yahan green ticks aa jayenge.</p>

  <div class="card">
    <h2>Configuration Status</h2>
    ${row(keySet, 'SHOPIFY_API_KEY', keySet ? maskKey(process.env.SHOPIFY_API_KEY) : '', keySet ? '' : 'Shopify Partners → aap ka app → Client credentials → API key')}
    ${row(secretSet, 'SHOPIFY_API_SECRET', secretSet ? '•••••••• (set, hidden)' : '', secretSet ? '' : 'Shopify Partners → aap ka app → Client credentials → API secret')}
    ${urlOk
      ? row(true, 'SHOPIFY_APP_URL', boot.urlValue, '')
      : `<div class="row bad"><div class="mark">✗</div><div class="info">
           <div class="label">SHOPIFY_APP_URL</div>
           <div class="value">${esc(boot.urlValue || '— not set —')}</div>
           <div class="note">${esc(boot.urlError || 'Railway → Settings → Networking → Generate Domain se public URL lein (port 3000)')}</div>
         </div></div>`}
    ${row(true, 'SCOPES', scopes, '')}
    ${dbRow}
    ${extraErrors.join('')}
  </div>

  <div class="card">
    <h2>Kaise fix karein (Railway)</h2>
    <ol>
      <li>Railway → apni service kholein → <b>Variables</b> tab</li>
      <li>Ye 3 variables add karein (values Shopify Partner Dashboard → Apps → apna app → <b>Configuration</b> → Client credentials se copy karein):</li>
    </ol>
    <div class="block">SHOPIFY_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SHOPIFY_API_SECRET=shpss_xxxxxxxxxxxxxxxxxxxxxxxx
SHOPIFY_APP_URL=https://YOUR-APP-NAME.up.railway.app</div>
    <ol start="3">
      <li><code>SHOPIFY_APP_URL</code> ke liye: Railway → <b>Settings</b> → <b>Networking</b> → Public Networking → <b>Generate Domain</b> (port <code>3000</code>) — jo domain mile usay variable mein daalein</li>
      <li>Data save karne ke liye: Railway → <b>+ New</b> → <b>Database</b> → <b>PostgreSQL</b> add karein, phir apni app service ke Variables mein: <code>DATABASE_URL</code> = Reference → <code>Postgres.DATABASE_URL</code></li>
      <li>Variables save hote hi Railway khud redeploy kar deta hai — thodi dair baad ye page refresh hokar LIVE ho jayega</li>
    </ol>
    <p class="hint">Iske baad Shopify Partner Dashboard → apna app → Configuration → URLs mein bhi yehi Railway domain set karein (App URL + redirect URI <code>https://YOUR-DOMAIN/api/auth/callback</code>).</p>
  </div>
</div>
</body>
</html>`;
}
