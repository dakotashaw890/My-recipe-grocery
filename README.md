# My Recipe & Grocery

## Install this update (v16 — warm kitchen)
Replace or add these files in your GitHub repository (all at the top level, no folders):
`index.html`, `app.css`, `kitchen.js` (new), `sw.js`, `manifest.json`.
Everything else stays as it is. Then follow `IMPORT-SETUP.md` once to turn on importing from links.

## What changed in v16
- **New look:** a warm kitchen design with a gingham tablecloth header, cookbook-style headings, tomato red for actions and olive for "you have it". A dark version follows your phone's dark mode.
- **Import recipes:** paste a link from a recipe website, or paste recipe text from anywhere. Ingredients are split into amount, unit and name, matched to ingredients you already use, and opened in the editor for review.
- **What can I make?** Recipes show "✓ Ready to cook" or "Need 2: …" based on your pantry. There's a 🍳 Can make now filter, and the Home screen shows how many recipes are ready.
- **Staples:** in any ingredient's editor, set "keep at least N on hand". When the pantry drops below that, it goes on the shopping list automatically with a ⭐ Staple tag.
- **Finish trip:** after shopping, tap ✓ Finish trip. Enter what you paid, and the app saves the trip, remembers each price, adds the items to the pantry and unchecks them.
- **Price history and recipe cost:** each ingredient shows its last price paid, average, low/high and a small trend chart. Recipes show about how much they cost per serving.

## What changed in v15
- **Family sync (Supabase):** shared recipes, meal plan, pantry, shopping list and checks, package sizes, prices, grocery trips and ingredient photos across phones. Each person has their own sign-in. Works offline and catches up later; a safety prompt stops one phone from wiping the shared data.
- **Automatic backups:** each phone saves a copy of all data (photos included) about once a day and before big changes (joining a family, importing, resetting, restoring). The last 10 are listed in Settings with Restore and Download buttons.
- **Backup reminder** on the Home screen if no backup file has been downloaded for 3 weeks. Backup files now include ingredient photos.
- **Ingredient photos moved to IndexedDB:** they no longer count toward the ~5 MB browser storage limit. Existing photos are moved automatically.
- **📤 Share list** on the Shopping screen sends the remaining items, grouped by department, to any app (text, email, notes).
- **👩‍🍳 Cook mode** on each recipe: large step-by-step text, scaled ingredients, and the screen stays on while cooking.
- **Stylesheet rebuilt** into `css/app.css`: one rule per selector, 53 overridden declarations and 7 unused rules removed. Every screen was checked at three screen widths to render exactly as before.
- Code split into `js/storage.js` (photos and backups), `js/sync.js` (family sync) and `js/extras.js` (share list, cook mode).

## Release history

## Install
1. Export a backup from Settings before replacing anything.
2. Extract this ZIP and upload only index.html, manifest.json, sw.js, icon-192.png and icon-512.png to your GitHub Pages repository.
3. Wait for publishing, close and reopen the installed app. If old screens remain, refresh the website once.
4. Check recipes, planner, pantry quantities and shopping list before using Cook.

## Changes
- Cook button beside each planned meal. Adjust cooked servings and optionally individual ingredients without changing the recipe. Confirm before pantry deduction.
- Shopping list moves fully pantry-covered ingredients into a distinct expandable Covered by Pantry department.
- Larger BUY quantity on each item, with package size beneath it.
- Ingredient pictures: category icons by default; photos from available barcode lookups; optional HTTPS picture URL per ingredient via Picture button.
- Retains partial package scanning and saved package details from prior release.

## Important limits
- Ingredient pictures are not guaranteed for every item; product photos depend on external Open Food Facts coverage and internet. Direct phone photo uploads are not included in this preview.
- Cooking only deducts ingredients with compatible preferred package conversions. Review the preview carefully.
- Undo last cooking deduction is in Pantry.
- No live Walmart prices.
- Tested for JavaScript syntax and ZIP integrity, not on your phone.


