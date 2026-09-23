import 'dotenv/config';
import { shopifyApp } from '@shopify/shopify-app-express';
import { DeliveryMethod } from '@shopify/shopify-api';
import { PostgreSQLSessionStorage } from '@shopify/shopify-app-session-storage-postgresql';
import { MemorySessionStorage } from '@shopify/shopify-app-session-storage-memory';
import { handleAppUninstalled, gdprCompliance } from './routes/webhooks.js';
import { isPostgresAlive } from './db.js';

const httpHook = (callback) => ({
  deliveryMethod: DeliveryMethod.Http,
  callbackUrl: '/api/webhooks',
  callback,
});

export function getAppConfig() {
  const rawUrl = (process.env.SHOPIFY_APP_URL || process.env.APP_URL || '').trim();
  if (!rawUrl) throw new Error('SHOPIFY_APP_URL is not set (e.g. https://your-app.up.railway.app)');
  const url = new URL(rawUrl);
  return {
    url,
    hostName: url.host,
    hostScheme: url.protocol === 'http:' ? 'http' : 'https',
  };
}

export function buildSessionStorage() {
  // Only use PostgreSQL when the DB was actually verified reachable at boot
  // (db.js initDb sets this flag). Otherwise fall back to memory so the app
  // NEVER crashes in a loop just because the database is down/misconfigured.
  if (process.env.DATABASE_URL && isPostgresAlive()) {
    return new PostgreSQLSessionStorage(process.env.DATABASE_URL);
  }
  if (process.env.DATABASE_URL) {
    console.error('[shopify] DATABASE_URL set hai lekin reachable NAHI — sessions abhi memory mein honge (restart par reset). DB theek hone ke baad redeploy karein.');
  }
  return new MemorySessionStorage();
}

function createShopify() {
  const { hostName, hostScheme } = getAppConfig();
  // [v2.1] Trim hardening — copy-paste mein extra space/newline aa jaye to bhi sahi chale
  const apiKey = String(process.env.SHOPIFY_API_KEY || '').trim();
  const apiSecretKey = String(process.env.SHOPIFY_API_SECRET || '').trim();
  if (apiKey !== process.env.SHOPIFY_API_KEY || apiSecretKey !== process.env.SHOPIFY_API_SECRET) {
    console.log('[shopify] NOTE: API key/secret mein extra whitespace thi — trim kar di gayi');
  }
  return shopifyApp({
    api: {
      apiKey,
      apiSecretKey,
      scopes: process.env.SCOPES || 'write_draft_orders,read_draft_orders,read_orders,read_products,write_script_tags,read_script_tags',
      hostName,
      hostScheme,
      apiVersion: '2024-10',
      isEmbeddedApp: true,
    },
    auth: {
      path: '/api/auth',
      callbackPath: '/api/auth/callback',
    },
    webhooks: {
      path: '/api/webhooks',
      webhooks: {
        'app/uninstalled': httpHook(handleAppUninstalled),
        'customers/data_request': httpHook(gdprCompliance),
        'customers/redact': httpHook(gdprCompliance),
        'shop/redact': httpHook(gdprCompliance),
      },
    },
    sessionStorage: buildSessionStorage(),
    useOnlineTokens: false,
    isEmbeddedApp: true,
  });
}

let _instance = null;

/** Lazy singleton — returns the configured shopify app instance */
export default function getShopify() {
  if (!_instance) _instance = createShopify();
  return _instance;
}
