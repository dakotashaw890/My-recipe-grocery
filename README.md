# Whole Kitchen

Plan meals, build the shopping list and keep your family's recipes in one place.
Live at **https://wholekitchen.app** (GitHub Pages, custom domain in `CNAME`). Installable as an app (PWA) and packaged for Google Play.

## How it's built
Plain HTML, CSS and JavaScript: no build step. Every file sits at the top level of this repository.
Data lives on the phone (localStorage, photos in IndexedDB). Family sync, sign-in, sharing and the helper features use Supabase.

| What | Files |
|---|---|
| Page, styles, offline cache | `index.html`, `app.css`, `sw.js`, `manifest.json`, icons, `badge-96.png` |
| Main app | `core.js`, `settings.js`, `ui.js`, `units.js`, `groups.js`, `planner.js`, `week.js`, `family.js`, `cooking.js`, `shop.js`, `kitchen.js` |
| Loaded when needed | `shop-extras.js`, `extras.js`, `handsfree.js`, `reminders.js`, `nutrition.js`, `weights.js`, `prices.js`, `pictures.js`, `imports.js`, `import-apps.js`, `substitutions.js`, `sharing.js`, `community.js`, `onboarding.js`, `report.js`, `setup-check.js`, `catalog.js`, `ingredient-catalog.js`, `ingredient-pictures.js`, `cropper.min.*` |
| Sync, backups, account | `sync.js`, `sync-config.js`, `storage.js`, `account.js` |
| Public pages | `privacy.html`, `delete-account.html` |
| Supabase helper (Edge Function `recipe-imports`) | `recipe-import.ts` |

## Supabase setup (run once, in this order)
1. `supabase-setup.sql`, then `sync-config.js` (see `SYNC-SETUP.md`)
2. `photo-storage-setup.sql` (`PHOTO-SETUP.md`)
3. `sharing-setup.sql` (`SHARING-SETUP.md`)
4. `community-setup.sql` (`COMMUNITY-SETUP.md`)
5. `account-deletion.sql`
6. `launch-setup.sql` (daily limits, problem reports, reminders)
7. The helper: deploy `recipe-import.ts` (`IMPORT-SETUP.md`, `STORE-NUTRITION-SETUP.md`)
8. Google sign-in: `GOOGLE-SIGNIN-SETUP.md`

In the app, **Settings → Setup check** shows what's working.

## Keys
`sync-config.js` holds only the public anon key. Secret keys (Kroger, USDA, Anthropic, and optionally Brave Search for web recipe search: `BRAVE_API_KEY`) go in Supabase Edge Function secrets, never in this repository.

## Updating
Upload the changed files over the old ones. Each changed script gets a new `?v=` number in `index.html` and `sw.js`, and `sw.js` gets a new `CACHE` name, so installed apps pick up the update.
