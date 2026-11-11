import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { abbreviationParts, type Abbreviation } from '../lib/glossary'

/** Texte simple : ses abréviations deviennent des boutons qui en donnent le sens. */
export function Glossed({ text, glossary }: { text: string; glossary: Abbreviation[] }) {
  if (glossary.length === 0) return <>{text}</>
  return (
    <>
      {abbreviationParts(text, glossary).map((part, i) =>
        part.kind === 'text' ? (
          part.text
        ) : (
          <Popover key={i}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label={`${part.text} : explication`}
                  className="rounded underline decoration-brand/60 decoration-dotted underline-offset-4 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                />
              }
            >
              {part.text}
            </PopoverTrigger>
            <PopoverContent className="w-64">
              <p className="font-medium">{part.text}</p>
              <p className="text-muted-foreground">{part.meaning}</p>
            </PopoverContent>
          </Popover>
        ),
      )}
    </>
  )
}
