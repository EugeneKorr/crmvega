import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ukhbszmytstnigbnhuml.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVraGJzem15dHN0bmlnYm5odW1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE5MDgxNzMsImV4cCI6MjA3NzQ4NDE3M30.TWsSrKG5EJHkoR-TfmdpPcUMh40tF-HJNqPyNW6AVRU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
