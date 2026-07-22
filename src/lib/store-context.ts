import { supabase } from '@/lib/supabase'
import { useState, useEffect } from 'react'

export interface StoreContext {
  storeId: string
  orgId: string
  storeName: string
  role: string
  stores: { id: string; name: string }[]
}

let _cache: StoreContext | null = null
let _promise: Promise<StoreContext | null> | null = null

export async function getStoreContext(): Promise<StoreContext | null> {
  if (_cache) return _cache
  if (_promise) return _promise

  _promise = (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      const { data: profile } = await supabase
        .from('profiles')
        .select('store_id, organisation_id, role')
        .eq('id', user.id)
        .single()

      if (!profile?.store_id) return null

      const { data: store } = await supabase
        .from('stores')
        .select('id, name')
        .eq('id', profile.store_id)
        .single()

      const stores = store ? [{ id: store.id, name: store.name }] : []

      _cache = {
        storeId: profile.store_id,
        orgId: profile.organisation_id ?? '',
        storeName: store?.name ?? '',
        role: profile.role ?? '',
        stores,
      }
      return _cache
    } catch {
      return null
    } finally {
      _promise = null
    }
  })()

  return _promise
}

export function clearStoreContext() {
  _cache = null
  _promise = null
}

/**
 * React hook — returns store context.
 *
 * Priority:
 *  1. ?store=ID in URL  →  franchisor viewing a specific store
 *  2. Profile has store_id  →  normal store login
 *  3. No store available  →  ready=true with empty storeId (page handles its own empty state)
 */
export function useStoreContext() {
  const [ctx, setCtx] = useState<StoreContext | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Read URL param INSIDE the effect to ensure client-side window is available
    const params = new URLSearchParams(window.location.search)
    const urlStoreId = params.get('store')

    if (urlStoreId) {
      // Franchisor viewing a specific store via ?store= URL param
      setCtx({
        storeId: urlStoreId,
        orgId: '',
        storeName: '',
        role: 'franchisor_admin',
        stores: [{ id: urlStoreId, name: '' }],
      })
      setReady(true)
      return
    }

    // Normal flow — load from profile
    getStoreContext().then(c => {
      setCtx(c)
      setReady(true)
    })
  }, [])

  return {
    storeId: ctx?.storeId ?? '',
    orgId: ctx?.orgId ?? '',
    storeName: ctx?.storeName ?? '',
    role: ctx?.role ?? '',
    stores: ctx?.stores ?? [],
    ready,
  }
}
