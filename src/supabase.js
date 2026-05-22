import { createClient } from '@supabase/supabase-js';
import { createOfflineClient } from './lib/supabaseOffline';

const supabaseUrl = 'https://cfrcdtxkdomwlnqnzgvb.supabase.co';
const supabaseKey = 'sb_publishable_R43VL--d2q7HZ6uLKvhqag_PPUyR32J';

export const supabaseReal = createClient(supabaseUrl, supabaseKey);
export const supabase     = createOfflineClient(supabaseReal);
