import React, { useEffect, useState, useCallback } from 'react';
import {
  Page, Card, Text, DataTable, Badge, TextField, Button, Banner,
  BlockStack, InlineStack, Box, Pagination, Spinner,
} from '@shopify/polaris';
import { api } from '../api.js';

export default function Orders() {
  const [data, setData] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [shop, setShop] = useState('');

  const load = useCallback(async (q, p) => {
    setLoading(true);
    try {
      const d = await api(`/orders?search=${encodeURIComponent(q)}&page=${p}`);
      setData(d);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setShop(params.get('shop') || '');
    load('', 1);
  }, [load]);

  const money = (n) => `PKR ${Number(n || 0).toLocaleString()}`;

  const rows = (data?.orders || []).map((o) => {
    const statusBadge = o.status === 'flagged' ? <Badge tone="warning">Flagged</Badge>
      : o.status === 'blocked' ? <Badge tone="critical">Blocked</Badge>
      : <Badge tone="success">Order created</Badge>;
    return [
      new Date(o.created_at).toLocaleString(),
      o.customer_name || '-',
      o.phone || '-',
      [o.address, o.city].filter(Boolean).join(', ').slice(0, 42) || '-',
      String(o.product_title || '-').slice(0, 30),
      String(o.quantity ?? '-'),
      money(Number(o.price || 0) * (o.quantity || 1)),
      statusBadge,
      o.shopify_order_id ? (
        <a href={`https://${o.shop}/admin/orders/${o.shopify_order_id}`} target="_blank" rel="noreferrer">Open</a>
      ) : (
        <Text variant="bodySm" tone="subdued">—</Text>
      ),
    ];
  });

  const totalPages = data ? Math.max(Math.ceil(data.total / data.limit), 1) : 1;

  return (
    <Page
      title="COD Orders"
      subtitle="Every order (and blocked attempt) placed through your COD form"
      primaryAction={<Button onClick={() => load(search, page)}>Refresh</Button>}
    >
      <BlockStack gap="400">
        {error && <Banner tone="critical" title="Error">{error}</Banner>}

        <Card>
          <Box padding="400">
            <InlineStack gap="300" blockAlign="center">
              <div style={{ flex: 1, maxWidth: 420 }}>
                <TextField
                  label="" labelHidden placeholder="Search by phone, name, product or city"
                  value={search} onChange={setSearch} autoComplete="off"
                  onClearButtonClick={() => { setSearch(''); load('', 1); }}
                />
              </div>
              <Button variant="primary" onClick={() => { setPage(1); load(search, 1); }}>Search</Button>
              {loading && <Spinner accessibilityLabel="Loading" size="small" />}
            </InlineStack>
          </Box>
        </Card>

        <Card>
          <Box padding="400">
            <BlockStack gap="300">
              {data && (
                <InlineStack distribute="space-between" blockAlign="center">
                  <Text variant="bodyMd" tone="subdued">{data.total} record(s)</Text>
                  {totalPages > 1 && (
                    <InlineStack gap="300">
                      <Button disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); load(search, p); }}>Previous</Button>
                      <Text variant="bodyMd">{page} / {totalPages}</Text>
                      <Button disabled={page >= totalPages} onClick={() => { const p = page + 1; setPage(p); load(search, p); }}>Next</Button>
                    </InlineStack>
                  )}
                </InlineStack>
              )}
              {rows.length === 0 ? (
                <Text tone="subdued">No records found. Orders placed through the storefront COD form will appear here instantly.</Text>
              ) : (
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text']}
                  headings={['Date', 'Customer', 'Phone', 'Address', 'Product', 'Qty', 'Value', 'Status', 'Shopify']}
                  rows={rows}
                  increasedVerticalDensity
                />
              )}
            </BlockStack>
          </Box>
        </Card>

        <Banner title="About statuses" tone="info">
          <Text as="p">
            <strong>Order created</strong> — a real order was placed in your Shopify admin (payment status "Pending").{' '}
            <strong>Flagged</strong> — order was created but our fraud engine marked it for review (e.g. duplicate phone).{' '}
            <strong>Blocked</strong> — the attempt was rejected and no order was created.
          </Text>
        </Banner>
      </BlockStack>
    </Page>
  );
}
