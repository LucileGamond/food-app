import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Icône de l'IA (petites étoiles) : sur chaque bouton qui fait appel à l'IA, et seulement sur eux. Elle dit d'un coup
 * d'œil que le bouton lance une lecture, une proposition ou une réponse de l'IA (qui prend du temps et coûte un peu).
 */
export function AiIcon({ className }: { className?: string }) {
  return <Sparkles className={cn(className)} aria-hidden data-ai-icon="" />
}
