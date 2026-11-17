// « Des idées pour ma laine » (stock de laine) : idées du modèle pour une laine, ou plusieurs laines associées, selon
// une envie (quelques dixièmes de centime), avec de vrais patrons de Ravelry pour chacune (gratuit). Une idée sans
// patron Ravelry peut en chercher sur internet avec le modèle. Les idées sont gardées pour être revues sans repayer,
// et un patron trouvé peut être gardé dans la bibliothèque (ajout par lien, sans l'IA).

import { BookmarkPlus, Loader2 } from 'lucide-react'
import { AiIcon } from '@/components/AiIcon'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAsync } from '@/hooks/useAsync'
import { formatShortDate } from '@/lib/dates'
import type { NavState } from '@/lib/navState'
import { decimal } from '@/lib/text'
import { LinkIcon, SearchIcon } from './KnitIcons'
import { ideaFit, ideasKey, MAX_IDEA_YARNS, MAX_WISH, patternNote, siteOf, stashMeters, yarnTitle, type StashIdeas, type StashItem, type YarnIdea } from '../lib/yarn'
import { patternSearchUrl } from '../lib/ravelry'

/** Coûts estimés (Haiku, recherche web à 1 ct), affichés avant de lancer. Ravelry est gratuit. */
export const IDEAS_COST = '≈ 0,1 ct'
export const PATTERNS_COST = '≈ 2 ct'

const now = () => new Date().toISOString()

interface Props {
  item: StashItem
  /** Tout le stock : laines à associer. */
  stash: StashItem[]
  /** Aucun patron de la bibliothèque ne convient : le bouton est mis en avant. */
  emphasize: boolean
}

