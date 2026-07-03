/* To enable REAL cloud login + sync:
   1. Create a free project at https://supabase.com
   2. Run supabase-schema.sql in the project's SQL editor
   3. Copy this file to  ascend-config.js  and paste your two public values below
      (Project Settings → API → Project URL and the anon/public key).
   The anon key is safe to ship in the browser — Row-Level Security protects data.
   If ascend-config.js is absent, the app runs in local DEMO mode.                */
window.ASCEND_CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-PUBLIC-KEY',
};
