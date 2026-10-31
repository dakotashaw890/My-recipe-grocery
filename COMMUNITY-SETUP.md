# Community recipes (one-time setup)

1. Supabase → **SQL Editor** → **New query**.
2. Paste everything in `community-setup.sql` and click **Run**. If Supabase warns about a destructive query, it's safe: the script only adds the community tables, their rules, and a public photo folder.

That's all. The **🌍 Community** tile appears on the Recipes screen.

## Looking after it
- A recipe reported by 3 different people is hidden automatically.
- To review: Supabase → **Table Editor** → `rg_public_recipes`, filter `hidden = true`.
  - Fine? Set `hidden` to false and `reports` to 0.
  - Not fine? Delete the row.
- People can only change or remove recipes they shared themselves.
- Anyone using Gingham can browse, even without an account. Sharing and reporting need an account.
