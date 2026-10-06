import { Router } from 'express';
import crypto from 'crypto';
import getShopify from '../shopify.js';
import {
  getSettings, pingWidget, logOrder, updateOrderStatus,
  isPhoneBlocked, countRecentByPhone, countTodayByPhone,
} from '../db.js';
import { normalizeConfig, normalizeFraud } from '../defaults.js';

const router = Router();

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function hmacHex(base, secret) {
  return crypto.createHmac('sha256', secret).update(base, 'utf8').digest('hex');
}

// Verify Shopify App Proxy request signature (GET and POST variants)
function verifyProxySignature(req) {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) return false;
  const signature = req.query.signature;
  if (!signature) return false;

  const params = { ...req.query };
  delete params.signature;

  // Reject stale requests (> 10 min)
  const ts = Number(params.timestamp || 0);
  if (!ts || Math.abs(Date.now() / 1000 - ts) > 600) return false;

  const flat = Object.keys(params)
    .sort()
    .map((k) => `${k}=${Array.isArray(params[k]) ? params[k].join(',') : params[k]}`);
  const bases = [
    flat.join(''),           // no delimiter (documented style)
    flat.join('&'),          // ampersand delimiter (defensive)
  ];
  if (req.method === 'POST' && req.rawBody) {
    for (const b of [...bases]) {
      bases.push(b + `body=${req.rawBody}`);
      bases.push(b + `&body=${req.rawBody}`);
    }
  }
  for (const base of bases) {
    try {
      if (safeEqual(hmacHex(base, secret), signature)) return true;
    } catch { /* continue */ }
  }
  return false;
}

function orderTokenFor(shop) {
  return hmacHex(`codr:${shop}`, process.env.SHOPIFY_API_SECRET);
}

function normalizePhone(raw) {
  return String(raw || '').replace(/[^\d+]/g, '');
}

function isValidPkPhone(digits) {
  const d = digits.replace(/\D/g, '');
  return /^0?3\d{9}$/.test(d) || /^923\d{9}$/.test(d);
}

async function loadOfflineSession(shop) {
  const shopify = getShopify();
  return shopify.config.sessionStorage.loadSession(shop);
}

async function createCodDraftOrder(session, { payload, config, productInfo }) {
  const shopify = getShopify();
  const client = new shopify.api.clients.Rest({ session });
  const nameParts = String(payload.name || '').trim().split(/\s+/);
  const firstName = nameParts.shift() || 'COD';
  const lastName = nameParts.join(' ') || 'Customer';

  const draftOrder = {
    line_items: [
      {
        variant_id: Number(payload.variantId),
        quantity: Number(payload.quantity) || 1,
        requires_shipping: true,
      },
    ],
    shipping_address: {
      first_name: firstName,
      last_name: lastName,
      phone: payload.phone,
      address1: payload.address || '',
      city: payload.city || '',
      country: config.country || 'Pakistan',
    },
    note: `COD order via COD Realistic form. Phone: ${payload.phone}${payload.notes ? ' | Notes: ' + payload.notes : ''}`,
    note_attributes: [
      { name: 'Payment Method', value: 'Cash on Delivery' },
      { name: 'Form', value: 'COD Realistic 1-Click' },
    ],
    tags: [config.orderTag || 'COD', 'cod-realistic'].filter(Boolean).join(', '),
    source_name: 'COD Realistic',
  };

  const resp = await client.post({ path: 'draft_orders', data: { draft_order: draftOrder } });
  const draft = resp.body.draft_order;

  // Complete the draft order so it becomes a real order marked as payment pending (COD)
  let orderId = null;
  try {
    const done = await client.post({
      path: `draft_orders/${draft.id}/complete`,
      query: { payment_pending: true },
    });
    orderId = done.body?.draft_order?.order_id || null;
  } catch (err) {
    console.error('[proxy] draft complete failed (kept as draft):', err.message);
  }
  return { draftId: draft.id, orderId, totalPrice: draft.total_price };
}

// ------------------------------------------------------------
// GET /proxy/config  -> widget settings (also counts a visit ping)
// ------------------------------------------------------------
router.get('/config', async (req, res) => {
  const shop = String(req.query.shop || '');
  if (!shop || !shop.includes('.myshopify.com')) {
    return res.status(400).json({ error: 'Invalid shop' });
  }
  try {
    const settings = await getSettings(shop);
    const config = normalizeConfig(settings.config);
    const fraud = normalizeFraud(settings.fraud);
    await pingWidget(shop);
    res.json({
      ok: true,
      config,
      validatePkPhone: fraud.validatePkPhone,
      orderToken: orderTokenFor(shop),
      proxyOk: verifyProxySignature(req),
    });
  } catch (err) {
    console.error('[proxy] config error:', err.message);
    res.status(500).json({ error: 'Failed to load config' });
  }
});

