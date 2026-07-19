import { supabase } from '@/lib/supabase'
import { useState, useEffect } from 'react'

export interface StoreContext {
  storeId: string
  orgId: string
  storeName: string
  role: string
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

      const { data: profile } = await supabase.from('profiles')
        .select('store_id, organisation_id, role').eq('id', user.id).single()
      if (!profile?.store_id) return null

      let storeName = ''
      const { data: store } = await supabase.from('stores')
        .select('name').eq('id', profile.store_id).single()
      storeName = store?.name || ''

      _cache = {
        storeId: profile.store_id,
        orgId: profile.organisation_id || '',
        storeName,
        role: profile.role || '',
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

/** Clear cache on sign-out so next login gets fresh context */
export function clearStoreContext() {
  _cache = null
  _promise = null
}

/** React hook — returns { storeId, orgId, storeName, role, ready } */
export function useStoreContext() {
  const [ctx, setCtx] = useState<StoreContext | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
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
    ready,
  }
}
