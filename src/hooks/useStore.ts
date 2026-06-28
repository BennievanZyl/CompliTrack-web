import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useStore() {
  const [storeId, setStoreId]     = useState<string | null>(null)
  const [orgId, setOrgId]         = useState<string | null>(null)
  const [storeName, setStoreName] = useState<string | null>(null)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('organisation_id')
        .eq('id', user.id)
        .single()

      if (!profile) { setLoading(false); return }

      const { data: store } = await supabase
        .from('stores')
        .select('id, name, organisation_id')
        .eq('organisation_id', profile.organisation_id)
        .eq('is_active', true)
        .limit(1)
        .single()

      if (store) {
        setStoreId(store.id)
        setOrgId(store.organisation_id)
        setStoreName(store.name)
      }
      setLoading(false)
    }
    load()
  }, [])

  return { storeId, orgId, storeName, loading }
}
