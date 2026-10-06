import React, { useEffect, useState } from 'react';
import {
  Page, Card, Text, TextField, Checkbox, Button, Banner, DataTable,
  BlockStack, InlineStack, Box, Select, Spinner, Badge,
} from '@shopify/polaris';
import { api } from '../api.js';

export default function Fraud() {
  const [fraud, setFraud] = useState(null);
  const [blocked, setBlocked] = useState([]);
  const [newPhone, setNewPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      const [s, b] = await Promise.all([api('/settings'), api('/blocked')]);
      setFraud(s.fraud);
      setBlocked(b.blocked);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => { load(); }, []);

  const set = (key, value) => setFraud((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      await api('/settings', { method: 'PUT', body: { fraud } });
      setToast('Fraud settings saved.');
      setTimeout(() => setToast(null), 3500);
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  const addPhone = async () => {
    if (!newPhone.trim()) return;
    try {
      await api('/blocked', { method: 'POST', body: { phone: newPhone.trim() } });
      setNewPhone('');
      const b = await api('/blocked');
      setBlocked(b.blocked);
    } catch (e) {
      setError(e.message);
    }
  };

  const removePhone = async (id) => {
    try {
      await api(`/blocked/${id}`, { method: 'DELETE' });
      setBlocked((list) => list.filter((b) => String(b.id) !== String(id)));
    } catch (e) {
      setError(e.message);
    }
  };

  if (!fraud) {
    return (
      <Page title="Fraud Prevention">
        {error ? <Banner tone="critical" title="Error">{error}</Banner> : <Spinner size="large" accessibilityLabel="Loading" />}
      </Page>
    );
  }

  const blockedRows = blocked.map((b) => [
    b.phone,
    new Date(b.created_at).toLocaleString(),
    <Button size="slim" tone="critical" onClick={() => removePhone(b.id)}>Remove</Button>,
  ]);

  return (
    <Page
      title="Fraud Prevention"
      subtitle="Stop fake and duplicate COD orders automatically"
      primaryAction={<Button variant="primary" loading={saving} onClick={save}>Save</Button>}
    >
      <BlockStack gap="400">
        {toast && <Banner tone="success" title="Saved">{toast}</Banner>}
        {error && <Banner tone="critical" title="Error">{error}</Banner>}

        <Card>
          <Box padding="400">
            <BlockStack gap="300">
              <InlineStack gap="300" blockAlign="center">
                <Text variant="headingMd" as="h2">Fraud engine</Text>
                <Badge tone={fraud.enabled ? 'success' : 'warning'}>{fraud.enabled ? 'Active' : 'Disabled'}</Badge>
              </InlineStack>
              <Checkbox label="Enable fraud prevention" checked={fraud.enabled} onChange={(v) => set('enabled', v)} />

              <TextField
                label="Duplicate order window (hours)"
                type="number" min={0} max={720}
                value={String(fraud.duplicateWindowHours)}
                onChange={(v) => set('duplicateWindowHours', Math.max(0, Number(v) || 0))}
                helpText="If the same phone number orders again within this window, the action below is applied. Set 0 to disable."
                connectedRight={
                  <Select
                    label="" labelHidden
                    options={[{ label: 'Flag order', value: 'flag' }, { label: 'Block order', value: 'block' }]}
                    value={fraud.duplicateAction}
                    onChange={(v) => set('duplicateAction', v)}
                  />
                }
              />

              <TextField
                label="Max orders per phone per day"
                type="number" min={0} max={100}
                value={String(fraud.maxPerDayPerPhone)}
                onChange={(v) => set('maxPerDayPerPhone', Math.max(0, Number(v) || 0))}
                helpText="When a phone number crosses this daily limit, the action below is applied. Set 0 to disable."
                connectedRight={
                  <Select
                    label="" labelHidden
                    options={[{ label: 'Flag order', value: 'flag' }, { label: 'Block order', value: 'block' }]}
                    value={fraud.maxPerDayAction}
                    onChange={(v) => set('maxPerDayAction', v)}
                  />
                }
              />

              <Checkbox
                label="Reject invalid Pakistani mobile numbers"
                checked={fraud.validatePkPhone} onChange={(v) => set('validatePkPhone', v)}
                helpText="Accepts 03XX-XXXXXXX, +92 3XX-XXXXXXX formats only."
              />
            </BlockStack>
          </Box>
        </Card>

        <Card>
          <Box padding="400">
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">Blocked phone numbers</Text>
              <Text variant="bodySm" tone="subdued">Orders from these numbers are rejected instantly.</Text>
              <InlineStack gap="300" blockAlign="center">
                <div style={{ flex: 1, maxWidth: 360 }}>
                  <TextField label="" labelHidden placeholder="e.g. 03001234567" value={newPhone} onChange={setNewPhone} autoComplete="off" />
                </div>
                <Button onClick={addPhone}>Block number</Button>
              </InlineStack>
              {blockedRows.length === 0 ? (
                <Text tone="subdued">No blocked numbers yet.</Text>
              ) : (
                <DataTable
                  columnContentTypes={['text', 'text', 'text']}
                  headings={['Phone', 'Added', 'Action']}
                  rows={blockedRows}
                />
              )}
            </BlockStack>
          </Box>
        </Card>

        <Banner title="How flags work" tone="info">
          <Text as="p">
            <strong>Flag</strong> creates the order but marks it for review in the COD Orders page (yellow badge).
            <strong> Block</strong> refuses the order completely and logs the attempt. Flagged orders still appear in Shopify — always call the customer to confirm before shipping.
          </Text>
        </Banner>
      </BlockStack>
    </Page>
  );
}
