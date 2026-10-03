# My Recipe & Grocery — Shopping and Cooking Preview

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
