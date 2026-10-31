# Store prices and nutrition facts (one-time setup)

Both features go through your Supabase import helper (the `recipe-imports` Edge Function), so the private keys stay in Supabase and never in the app.

## 1. Update the helper
Supabase → **Edge Functions** → **recipe-imports** → **Code**. Replace everything with the contents of `recipe-import.ts` and click **Deploy**.

## 2. Kroger store prices (free)
1. Go to **developer.kroger.com** and create a free account.
2. **Create an app**: any name (e.g. "Gingham family"), environment **Production**, and tick the **Product** API (Public). The redirect URL can be `https://localhost`.
3. Copy the app's **Client ID** and **Client Secret**.
4. In Supabase: **Edge Functions** → **Secrets** (or Project Settings → Edge Functions → Secrets) → add:
   - `KROGER_CLIENT_ID` = your Client ID
   - `KROGER_CLIENT_SECRET` = your Client Secret
5. In Gingham: Shopping → **⋯** → **Choose your store for live prices** → enter your ZIP code → tap your store.

Prices come from Kroger-family stores (Kroger, King Soopers, Ralphs, Fry's, Fred Meyer, Smith's, Harris Teeter, Dillons, QFC, Mariano's, Pick 'n Save…). If an ingredient matched the wrong product, open it under Ingredients and tap **Not right?** to pick the one you buy.

## 3. Nutrition facts (free)
1. Go to **api.data.gov/signup**, enter your name and email. The key is emailed to you right away.
2. In Supabase **Edge Functions → Secrets**, add `FDC_API_KEY` = that key.
3. In Gingham: open a recipe → **Nutrition facts** → **Look up nutrition facts**.

Nutrition data comes from USDA FoodData Central (public domain). It's an estimate: it depends on matching each ingredient to a USDA food, and on knowing how much a cup or one item weighs.
