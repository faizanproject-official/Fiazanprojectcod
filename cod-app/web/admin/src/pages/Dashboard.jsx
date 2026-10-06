import React, { useEffect, useState } from 'react';
import {
  Page, Layout, Card, Text, Grid, BlockStack, InlineStack, Badge, DataTable,
  Banner, Button, Spinner, Box,
} from '@shopify/polaris';
import { api } from '../api.js';

function StatCard({ label, value, tone }) {
  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="200">
          <Text variant="bodySm" tone="subdued">{label}</Text>
          <Text variant="headingLg" as="h4" tone={tone}>{value}</Text>
        </BlockStack>
      </Box>
    </Card>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [repairing, setRepairing] = useState(false);

  const load = async () => {
    try {
      setData(await api('/overview'));
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => { load(); }, []);

  const repairScriptTag = async () => {
    setRepairing(true);
    try {
      await api('/repair-script-tag', { method: 'POST' });
      await load();
    } catch (e) {
      setError(e.message);
    }
    setRepairing(false);
  };

  if (error && !data) {
    return (
      <Page title="Dashboard">
        <Banner title="Could not load data" tone="critical">{error}</Banner>
      </Page>
    );
  }
  if (!data) {
    return (
      <Page title="Dashboard">
        <BlockStack align="center" inlineAlign="center" gap="400">
          <Box padding="800"><Spinner accessibilityLabel="Loading" size="large" /></Box>
        </BlockStack>
      </Page>
    );
  }

  const s = data.stats;
  const money = (n) => `PKR ${Number(n || 0).toLocaleString()}`;

  const rows = (s.recent || []).map((o) => [
    new Date(o.created_at).toLocaleString(),
    o.customer_name || '-',
    o.phone || '-',
    String(o.product_title || '-').slice(0, 32),
    String(o.quantity ?? '-'),
    money(Number(o.price || 0) * (o.quantity || 1)),
    o.status === 'flagged' ? <Badge tone="warning">Flagged</Badge>
      : o.status === 'blocked' ? <Badge tone="critical">Blocked</Badge>
      : <Badge tone="success">Order created</Badge>,
  ]);

  return (
    <Page
      title="Dashboard"
      subtitle={`Cash on Delivery orders for ${data.shop}`}
      primaryAction={<Button variant="primary" loading={repairing} onClick={repairScriptTag}>Repair storefront widget</Button>}
    >
      <BlockStack gap="400">
        {!data.scriptTagOk && (
          <Banner
            title="Storefront widget is not active"
            tone="warning"
            action={{ content: 'Repair now', onAction: repairScriptTag }}
          >
            The COD form widget script is missing on your storefront. Click "Repair now" to reinstall it. If it keeps failing, open Setup &amp; Status and follow the checklist.
          </Banner>
        )}
        {error && <Banner title="Warning" tone="warning">{error}</Banner>}

        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <StatCard label="Orders today" value={s.today} />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <StatCard label="Orders last 7 days" value={s.d7} />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <StatCard label="Orders last 30 days" value={s.d30} />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <StatCard label="Estimated revenue (30d)" value={money(s.revenue30)} tone="success" />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <StatCard label="Flagged orders (7d)" value={s.flagged7} tone={s.flagged7 > 0 ? 'warning' : undefined} />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <StatCard label="Blocked attempts (7d)" value={s.blocked7} tone={s.blocked7 > 0 ? 'critical' : undefined} />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <StatCard label="Form views (30d)" value={s.visits30} />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <StatCard label="Conversion (30d)" value={`${s.conversion30}%`} />
          </Grid.Cell>
        </Grid>

        {s.topProducts?.length > 0 && (
          <Card>
            <Box padding="400">
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">Top products (30 days)</Text>
                <InlineStack gap="300" wrap>
                  {s.topProducts.map((p) => (
                    <Badge key={p.product_title} size="large">{String(p.product_title).slice(0, 40)} — {p.qty} pcs</Badge>
                  ))}
                </InlineStack>
              </BlockStack>
            </Box>
          </Card>
        )}

        <Card>
          <Box padding="400">
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">Recent COD orders</Text>
              {rows.length === 0 ? (
                <Text tone="subdued">No COD orders yet. Make sure the storefront widget is active, then open any product page on your store — the 1-click COD form will appear there.</Text>
              ) : (
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text']}
                  headings={['Date', 'Customer', 'Phone', 'Product', 'Qty', 'Value', 'Status']}
                  rows={rows}
                />
              )}
            </BlockStack>
          </Box>
        </Card>

        <Card>
          <Box padding="400">
            <BlockStack gap="200">
              <Text variant="headingMd" as="h3">How it works</Text>
              <Text as="p" tone="subdued">
                The COD form appears automatically on your product pages (installed as a script tag).
                Customers fill name, phone and address — a real order is created in your Shopify admin
                with payment status "Pending" and the tag {`"${''}`}COD{`"${''}`}, exactly like a ReleaseIT style COD order.
                You never see our domain, and your customers never see it either: form requests travel through your own store domain (app proxy).
              </Text>
            </BlockStack>
          </Box>
        </Card>
      </BlockStack>
    </Page>
  );
}
