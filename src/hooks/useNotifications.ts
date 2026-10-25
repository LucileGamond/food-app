import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage, type Api } from '@/api'
import { currentDevicePush, PushPermissionError, pushRegistration, subscribeDevice, unsubscribeDevice, type PushStatus } from '@/lib/push'

export interface NotificationsState {
  status: PushStatus | 'loading'
  busy: boolean
  enable: () => Promise<void>
  disable: () => Promise<void>
}

/** Notifications des listes de courses sur cet appareil. */
export function useNotifications(api: Api): NotificationsState {
  const [status, setStatus] = useState<NotificationsState['status']>('loading')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const registration = await pushRegistration()
        let next: PushStatus
        if (!registration) next = 'unsupported'
        else if (Notification.permission === 'denied') next = 'denied'
        else {
          const device = await currentDevicePush(registration)
          next = device && (await api.push.isSubscribed(device.endpoint)) ? 'on' : 'off'
        }
        if (active) setStatus(next)
      } catch {
        if (active) setStatus('off')
      }
    })()
    return () => {
      active = false
    }
  }, [api])

  const enable = useCallback(async () => {
    setBusy(true)
    try {
      const registration = await pushRegistration()
      if (!registration) return setStatus('unsupported')
      const device = await subscribeDevice(registration)
      await api.push.saveSubscription({ ...device, userAgent: navigator.userAgent })
      setStatus('on')
      toast.success('Notifications activées sur cet appareil')
    } catch (error) {
      if (error instanceof PushPermissionError) setStatus('denied')
      else toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }, [api])

  const disable = useCallback(async () => {
    setBusy(true)
    try {
      const registration = await pushRegistration()
      const endpoint = registration ? await unsubscribeDevice(registration) : null
      if (endpoint) await api.push.deleteSubscription(endpoint)
      setStatus('off')
      toast.success('Notifications désactivées sur cet appareil')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }, [api])

  return { status, busy, enable, disable }
}
