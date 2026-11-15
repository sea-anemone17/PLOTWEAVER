import {createClient} from '@supabase/supabase-js';
import {cloudConfig} from './cloudConfig';

export const supabaseAuth = cloudConfig.enabled && cloudConfig.supabaseUrl && cloudConfig.publishableKey
 ? createClient(cloudConfig.supabaseUrl,cloudConfig.publishableKey,{
    auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true,flowType:'pkce'},
   })
 : null;
