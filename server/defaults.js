// Default form + fraud settings for every shop
export const DEFAULT_CONFIG = {
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

export const DEFAULT_FRAUD = {
  enabled: true,
  duplicateWindowHours: 24,
  duplicateAction: 'flag', // 'flag' | 'block'
  maxPerDayPerPhone: 5,
  maxPerDayAction: 'flag', // 'flag' | 'block'
  validatePkPhone: true,
};

export function mergeDeep(base, override) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  if (!override || typeof override !== 'object') return out;
  for (const key of Object.keys(override)) {
    const val = override[key];
    if (val && typeof val === 'object' && !Array.isArray(val) && base && typeof base[key] === 'object' && !Array.isArray(base[key])) {
      out[key] = mergeDeep(base[key], val);
    } else if (val !== undefined) {
      out[key] = val;
    }
  }
  return out;
}

export function normalizeConfig(raw) {
  return mergeDeep(DEFAULT_CONFIG, raw || {});
}

export function normalizeFraud(raw) {
  return mergeDeep(DEFAULT_FRAUD, raw || {});
}
