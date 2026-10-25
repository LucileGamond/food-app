import { Checkbox } from '@/components/ui/checkbox'
import { formatAmount, type ShoppingItem } from '@/lib/shopping'
import { cn } from '@/lib/utils'

interface Props {
  item: ShoppingItem
  onToggle: (item: ShoppingItem) => void
  onEdit: (item: ShoppingItem) => void
}

/** Un article : grande case à cocher (pris / pas pris) ; le reste de la ligne ouvre la modification. */
export function ShoppingItemRow({ item, onToggle, onEdit }: Props) {
  const amount = formatAmount(item)
  return (
    <li data-testid="shopping-item" className="flex min-h-12 items-center gap-1">
      <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
        <Checkbox checked={item.checked} onCheckedChange={() => onToggle(item)} aria-label={`${item.checked ? 'Décocher' : 'Cocher'} « ${item.name} »`} className="size-5" />
      </label>
      <button
        type="button"
        onClick={() => onEdit(item)}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-left hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span className={cn('min-w-0 flex-1 truncate', item.checked && 'text-muted-foreground line-through')}>
          <span className="sr-only">Modifier</span> {item.name}
        </span>
        {amount && <span className={cn('shrink-0 text-sm tabular-nums text-muted-foreground', item.checked && 'line-through')}>{amount}</span>}
      </button>
    </li>
  )
}
