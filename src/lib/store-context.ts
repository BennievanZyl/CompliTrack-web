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

/** Load a specific store by ID (used when franchisor views a store via ?store=xxx) */
async function getStoreById(storeId: string): Promise<StoreContext | null> {
  try {
    const { data: store } = await supabase.from('stores').select('id, name, organisation_id').eq('id', storeId).single()
    if (!store) return null
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = user ? await supabase.from('profiles').select('role, organisation_id').eq('id', user.id).single() : { data: null }
    return {
      storeId: store.id,
      orgId: (store as any).organisation_id ?? profile?.organisation_id ?? '',
      storeName: (store as any).name ?? '',
      role: profile?.role ?? 'franchisor_admin',
      stores: [{ id: store.id, name: (store as any).name ?? '' }],
    }
  } catch {
    return null
  }
}

export function clearStoreContext() {
  _cache = null
  _promise = null
}

/**
 * React hook — returns store context for the logged-in user.
 * When the URL contains ?store=STORE_ID (franchisor viewing a store),
 * that store's data is used instead of the logged-in user's store.
 */
export function useStoreContext() {
  const [ctx, setCtx] = useState<StoreContext | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Check for ?store= URL override (franchisor portal navigating into a store)
    const urlStoreId = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('store')
      : null

    if (urlStoreId) {
      // Franchisor is viewing a specific store — load that store's context
      getStoreById(urlStoreId).then(c => {
        setCtx(c)
        setReady(true)
      })
    } else {
      // Normal login — use the logged-in user's own store
      getStoreContext().then(c => {
        setCtx(c)
        setReady(true)
      })
    }
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
