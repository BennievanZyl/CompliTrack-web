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
 * When URL contains ?store=STORE_ID (franchisor viewing a store),
 * that store ID is used directly — no DB lookup needed, RLS is bypassed
 * because all data queries on the page already use the storeId directly.
 */
export function useStoreContext() {
  const [ctx, setCtx] = useState<StoreContext | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const urlStoreId = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('store')
      : null

    if (urlStoreId) {
      // Franchisor viewing a specific store via ?store= URL param.
      // Trust the store ID directly — the franchisor portal already validated
      // access. All page queries use storeId directly so RLS is applied per-query.
      setCtx({
        storeId: urlStoreId,
        orgId: '',
        storeName: '',
        role: 'franchisor_admin',
        stores: [{ id: urlStoreId, name: '' }],
      })
      setReady(true)
    } else {
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
