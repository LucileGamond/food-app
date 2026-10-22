import { Loader2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  children?: ReactNode
  confirmLabel: string
  confirmDisabled?: boolean
  onConfirm: () => Promise<void>
}

export function ConfirmDialog({ open, onOpenChange, title, description, children, confirmLabel, confirmDisabled, onConfirm }: Props) {
  const [running, setRunning] = useState(false)

  async function confirm() {
    setRunning(true)
    try {
      await onConfirm()
    } finally {
      setRunning(false)
      onOpenChange(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !running && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel className="h-10" disabled={running}>
            Annuler
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" className="h-10" onClick={() => void confirm()} disabled={running || confirmDisabled}>
            {running && <Loader2 className="animate-spin" aria-hidden />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
