# SETUP GUIDE (Roman Urdu) — COD Realistic Shopify App

Ye app ReleaseIT jaisi kaam karegi: aapki Shopify admin ke andar chalegi (domain nazar nahi aayega),
aur product pages par 1-click COD form lag jayega. Neeche ke steps EXACTLY follow karein.

---

## STEP 1 — Shopify Partner account + App banayen

1. https://partners.shopify.com par jayen aur login karein (ya account banayen).
2. Left menu me **Apps and sales channels** → **Create app** → **Create app manually**.
3. App ka naam rakhen: `COD Realistic` → **Create app**.
4. Ab **Client credentials** section kholen — wahan **API key** aur **API secret** likha hoga.
   - Dono copy kar lein. Ye Railway me lagani hain.

## STEP 2 — Railway par deploy

1. https://railway.app par login karein (GitHub se login best hai).
2. **New Project** → **Deploy from GitHub repo**.
   - Pehle is folder ko GitHub par upload karein (naya repository bana kar, files upload kar dein).
   - Railway khud Dockerfile detect kar ke deploy karega (2-4 minute lagte hain).
3. Deploy ke baad **Settings → Networking → Generate Domain** par click karein.
   - Aapko ek domain milega jaise: `https://cod-realistic-production-xxxx.up.railway.app`
   - Ye domain copy kar lein — isko **APP_URL** kehte hain.
4. Ab **Variables** tab me ye variables add karein:

| Variable | Value |
|---|---|
| `SHOPIFY_API_KEY` | Step 1 se aapki API key |
| `SHOPIFY_API_SECRET` | Step 1 se aapka API secret |
| `SHOPIFY_APP_URL` | `https://aap-ka-railway-domain.up.railway.app` (bina trailing slash) |
| `SCOPES` | `write_draft_orders,read_draft_orders,read_orders,read_products,write_script_tags,read_script_tags` |

5. PostgreSQL add karein (data save karne ke liye):
   - Project page par **+ New** → **Database** → **Add PostgreSQL**.
   - Ab apne app service ke **Variables** me jayen aur ek variable add karein:
     - Name: `DATABASE_URL`
     - Value: `${{Postgres.DATABASE_URL}}`  (Reference button se Postgres ka DATABASE_URL select karein)
   - App khud restart ho jayegi. Done — ab data database me save hoga.

6. Deploy complete hone ke baad browser me `https://aap-ka-domain/health` kholen.
   Agar `{"ok":true,...}` dikhe to server live hai.

## STEP 3 — Shopify app configure karein

Partner dashboard me apni app khol kar **Configuration** tab me ye set karein:

### 3a. URLs
- **App URL**: `https://aap-ka-railway-domain.up.railway.app`
- **Allowed redirection URL(s)**: `https://aap-ka-railway-domain.up.railway.app/api/auth/callback`
- Embedded app: ON rakhen.

### 3b. App Proxy (BOHOT ZAROORI — isi se customer ko hamara domain nazar nahi aata)
Configuration page par **App proxy** section me:
- Subpath prefix: `apps`
- Subpath: `cod`
- Proxy URL: `https://aap-ka-railway-domain.up.railway.app/proxy`
- **Save** karein.

### 3c. Webhooks / Privacy
- **Privacy compliance endpoint (GDPR)** me ye URL dein: `https://aap-ka-railway-domain.up.railway.app/api/webhooks`
- (Customer data request, redact — sab isi par handle hote hain.)

Changes ke baad app ko **Save** karein.

## STEP 4 — App install karein apni store par

Browser me ye URL kholen (apna shop domain daal kar):

```
https://aap-ka-railway-domain.up.railway.app/api/auth?shop=aap-ki-store.myshopify.com
```

- Shopify install confirmation screen aayegi → **Install**.
- Install hote hi:
  - App aapki Shopify admin ke **andar** khulegi (embedded dashboard) — ye ReleaseIT jaisa hi experience hai.
  - App khud hi storefront par COD form ka script laga degi (script tag auto-create hota hai).

## STEP 5 — Check karein ke sab chal raha hai

1. Shopify admin → Apps → **COD Realistic** kholen.
2. **Dashboard** me "Storefront widget is active" wala green banner dikhna chahiye.
   - Agar warning dikhe to "Repair now" button daba dein.
3. **Form Designer** me ja kar texts/colors/fields set karein → Save.
4. **Setup & Status** page par Step 2 (App proxy) ke exact values diye hote hain — verify kar lein.
5. Apni store kholen, kisi bhi product page par jayen, **hard refresh** karein (Ctrl+Shift+R ya mobile me private tab).
   - Product page par **"Order Now — Cash on Delivery"** form nazar aayega.
6. Form fill kar ke order place karein → turant Shopify admin → Orders me naya order aayega:
   - Payment status: **Pending**
   - Tag: **COD**
   - Customer ka phone/address set hoga.

## STEP 6 — Orders aur fraud

- **COD Orders** page: har order ka record (phone, address, product, status) + search.
- **Fraud Prevention** page:
  - Duplicate phone window (e.g. 24h me same number dobara order kare to Flag ya Block)
  - Rozana order limit per phone
  - Pakistani number validation (03001234567 format)
  - Block list — kisi number ko hamesha ke liye block karein
- Flagged order = order bana hai lekin review karna hai (pehle customer ko call karein).
- Blocked = order bana hi nahi.

---

## Common Problems (Aksar puchay jane wale sawalat)

**Q: Admin panel kholne par "redirect" ya authorization mangta hai?**
App pehli baar install par khud authorize hoti hai. Agar phir mange to ye URL kholen:
`https://aap-ka-domain/api/auth?shop=aap-ki-store.myshopify.com`

**Q: Product page par form nazar nahi aa raha?**
- Hard refresh karein (cache issue).
- Admin → Dashboard → "Repair now" dabayen.
- Check karein ke Shopify admin → Settings → Customer accounts nahi, seedha product page khul raha ho.
- Form sirf **product pages** par aata hai (homepage par nahi) — ye jaan-boojh kar hai.

**Q: Order place karne par error aa raha hai?**
- Setup & Status me App proxy values verify karein (STEP 3b).
- Product variant stock me hona chahiye.

**Q: Railway par deploy fail ho jata hai?**
- Check karein ke poora folder upload hua hai (package.json, Dockerfile, server/, web/).
- Railway logs dekhen — pehli baar build 3-4 minute leta hai.

**Q: Domain change karni pari (Railway naya domain de diya)?**
- Railway Variables me `SHOPIFY_APP_URL` update karein.
- Shopify Partners → Configuration me App URL, redirection URL aur proxy URL update karein.
- Admin → Dashboard → "Repair now" (script tag naya domain point karega).

**Q: App Store par publish karna chahta hoon?**
Ye app GDPR webhooks + embedded architecture ke saath built hai jo App Store review ke liye ready hai.
Lekin App Store ke liye listing, screenshots, billing setup aur review process alag cheez hai — pehle apne
store par achhe se test kar lein.
