import { Camera, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { PendingLink } from '@/lib/recipes'

interface Props {
  open: boolean
  references: PendingLink[]
  onOpenChange: (open: boolean) => void
  onImport: (reference: PendingLink) => void
  onLink: (reference: PendingLink) => void
}

/** Après l'enregistrement : les recettes auxquelles renvoie la recette, à importer ou à lier. */
export function LinkedRecipesOffer({ open, references, onOpenChange, onImport, onLink }: Props) {
  return (
    <Dialog open={open && references.length > 0} onOpenChange={onOpenChange}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Recettes liées</DialogTitle>
          <DialogDescription>
            {references.length > 1 ? 'Cette recette utilise d’autres recettes du livre.' : 'Cette recette utilise une autre recette du livre.'}
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-lg border" aria-label="Recettes à importer">
          {references.map((reference) => (
            <li key={reference.position} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span className="min-w-0 text-sm">
                <span className="font-medium">{reference.name}</span>
                <span className="text-muted-foreground"> · {reference.page}</span>
              </span>
              <span className="flex gap-2">
                <Button variant="outline" size="sm" aria-label={`Lier ${reference.name} à une recette existante`} onClick={() => onLink(reference)}>
                  <Link2 /> Lier
                </Button>
                <Button size="sm" aria-label={`Importer ${reference.name}`} onClick={() => onImport(reference)}>
                  <Camera /> Importer
                </Button>
              </span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" className="h-10" onClick={() => onOpenChange(false)}>
            Plus tard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
