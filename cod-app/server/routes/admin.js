import { Router } from 'express';
import getShopify, { getAppConfig } from '../shopify.js';
import {
  getSettings, saveSettings, getStats, listOrders,
  listBlockedPhones, addBlockedPhone, removeBlockedPhone, ensureShop,
} from '../db.js';
import { normalizeConfig, normalizeFraud } from '../defaults.js';

const router = Router();

function shopFromResLocals(req, res) {
  const session = res.locals?.shopify?.session;
  if (!session?.shop) throw new Error('No shop session');
  return session.shop;
}

// Dashboard data
router.get('/overview', async (req, res) => {
  try {
    const shop = shopFromResLocals(req, res);
    const settings = await getSettings(shop);
    const stats = await getStats(shop);
    let scriptTagOk = false;
    let scriptTagSrc = null;
    try {
      const shopify = getShopify();
      const { url } = getAppConfig();
      const client = new shopify.api.clients.Rest({ session: res.locals.shopify.session });
      const st = await client.get({ path: 'script_tags' });
      scriptTagSrc = `${url.origin}/storefront/cod-widget.js`;
      scriptTagOk = st.body.script_tags.some((t) => t.src.startsWith(url.origin) && t.src.includes('cod-widget'));
    } catch (err) {
      console.error('[admin] script tag check failed:', err.message);
    }
    res.json({
      ok: true,
      shop,
      stats,
      scriptTagOk,
      scriptTagSrc,
      appUrl: getAppConfig().url.origin,
      hasSettings: !!(settings.config && Object.keys(settings.config).length),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Settings (form designer + fraud)
router.get('/settings', async (req, res) => {
  try {
    const shop = shopFromResLocals(req, res);
    const settings = await getSettings(shop);
    res.json({ ok: true, config: normalizeConfig(settings.config), fraud: normalizeFraud(settings.fraud) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const shop = shopFromResLocals(req, res);
    await ensureShop(shop);
    const existing = await getSettings(shop);
    const config = normalizeConfig(req.body?.config ?? existing.config);
    const fraud = normalizeFraud(req.body?.fraud ?? existing.fraud);
    await saveSettings(shop, config, fraud);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Orders log
router.get('/orders', async (req, res) => {
  try {
    const shop = shopFromResLocals(req, res);
    const search = String(req.query.search || '');
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = 50;
    const { rows, total } = await listOrders(shop, { search, limit, offset: (page - 1) * limit });
    res.json({ ok: true, orders: rows, total, page, limit });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Blocked phones
router.get('/blocked', async (req, res) => {
  try {
    const shop = shopFromResLocals(req, res);
    res.json({ ok: true, blocked: await listBlockedPhones(shop) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/blocked', async (req, res) => {
  try {
    const shop = shopFromResLocals(req, res);
    const phone = String(req.body?.phone || '').trim();
    if (!phone) return res.status(400).json({ ok: false, error: 'Phone required' });
    await addBlockedPhone(shop, phone);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/blocked/:id', async (req, res) => {
  try {
    const shop = shopFromResLocals(req, res);
    await removeBlockedPhone(shop, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Repair: re-create the storefront script tag if it is missing
router.post('/repair-script-tag', async (req, res) => {
  try {
    const shop = shopFromResLocals(req, res);
    const shopify = getShopify();
    const { url } = getAppConfig();
    const client = new shopify.api.clients.Rest({ session: res.locals.shopify.session });
    const src = `${url.origin}/storefront/cod-widget.js`;
    const existing = await client.get({ path: 'script_tags' });
    const has = existing.body.script_tags.some((t) => t.src === src);
    if (!has) {
      await client.post({
        path: 'script_tags',
        data: { script_tag: { event: 'onload', src, displayScope: 'online_store' } },
      });
    }
    res.json({ ok: true, created: !has, src });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
