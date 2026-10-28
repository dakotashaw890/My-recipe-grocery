# Turn on "Import from link" (about 5 minutes, once)

Importing a recipe from a website needs a small helper in your Supabase project. Phone apps aren't allowed to read other websites directly, so the helper fetches the recipe page for the app. It's free, and only people signed in to your family can use it.

**Paste recipe text** works without this setup, so you can use that in the meantime.

## Steps (on a computer)

1. Go to [supabase.com](https://supabase.com/dashboard) and open your project.
2. In the left sidebar, click **Edge Functions**. The icon looks like a lightning bolt in a box. Hover over the icons if the labels are hidden.
3. Click **Deploy a new function**, then choose **Via Editor**.
4. An editor opens with some sample code. Click inside it, press **Ctrl+A** and then **Delete** to clear it.
5. Open `recipe-import.ts` in **Notepad**, not Word. Press **Ctrl+A** then **Ctrl+C**, then paste it into the Supabase editor with **Ctrl+V**.
6. At the bottom, find the function name box and type exactly: `recipe-imports`
7. Click **Deploy function** and wait for the success message.
8. Turn off the built-in JWT check. On the function's page, open **Details** (or **Settings**), find **Verify JWT** or **Enforce JWT verification**, switch it **off**, and save.
   This is safe: the helper does its own check and only answers people signed in to your family. Leaving it on can make every import fail with a sign-in error.

## Try it

On your phone, go to **Recipes → 🔗 Import**, paste a recipe link, and tap **Import from link**. The recipe opens in the editor, with each ingredient's original line shown underneath so you can check it before saving.

## If something goes wrong

| What you see | What it means |
| --- | --- |
| "The import helper isn't set up in Supabase yet" | The function isn't deployed, or its name isn't exactly `recipe-imports`. |
| "Sign in under Family sync…" | Sign in on that phone, or turn off **Verify JWT** (step 8). |
| "That site refused the request" | Some sites block imports. Use **Paste recipe text**. |
| "No recipe found on that page" | The page doesn't include recipe data. Use **Paste recipe text**. |
