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

/** Get profile role without requiring store_id */
async function getProfileRole(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    return data?.role ?? null
  } catch {
    return null
  }
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
 *  3. Franchisor admin with no store_id + no URL param  →  redirect to /franchisor
 */
export function useStoreContext() {
  const [ctx, setCtx] = useState<StoreContext | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const urlStoreId = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('store')
      : null

    if (urlStoreId) {
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

    getStoreContext().then(async c => {
      if (!c) {
        // No store on profile — check if franchisor admin who needs to pick a store
        const role = await getProfileRole()
        const isFranchiseAdmin = role === 'franchisor_admin' || role === 'platform_admin'
        const path = typeof window !== 'undefined' ? window.location.pathname : ''
        const storePages = ['/finances','/analytics','/cashup','/compliance','/documents','/people','/reports','/settings','/stock','/wages','/attendance']
        if (isFranchiseAdmin && storePages.some(p => path.startsWith(p))) {
          window.location.href = '/franchisor'
          return
        }
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
