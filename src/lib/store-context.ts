import { supabase } from '@/lib/supabase'

export interface StoreContext {
  storeId: string
  orgId: string
  storeName: string
  role: string
}

let _cache: StoreContext | null = null

export async function getStoreContext(): Promise<StoreContext | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase.from('profiles')
      .select('store_id, organisation_id, role').eq('id', user.id).single()
    if (!profile) return null

    let storeName = ''
    if (profile.store_id) {
      const { data: store } = await supabase.from('stores')
        .select('name').eq('id', profile.store_id).single()
      storeName = store?.name || ''
    }

    return {
      storeId: profile.store_id || '',
      orgId: profile.organisation_id || '',
      storeName,
      role: profile.role || '',
    }
  } catch {
    return null
  }
}
