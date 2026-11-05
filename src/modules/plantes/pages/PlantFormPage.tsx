import { ArrowLeft, Loader2, SearchX } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/EmptyState'
import { LoadError } from '@/components/LoadError'
import { useApi } from '@/app/ApiContext'
import { errorMessage } from '@/api'
import { compressImage } from '@/lib/image'
import { PlantPhotos } from '../components/PlantPhotos'
import { RulesEditor } from '../components/RulesEditor'
import { hasFormErrors, toFormValues, toPlantFormOutput, validatePlantForm, type PlantField, type PlantFormValues } from '../lib/form'
import { sortedPhotos, type Plant } from '../lib/plants'
import { locations } from '../lib/status'
import { usePhotoDrafts } from '../hooks/usePhotoDrafts'
import { usePlantDetail, usePlantPhotoUrls, usePlantsOverview, usePlantsToday } from '../hooks/usePlants'

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border bg-background p-5 shadow-xs" aria-labelledby={id}>
      <div>
        <h2 id={id} className="font-semibold tracking-tight">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  return message ? (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  ) : null
}

/** Ajout ou modification d'une plante : fiche, photos et règles d'arrosage. */
export function PlantFormPage({ today: fixedToday }: { today?: string }) {
  const { id } = useParams()
  const today = usePlantsToday(fixedToday)
  return id ? <EditPlant id={id} today={today} /> : <PlantForm plant={null} today={today} />
}

function EditPlant({ id, today }: { id: string; today: string }) {
  const { detail, error, reload } = usePlantDetail(id)
  if (error) return <LoadError message={error} onRetry={reload} />
  if (!detail) return <Skeleton className="h-96 w-full" aria-busy="true" aria-label="Chargement de la plante" />
  if (!detail.plant) return <EmptyState icon={SearchX} title="Plante introuvable" description="Elle a peut-être été supprimée." />
  // Formulaire initialisé une fois : une modification faite ailleurs entre-temps ne l'écrase pas.
  return <PlantForm key={detail.plant.id} plant={detail.plant} today={today} />
}

function PlantForm({ plant, today }: { plant: Plant | null; today: string }) {
  const api = useApi()
  const navigate = useNavigate()
  const { overview } = usePlantsOverview(today)
  const [values, setValues] = useState<PlantFormValues>(() => toFormValues(plant))
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  // Plante créée mais photos non envoyées (erreur) : le nouvel essai la met à jour au lieu d'en créer une autre.
  const [savedId, setSavedId] = useState(plant?.id ?? null)
  const photos = usePhotoDrafts(plant ? sortedPhotos(plant) : [])
  const urls = usePlantPhotoUrls(plant ? sortedPhotos(plant).map((p) => p.storage_path) : [])

  const errors = validatePlantForm(values)
  const shown = submitted ? errors : { fields: {}, rules: [] }
  const set = <K extends PlantField>(key: K, value: string) => setValues((v) => ({ ...v, [key]: value }))
  const field = (key: PlantField, errorId: string) => ({
    value: values[key],
    onChange: (e: { target: { value: string } }) => set(key, e.target.value),
    'aria-invalid': Boolean(shown.fields[key]),
    'aria-describedby': shown.fields[key] ? errorId : undefined,
  })
  const places = overview ? locations(overview.plants) : []
  const backTo = plant ? `/plantes/${plant.id}` : '/plantes'

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (hasFormErrors(errors)) return
    const output = toPlantFormOutput(values)
    setSaving(true)
    try {
      const id = await api.plants.savePlant(output.plant, output.rules, savedId ?? undefined)
      setSavedId(id)
      for (const photo of photos.removed) await api.plants.deletePhoto(photo)
      photos.clearRemoved()
      const ordered: string[] = []
      for (const draft of photos.drafts) {
        if (draft.kind === 'saved') {
          ordered.push(draft.photo.id)
          continue
        }
        const uploaded = await api.plants.uploadPhoto(id, await compressImage(draft.file))
        photos.markUploaded(draft.key, uploaded)
        ordered.push(uploaded.id)
      }
      if (ordered.length > 1) await api.plants.reorderPhotos(ordered)
      toast.success(plant ? 'Plante modifiée' : 'Plante ajoutée')
      navigate(`/plantes/${id}`, { replace: true })
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link to={backTo} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> {plant ? 'Retour à la fiche' : 'Plantes'}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{plant ? `Modifier ${plant.name}` : 'Nouvelle plante'}</h1>
      </div>

      <Section id="infos-heading" title="Informations">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="plant-name">Nom</Label>
            <Input id="plant-name" className="h-10" autoComplete="off" placeholder="Ex. Cactus du salon" {...field('name', 'name-error')} />
            <FieldError id="name-error" message={shown.fields.name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plant-species">Espèce</Label>
            <Input id="plant-species" className="h-10" placeholder="Ex. Echinocactus grusonii" {...field('species', 'species-error')} />
            <FieldError id="species-error" message={shown.fields.species} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plant-location">Emplacement</Label>
            <Input id="plant-location" className="h-10" list="plant-locations" placeholder="Ex. Salon, balcon…" {...field('location', 'location-error')} />
            <datalist id="plant-locations">
              {places.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            <FieldError id="location-error" message={shown.fields.location} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plant-planted-on">Date de plantation</Label>
            <Input id="plant-planted-on" type="date" className="h-10" {...field('planted_on', 'planted-on-error')} />
            <FieldError id="planted-on-error" message={shown.fields.planted_on} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="plant-height">Taille (cm)</Label>
              <Input id="plant-height" inputMode="decimal" className="h-10" {...field('planted_height_cm', 'height-error')} />
              <FieldError id="height-error" message={shown.fields.planted_height_cm} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plant-pot">Pot (Ø cm)</Label>
              <Input id="plant-pot" inputMode="decimal" className="h-10" {...field('pot_diameter_cm', 'pot-error')} />
              <FieldError id="pot-error" message={shown.fields.pot_diameter_cm} />
            </div>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="plant-notes">Notes</Label>
            <Textarea id="plant-notes" rows={3} placeholder="Exposition, engrais, rempotage…" {...field('notes', 'notes-error')} />
            <FieldError id="notes-error" message={shown.fields.notes} />
          </div>
        </div>
      </Section>

      <Section id="photos-heading" title="Photos" description="La première photo est la photo principale.">
        <PlantPhotos drafts={photos.drafts} urls={urls} onAdd={photos.add} onRemove={photos.remove} onMakeMain={photos.makeMain} />
      </Section>

      <Section id="rules-heading" title="Arrosage" description="Une règle par période de l’année : mois concernés, date du 1er arrosage, fréquence et quantité.">
        <RulesEditor rules={values.rules} errors={shown.rules} onChange={(rules) => setValues((v) => ({ ...v, rules }))} today={today} />
      </Section>

      {submitted && hasFormErrors(errors) && (
        <p role="alert" className="text-sm text-destructive">
          Certains champs sont à corriger.
        </p>
      )}

      <div className="sticky bottom-20 z-20 flex justify-end gap-2 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur md:bottom-4">
        <Link to={backTo} className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium hover:bg-muted">
          Annuler
        </Link>
        <Button type="submit" className="h-10 min-w-32" disabled={saving}>
          {saving && <Loader2 className="animate-spin" aria-hidden />}
          Enregistrer
        </Button>
      </div>
    </form>
  )
}
