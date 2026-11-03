import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { useNotifications, type NotificationsState } from '@/hooks/useNotifications'
import { DEFAULT_SETTINGS, isPageEnabled, type PageKey, type UserSettings } from '@/lib/settings'

export interface SettingsState {
  settings: UserSettings
  loading: boolean
  /** Réglages lus en base : tant que ce n'est pas le cas, rien n'est masqué ni enregistré. */
  ready: boolean
  loadError: string | null
  reload: () => void
  /** Page affichée ? Vrai tant que les réglages ne sont pas chargés (rien n'est masqué par défaut). */
  isEnabled: (page: PageKey) => boolean
  /** Modifie les réglages (affichés tout de suite, rétablis si l'enregistrement échoue). */
  update: (patch: Partial<UserSettings>) => Promise<boolean>
  /** Notifications de cet appareil. */
  notifications: NotificationsState
}

const SettingsContext = createContext<SettingsState | null>(null)

/** Réglages de la personne connectée, partagés par la navigation et les écrans. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const api = useApi()
  const notifications = useNotifications(api)
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const latest = useRef(settings)

  useEffect(() => {
    let active = true
    api.settings
      .getSettings()
      .then((loaded) => {
        if (!active) return
        latest.current = loaded
        setSettings(loaded)
        setReady(true)
        setLoadError(null)
      })
      .catch((error: unknown) => {
        if (active) setLoadError(errorMessage(error))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [api, attempt])

  const reload = useCallback(() => {
    setLoading(true)
    setAttempt((n) => n + 1)
  }, [])

  const update = useCallback(
    async (patch: Partial<UserSettings>) => {
      // Sans les vrais réglages, enregistrer écraserait ceux de la base avec les valeurs par défaut.
      if (!ready) {
        toast.error('Réglages non chargés : réessaie dans un instant')
        return false
      }
      const previous = latest.current
      const next = { ...previous, ...patch }
      latest.current = next
      setSettings(next)
      try {
        await api.settings.saveSettings(next)
        return true
      } catch (error) {
        // Rétabli seulement si aucune autre modification n'a suivi.
        if (latest.current === next) {
          latest.current = previous
          setSettings(previous)
        }
        toast.error(errorMessage(error))
        return false
      }
    },
    [api, ready],
  )

  const isEnabled = useCallback((page: PageKey) => !ready || isPageEnabled(settings, page), [ready, settings])

  const value = useMemo(
    () => ({ settings, loading, ready, loadError, reload, isEnabled, update, notifications }),
    [settings, loading, ready, loadError, reload, isEnabled, update, notifications],
  )
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsState {
  const value = useContext(SettingsContext)
  if (!value) throw new Error('useSettings doit être utilisé dans un SettingsProvider')
  return value
}
