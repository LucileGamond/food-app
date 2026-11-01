import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { useNotifications, type NotificationsState } from '@/hooks/useNotifications'
import { DEFAULT_SETTINGS, type UserSettings } from '@/lib/settings'

export interface SettingsState {
  settings: UserSettings
  loading: boolean
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
  const latest = useRef(settings)

  useEffect(() => {
    let active = true
    api.settings
      .getSettings()
      .then((loaded) => {
        if (!active) return
        latest.current = loaded
        setSettings(loaded)
      })
      .catch((error: unknown) => {
        if (active) toast.error(errorMessage(error))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [api])

  const update = useCallback(
    async (patch: Partial<UserSettings>) => {
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
    [api],
  )

  const value = useMemo(() => ({ settings, loading, update, notifications }), [settings, loading, update, notifications])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsState {
  const value = useContext(SettingsContext)
  if (!value) throw new Error('useSettings doit être utilisé dans un SettingsProvider')
  return value
}
