import 'dotenv/config.js';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import shopifyApp from '@shopify/shopify-app-express';
import { shopifyApp as initializeApp } from '@shopify/shopify-app-express';
import { SQLiteSessionStorage } from '@shopify/shopify-app-session-storage-sqlite';

const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Parse JSON
app.use(express.json());

// Serve static files (built frontend)
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint (always available)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Initialize Shopify app with validation
let shopifyAppInstance = null;
let shopifyInitError = null;

const initializeShopifyApp = async () => {
  try {
    const requiredVars = {
      SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY,
      SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET,
      SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL,
    };

    const missingVars = Object.entries(requiredVars)
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missingVars.length > 0) {
      shopifyInitError = `Missing required environment variables: ${missingVars.join(', ')}`;
      console.warn(`⚠️  Shopify initialization skipped: ${shopifyInitError}`);
      return null;
    }

    shopifyAppInstance = await initializeApp({
      apiKey: process.env.SHOPIFY_API_KEY,
      apiSecret: process.env.SHOPIFY_API_SECRET,
      apiVersion: '2024-04',
      scopes: process.env.SCOPES?.split(',') || [],
      host: process.env.SHOPIFY_APP_URL,
      isEmbeddedApp: true,
      sessionStorage: new SQLiteSessionStorage(),
    });

    console.log('✓ Shopify app initialized successfully');
    return shopifyAppInstance;
  } catch (error) {
    shopifyInitError = error.message;
    console.error(`⚠️  Failed to initialize Shopify app: ${error.message}`);
    return null;
  }
};

// Initialize Shopify app
await initializeShopifyApp();

// Apply Shopify middleware if initialized
if (shopifyAppInstance) {
  app.use(shopifyAppInstance.middleware());
} else {
  console.log('⚠️  Running in degraded mode without Shopify integration');
  // Add a warning endpoint to indicate missing config
  app.get('/api/status', (req, res) => {
    res.status(503).json({
      status: 'degraded',
      message: 'Shopify integration not configured',
      missingConfig: shopifyInitError,
    });
  });
}

// Serve the admin frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 App listening on port ${PORT}`);
  if (shopifyInitError) {
    console.log(`⚠️  Shopify configuration missing. Set SHOPIFY_API_KEY, SHOPIFY_API_SECRET, and SHOPIFY_APP_URL to enable Shopify features.`);
  }
});

