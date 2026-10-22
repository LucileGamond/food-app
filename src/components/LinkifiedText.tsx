import { linkify } from '@/lib/meals'
import { cn } from '@/lib/utils'

export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn('break-words whitespace-pre-line', className)}>
      {linkify(text).map((part, i) =>
        part.type === 'link' ? (
          <a
            key={i}
            href={part.value}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {part.value.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
          </a>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </span>
  )
}
