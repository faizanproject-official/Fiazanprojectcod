// Admin API client — App Bridge (app-bridge.js) automatically attaches
// session tokens to same-origin fetch() calls.

export async function api(path, options = {}) {
  const opts = {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
  };
  if (options.body !== undefined) opts.body = JSON.stringify(options.body);

  const res = await fetch(`/api/admin${path}`, opts);

  if (res.status === 401 || res.status === 403) {
    // Preferred path: backend told us where to re-authorize.
    const reauthUrl = res.headers.get('X-Shopify-API-Request-Failure-Reauthorize-Url');
    if (reauthUrl) {
      exitIframe(reauthUrl);
      // Park forever — a top-level OAuth redirect is in progress.
      return new Promise(() => {});
    }
    // No reauthorize header: session simply missing (first run / storage reset).
    if (window.top !== window.self) {
      // We are inside the Shopify admin iframe — CANNOT set window.top.location
      // (cross-origin). Navigate this iframe to the exit-iframe page instead.
      exitIframe(`/api/auth${shopHostQuery()}`);
      return new Promise(() => {});
    }
    // Opened outside admin (plain browser tab) — plain navigation is fine.
    window.location.href = `/api/auth${shopHostQuery()}`;
    return new Promise(() => {});
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function shopHostQuery() {
  const params = new URLSearchParams(window.location.search);
  const qs = new URLSearchParams();
  if (params.get('shop')) qs.set('shop', params.get('shop'));
  if (params.get('host')) qs.set('host', params.get('host'));
  const s = qs.toString();
  return s ? `?${s}` : '';
}

// Navigate THIS iframe (allowed) to the exit-iframe page, which breaks out to
// top-level OAuth via window.open(uri, '_top') — the only iframe-permitted way.
// [v2.3] SIRF EK dafa navigate hota hai — multiple 401s se exitiframe bounce
// hone par 2 OAuth flows race karte the -> "Invalid OAuth callback".
function exitIframe(authPath) {
  if (window.__reauthStarted) return;
  window.__reauthStarted = true;
  const target = `${authPath}${authPath.includes('?') ? '&' : '?'}embedded=0`;
  window.location.href = `/exitiframe?redirectUri=${encodeURIComponent(target)}`;
}
