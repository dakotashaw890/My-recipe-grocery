# Turn on "Continue with Google"

About 15 minutes. You need the Google account you want to own the app's sign-in settings.

## 1. Google Cloud: create the sign-in client

1. Go to **console.cloud.google.com** and create a project (top bar → project picker → **New project**, name it "Whole Kitchen").
2. Left menu → **APIs & Services → OAuth consent screen** (may be called **Google Auth Platform → Branding**).
   - App name: **Whole Kitchen**. User support email: your email.
   - Audience / user type: **External**.
   - Authorized domains: add **supabase.co** and **wholekitchen.app**.
   - Developer contact email: your email. Save.
   - Under **Audience**, click **Publish app** so anyone can sign in (Whole Kitchen only asks for name and email, so Google doesn't need to review it).
3. Left menu → **Clients** (or **Credentials → Create credentials → OAuth client ID**).
   - Application type: **Web application**. Name: Whole Kitchen.
   - **Authorized JavaScript origins:** `https://wholekitchen.app`
   - **Authorized redirect URIs:** `https://pgqhbapseuzuyvvekcyu.supabase.co/auth/v1/callback`
   - Create. Copy the **Client ID** and **Client secret**.

## 2. Supabase: switch Google on

1. Supabase → **Authentication → Sign In / Providers → Google**. Turn it on, paste the **Client ID** and **Client secret**, Save.
2. Supabase → **Authentication → URL Configuration**:
   - **Site URL:** `https://wholekitchen.app`
   - **Redirect URLs:** add `https://wholekitchen.app/**`

## 3. Check it

In the app: **Settings → Setup check** should show ✓ *Sign in with Google*. Then try **Settings → Family sync → Continue with Google**.

Notes
- Someone who already has an email-and-password account with the same Gmail address is linked to the same account when they use Google.
- People who sign up with Google can still delete their account in the app, or on the delete-account page with **Continue with Google**.