// ------------------------------------------------------------
// POST /proxy/order  -> fraud checks + create Shopify order
// ------------------------------------------------------------
router.post('/order', async (req, res) => {
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const shop = String(body.shop || req.query.shop || '');
  if (!shop || !shop.includes('.myshopify.com')) {
    return res.status(400).json({ ok: false, error: 'Invalid shop' });
  }

  // Auth: either a valid Shopify proxy signature or our HMAC order token
  const signatureOk = verifyProxySignature(req);
  const tokenOk = body.orderToken && safeEqual(body.orderToken, orderTokenFor(shop));
  if (!signatureOk && !tokenOk) {
    return res.status(403).json({ ok: false, error: 'Unauthorized request' });
  }

  try {
    const settings = await getSettings(shop);
    const config = normalizeConfig(settings.config);
    const fraud = normalizeFraud(settings.fraud);

    const phone = normalizePhone(body.phone);
    const name = String(body.name || '').trim();
    const address = String(body.address || '').trim();
    const city = String(body.city || '').trim();
    const notes = String(body.notes || '').trim();
    const quantity = Math.min(Math.max(Number(body.quantity) || 1, 1), Number(config.maxQuantity) || 5);
    const variantId = Number(String(body.variantId || '').replace(/\D/g, ''));

    // --- Validation ---
    const fields = config.fields || {};
    if (fields.name?.enabled !== false && name.length < 3) {
      return res.status(400).json({ ok: false, error: 'Please enter your full name.' });
    }
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      return res.status(400).json({ ok: false, error: 'Please enter a valid phone number.' });
    }
    if (fraud.validatePkPhone && !isValidPkPhone(phone)) {
      return res.status(400).json({ ok: false, error: 'Please enter a valid Pakistani mobile number (e.g. 03001234567).' });
    }
    if (fields.address?.enabled !== false && address.length < 8) {
      return res.status(400).json({ ok: false, error: 'Please enter your complete address.' });
    }
    if (fields.city?.enabled && fields.city.required && !city) {
      return res.status(400).json({ ok: false, error: 'Please enter your city.' });
    }
    if (!variantId) {
      return res.status(400).json({ ok: false, error: 'Please select a product variant.' });
    }

    const session = await loadOfflineSession(shop);
    if (!session) {
      return res.status(401).json({ ok: false, error: 'App not installed for this shop. Please reinstall the app.' });
    }

    // --- Fraud checks ---
    const baseRow = {
      shop, productTitle: body.productTitle || null, variantTitle: body.variantTitle || null,
      quantity, price: Number(body.price) || 0, name, phone, address, city,
    };

    if (fraud.enabled) {
      if (await isPhoneBlocked(shop, phone)) {
        await logOrder({ ...baseRow, status: 'blocked', flagReason: 'Phone is on block list' });
        return res.status(403).json({ ok: false, error: 'We cannot accept your order. Please contact support.' });
      }
      const windowH = Number(fraud.duplicateWindowHours) || 0;
      if (windowH > 0) {
        const recent = await countRecentByPhone(shop, phone, windowH);
        if (recent > 0) {
          const reason = `Duplicate: ${recent} order(s) with same phone in last ${windowH}h`;
          if (fraud.duplicateAction === 'block') {
            await logOrder({ ...baseRow, status: 'blocked', flagReason: reason });
            return res.status(403).json({ ok: false, error: 'You already have a recent order. Our team will contact you.' });
          }
          // flag: create order but mark it
          const order = await createCodDraftOrder(session, { payload: { ...body, phone, quantity }, config, productInfo: baseRow });
          const row = await logOrder({ ...baseRow, status: 'flagged', flagReason: reason });
          await updateOrderStatus(row.id, 'flagged', reason, order.orderId);
          return res.json({ ok: true, message: config.successMessage, orderId: order.orderId });
        }
      }
      const maxDay = Number(fraud.maxPerDayPerPhone) || 0;
      if (maxDay > 0 && (await countTodayByPhone(shop, phone)) >= maxDay) {
        const reason = `Rate limit: >= ${maxDay} orders today for this phone`;
        if (fraud.maxPerDayAction === 'block') {
          await logOrder({ ...baseRow, status: 'blocked', flagReason: reason });
          return res.status(403).json({ ok: false, error: 'Daily order limit reached for this number.' });
        }
        const order = await createCodDraftOrder(session, { payload: { ...body, phone, quantity }, config, productInfo: baseRow });
        const row = await logOrder({ ...baseRow, status: 'flagged', flagReason: reason });
        await updateOrderStatus(row.id, 'flagged', reason, order.orderId);
        return res.json({ ok: true, message: config.successMessage, orderId: order.orderId });
      }
    }

    // --- Clean order ---
    let order;
    try {
      order = await createCodDraftOrder(session, { payload: { ...body, phone, quantity }, config, productInfo: baseRow });
    } catch (err) {
      const msg = err?.response?.body?.errors || err.message;
      console.error('[proxy] draft order failed:', JSON.stringify(msg));
      if (String(JSON.stringify(msg)).toLowerCase().includes('inventory')) {
        return res.status(409).json({ ok: false, error: 'Sorry, this product is out of stock right now.' });
      }
      return res.status(500).json({ ok: false, error: 'Could not place your order. Please try again.' });
    }
    const row = await logOrder({ ...baseRow, status: 'created' });
    await updateOrderStatus(row.id, 'created', null, order.orderId);

    res.json({ ok: true, message: config.successMessage, orderId: order.orderId });
  } catch (err) {
    console.error('[proxy] order error:', err.message);
    res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
});

export default router;
