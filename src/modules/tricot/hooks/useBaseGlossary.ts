import { useEffect, useState } from 'react'
import { useApi } from '@/app/ApiContext'
import type { Api } from '@/api'
import { EMPTY_GLOSSARY, sanitizeBaseGlossary, type BaseGlossary } from '../lib/glossary'

/** Copie gardée sur le téléphone : le glossaire sert aussi hors ligne. */
const STORAGE_KEY = 'life:tricot:glossaire'

/** Un chargement par appli (et par client, pour les tests). */
const loads = new WeakMap<Api, Promise<BaseGlossary>>()

function storedGlossary(): BaseGlossary {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? sanitizeBaseGlossary(JSON.parse(raw)) : EMPTY_GLOSSARY
  } catch {
    return EMPTY_GLOSSARY
  }
}

function load(api: Api): Promise<BaseGlossary> {
  let pending = loads.get(api)
  if (!pending) {
    pending = api.knitting.getGlossary().then((glossary) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(glossary))
      } catch {
        // Stockage plein ou indisponible : le glossaire sera relu au prochain lancement.
      }
      return glossary
    })
    // Échec (hors ligne) : on réessaiera au prochain affichage.
    pending.catch(() => loads.delete(api))
    loads.set(api, pending)
  }
  return pending
}

/** Glossaire des abréviations classiques (en base), avec la copie du téléphone en attendant ou sans réseau. */
export function useBaseGlossary(): BaseGlossary {
  const api = useApi()
  const [glossary, setGlossary] = useState(storedGlossary)
  useEffect(() => {
    let stopped = false
    load(api).then(
      (loaded) => !stopped && setGlossary(loaded),
      () => undefined,
    )
    return () => {
      stopped = true
    }
  }, [api])
  return glossary
}
