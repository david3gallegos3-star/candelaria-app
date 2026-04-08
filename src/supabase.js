import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cfrcdtxkdomwlnqnzgvb.supabase.co';
const supabaseKey = 'sb_publishable_R43VL--d2q7HZ6uLKvhqag_PPUyR32J';

export const supabase = createClient(supabaseUrl, supabaseKey);