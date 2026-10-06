import { deleteShopData } from '../db.js';

// app/uninstalled — clean up our data for the shop
export async function handleAppUninstalled(topic, shop, body) {
  try {
    await deleteShopData(shop);
    console.log(`[webhooks] app/uninstalled cleaned data for ${shop}`);
  } catch (err) {
    console.error('[webhooks] app/uninstalled handler error:', err.message);
  }
}

// GDPR mandatory webhooks — respond 200, no personal data stored beyond order logs
export async function gdprCompliance(topic, shop, body) {
  console.log(`[webhooks] GDPR webhook received: ${topic} for ${shop}`);
}
