import React, { useEffect, useState } from 'react';
import {
  Page, Layout, Card, Text, TextField, Checkbox, Button, Banner,
  BlockStack, InlineStack, Box, Divider, Select, Spinner,
} from '@shopify/polaris';
import { api } from '../api.js';

const DEFAULTS = {
  heading: 'Order Now — Cash on Delivery',
  subheading: 'Fill the form and pay cash when your parcel arrives. No advance payment required.',
  buttonText: 'Place COD Order',
  successMessage: 'Order placed successfully! Our team will call you shortly to confirm.',
  primaryColor: '#1a7f37',
  buttonTextColor: '#ffffff',
  cardBgColor: '#ffffff',
  textColor: '#202223',
  borderColor: '#e3e3e3',
  cornerRadius: 14,
  maxWidth: 480,
  themeExtensionMode: false,
  country: 'Pakistan',
  phonePlaceholder: '03XX-XXXXXXX',
  fields: {
    name: { enabled: true, required: true },
    phone: { enabled: true, required: true },
    address: { enabled: true, required: true },
    city: { enabled: true, required: false },
    notes: { enabled: false, required: false },
  },
  showProduct: true,
  showQuantity: true,
  maxQuantity: 5,
  validatePkPhone: true,
  orderTag: 'COD',
  thankYouRedirect: false,
};

function ColorField({ label, value, onChange }) {
  return (
    <InlineStack gap="200" blockAlign="center">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 44, height: 36, border: '1px solid #d5d5d5', borderRadius: 8, padding: 2, background: '#fff', cursor: 'pointer' }}
      />
      <div style={{ flex: 1 }}>
        <Text variant="bodyMd" as="p">{label}</Text>
        <Text variant="bodySm" tone="subdued">{value}</Text>
      </div>
    </InlineStack>
  );
}

function FieldToggle({ label, field, value, onChange }) {
  return (
    <Card background="bg-surface-secondary">
      <Box padding="300">
        <InlineStack gap="400" blockAlign="center">
          <div style={{ flex: 1 }}><Text variant="bodyMd" as="p" fontWeight="semibold">{label}</Text></div>
          <Checkbox label="Show" checked={value.enabled} onChange={(v) => onChange(field, 'enabled', v)} />
          <Checkbox label="Required" checked={value.required} onChange={(v) => onChange(field, 'required', v)} />
        </InlineStack>
      </Box>
    </Card>
  );
}

