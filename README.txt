# My Recipe & Grocery — Android PWA

This is a phone-first installable web app created from `Groceries.xlsx`.

Included:
- 11 recipes from the workbook
- ingredient quantities and container information
- combined shopping list using container fractions
- adjustable servings
- recipe instructions
- grocery check-off
- favorites
- weekly meal planner
- add/edit/delete recipes
- local on-device storage
- JSON backup/restore

## Install on Android

For Chrome's "Install app / Add to Home screen" experience, the files need to be served from an HTTPS web address. A simple static host such as GitHub Pages, Netlify, or Cloudflare Pages works.

1. Upload the contents of this folder to a static HTTPS host.
2. Open the site's address in Chrome on your Android phone.
3. Open Chrome's menu (⋮).
4. Choose **Install app** or **Add to Home screen**.
5. Launch it from the new home-screen icon.

The app then runs locally in the browser and keeps your recipes, plan, favorites, and shopping checks on the phone.

## Important spreadsheet note

The workbook contains a handful of `#REF!`/blank computed values in the Data sheet. The app preserves valid workbook container fractions and calculates a fallback fraction from the ingredient catalog when the workbook value is missing/error.

## Backup

Use More → Export backup periodically if you want a copy of your recipes and app data.
