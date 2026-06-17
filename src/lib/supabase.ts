import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://fdixocuxhpafxkfytvxu.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkaXhvY3V4aHBhZnhrZnl0dnh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0ODI2NzgsImV4cCI6MjA5MzA1ODY3OH0.ZsStIc18riGDkmcuRvgKfnAMol6DMKZF2y2br8RAfl0'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)