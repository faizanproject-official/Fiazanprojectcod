/*!
 * COD Realistic - 1-Click Cash on Delivery widget for Shopify storefronts
 * Auto-injected via Shopify ScriptTag. No dependencies.
 */
(function () {
  'use strict';

  // v2.4: global guard — safe when loaded multiple times (ScriptTag + Theme App Extension)
  if (window.__CODR_ACTIVE__) return;
  window.__CODR_ACTIVE__ = true;

  // v2.4: Theme App Extension embed config (set by the app embed block)
  var EMBED = window.__CODR_EMBED__ || null;

  var currentScript = document.currentScript;
  var APP_URL = '';
  try {
    if (currentScript && currentScript.src) APP_URL = new URL('.', currentScript.src).origin;
  } catch (e) {
    APP_URL = '';
  }
  if (!APP_URL && EMBED && EMBED.appUrl) APP_URL = EMBED.appUrl;

  var SHOP = (window.Shopify && window.Shopify.shop) || '';
  if (!SHOP) return;

  var WIDGET_ID = 'codr-widget';
  var mounted = false;

  // ---------- utils ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(cents, currency) {
    var v = (Number(cents) || 0) / 100;
    return v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' ' + (currency || 'PKR');
  }
  function isValidPkPhone(raw) {
    var d = String(raw).replace(/\D/g, '');
    return /^0?3\d{9}$/.test(d) || /^923\d{9}$/.test(d);
  }

  // ---------- config fetch (app proxy first, direct fallback) ----------
  function fetchConfig() {
    var proxyUrl = '/apps/cod/config?shop=' + encodeURIComponent(SHOP);
    var directUrl = (APP_URL || '') + '/proxy/config?shop=' + encodeURIComponent(SHOP);
    return fetch(proxyUrl, { credentials: 'omit' })
      .then(function (r) { if (!r.ok) throw new Error('proxy ' + r.status); return r.json(); })
      .catch(function () {
        return fetch(directUrl, { credentials: 'omit' }).then(function (r) {
          if (!r.ok) throw new Error('direct ' + r.status);
          return r.json();
        });
      });
  }

  function submitOrder(payload) {
    var proxyUrl = '/apps/cod/order?shop=' + encodeURIComponent(SHOP);
    var directUrl = (APP_URL || '') + '/proxy/order?shop=' + encodeURIComponent(SHOP);
    var attempt = function (url) {
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify(payload),
      }).then(function (r) {
        return r.json().then(function (data) { return { status: r.status, data: data }; });
      });
    };
    return attempt(proxyUrl).catch(function () { return attempt(directUrl); });
  }

  // ---------- product detection ----------
  function getProductHandle() {
    if (window.meta && window.meta.product && window.meta.product.id && window.meta.page && window.meta.page.pageType === 'product') {
      var m = location.pathname.match(/\/products\/([^\/\?#]+)/);
      if (m) return decodeURIComponent(m[1]);
    }
    var m2 = location.pathname.match(/\/products\/([^\/\?#]+)/);
    return m2 ? decodeURIComponent(m2[1]) : null;
  }

  function fetchProduct(handle) {
    return fetch('/products/' + encodeURIComponent(handle) + '.js', { credentials: 'omit' })
      .then(function (r) { if (!r.ok) throw new Error('product'); return r.json(); });
  }

  // ---------- insertion ----------
  function findMountPoint() {
    // v2.4: explicit theme-app-embed container wins over auto-detection
    try {
      var embedRoot = document.querySelector('[data-codr-embed]');
      if (embedRoot) return embedRoot;
    } catch (e) { /* fall through */ }
    var selectors = [
      '[data-action="add-to-cart"]',
      '.product-form__buttons',
      '.product-form__submit',
      '.product__info-container > .product__info-wrapper',
      'product-info',
      '.product-single__form',
      '#AddToCartForm',
      'h1.product__title',
      'h1.product-title',
      'h1[itemprop="name"]',
      '.product__title',
    ];
    for (var i = 0; i < selectors.length; i++) {
      try {
        var el = $(selectors[i]);
        if (el) {
          // insert after the add-to-cart button when possible
          if (i === 0 && el.closest('.product-form')) return el.closest('.product-form');
          return el.parentElement || el;
        }
      } catch (e) { /* keep trying */ }
    }
    var main = $('main') || $('[role="main"]') || document.body;
    return main;
  }

  // ---------- styles ----------
  function injectStyles(cfg) {
    var css = ''
      + '#' + WIDGET_ID + '{all:revert;font-family:inherit;}'
      + '#' + WIDGET_ID + ' .codr-card{background:' + (cfg.cardBgColor || '#fff') + ';color:' + (cfg.textColor || '#202223')
      + ';border:1px solid ' + (cfg.borderColor || '#e3e3e3') + ';border-radius:' + (Number(cfg.cornerRadius) || 14) + 'px;padding:18px;margin:18px 0;'
      + 'box-shadow:0 3px 14px rgba(0,0,0,.07);max-width:' + (Number(cfg.maxWidth) || 480) + 'px;margin-left:auto;margin-right:auto;}'
      + '#' + WIDGET_ID + ' .codr-head{font-size:18px;font-weight:700;line-height:1.3;margin-bottom:4px;}'
      + '#' + WIDGET_ID + ' .codr-sub{font-size:13px;opacity:.75;margin-bottom:14px;line-height:1.45;}'
      + '#' + WIDGET_ID + ' .codr-prod{display:flex;gap:10px;align-items:center;background:rgba(0,0,0,.045);border-radius:10px;padding:10px;margin-bottom:12px;}'
      + '#' + WIDGET_ID + ' .codr-prod img{width:52px;height:52px;object-fit:cover;border-radius:8px;background:#eee;}'
      + '#' + WIDGET_ID + ' .codr-prod .codr-pt{font-size:13px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
      + '#' + WIDGET_ID + ' .codr-prod .codr-pp{font-size:13px;opacity:.75;}'
      + '#' + WIDGET_ID + ' .codr-f{margin-bottom:10px;}'
      + '#' + WIDGET_ID + ' label.codr-l{display:block;font-size:12px;font-weight:600;margin-bottom:4px;}'
      + '#' + WIDGET_ID + ' .codr-i,#' + WIDGET_ID + ' select.codr-i,#' + WIDGET_ID + ' textarea.codr-i{width:100%;box-sizing:border-box;'
      + 'border:1px solid ' + (cfg.borderColor || '#ddd') + ';border-radius:8px;padding:10px 12px;font-size:14px;font-family:inherit;'
      + 'background:#fff;color:' + (cfg.textColor || '#202223') + ';outline:none;}'
      + '#' + WIDGET_ID + ' .codr-i:focus{border-color:' + (cfg.primaryColor || '#1a7f37') + ';box-shadow:0 0 0 2px '
      + (cfg.primaryColor || '#1a7f37') + '33;}'
      + '#' + WIDGET_ID + ' .codr-err{color:#c5280c;font-size:12px;margin-top:4px;display:none;}'
      + '#' + WIDGET_ID + ' .codr-row{display:flex;gap:10px;}'
      + '#' + WIDGET_ID + ' .codr-row>*{flex:1;}'
      + '#' + WIDGET_ID + ' .codr-btn{width:100%;border:none;border-radius:' + Math.max(6, Math.round((Number(cfg.cornerRadius) || 14) * 0.7)) + 'px;padding:13px 16px;font-size:15px;font-weight:700;'
      + 'cursor:pointer;margin-top:6px;font-family:inherit;transition:opacity .15s, transform .05s;}'
      + '#' + WIDGET_ID + ' .codr-btn:hover{opacity:.92;}'
      + '#' + WIDGET_ID + ' .codr-btn:active{transform:scale(.99);}'
      + '#' + WIDGET_ID + ' .codr-btn[disabled]{opacity:.6;cursor:not-allowed;}'
      + '#' + WIDGET_ID + ' .codr-foot{font-size:11px;text-align:center;opacity:.6;margin-top:10px;}'
      + '#' + WIDGET_ID + ' .codr-success{text-align:center;padding:26px 10px;}'
      + '#' + WIDGET_ID + ' .codr-check{width:52px;height:52px;border-radius:50%;background:' + (cfg.primaryColor || '#1a7f37')
      + ';color:#fff;font-size:28px;line-height:52px;margin:0 auto 12px;}'
      + '#' + WIDGET_ID + ' .codr-okmsg{font-size:15px;font-weight:600;line-height:1.5;}';
    var s = document.createElement('style');
    s.id = WIDGET_ID + '-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ---------- render ----------
  function render(cfg, fraudValidate, orderToken, product) {
    if (mounted) return;
    var mount = findMountPoint();
    if (!mount) return;

    var root = document.createElement('div');
    root.id = WIDGET_ID;
    var currency = (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || 'PKR';

    var variants = (product && product.variants) || [];
    var hasVariants = variants.length > 1;
    var inStock = variants.length === 0 || variants.some(function (v) { return v.available; });

    var priceCents = variants.length ? variants[0].price : (product ? product.price : 0);
    var img = product && product.featured_image ? product.featured_image : (product && product.images && product.images[0]) || '';
    var title = product ? product.title : '';

    var fields = cfg.fields || {};
    function fieldHtml(key, label, ph, type) {
      if (!fields[key] || fields[key].enabled === false) return '';
      var req = fields[key].required ? ' *' : '';
      var input = type === 'textarea'
        ? '<textarea class="codr-i" data-f="' + key + '" rows="2" placeholder="' + esc(ph) + '"></textarea>'
        : '<input class="codr-i" data-f="' + key + '" type="' + (type || 'text') + '" placeholder="' + esc(ph) + '" />';
      return '<div class="codr-f" data-fw="' + key + '"><label class="codr-l">' + esc(label) + req + '</label>' + input
        + '<div class="codr-err" data-err="' + key + '"></div></div>';
    }

    var variantOptions = '';
    if (hasVariants) {
      variantOptions = '<div class="codr-f"><label class="codr-l">Select variant</label><select class="codr-i" id="codr-variant">'
        + variants.map(function (v, i) {
          return '<option value="' + v.id + '"' + (i === 0 ? ' selected' : '') + (v.available ? '' : ' disabled') + '>'
            + esc(v.title) + (v.available ? ' — ' + money(v.price, currency) : ' (out of stock)') + '</option>';
        }).join('')
        + '</select></div>';
    }

    var qtyHtml = '';
    if (cfg.showQuantity) {
      var maxQ = Math.max(1, Number(cfg.maxQuantity) || 5);
      qtyHtml = '<div class="codr-f" style="max-width:110px"><label class="codr-l">Quantity</label>'
        + '<select class="codr-i" id="codr-qty">'
        + Array.apply(null, Array(maxQ)).map(function (_, i) { return '<option value="' + (i + 1) + '">' + (i + 1) + '</option>'; }).join('')
        + '</select></div>';
    }

    var prodHtml = '';
    if (cfg.showProduct) {
      prodHtml = '<div class="codr-prod">'
        + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" />' : '')
        + '<div class="codr-pt">' + esc(title) + '</div>'
        + '<div class="codr-pp" id="codr-price">' + esc(money(priceCents, currency)) + '</div>'
        + '</div>';
    }

    root.innerHTML = ''
      + '<div class="codr-card">'
      + '  <div id="codr-form-view">'
      + '    <div class="codr-head">' + esc(cfg.heading || 'Order Now — Cash on Delivery') + '</div>'
      + (cfg.subheading ? '    <div class="codr-sub">' + esc(cfg.subheading) + '</div>' : '')
      + prodHtml
      + variantOptions
      + '    <div class="codr-row">'
      + qtyHtml
      + '    </div>'
      + fieldHtml('name', 'Full name', 'Your full name')
      + fieldHtml('phone', 'Phone number', cfg.phonePlaceholder || '03XX-XXXXXXX', 'tel')
      + fieldHtml('city', 'City', 'Your city')
      + fieldHtml('address', 'Complete address', 'House no, street, area', 'textarea')
      + fieldHtml('notes', 'Notes (optional)', 'Any special instructions', 'textarea')
      + '    <button type="button" class="codr-btn" id="codr-submit" style="background:' + (cfg.primaryColor || '#1a7f37') + ';color:' + (cfg.buttonTextColor || '#fff') + '">'
      + esc(cfg.buttonText || 'Place COD Order')
      + '    </button>'
      + '    <div class="codr-err" data-err="global"></div>'
      + '    <div class="codr-foot">Cash on Delivery — pay when you receive</div>'
      + '  </div>'
      + '  <div id="codr-success-view" class="codr-success" style="display:none">'
      + '    <div class="codr-check">&#10003;</div>'
      + '    <div class="codr-okmsg">' + esc(cfg.successMessage || 'Order placed successfully!') + '</div>'
      + '  </div>'
      + '</div>';

    mount.appendChild(root);
    mounted = true;
    injectStyles(cfg);

    var submitBtn = $('#codr-submit', root);
    var globalErr = $('[data-err="global"]', root);

    function currentVariant() {
      if (!hasVariants) return variants[0] || null;
      var sel = $('#codr-variant', root);
      return variants.filter(function (v) { return String(v.id) === String(sel.value); })[0] || variants[0];
    }

    function updatePrice() {
      var v = currentVariant();
      var priceEl = $('#codr-price', root);
      if (v && priceEl) priceEl.textContent = money(v.price * (Number(($('#codr-qty', root) || {}).value) || 1), currency);
    }
    if (hasVariants) {
      $('#codr-variant', root).addEventListener('change', updatePrice);
      var q0 = $('#codr-qty', root);
      if (q0) q0.addEventListener('change', updatePrice);
    }

    function setErr(key, msg) {
      var el = root.querySelector('[data-err="' + key + '"]');
      if (!el) return;
      el.textContent = msg || '';
      el.style.display = msg ? 'block' : 'none';
      if (msg) {
        var wrap = root.querySelector('[data-fw="' + key + '"]') || el;
        var input = wrap.querySelector('.codr-i');
        if (input) input.style.borderColor = '#c5280c';
      }
    }

    function clearErrs() {
      ['name', 'phone', 'city', 'address', 'notes', 'global'].forEach(function (k) { setErr(k, ''); });
      root.querySelectorAll('.codr-i').forEach(function (i) { i.style.borderColor = ''; });
    }

    function validate() {
      var vals = {};
      root.querySelectorAll('.codr-i[data-f]').forEach(function (i) { vals[i.getAttribute('data-f')] = i.value.trim(); });
      var f = cfg.fields || {};
      if (f.name && f.name.enabled !== false && f.name.required && vals.name.length < 3) { setErr('name', 'Please enter your full name.'); return null; }
      var digits = vals.phone.replace(/\D/g, '');
      if (digits.length < 10) { setErr('phone', 'Please enter a valid phone number.'); return null; }
      if (fraudValidate && !isValidPkPhone(vals.phone)) { setErr('phone', 'Enter a valid mobile number e.g. 03001234567.'); return null; }
      if (f.city && f.city.enabled && f.city.required && vals.city.length < 2) { setErr('city', 'Please enter your city.'); return null; }
      if (f.address && f.address.enabled !== false && f.address.required && vals.address.length < 8) { setErr('address', 'Please enter your complete address.'); return null; }
      return vals;
    }

    submitBtn.addEventListener('click', function () {
      clearErrs();
      if (!inStock) { setErr('global', 'Sorry, this product is currently out of stock.'); return; }
      var vals = validate();
      if (!vals) return;

      var variant = currentVariant();
      var qty = Number(($('#codr-qty', root) || {}).value) || 1;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Placing order...';

      submitOrder({
        shop: SHOP,
        orderToken: orderToken,
        variantId: variant ? variant.id : '',
        quantity: qty,
        name: vals.name || 'COD Customer',
        phone: vals.phone,
        address: vals.address || '',
        city: vals.city || '',
        notes: vals.notes || '',
        productTitle: title,
        variantTitle: variant ? variant.title : '',
        price: variant ? Number(variant.price) / 100 : 0,
      })
        .then(function (res) {
          if (res && res.status >= 200 && res.status < 300 && res.data && res.data.ok) {
            $('#codr-form-view', root).style.display = 'none';
            $('#codr-success-view', root).style.display = 'block';
            if (cfg.thankYouRedirect) {
              setTimeout(function () { location.href = '/pages/thank-you'; }, 1200);
            }
          } else {
            var msg = (res && res.data && res.data.error) || 'Could not place your order. Please try again.';
            setErr('global', msg);
            submitBtn.disabled = false;
            submitBtn.textContent = cfg.buttonText || 'Place COD Order';
          }
        })
        .catch(function () {
          setErr('global', 'Network error. Please check your connection and try again.');
          submitBtn.disabled = false;
          submitBtn.textContent = cfg.buttonText || 'Place COD Order';
        });
    });
  }

  // ---------- boot ----------
  function boot() {
    var handle = getProductHandle();
    if (!handle || mounted) return;

    fetchConfig()
      .then(function (cfgRes) {
        if (!cfgRes || !cfgRes.ok) return;
        // v2.4: Theme Editor mode — widget renders ONLY inside the app embed block
        if (cfgRes.config && cfgRes.config.themeExtensionMode) {
          if (!document.querySelector('[data-codr-embed]')) return;
        }
        return fetchProduct(handle).then(function (product) {
          render(cfgRes.config, cfgRes.validatePkPhone, cfgRes.orderToken, product);
        });
      })
      .catch(function (err) {
        if (window.console) console.warn('[COD Realistic] widget failed to load:', err && err.message);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  // Shopify sections re-render — retry once after a short delay
  setTimeout(boot, 1500);
})();
