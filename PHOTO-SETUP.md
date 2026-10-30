# Photo storage setup (one time)

Gingham v23 keeps recipe and ingredient photos in Supabase **Storage** instead of inside your family's shared data. That keeps the database small (it's what the free plan limits), makes syncing faster, and means a phone joining the family doesn't download every photo at once.

## Steps

1. Open your project at supabase.com.
2. In the left menu, click **SQL Editor**, then **New query**.
3. Open `photo-storage-setup.sql`, copy everything in it, and paste it into the editor.
4. Click **Run**. You should see "Success. No rows returned". If Supabase warns about a destructive query, it's safe to continue: the script only adds a photo folder and its privacy rules.

That's it. The next time each phone opens Gingham and syncs, it moves its photos into storage by itself. To check, go to **Storage** in Supabase: there's a **photos** bucket with one folder for your family.

## Good to know

- The photos are private. Only signed-in members of your family can see them.
- Each phone keeps its own copy of the photos, so they still show offline. A new phone downloads them in the background after it joins.
- Until the script is run, photos keep syncing the old way, so nothing breaks in the meantime.
- Update both phones together. A phone still on an older version will show blank pictures for photos added in the new way.
