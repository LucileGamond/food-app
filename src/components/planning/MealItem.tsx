import { useDraggable } from '@dnd-kit/core'
import { BookmarkCheck, BookmarkPlus, Copy, MoreHorizontal, MoveRight, Pencil, Trash2, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LinkifiedText } from '@/components/LinkifiedText'
import { peopleLabel, type Meal, type Profile } from '@/lib/meals'
import { cn } from '@/lib/utils'

export type MealAction = 'edit' | 'move' | 'duplicate' | 'save' | 'delete'

interface Props {
  meal: Meal
  profiles: Profile[]
  disabled?: boolean
  onAction: (action: MealAction, meal: Meal) => void
}

export function MealItem({ meal, profiles, disabled, onAction }: Props) {
  const move = useDraggable({ id: `move:${meal.id}`, data: { meal, mode: 'move' }, disabled })
  const copy = useDraggable({ id: `copy:${meal.id}`, data: { meal, mode: 'copy' }, disabled })
  const { recipe } = meal
  const details = [recipe.notes, recipe.url].filter(Boolean).join('\n')

  return (
    <li
      ref={move.setNodeRef}
      // Appui long (tactile) ou glisser (souris) pour déplacer ; au clavier : menu « Déplacer… ».
      {...move.listeners}
      data-testid="meal-item"
      className={cn(
        'group relative flex touch-manipulation items-start gap-2 rounded-lg border bg-background p-3 shadow-xs transition-shadow select-none hover:shadow-sm',
        move.isDragging && 'opacity-40',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5">
          {recipe.is_saved ? (
            <>
              <BookmarkCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-label="Recette sauvegardée" />
              <Link
                to={`/recettes/${recipe.id}`}
                className="font-medium leading-snug hover:underline"
                onPointerDown={(e) => e.stopPropagation()}
              >
                {recipe.title}
              </Link>
            </>
          ) : (
            <span className="font-medium leading-snug">{recipe.title}</span>
          )}
        </div>
        {!recipe.is_saved && details && (
          <LinkifiedText text={details} className="mt-1 line-clamp-3 block text-sm text-muted-foreground" />
        )}
        {profiles.length > 0 && (
          <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="size-3" aria-hidden />
            {peopleLabel(meal.people, profiles)}
          </p>
        )}
      </div>

      <div
        className="flex shrink-0 items-center"
        // Les boutons ne doivent pas déclencher le déplacement du repas entier.
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button
          ref={copy.setNodeRef}
          type="button"
          {...copy.attributes}
          {...copy.listeners}
          aria-label={`Glisser pour dupliquer ${recipe.title}`}
          title="Glisser pour dupliquer"
          disabled={disabled}
          className="flex size-9 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing"
        >
          <Copy className="size-4" aria-hidden />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-lg" aria-label={`Actions pour ${recipe.title}`} disabled={disabled} />}
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => onAction('edit', meal)}>
              <Pencil /> Modifier
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction('move', meal)}>
              <MoveRight /> Déplacer…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction('duplicate', meal)}>
              <Copy /> Dupliquer…
            </DropdownMenuItem>
            {!recipe.is_saved && (
              <DropdownMenuItem onClick={() => onAction('save', meal)}>
                <BookmarkPlus /> Sauvegarder la recette
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onAction('delete', meal)}>
              <Trash2 /> Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}
