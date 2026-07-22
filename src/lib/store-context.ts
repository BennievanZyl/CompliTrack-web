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
 * Priority order:
 *  1. ?store=STORE_ID in URL  →  franchisor viewing a specific store
 *  2. Profile has store_id    →  normal store owner/manager login
 *  3. Franchisor admin with no store_id and no URL param
 *     →  redirect to /franchisor portal (they should select a store there)
 */
export function useStoreContext() {
  const [ctx, setCtx] = useState<StoreContext | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const urlStoreId = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('store')
      : null

    if (urlStoreId) {
      // Franchisor is viewing a specific store via ?store= URL param
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
      if (!c) {
        // Profile has no store_id — check if this is a franchisor admin
        // who navigated directly to a store page without ?store= param
        supabase.from('profiles').select('role').eq('id', supabase.auth.getUser().then(r => r.data.user?.id ?? '')).maybeSingle().catch(() => null)
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (!user) return
          supabase.from('profiles').select('role').eq('id', user.id).single().then(({ data }) => {
            if (data?.role === 'franchisor_admin' || data?.role === 'platform_admin') {
              // Redirect to franchisor portal — they need to select a store first
              if (typeof window !== 'undefined' &&
                  !window.location.pathname.startsWith('/franchisor') &&
                  !window.location.pathname.startsWith('/admin') &&
                  !window.location.pathname.startsWith('/login') &&
                  !window.location.pathname.startsWith('/org')) {
                window.location.href = '/franchisor'
              }
            }
          })
        })
      }
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
