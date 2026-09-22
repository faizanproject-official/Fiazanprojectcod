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

// Initialize Shopify app
const shopifyAppInstance = await initializeApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecret: process.env.SHOPIFY_API_SECRET,
  apiVersion: '2024-04',
  scopes: process.env.SCOPES?.split(',') || [],
  host: process.env.SHOPIFY_APP_URL,
  isEmbeddedApp: true,
  sessionStorage: new SQLiteSessionStorage(),
});

app.use(shopifyAppInstance.middleware());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve the admin frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Shopify app listening on port ${PORT}`);
});

