import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { full_name, email, password, store_id, role } = await req.json()

    if (!full_name || !email || !password || !store_id || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!serviceKey || !supabaseUrl) {
      return NextResponse.json({ error: 'Server not configured for admin actions' }, { status: 500 })
    }

    // Verify the caller is actually authorised to create a login for this store —
    // never trust the request body alone for a privileged action like this.
    const authHeader = req.headers.get('authorization') || ''
    const callerToken = authHeader.replace('Bearer ', '')
    if (!callerToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: callerData, error: callerError } = await admin.auth.getUser(callerToken)
    if (callerError || !callerData.user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    const { data: callerProfile } = await admin.from('profiles')
      .select('organisation_id, role').eq('id', callerData.user.id).single()
    if (!callerProfile || !['franchisee_owner', 'store_manager', 'franchisor_admin'].includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Not authorised to create logins' }, { status: 403 })
    }

    const { data: targetStore } = await admin.from('stores').select('organisation_id').eq('id', store_id).single()
    if (!targetStore || targetStore.organisation_id !== callerProfile.organisation_id) {
      return NextResponse.json({ error: 'Store not found in your organisation' }, { status: 403 })
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name },
    })
    if (createError || !created.user) {
      return NextResponse.json({ error: createError?.message || 'Could not create account' }, { status: 400 })
    }

    const { error: profileError } = await admin.from('profiles').insert({
      id: created.user.id, organisation_id: callerProfile.organisation_id, store_id, role, full_name,
    })
    if (profileError) {
      // Roll back the auth user so we don't leave an orphaned login with no profile
      await admin.auth.admin.deleteUser(created.user.id)
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, user_id: created.user.id })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unexpected error' }, { status: 500 })
  }
}
