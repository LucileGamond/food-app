import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router-dom'
import { AppError } from '@/api'
import { fakeApi, renderWithApp } from '@/test/fakes'
import type { ReadPattern } from '../lib/pattern'
import type { MeasureProfile } from '../lib/sizing'
import { KnittingImportPage } from './KnittingImportPage'
import { KnittingMeasuresPage } from './KnittingMeasuresPage'

const LEA: MeasureProfile = { id: 'm1', name: 'Léa', measures: { chest: 92, waist: null, hip: 98, arm: null, head: null } }
const MOI: MeasureProfile = { id: 'm2', name: 'Moi', measures: { chest: 100, waist: null, hip: null, arm: null, head: null } }

const PATTERN: ReadPattern = {
  title: 'Pull Bergamote',
  sizes: ['S', 'M', 'L'],
  sizeIndex: 0,
  steps: [{ title: 'Dos', instructions: 'Monter 90 (100-110) m.', totalRows: 120, stitches: 90, sections: [] }],
  sizeChart: {
    kind: 'finished',
    easeCm: null,
    rows: [
      { label: 'Tour de poitrine', measure: 'chest', values: [92, 101, 110] },
      { label: 'Longueur totale', measure: 'other', values: [58, 60, null] },
    ],
  },
}

describe('fiches de mesures', () => {
  it('ajoute, modifie et supprime une fiche', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    renderWithApp(<KnittingMeasuresPage />, { api })
    expect(await screen.findByText(/Aucune fiche : note tes mesures/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tricot' })).toHaveAttribute('href', '/tricot')

    await user.click(screen.getByRole('button', { name: 'Nouvelle fiche' }))
    let dialog = await screen.findByRole('dialog', { name: 'Nouvelle fiche de mesures' })
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Indique le nom de la personne.')
    await user.type(within(dialog).getByLabelText('Pour qui'), 'Léa')
    await user.type(within(dialog).getByLabelText('Tour de poitrine (cm)'), '2')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Tour de poitrine : un nombre de cm entre 10 et 300.')
    await user.type(within(dialog).getByLabelText('Tour de poitrine (cm)'), '1,5')
    await user.type(within(dialog).getByLabelText('Tour de hanches (cm)'), '98')
    api.knitting.listMeasures.mockResolvedValue([LEA])
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveMeasures).toHaveBeenCalledWith({ id: null, name: 'Léa', measures: { chest: 21.5, waist: null, hip: 98, arm: null, head: null } })

    const list = await screen.findByRole('list', { name: 'Fiches de mesures' })
    expect(within(list).getByText('poitrine 92 · hanches 98 cm')).toBeInTheDocument()
    await user.click(within(list).getByRole('button', { name: 'Modifier la fiche de Léa' }))
    dialog = await screen.findByRole('dialog', { name: 'Modifier la fiche' })
    expect(within(dialog).getByLabelText('Tour de poitrine (cm)')).toHaveValue('92')
    await user.type(within(dialog).getByLabelText('Tour de tête (cm)'), '55')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveMeasures).toHaveBeenLastCalledWith({ id: 'm1', name: 'Léa', measures: { ...LEA.measures, head: 55 } })

    await user.click(within(list).getByRole('button', { name: 'Supprimer la fiche de Léa' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(api.knitting.deleteMeasures).toHaveBeenCalledWith('m1'))
  })

  it('signale un enregistrement impossible', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.saveMeasures.mockRejectedValue(new AppError('Impossible d’enregistrer la fiche de mesures.'))
    renderWithApp(<KnittingMeasuresPage />, { api })
    await user.click(await screen.findByRole('button', { name: 'Nouvelle fiche' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle fiche de mesures' })
    await user.type(within(dialog).getByLabelText('Pour qui'), 'Moi')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Impossible d’enregistrer la fiche de mesures.')).toBeInTheDocument()
    expect(dialog).toBeInTheDocument()
  })
})

describe('taille selon les mesures, après la lecture', () => {
  const pdf = new File(['%PDF-1.4'], 'bergamote.pdf', { type: 'application/pdf' })

  async function readPattern(api = fakeApi()) {
    const user = userEvent.setup()
    renderWithApp(<KnittingImportPage />, { api, route: '/tricot/nouveau', path: '/tricot/nouveau', extraRoutes: <Route path="/tricot/mesures" element={<p>Page des mesures</p>} /> })
    await user.upload(screen.getByLabelText('Patron (PDF)'), pdf)
    await user.click(screen.getByRole('button', { name: 'Lire le patron' }))
    return { user, card: await screen.findByRole('region', { name: 'Quelle taille pour qui ?' }) }
  }

  it('conseille une taille pour la fiche et l’aisance choisies, puis relit le patron pour elle', async () => {
    const api = fakeApi()
    api.knitting.listMeasures.mockResolvedValue([LEA, MOI])
    api.knitting.readPattern.mockResolvedValue(PATTERN)
    const { user, card } = await readPattern(api)
    expect(within(card).getByRole('table')).toHaveTextContent('Tour de poitrine9210111')
    // Léa, aisance classique (8 cm) : 100 cm visés → M
    const status = await within(card).findByRole('status')
    expect(status).toHaveTextContent('Taille conseillée : M')
    expect(status).toHaveTextContent('Tour de poitrine 92 cm + 8 cm d’aisance = 100 cm → M (101 cm fini, aisance réelle 9 cm).')
    // La plage est écrite sur le bouton (pas dans une infobulle de survol)
    expect(within(card).getByRole('button', { name: 'Classique 5 à 10 cm' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(card).getByText('Les rangs et mailles ont été comptés pour la taille S.')).toBeInTheDocument()

    // Ajusté : S, la taille lue, rien à relire
    await user.click(within(card).getByRole('button', { name: 'Ajusté 0 à 5 cm' }))
    expect(status).toHaveTextContent('Taille conseillée : S')
    expect(within(card).queryByRole('button', { name: /Relire/ })).not.toBeInTheDocument()
    // Aisance à soi : 18 cm pour moi → L
    await user.selectOptions(within(card).getByLabelText('Pour qui'), 'm2')
    await user.clear(within(card).getByLabelText('Aisance en cm'))
    await user.type(within(card).getByLabelText('Aisance en cm'), '9')
    expect(status).toHaveTextContent('Taille conseillée : L')
    expect(within(card).getByRole('button', { name: 'Classique 5 à 10 cm' })).toHaveAttribute('aria-pressed', 'false')

    await user.clear(screen.getByLabelText('Nom du projet'))
    await user.type(screen.getByLabelText('Nom du projet'), 'Pull de Noël')
    api.knitting.readPattern.mockResolvedValue({ ...PATTERN, sizeIndex: 2 })
    await user.click(within(card).getByRole('button', { name: 'Relire pour la taille L' }))
    expect(api.knitting.readPattern).toHaveBeenLastCalledWith(pdf, 'L')
    await waitFor(() => expect(screen.queryByRole('button', { name: /Relire/ })).not.toBeInTheDocument())
    expect(screen.getByLabelText('Nom du projet')).toHaveValue('Pull de Noël')
    expect(screen.getByLabelText('Taille')).toHaveDisplayValue('L')
  })

  it('tableau des mesures du corps : pas d’aisance à régler ; erreur de relecture lisible', async () => {
    const api = fakeApi()
    api.knitting.listMeasures.mockResolvedValue([MOI])
    api.knitting.readPattern.mockResolvedValue({ ...PATTERN, sizeChart: { kind: 'body', easeCm: null, rows: [{ label: 'Poitrine', measure: 'chest', values: [88, 94, 100] }] } })
    const { user, card } = await readPattern(api)
    expect(await within(card).findByRole('status')).toHaveTextContent('Tour de poitrine 100 cm → L (tableau du patron : 100 cm).')
    expect(within(card).queryByRole('group', { name: /Aisance/ })).not.toBeInTheDocument()
    api.knitting.readPattern.mockRejectedValueOnce(new AppError('La lecture du patron a échoué.'))
    await user.click(within(card).getByRole('button', { name: 'Relire pour la taille L' }))
    expect(await screen.findByText('La lecture du patron a échoué.')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Étapes lues' })).toBeInTheDocument()
  })

  it('aisance du patron par défaut ; fiche sans mesure utile ; sans fiche, renvoie vers les fiches', async () => {
    const api = fakeApi()
    api.knitting.listMeasures.mockResolvedValue([{ ...LEA, measures: { chest: null, waist: 70, hip: null, arm: null, head: null } }])
    api.knitting.readPattern.mockResolvedValue({ ...PATTERN, sizeChart: { ...PATTERN.sizeChart!, easeCm: 12 } })
    const { card } = await readPattern(api)
    expect(within(card).getByRole('group', { name: 'Aisance (patron : 12 cm)' })).toBeInTheDocument()
    expect(await within(card).findByLabelText('Aisance en cm')).toHaveValue('12')
    expect(await within(card).findByRole('status')).toHaveTextContent('Aucune mesure de la fiche ne correspond au tableau du patron')
  })

  it('sans fiche, renvoie vers les fiches de mesures', async () => {
    const api = fakeApi()
    api.knitting.readPattern.mockResolvedValue(PATTERN)
    const { user, card } = await readPattern(api)
    await user.click(await within(card).findByRole('link', { name: 'Fiches de mesures' }))
    expect(await screen.findByText('Page des mesures')).toBeInTheDocument()
  })

  it('fiches illisibles : message et nouvel essai', async () => {
    const api = fakeApi()
    api.knitting.listMeasures.mockRejectedValueOnce(new AppError('Impossible de charger les fiches de mesures.')).mockResolvedValue([LEA])
    api.knitting.readPattern.mockResolvedValue(PATTERN)
    const { user, card } = await readPattern(api)
    expect(await within(card).findByText('Impossible de charger les fiches de mesures.')).toBeInTheDocument()
    expect(within(card).queryByLabelText('Pour qui')).not.toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: /Réessayer/ }))
    expect(await within(card).findByRole('status')).toHaveTextContent('Taille conseillée : M')
  })

  it('sans tableau des mesures dans le patron, rien n’est proposé', async () => {
    const api = fakeApi()
    api.knitting.readPattern.mockResolvedValue({ ...PATTERN, sizeChart: null })
    const user = userEvent.setup()
    renderWithApp(<KnittingImportPage />, { api, route: '/tricot/nouveau', path: '/tricot/nouveau' })
    await user.upload(screen.getByLabelText('Patron (PDF)'), pdf)
    await user.click(screen.getByRole('button', { name: 'Lire le patron' }))
    await screen.findByRole('list', { name: 'Étapes lues' })
    expect(screen.queryByRole('region', { name: 'Quelle taille pour qui ?' })).not.toBeInTheDocument()
  })
})
