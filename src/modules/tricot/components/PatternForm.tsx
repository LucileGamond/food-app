// Formulaire d'un patron de la bibliothèque (ajout et modification) : ses formats (PDF, photos, lien), puis ce qui
// aide à le retrouver (taille, envie, besoins, laine envisagée, notes).

import { FileText, ImagePlus, Loader2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useSignedUrls } from '@/hooks/useSignedUrls'
import { ACCEPTED_IMAGE_TYPES, compressImage } from '@/lib/image'
import { usePatternFiles } from '../hooks/usePatternFiles'
import { EMPTY_PATTERN_DRAFT, fileCount, linkAdditions, MAX_PATTERN_PHOTOS, parsePatternDraft, titleFromFile, toPatternDraft, WISHES, type KnitPattern, type PatternDraft, type PatternLink, type PatternWish } from '../lib/library'
import { MAX_PDF_BYTES } from '../lib/pattern'
import { PatternLinkField } from './PatternLinkField'
import { PatternThumbs } from './PatternThumbs'

interface Props {
  /** Patron modifié ; null pour en ajouter un. */
  existing: KnitPattern | null
  /** Lien partagé depuis le téléphone : prérempli, puis lu tout de suite. */
  initialLink?: { url: string; title: string | null } | null
  onSaved: (id: string) => void
}

