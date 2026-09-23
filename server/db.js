import pg from 'pg';

// ============================================================
// App data store. Uses PostgreSQL when DATABASE_URL is present
// (recommended on Railway). Falls back to in-memory storage for
// local testing (data resets on restart).
// ============================================================

let pool = null;
const memory = {
  settings: new Map(),      // shop -> {config, fraud}
  orders: [],               // array of order rows
  blocked: [],              // array of {id, shop, phone, created_at}
  pings: new Map(),         // shop|YYYY-MM-DD -> count
  nextId: 1,
};

export const isPostgres = () => !!process.env.DATABASE_URL;
let alive = false;
/** true only when DATABASE_URL is set AND initDb() succeeded */
export const isPostgresAlive = () => isPostgres() && alive;

export async function initDb() {
  alive = false;
  if (!isPostgres()) {
    console.warn('[db] DATABASE_URL not set — using IN-MEMORY storage. Data will reset on restart. Add a PostgreSQL service on Railway for production.');
    return;
  }
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false },
    max: 8,
  });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shop_settings (
      shop TEXT PRIMARY KEY,
      config JSONB NOT NULL DEFAULT '{}',
      fraud JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cod_orders (
      id BIGSERIAL PRIMARY KEY,
      shop TEXT NOT NULL,
      shopify_order_id BIGINT,
      product_title TEXT,
      variant_title TEXT,
      quantity INT DEFAULT 1,
      price NUMERIC(12,2) DEFAULT 0,
      customer_name TEXT,
      phone TEXT,
      address TEXT,
      city TEXT,
      status TEXT DEFAULT 'created',
      flag_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_cod_orders_shop_created ON cod_orders (shop, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cod_orders_shop_phone ON cod_orders (shop, phone);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS blocked_phones (
      id BIGSERIAL PRIMARY KEY,
      shop TEXT NOT NULL,
      phone TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (shop, phone)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS widget_pings (
      shop TEXT NOT NULL,
      day DATE NOT NULL,
      count INT NOT NULL DEFAULT 0,
      PRIMARY KEY (shop, day)
    );
  `);
  console.log('[db] PostgreSQL connected and schema ready');
  alive = true;
}

// ---------- Settings ----------
export async function ensureShop(shop) {
  if (!isPostgres()) {
    if (!memory.settings.has(shop)) memory.settings.set(shop, {});
    return;
  }
  await pool.query('INSERT INTO shop_settings (shop) VALUES ($1) ON CONFLICT (shop) DO NOTHING', [shop]);
}

export async function getSettings(shop) {
  if (!isPostgres()) return memory.settings.get(shop) || {};
  const r = await pool.query('SELECT config, fraud FROM shop_settings WHERE shop = $1', [shop]);
  return r.rows[0] || {};
}

export async function saveSettings(shop, config, fraud) {
  if (!isPostgres()) {
    memory.settings.set(shop, { config, fraud });
    return;
  }
  await pool.query(
    `INSERT INTO shop_settings (shop, config, fraud, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (shop) DO UPDATE SET config = $2, fraud = $3, updated_at = now()`,
    [shop, JSON.stringify(config), JSON.stringify(fraud)]
  );
}

export async function deleteShopData(shop) {
  if (!isPostgres()) {
    memory.settings.delete(shop);
    memory.orders = memory.orders.filter((o) => o.shop !== shop);
    memory.blocked = memory.blocked.filter((b) => b.shop !== shop);
    return;
  }
  await pool.query('DELETE FROM shop_settings WHERE shop = $1', [shop]);
  await pool.query('DELETE FROM blocked_phones WHERE shop = $1', [shop]);
}

// ---------- Orders ----------
export async function logOrder(order) {
  const row = {
    shop: order.shop,
    shopify_order_id: order.shopifyOrderId || null,
    product_title: order.productTitle || null,
    variant_title: order.variantTitle || null,
    quantity: order.quantity || 1,
    price: order.price || 0,
    customer_name: order.name || null,
    phone: order.phone || null,
    address: order.address || null,
    city: order.city || null,
    status: order.status || 'created',
    flag_reason: order.flagReason || null,
    created_at: new Date(),
    id: 0,
  };
  if (!isPostgres()) {
    row.id = memory.nextId++;
    memory.orders.unshift(row);
    return row;
  }
  const r = await pool.query(
    `INSERT INTO cod_orders (shop, shopify_order_id, product_title, variant_title, quantity, price, customer_name, phone, address, city, status, flag_reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [row.shop, row.shopify_order_id, row.product_title, row.variant_title, row.quantity, row.price, row.customer_name, row.phone, row.address, row.city, row.status, row.flag_reason]
  );
  return r.rows[0];
}

export async function updateOrderStatus(id, status, flagReason, shopifyOrderId) {
  if (!isPostgres()) {
    const row = memory.orders.find((o) => o.id === Number(id));
    if (row) {
      row.status = status;
      if (flagReason) row.flag_reason = flagReason;
      if (shopifyOrderId) row.shopify_order_id = shopifyOrderId;
    }
    return;
  }
  await pool.query(
    `UPDATE cod_orders SET status = $2,
       flag_reason = COALESCE($3, flag_reason),
       shopify_order_id = COALESCE($4, shopify_order_id)
     WHERE id = $1`,
    [id, status, flagReason || null, shopifyOrderId || null]
  );
}

export async function listOrders(shop, { search = '', limit = 50, offset = 0 } = {}) {
  if (!isPostgres()) {
    let rows = memory.orders.filter((o) => o.shop === shop);
    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter((o) =>
        [o.phone, o.customer_name, o.product_title, o.city].some((v) => v && String(v).toLowerCase().includes(s))
      );
    }
    return { rows: rows.slice(offset, offset + limit), total: rows.length };
  }
  const like = `%${search}%`;
  const where = search
    ? 'shop = $1 AND (phone ILIKE $2 OR customer_name ILIKE $2 OR product_title ILIKE $2 OR city ILIKE $2)'
    : 'shop = $1';
  const params = search ? [shop, like] : [shop];
  const total = await pool.query(`SELECT COUNT(*) c FROM cod_orders WHERE ${where}`, params);
  const rows = await pool.query(
    `SELECT * FROM cod_orders WHERE ${where} ORDER BY created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
    params
  );
  return { rows: rows.rows, total: Number(total.rows[0].c) };
}

export async function getStats(shop) {
  const empty = {
    today: 0, d7: 0, d30: 0, revenue30: 0, flagged7: 0, blocked7: 0,
    visits30: 0, conversion30: 0, topProducts: [], recent: [],
  };
  if (!isPostgres()) {
    const now = Date.now();
    const day = 86400000;
    const ok = memory.orders.filter((o) => o.shop === shop && o.status !== 'blocked');
    const since = (d) => ok.filter((o) => now - new Date(o.created_at).getTime() <= d);
    const all30 = since(30 * day);
    const flagged7 = memory.orders.filter((o) => o.shop === shop && o.status === 'flagged' && now - new Date(o.created_at).getTime() <= 7 * day).length;
    const blocked7 = memory.orders.filter((o) => o.shop === shop && o.status === 'blocked' && now - new Date(o.created_at).getTime() <= 7 * day).length;
    const visits30 = [...memory.pings.entries()].reduce((acc, [k, c]) => (k.startsWith(shop + '|') ? acc + c : acc), 0);
    const byProduct = {};
    for (const o of all30) {
      byProduct[o.product_title] = (byProduct[o.product_title] || 0) + (o.quantity || 1);
    }
    const topProducts = Object.entries(byProduct).map(([t, q]) => ({ product_title: t, qty: q })).sort((a, b) => b.qty - a.qty).slice(0, 5);
    return {
      ...empty,
      today: since(day).length,
      d7: since(7 * day).length,
      d30: all30.length,
      revenue30: all30.reduce((s, o) => s + Number(o.price || 0) * (o.quantity || 1), 0),
      flagged7, blocked7, visits30,
      conversion30: visits30 ? Math.round((all30.length / visits30) * 1000) / 10 : 0,
      topProducts,
      recent: ok.slice(0, 6),
    };
  }
  const one = async (sql, params = [shop]) => (await pool.query(sql, params)).rows;
  const [today, d7, d30, flagged, blocked, visits, top, recent] = await Promise.all([
    one(`SELECT COUNT(*) c FROM cod_orders WHERE shop=$1 AND status<>'blocked' AND created_at > now() - interval '1 day'`),
    one(`SELECT COUNT(*) c FROM cod_orders WHERE shop=$1 AND status<>'blocked' AND created_at > now() - interval '7 days'`),
    one(`SELECT COUNT(*) c, COALESCE(SUM(price*quantity),0) rev FROM cod_orders WHERE shop=$1 AND status<>'blocked' AND created_at > now() - interval '30 days'`),
    one(`SELECT COUNT(*) c FROM cod_orders WHERE shop=$1 AND status='flagged' AND created_at > now() - interval '7 days'`),
    one(`SELECT COUNT(*) c FROM cod_orders WHERE shop=$1 AND status='blocked' AND created_at > now() - interval '7 days'`),
    one(`SELECT COALESCE(SUM(count),0) c FROM widget_pings WHERE shop=$1 AND day > CURRENT_DATE - 30`),
    one(`SELECT product_title, SUM(quantity) qty FROM cod_orders WHERE shop=$1 AND status<>'blocked' AND created_at > now() - interval '30 days' AND product_title IS NOT NULL GROUP BY product_title ORDER BY qty DESC LIMIT 5`),
    one(`SELECT * FROM cod_orders WHERE shop=$1 AND status<>'blocked' ORDER BY created_at DESC LIMIT 6`),
  ]);
  const visits30 = Number(visits[0].c);
  const d30c = Number(d30[0].c);
  return {
    today: Number(today[0].c),
    d7: Number(d7[0].c),
    d30: d30c,
    revenue30: Number(d30[0].rev),
    flagged7: Number(flagged[0].c),
    blocked7: Number(blocked[0].c),
    visits30,
    conversion30: visits30 ? Math.round((d30c / visits30) * 1000) / 10 : 0,
    topProducts: top.map((t) => ({ product_title: t.product_title, qty: Number(t.qty) })),
    recent: recent,
  };
}

// ---------- Fraud helpers ----------
export async function countRecentByPhone(shop, phone, hours) {
  if (!isPostgres()) {
    const cutoff = Date.now() - hours * 3600000;
    return memory.orders.filter((o) => o.shop === shop && o.phone === phone && o.status !== 'blocked' && new Date(o.created_at).getTime() >= cutoff).length;
  }
  const r = await pool.query(
    `SELECT COUNT(*) c FROM cod_orders WHERE shop=$1 AND phone=$2 AND status<>'blocked' AND created_at > now() - ($3 || ' hours')::interval`,
    [shop, phone, String(hours)]
  );
  return Number(r.rows[0].c);
}

export async function countTodayByPhone(shop, phone) {
  if (!isPostgres()) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return memory.orders.filter((o) => o.shop === shop && o.phone === phone && o.status !== 'blocked' && new Date(o.created_at) >= start).length;
  }
  const r = await pool.query(
    `SELECT COUNT(*) c FROM cod_orders WHERE shop=$1 AND phone=$2 AND status<>'blocked' AND created_at >= CURRENT_DATE`,
    [shop, phone]
  );
  return Number(r.rows[0].c);
}

// ---------- Blocked phones ----------
export async function isPhoneBlocked(shop, phone) {
  if (!isPostgres()) return memory.blocked.some((b) => b.shop === shop && b.phone === phone);
  const r = await pool.query('SELECT 1 FROM blocked_phones WHERE shop=$1 AND phone=$2 LIMIT 1', [shop, phone]);
  return r.rowCount > 0;
}

export async function listBlockedPhones(shop) {
  if (!isPostgres()) return memory.blocked.filter((b) => b.shop === shop).sort((a, b) => b.id - a.id);
  const r = await pool.query('SELECT * FROM blocked_phones WHERE shop=$1 ORDER BY created_at DESC LIMIT 500', [shop]);
  return r.rows;
}

export async function addBlockedPhone(shop, phone) {
  if (!isPostgres()) {
    if (!memory.blocked.some((b) => b.shop === shop && b.phone === phone)) {
      memory.blocked.push({ id: memory.nextId++, shop, phone, created_at: new Date() });
    }
    return;
  }
  await pool.query('INSERT INTO blocked_phones (shop, phone) VALUES ($1,$2) ON CONFLICT (shop, phone) DO NOTHING', [shop, phone]);
}

export async function removeBlockedPhone(shop, id) {
  if (!isPostgres()) {
    memory.blocked = memory.blocked.filter((b) => !(b.shop === shop && b.id === Number(id)));
    return;
  }
  await pool.query('DELETE FROM blocked_phones WHERE shop=$1 AND id=$2', [shop, id]);
}

// ---------- Widget pings (approx. storefront visits) ----------
export async function pingWidget(shop) {
  const day = new Date().toISOString().slice(0, 10);
  if (!isPostgres()) {
    const key = shop + '|' + day;
    memory.pings.set(key, (memory.pings.get(key) || 0) + 1);
    return;
  }
  await pool.query(
    `INSERT INTO widget_pings (shop, day, count) VALUES ($1,$2,1)
     ON CONFLICT (shop, day) DO UPDATE SET count = widget_pings.count + 1`,
    [shop, day]
  );
}

export async function closeDb() {
  if (pool) await pool.end();
}