export function YarnIdeasSection({ item, stash, emphasize }: Props) {
  const api = useApi()
  const [others, setOthers] = useState<string[]>([])
  const [wish, setWish] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Idées obtenues ou modifiées ici (plus récentes que celles gardées). */
  const [fresh, setFresh] = useState<StashIdeas | null>(null)
  /** Idées dont on cherche les patrons, et celles pour lesquelles rien n'a été trouvé. */
  const [searching, setSearching] = useState<string[]>([])
  const [noneFound, setNoneFound] = useState<string[]>([])

  const chosen = [item, ...stash.filter((s) => s.id !== item.id && others.includes(s.id))]
  const yarns = chosen.map((s) => s.yarn)
  const key = ideasKey(chosen.map((s) => s.id)).join(',')
  const saved = useAsync(async () => ({ key, value: await api.knitting.getStashIdeas(chosen.map((s) => s.id)) }), [api, key])
  const current = fresh && fresh.stashIds.join(',') === key ? fresh : saved.data?.key === key ? saved.data.value : null
  const available = stashMeters(yarns)
  const combinable = stash.filter((s) => s.id !== item.id)
  /** Laines de l'idée, notées sur le patron gardé. */
  const ideaYarnText = yarns.map(yarnTitle).join(' + ')
  /** Sans compte Ravelry relié, les idées n'ont pas de patrons : on le rappelle (erreur de lecture : rien). */
  const ravelry = useAsync(() => api.knitting.getRavelryAccount(), [api])
  const ravelryMissing = ravelry.data === null

  // Dernières idées connues, à jour dès qu'elles changent (une recherche de patrons qui répond après une autre part d'elles)
  const latest = useRef(current)
  useEffect(() => {
    latest.current = current
  }, [current])

  async function keep(value: StashIdeas) {
    latest.current = value
    setFresh(value)
    try {
      await api.knitting.saveStashIdeas(value)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  async function ask() {
    setLoading(true)
    setError(null)
    setNoneFound([])
    try {
      const { ideas, weight } = await api.knitting.yarnIdeas(yarns, { wish })
      await keep({ stashIds: ideasKey(chosen.map((s) => s.id)), wish: wish.trim(), ideas, weight, updatedAt: now() })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  async function findPatterns(ideas: StashIdeas, idea: YarnIdea) {
    setSearching((list) => [...list, idea.title])
    setError(null)
    try {
      const patterns = await api.knitting.ideaPatterns(idea, yarns, ideas.weight)
      if (patterns.length === 0) setNoneFound((list) => [...list, idea.title])
      // Sur les idées du moment (une autre recherche a pu répondre entre-temps), pas sur celles du clic
      const base = latest.current && latest.current.stashIds.join(',') === ideas.stashIds.join(',') ? latest.current : ideas
      await keep({ ...base, ideas: base.ideas.map((i) => (i.title === idea.title ? { ...i, patterns } : i)) })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSearching((list) => list.filter((t) => t !== idea.title))
    }
  }

  function toggle(id: string, checked: boolean) {
    setOthers((list) => (checked ? [...list, id] : list.filter((o) => o !== id)))
  }

  return (
    <section aria-labelledby="match-ideas" className="space-y-3">
      <h3 id="match-ideas" className="text-sm font-medium">
        Des idées
      </h3>

      {combinable.length > 0 && (
        <fieldset className="space-y-1.5">
          <legend className="text-sm text-muted-foreground">Avec d’autres laines du stock</legend>
          {combinable.map((s) => {
            const checked = others.includes(s.id)
            return (
              <span key={s.id} className="flex items-center gap-2">
                <Checkbox
                  id={`ideas-with-${s.id}`}
                  checked={checked}
                  disabled={loading || (!checked && chosen.length >= MAX_IDEA_YARNS)}
                  onCheckedChange={(value) => toggle(s.id, value === true)}
                />
                <Label htmlFor={`ideas-with-${s.id}`} className="font-normal">
                  {yarnTitle(s.yarn)}
                  {s.yarn.color && <span className="text-muted-foreground"> · {s.yarn.color}</span>}
                </Label>
              </span>
            )
          })}
        </fieldset>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="ideas-wish">Envie de…</Label>
        <Input
          id="ideas-wish"
          className="h-10"
          value={wish}
          maxLength={MAX_WISH}
          disabled={loading}
          placeholder="un pull, pour bébé, vite fait…"
          onChange={(e) => setWish(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button variant={emphasize && !current ? 'default' : 'outline'} className="h-10" disabled={loading} onClick={() => void ask()}>
          {loading ? <Loader2 className="animate-spin" aria-hidden /> : <AiIcon />}
          {loading ? 'Recherche d’idées…' : current ? 'Relancer' : 'Des idées avec l’IA'}
        </Button>
        <span className="text-xs text-muted-foreground">{IDEAS_COST}{ravelryMissing ? '' : ' · patrons de Ravelry gratuits'}</span>
      </div>

      {ravelryMissing && (
        <p className="text-xs text-muted-foreground">
          Pour de vrais patrons à chaque idée (gratuit),{' '}
          <Link to="/reglages" className="font-medium text-brand underline-offset-4 hover:underline">
            relie ton compte Ravelry dans les Réglages
          </Link>
          .
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {current && (
        <>
          <p className="text-xs text-muted-foreground">
            Idées du {formatShortDate(current.updatedAt.slice(0, 10))}
            {current.wish && ` · envie : ${current.wish}`}
          </p>
          <ul aria-label="Idées de modèles" className="space-y-2">
            {current.ideas.map((idea) => {
              const fit = ideaFit(idea.meters, yarns)
              const busy = searching.includes(idea.title)
              return (
                <li key={idea.title} className="rounded-xl border p-3 text-sm">
                  <p>
                    <span className="knit-name">{idea.title}</span>
                    {idea.size && <span className="font-normal text-muted-foreground"> · {idea.size}</span>}
                  </p>
                  <p className="text-muted-foreground">
                    {[idea.why, idea.meters !== null && `≈ ${idea.meters} m`, idea.needleMm !== null && `aiguilles ${decimal(idea.needleMm)} mm`].filter(Boolean).join(' · ')}
                  </p>
                  {fit && (
                    // Ambre comme « À préparer » du module : lisible sur les fonds écru (contraste AA).
                    <Badge variant={fit.enough ? 'secondary' : 'outline'} className={fit.enough ? 'mt-1' : 'mt-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'}>
                      {fit.label}
                    </Badge>
                  )}

                  {idea.patterns.length > 0 ? (
                    <ul aria-label={`Patrons trouvés : ${idea.title}`} className="mt-2 space-y-1.5">
                      {idea.patterns.map((p) => {
                        const note = patternNote(p)
                        return (
                          <li key={p.url} className="flex items-start gap-2">
                            <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 flex-1 items-start gap-1 font-medium text-brand underline-offset-4 hover:underline">
                              <LinkIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                              <span>
                                {p.title} <span className="font-normal text-muted-foreground">· {[siteOf(p.url), note].filter(Boolean).join(' · ')}</span>
                              </span>
                            </a>
                            <Link
                              to="/tricot/patrons/nouveau"
                              state={{ patternLink: { url: p.url, title: p.title, yarnIdea: ideaYarnText, metersNeeded: idea.meters, needleMm: idea.needleMm } } satisfies NavState}
                              aria-label={`Garder ${p.title} dans ma bibliothèque`}
                              className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
                            >
                              <BookmarkPlus className="size-3.5" aria-hidden /> Garder
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  ) : noneFound.includes(idea.title) ? (
                    <p className="mt-2 text-muted-foreground">Aucun patron trouvé sur internet.</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-x-2">
                      <span className="text-muted-foreground">{ravelryMissing ? 'Pas de patron.' : 'Rien sur Ravelry.'}</span>
                      <Button variant="outline" size="sm" disabled={busy} onClick={() => void findPatterns(current, idea)} aria-label={`Chercher sur internet : ${idea.title}`}>
                        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <SearchIcon />}
                        {busy ? 'Recherche…' : 'Chercher sur internet'}
                      </Button>
                      <span className="text-xs text-muted-foreground">{PATTERNS_COST}</span>
                    </div>
                  )}

                  {idea.search && (
                    <a
                      href={patternSearchUrl(idea.search, { weight: current.weight, meters: available, needleMm: item.yarn.needle_mm })}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:underline"
                    >
                      <LinkIcon className="size-3.5" aria-hidden /> Plus de patrons sur Ravelry
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
