import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL     || 'https://poqiioyadddbuxcohwjy.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvcWlpb3lhZGRkYnV4Y29od2p5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NjU1NjksImV4cCI6MjA5MTM0MTU2OX0.HvbwwcNAVoMz9zPXknMT6rOKhjLMiQOH30iVgw6s6Ys'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
