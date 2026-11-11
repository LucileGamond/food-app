import type { Abbreviation } from '../../lib/glossary'
import { describeEvent, type Upcoming } from '../../lib/guide'
import { Glossed } from '../Glossed'

/** « Ensuite » : les prochains rangs qui demandent quelque chose, et dans combien de rangs. */
export function UpcomingList({ items, glossary }: { items: Upcoming[]; glossary: Abbreviation[] }) {
  if (items.length === 0) return null
  return (
    <section aria-labelledby="upcoming" className="space-y-1">
      <h2 id="upcoming" className="text-sm font-medium">
        Ensuite
      </h2>
      <ol aria-labelledby="upcoming" className="divide-y text-sm">
        {items.map((item) => (
          <li key={item.row} className="flex items-baseline gap-3 py-2">
            <span className="w-16 shrink-0 text-muted-foreground tabular-nums">rang {item.row}</span>
            <span className="min-w-0 flex-1 space-y-0.5">
              {item.events.map((event, i) => (
                <span key={i} className="block">
                  <Glossed text={describeEvent(event)} glossary={glossary} />
                </span>
              ))}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">dans {item.inRows}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
