import { createClient } from '@supabase/supabase-js';

// Public browser credentials only. Never place a service_role or secret key here.
export const supabase = createClient(
 'https://tihhjzwmlnisndlycgpe.supabase.co',
 'sb_publishable_pZ169DXpu9LWhz5OSM8JVQ_C9aYKdzX',
 { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);