export default function Designer() {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/settings')
      .then((d) => setConfig({ ...DEFAULTS, ...d.config }))
      .catch((e) => setError(e.message));
  }, []);

  const set = (key, value) => setConfig((c) => ({ ...c, [key]: value }));
  const setField = (field, key, value) =>
    setConfig((c) => ({ ...c, fields: { ...c.fields, [field]: { ...c.fields[field], [key]: value } } }));

  const save = async () => {
    setSaving(true);
    try {
      await api('/settings', { method: 'PUT', body: { config, fraud: undefined } });
      setToast('Form design saved. Refresh your product page to see changes.');
      setTimeout(() => setToast(null), 4000);
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  if (!config) {
    return (
      <Page title="Form Designer">
        {error ? <Banner tone="critical" title="Error">{error}</Banner> : <Spinner size="large" accessibilityLabel="Loading" />}
      </Page>
    );
  }

  const enabledFields = Object.entries(config.fields).filter(([, f]) => f.enabled);

  // ---- Live preview ----
  const preview = (
    <div style={{ background: '#f1f1f1', padding: 24, borderRadius: 12 }}>
      <div
        style={{
          background: config.cardBgColor, color: config.textColor,
          border: `1px solid ${config.borderColor}`, borderRadius: Number(config.cornerRadius) || 14,
          padding: 20, maxWidth: Math.min(Number(config.maxWidth) || 480, 480), margin: '0 auto',
          boxShadow: '0 4px 18px rgba(0,0,0,0.08)',
          fontFamily: 'inherit',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>{config.heading || 'Order Now'}</div>
        {config.subheading ? <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 14 }}>{config.subheading}</div> : null}
        {config.showProduct && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'rgba(0,0,0,0.04)', borderRadius: 10, padding: 10, marginBottom: 12 }}>
            <div style={{ width: 46, height: 46, borderRadius: 8, background: 'rgba(0,0,0,0.12)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Product name</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>PKR 2,499</div>
            </div>
            {config.showQuantity && (
              <div style={{ fontSize: 12, border: `1px solid ${config.borderColor}`, borderRadius: 6, padding: '4px 8px' }}>Qty: 1</div>
            )}
          </div>
        )}
        {enabledFields.map(([key]) => (
          <div key={key} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, textTransform: 'capitalize' }}>
              {key}{config.fields[key].required ? ' *' : ''}
            </div>
            <div style={{
              border: `1px solid ${config.borderColor}`, borderRadius: 8, padding: '9px 12px',
              fontSize: 13, color: '#8a8a8a', background: '#fff',
            }}>
              {key === 'phone' ? config.phonePlaceholder : key === 'address' ? 'House, street, area' : key === 'notes' ? 'Any special instructions' : `Your ${key}`}
            </div>
          </div>
        ))}
        <div style={{
          background: config.primaryColor, color: config.buttonTextColor,
          borderRadius: Math.max(6, Math.round((Number(config.cornerRadius) || 14) * 0.7)), padding: '12px 0', textAlign: 'center',
          fontWeight: 700, fontSize: 15, marginTop: 4,
        }}>
          {config.buttonText || 'Place Order'}
        </div>
        <div style={{ fontSize: 11, textAlign: 'center', opacity: 0.6, marginTop: 10 }}>
          Cash on Delivery — pay when you receive
        </div>
      </div>
    </div>
  );

  return (
    <Page
      title="Form Designer"
      subtitle="Design the 1-click COD form that appears on your product pages"
      primaryAction={<Button variant="primary" loading={saving} onClick={save}>Save</Button>}
    >
      <BlockStack gap="400">
        {toast && <Banner tone="success" title="Saved">{toast}</Banner>}
        {error && <Banner tone="critical" title="Error">{error}</Banner>}

        <Layout>
          <Layout.Section variant="oneHalf">
            <BlockStack gap="400">
              <Card>
                <Box padding="400">
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h2">Texts</Text>
                    <TextField label="Heading" value={config.heading} onChange={(v) => set('heading', v)} autoComplete="off" />
                    <TextField label="Sub-heading" value={config.subheading} onChange={(v) => set('subheading', v)} multiline={2} autoComplete="off" />
                    <TextField label="Button text" value={config.buttonText} onChange={(v) => set('buttonText', v)} autoComplete="off" />
                    <TextField label="Success message" value={config.successMessage} onChange={(v) => set('successMessage', v)} multiline={2} autoComplete="off" />
                    <TextField label="Phone placeholder" value={config.phonePlaceholder} onChange={(v) => set('phonePlaceholder', v)} autoComplete="off" />
                    <TextField
                      label="Order tag" value={config.orderTag} onChange={(v) => set('orderTag', v)} autoComplete="off"
                      helpText="Orders created by this form are tagged with this value so you can filter them in Shopify admin."
                    />
                  </BlockStack>
                </Box>
              </Card>

              <Card>
                <Box padding="400">
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h2">Colors</Text>
                    <ColorField label="Button color" value={config.primaryColor} onChange={(v) => set('primaryColor', v)} />
                    <ColorField label="Button text" value={config.buttonTextColor} onChange={(v) => set('buttonTextColor', v)} />
                    <ColorField label="Form background" value={config.cardBgColor} onChange={(v) => set('cardBgColor', v)} />
                    <ColorField label="Form text" value={config.textColor} onChange={(v) => set('textColor', v)} />
                    <ColorField label="Borders" value={config.borderColor} onChange={(v) => set('borderColor', v)} />
                    <Select
                      label="Corner style"
                      options={[{ label: 'Sharp (0px)', value: '0' }, { label: 'Soft (10px)', value: '10' }, { label: 'Round (14px) — default', value: '14' }, { label: 'Extra round (22px)', value: '22' }, { label: 'Pill (30px)', value: '30' }]}
                      value={String(config.cornerRadius ?? 14)}
                      onChange={(v) => set('cornerRadius', Number(v))}
                    />
                    <Select
                      label="Form width"
                      options={[{ label: 'Narrow (400px)', value: '400' }, { label: 'Normal (480px) — default', value: '480' }, { label: 'Wide (560px)', value: '560' }, { label: 'Full (680px)', value: '680' }]}
                      value={String(config.maxWidth ?? 480)}
                      onChange={(v) => set('maxWidth', Number(v))}
                    />
                  </BlockStack>
                </Box>
              </Card>

              <Card>
                <Box padding="400">
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h2">Form fields</Text>
                    <FieldToggle label="Full name" field="name" value={config.fields.name} onChange={setField} />
                    <FieldToggle label="Phone number" field="phone" value={config.fields.phone} onChange={setField} />
                    <FieldToggle label="Address" field="address" value={config.fields.address} onChange={setField} />
                    <FieldToggle label="City" field="city" value={config.fields.city} onChange={setField} />
                    <FieldToggle label="Notes (optional instructions)" field="notes" value={config.fields.notes} onChange={setField} />
                  </BlockStack>
                </Box>
              </Card>

              <Card>
                <Box padding="400">
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h2">Product &amp; options</Text>
                    <Checkbox label="Show product name and price in the form" checked={config.showProduct} onChange={(v) => set('showProduct', v)} />
                    <Checkbox label="Allow customer to choose quantity" checked={config.showQuantity} onChange={(v) => set('showQuantity', v)} />
                    {config.showQuantity && (
                      <TextField
                        label="Maximum quantity per order" type="number" value={String(config.maxQuantity)}
                        onChange={(v) => set('maxQuantity', Math.max(1, Number(v) || 1))} min={1} max={99}
                      />
                    )}
                    <Checkbox
                      label="Validate Pakistani mobile numbers (03XX-XXXXXXX / +92)"
                      checked={config.validatePkPhone} onChange={(v) => set('validatePkPhone', v)}
                      helpText="Blocks typos like 0301234 (too short) before the order is placed."
                    />
                    <TextField
                      label="Delivery country" value={config.country} onChange={(v) => set('country', v)} autoComplete="off"
                      helpText="Set on every order's shipping address."
                    />
                  </BlockStack>
                </Box>
              </Card>

              <Card>
                <Box padding="400">
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h2">Theme Editor mode (advanced)</Text>
                    <Checkbox
                      label="Control widget from Online Store &gt; Themes &gt; Customize"
                      checked={config.themeExtensionMode}
                      onChange={(v) => set('themeExtensionMode', v)}
                      helpText="ON: widget renders ONLY where the 'COD Order Form' app embed block is placed in the theme editor. The automatic script-tag injection is disabled. Enable this ONLY after the theme extension is deployed and the block is toggled ON."
                    />
                    <Banner tone="info">
                      <p><b>Workflow:</b> 1) Deploy the theme extension (COD-Theme-Extension kit) &nbsp;2) Theme editor &gt; App embeds &gt; turn ON "COD Order Form" &nbsp;3) Save theme &nbsp;4) Turn this checkbox ON &nbsp;5) Save design. To go back to automatic placement, just turn this checkbox OFF.</p>
                    </Banner>
                  </BlockStack>
                </Box>
              </Card>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneHalf">
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">Live preview</Text>
                  <Text variant="bodySm" tone="subdued">This is how the form will look on your product page (desktop and mobile).</Text>
                  <Divider />
                  {preview}
                  <Button onClick={save} loading={saving} variant="primary" fullWidth>Save design</Button>
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
