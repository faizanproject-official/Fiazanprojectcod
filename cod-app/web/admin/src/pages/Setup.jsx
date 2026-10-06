import React, { useEffect, useState } from 'react';
import {
  Page, Card, Text, Banner, BlockStack, Box, Button, InlineStack, Spinner, List,
} from '@shopify/polaris';
import { api } from '../api.js';

function CopyRow({ label, value }) {
  const [copied, setCopied] = useState(false);
  return (
    <Box background="bg-surface-secondary" padding="300" borderRadius="200">
      <InlineStack distribute="space-between" blockAlign="center">
        <BlockStack gap="050">
          <Text variant="bodySm" tone="subdued">{label}</Text>
          <Text variant="bodyMd" fontWeight="semibold" breakWord>{value}</Text>
        </BlockStack>
        <Button
          size="slim"
          onClick={() => {
            navigator.clipboard?.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </InlineStack>
    </Box>
  );
}

export default function Setup() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [repairing, setRepairing] = useState(false);

  const load = async () => {
    try {
      setData(await api('/overview'));
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => { load(); }, []);

  const repair = async () => {
    setRepairing(true);
    try {
      await api('/repair-script-tag', { method: 'POST' });
      await load();
    } catch (e) {
      setError(e.message);
    }
    setRepairing(false);
  };

  if (!data) {
    return (
      <Page title="Setup & Status">
        {error ? <Banner tone="critical" title="Error">{error}</Banner> : <Spinner size="large" accessibilityLabel="Loading" />}
      </Page>
    );
  }

  const appUrl = data.appUrl;

  return (
    <Page title="Setup & Status" subtitle="Everything that keeps this app working properly inside Shopify">
      <BlockStack gap="400">
        {error && <Banner tone="critical" title="Error">{error}</Banner>}

        <Card>
          <Box padding="400">
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">1. Storefront COD widget (script tag)</Text>
              <Banner
                tone={data.scriptTagOk ? 'success' : 'warning'}
                title={data.scriptTagOk ? 'Widget is installed and active on your store' : 'Widget is NOT active'}
                action={data.scriptTagOk ? undefined : { content: 'Repair now', onAction: repair }}
              >
                {data.scriptTagOk
                  ? 'The 1-click COD form automatically appears on all product pages of your store.'
                  : 'Click "Repair now" to re-install the widget script on your storefront. This is safe and takes a second.'}
              </Banner>
              <CopyRow label="Widget script source" value={data.scriptTagSrc || `${appUrl}/storefront/cod-widget.js`} />
            </BlockStack>
          </Box>
        </Card>

        <Card>
          <Box padding="400">
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">2. App proxy (hides our domain — customers order via YOUR store domain)</Text>
              <Text as="p" tone="subdued">
                In Shopify Partners, open your app, then <strong>Configuration → App proxy</strong> and enter exactly these values.
                This makes the form submit through <strong>your-store.myshopify.com/apps/...</strong> so no external domain is ever visible.
              </Text>
              <CopyRow label="Subpath prefix" value="apps" />
              <CopyRow label="Subpath" value="cod" />
              <CopyRow label="Proxy URL" value={`${appUrl}/proxy`} />
              <Text as="p" tone="subdued">The form on product pages submits to <code>/apps/cod/order</code> on your store domain.</Text>
            </BlockStack>
          </Box>
        </Card>

        <Card>
          <Box padding="400">
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">3. Admin dashboard embedding</Text>
              <Banner tone="success" title="This app runs embedded inside Shopify admin">
                You are viewing it inside your Shopify admin right now. The app's own domain is never shown to you or your customers —
                exactly like other professional Shopify apps.
              </Banner>
            </BlockStack>
          </Box>
        </Card>

        <Card>
          <Box padding="400">
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">4. Where do COD orders appear?</Text>
              <List>
                <List.Item>Shopify admin → <strong>Orders</strong> — every COD form submission creates a real order with payment status <strong>"Pending"</strong> and tag <strong>COD</strong>.</List.Item>
                <List.Item>This app's <strong>COD Orders</strong> page — full log with fraud flags and blocked attempts.</List.Item>
                <List.Item>Call the customer to confirm, then fulfill the order normally. Collect cash on delivery and mark payment as received in Shopify.</List.Item>
              </List>
            </BlockStack>
          </Box>
        </Card>

        <Card>
          <Box padding="400">
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">Troubleshooting</Text>
              <List>
                <List.Item><strong>Form not visible on product page?</strong> Hard-refresh the page (Ctrl+Shift+R). The widget loads after page content. If still missing, click "Repair now" above.</List.Item>
                <List.Item><strong>Orders not created?</strong> Check that app proxy is configured (step 2) and the product variant is in stock.</List.Item>
                <List.Item><strong>Changed the Railway domain?</strong> Click "Repair now" — the widget script will be re-pointed to the new domain.</List.Item>
              </List>
            </BlockStack>
          </Box>
        </Card>
      </BlockStack>
    </Page>
  );
}