## Planner cooked status patch
- Planned meals turn light green and show a prominent ✓ COMPLETE label and actual servings after confirming cooking.
- The button changes to '✓ Complete · Cook again' so an additional deduction is intentional.
- Undo last cooked meal restores the previous planner completion status when the meal still matches.
- Changing a planned recipe or serving count resets its completed status; unchanged edits preserve it.


## Planner and shopping layout update
- Add multiple independently editable recipes to each day and meal (Breakfast/Lunch/Dinner). Existing saved weekly plans remain compatible.
- Each planned recipe has independent servings, Cook button, and green COMPLETE state.
- Shopping quantities aggregate every planned recipe and all manual selections.
- Shopping department cards now have compact ingredient thumbnails, prominent BUY quantities, pantry amounts, and expandable edit controls. Covered ingredients remain in a separate section.
- Export a backup before installation. Replace index.html, sw.js, manifest.json, icon-192.png and icon-512.png on GitHub; README is for reference.
- Test with one added meal before recording cooking deductions on both phones.


## Shopping screen fixes
- Expanded Edit Package now fills the card width with aligned, responsive fields.
- Edit Pantry, Edit Package, and Picture display side by side.
- Removed repeated price-estimate text on shopping items; one estimate note remains at the total.
- Removed redundant recipe requirement and pantry coverage line from expanded shopping cards.


## Photo restoration
- Accepts saved camera/photo-library images stored as embedded data:image URLs as well as HTTPS image URLs. No re-upload of saved photos is required if they remain in app data.

- Added Collapse control to shopping editor; photo restoration and three previous fixes retained.

- Removed the redundant shopping quantity explanation card.

Restores embedded package photos and camera/gallery picker from photo-enabled source, retaining shopping layout, Collapse and message removal.

Barcode scanning: select Add new ingredient to enter its name, package quantity, unit and type, then add it directly to pantry. Existing ingredients remain selectable.

Scanner upgrade: preserves ingredient pictures and preferences, remembers barcode matches, online product lookup with manual fallback, quick-add 1/2/3, optional continuous scanning, torch where supported, duplicate scan protection. Barcode mappings are included in app state backups and existing sync.

## Scanner and picture fixes
- Fixes a missing optional cloud-sync callback that caused saves to throw after local storage succeeded, leaving the scanner open and causing every photo upload to report a misleading storage error.
- Scanner saves now show confirmation, prevent duplicate submissions, refresh pantry and support continuous scanning.
- New ingredients without pictures can opt to add a camera/gallery picture immediately after saving. Existing pictures remain protected.
- Ingredient photo uploads are resized/compressed and roll back their in-memory change on failed storage.
- NOTE: This supplied standalone build contains no implemented cloud-sync callback. This patch does not create Supabase Storage or guarantee cross-device photo sync. Test on the actual Android devices.

Pantry save reliability: removes undefined renderAll call, separates storage commit from UI refresh and optional sync, and prevents false failed-save alerts after successful writes.


Conversion + meal-planner update:
- Recipe quantities convert through compatible unit families before pantry subtraction and package rounding.
- Added remembered ingredient-specific recipe-to-package conversions with manual correction controls.
- Unresolved conversions are flagged instead of silently guessed.
- Suggest Empty Meals now fills Breakfast, Lunch, and Dinner, respecting recipe meal categories.
- Added Breakfast, Lunch, Dinner, and Snack recipe categories. Snack is excluded from automatic planning.
- Existing recipes without saved categories receive a conservative inferred category until edited.

Ingredient management update:
- Ingredient names can now be renamed from the ingredient editor.
- Renames propagate through recipes, pantry, package preferences, photos/metadata, barcode associations, and saved conversions.
- Names containing apostrophes and other special characters are handled through encoded IDs rather than raw names.
- Renaming to an existing ingredient offers a merge instead of creating another duplicate.
- Added Delete Ingredient. Ingredients used by recipes are protected; unused ingredients can be removed with related saved data cleaned up.

- One-time cleanup removes the malformed ingredient “she'll noodle” / “she'll noodles” from saved pantry/package/photo/barcode/conversion data and recipe ingredient references.
