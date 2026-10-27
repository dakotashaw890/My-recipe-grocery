# Family sync setup (about 10 minutes)

Family sync lets every phone share one set of recipes, meal plan, pantry, shopping list, prices, trips and ingredient photos. Each person signs in with their own email. Changes show up on the other phones within about 15 seconds while the app is open.

## 1. Create the database tables (once)

1. Open your project at [supabase.com](https://supabase.com/dashboard).
2. Go to **SQL Editor → New query**.
3. Open `supabase-setup.sql`, copy everything, paste it in, and click **Run**. You should see "Success. No rows returned".

The script only adds tables that start with `rg_`, so it won't touch anything else in your project. It is safe to run again.

## 2. Sign-in settings

Supabase makes new accounts confirm their email first. Pick one of these:

- **Simplest:** go to **Authentication → Sign In / Providers → Email** and turn off **Confirm email**. Accounts work right away.
- **Keep confirmation on:** go to **Authentication → URL Configuration** and set **Site URL** to your app's address, for example `https://yourname.github.io/your-repo/`. The confirmation link then opens your app instead of an error page.

## 3. Connect the app to your project

1. In Supabase, open **Project Settings → API** (on some projects it's called **API Keys**).
2. Copy the **Project URL** and the **anon public** key (newer projects call it the **publishable** key).
3. In GitHub, open `sync-config.js`, click the pencil to edit, and paste them between the quotes:

   ```js
   window.RG_SYNC_CONFIG = {
     url: "https://abcd1234.supabase.co",
     anonKey: "eyJhbGciOi..."
   };
   ```

4. Commit the change.

These two values are meant to be public. The rules from step 1 make sure only your family's accounts can read or change your data. **Never** use the `service_role` or secret key here.

## 4. Turn it on

**First phone** (the one with the data you want to keep):

1. Open the app, then **⚙️ Settings → Family sync**.
2. Enter your email and a password (8 characters or more), then tap **Create account**.
3. Enter your name and a family name, then tap **Create family from this phone's data**.
4. A join code appears. Tap **Share join code** to send it to the other phone.

**Second phone:**

1. Open **⚙️ Settings → Family sync** and create an account with that person's own email.
2. Enter the join code and tap **Join family**.

Joining **replaces** that phone's recipes, plan and pantry with the family's copy. A backup of the phone's old data is saved first under **Settings → Automatic backups**, in case you need anything from it.

A small ☁ ✓ next to the settings gear means the phone is synced.

## Good to know

- **Offline:** the app works without internet. Changes are saved on the phone and sent when it's back online.
- **Same item changed on two phones:** the change that reaches Supabase last wins. Different items, like two different meals, never overwrite each other.
- **Safety stop:** if one phone is about to remove a large part of the shared data at once, the app asks first. Choosing Cancel pauses sync. **Use family's copy** then puts that phone back in line with everyone else.
- **Reset** is blocked while a phone is syncing, so it can't wipe the family's data. Use **Stop syncing on this phone** first.
- **Backups:** each phone keeps 10 automatic backups. Still download a backup file now and then, because a sync mistake can reach every phone.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| "Family sync isn't connected yet" | `sync-config.js` is empty or still loading the old copy. Check the file on GitHub, then fully close and reopen the app. |
| "Invalid login credentials" | Wrong password, or the email hasn't been confirmed yet (see step 2). |
| "No family found with that code" | Check the code on the first phone (Settings → Family sync). Letters only, no spaces needed. |
| ☁ ⚠ Sync problem, mentioning `rg_items` or a function | Run `supabase-setup.sql` again (step 1). |
| ☁ ⚠ Offline | Normal without internet. It catches up automatically. |
| "Signed out" | Sign in again on that phone. It rejoins the same family. |
