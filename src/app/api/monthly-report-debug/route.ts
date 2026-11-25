import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    SUPABASE_URL_set:     !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    SERVICE_KEY_set:      !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    ANTHROPIC_KEY_set:    !!process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_KEY_prefix: process.env.ANTHROPIC_API_KEY?.slice(0, 7) ?? 'not set',
  })
}