export function PatternForm({ existing, initialLink = null, onSaved }: Props) {
  const api = useApi()
  const [draft, setDraft] = useState<PatternDraft>(() =>
    existing ? toPatternDraft(existing) : { ...EMPTY_PATTERN_DRAFT, url: initialLink?.url ?? '', title: initialLink?.title ?? '' },
  )
  const { files, newPhotoPreviews, choosePdf, removePdf, addPhotos, removePhoto } = usePatternFiles(existing)
  const savedUrls = useSignedUrls(api.knitting.progressPhotoUrls, files.photos)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [preparing, setPreparing] = useState(false)

  const change = (patch: Partial<PatternDraft>) => setDraft((d) => ({ ...d, ...patch }))
  /** Nom proposé d'après le premier fichier choisi, s'il n'y en a pas encore. */
  const suggestTitle = (name: string) => setDraft((d) => (d.title.trim() ? d : { ...d, title: titleFromFile(name) }))
  const count = fileCount(files)

  async function onPhotos(list: FileList | null) {
    const chosen = [...(list ?? [])]
    if (chosen.length === 0) return
    if (count.photos + chosen.length > MAX_PATTERN_PHOTOS) return setError(`${MAX_PATTERN_PHOTOS} photos au plus.`)
    setError(null)
    setPreparing(true)
    try {
      addPhotos(await Promise.all(chosen.map((file) => compressImage(file))))
      suggestTitle(chosen[0]!.name)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setPreparing(false)
    }
  }

  /** Ajoute au patron ce que le lien a donné, sans rien remplacer ; renvoie ce qu'il faut en dire. */
  async function applyLink(link: PatternLink): Promise<string> {
    const added = linkAdditions(link, { title: draft.title, files })
    if (added.title) change({ title: added.title })
    if (added.pdf) choosePdf(added.pdf)
    if (added.image) addPhotos([await compressImage(added.image)])
    return added.message
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (files.newPdf && files.newPdf.size > MAX_PDF_BYTES) return setError('PDF trop lourd (20 Mo au plus).')
    const parsed = parsePatternDraft(draft, files)
    if ('error' in parsed) return setError(parsed.error)
    setError(null)
    setSaving(true)
    try {
      onSaved(await api.knitting.savePattern(parsed.fields, files, existing))
    } catch (e) {
      setError(errorMessage(e))
      setSaving(false)
    }
  }

  const pdfName = files.newPdf?.name ?? (files.pdfPath ? 'PDF du patron' : null)

  return (
    <form onSubmit={(e) => void submit(e)} className="max-w-lg space-y-4" noValidate>
      <div className="grid gap-1.5">
        <Label htmlFor="pattern-title">Nom du patron</Label>
        <Input id="pattern-title" className="h-10" maxLength={200} value={draft.title} onChange={(e) => change({ title: e.target.value })} placeholder="Pull Bergamote" />
      </div>

      <fieldset className="space-y-3 rounded-2xl border p-4">
        <legend className="px-1 text-sm font-medium">Le patron</legend>
        <p className="-mt-1 text-xs text-muted-foreground">Un PDF, des photos (magazine, livre) ou un lien : au moins l’un des trois.</p>

        <div className="grid gap-1.5">
          <Label htmlFor="pattern-pdf">PDF</Label>
          {pdfName ? (
            <p className="flex items-center gap-2 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{pdfName}</span>
              <Button type="button" variant="ghost" size="icon-touch" aria-label="Retirer le PDF" onClick={removePdf}>
                <X />
              </Button>
            </p>
          ) : (
            <Input
              id="pattern-pdf"
              type="file"
              accept="application/pdf,.pdf"
              className="h-10"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                choosePdf(file)
                suggestTitle(file.name)
              }}
            />
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="pattern-photos">Photos</Label>
          {count.photos > 0 && (
            <PatternThumbs
              label="Photos du patron"
              thumbs={[...files.photos.map((path) => ({ key: path, url: savedUrls[path] })), ...newPhotoPreviews.map((p) => ({ key: p.key, url: p.url }))]}
              onRemove={removePhoto}
            />
          )}
          {count.photos < MAX_PATTERN_PHOTOS && (
            <label
              htmlFor="pattern-photos"
              className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-muted/50 focus-within:ring-3 focus-within:ring-ring/50"
            >
              {preparing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
              {count.photos > 0 ? 'Ajouter des photos' : 'Choisir des photos'}
              <input id="pattern-photos" type="file" multiple accept={ACCEPTED_IMAGE_TYPES.join(',')} className="sr-only" onChange={(e) => void onPhotos(e.target.files)} />
            </label>
          )}
        </div>

        <PatternLinkField value={draft.url} onChange={(url) => change({ url })} onRead={applyLink} readOnMount={!!initialLink} />
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="pattern-size">Taille visée</Label>
          <Input id="pattern-size" className="h-10" maxLength={40} value={draft.size} onChange={(e) => change({ size: e.target.value })} placeholder="M, 4 ans…" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pattern-wish">Envie</Label>
          <NativeSelect id="pattern-wish" value={draft.wish === null ? '' : String(draft.wish)} onChange={(e) => change({ wish: e.target.value ? (Number(e.target.value) as PatternWish) : null })}>
            {WISHES.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
            <option value="">Pas d’envie notée</option>
          </NativeSelect>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="pattern-meters">Métrage nécessaire (m)</Label>
          <Input id="pattern-meters" inputMode="numeric" className="h-10" value={draft.metersNeeded} onChange={(e) => change({ metersNeeded: e.target.value })} placeholder="600" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pattern-needle">Aiguilles (mm)</Label>
          <Input id="pattern-needle" inputMode="decimal" className="h-10" value={draft.needleMm} onChange={(e) => change({ needleMm: e.target.value })} placeholder="4" />
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">Facultatif : sert à retrouver ce patron depuis une laine de ton stock.</p>
      <div className="grid gap-1.5">
        <Label htmlFor="pattern-yarn">Laine envisagée</Label>
        <Input id="pattern-yarn" className="h-10" maxLength={200} value={draft.yarnIdea} onChange={(e) => change({ yarnIdea: e.target.value })} placeholder="Restes de mérinos bleu" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pattern-notes">Notes</Label>
        <Textarea id="pattern-notes" maxLength={2000} value={draft.notes} onChange={(e) => change({ notes: e.target.value })} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="h-10" disabled={saving || preparing}>
        {saving && <Loader2 className="animate-spin" aria-hidden />}
        Enregistrer
      </Button>
    </form>
  )
}
