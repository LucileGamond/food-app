import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, useLocation } from 'react-router-dom'
import { AppError } from '@/api'
import type { NavState } from '@/lib/navState'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { EMPTY_YARN, type StashIdeas, type StashItem, type Yarn, type YarnIdea } from '../lib/yarn'
import { YarnIdeasSection } from './YarnIdeasSection'

const MERINO: Yarn = { ...EMPTY_YARN, brand: 'DROPS', name: 'Merino', length_m: 105, skeins: 8, needle_mm: 4 }
const ALPACA: Yarn = { ...EMPTY_YARN, brand: 'Drops', name: 'Alpaca', color: 'Gris', length_m: 167, skeins: 2, needle_mm: 3.5 }
const NO_METERS: Yarn = { ...EMPTY_YARN, brand: 'Inconnue' }
const item = (id: string, yarn: Yarn = MERINO): StashItem => ({ id, yarn, notes: '', createdAt: '2026-11-01' })
const STASH = [item('st1'), item('st2', ALPACA), item('st3', NO_METERS), item('st4', { ...MERINO, name: 'Cotton' }), item('st5', { ...MERINO, name: 'Silk' })]

const SWEATER: YarnIdea = { title: 'Pull raglan', why: 'Assez pour une taille M.', size: 'femme M', meters: 1100, needleMm: 4, search: 'raglan sweater', patterns: [] }
const HAT: YarnIdea = { title: 'Bonnet', why: 'Rapide.', size: '', meters: 150, needleMm: null, search: '', patterns: [] }
const SAVED: StashIdeas = { stashIds: ['st1'], wish: 'pour bébé', ideas: [HAT], weight: 'dk', updatedAt: '2026-11-10T09:00:00Z' }

function NewPatternPage() {
  const link = (useLocation().state as NavState | null)?.patternLink
  return <p>Nouveau patron : {[link?.url, link?.title, link?.yarnIdea, link?.metersNeeded, link?.needleMm].join(' · ')}</p>
}

function setup(options: { stash?: StashItem[]; current?: StashItem; emphasize?: boolean; configure?: (api: ReturnType<typeof fakeApi>) => void } = {}) {
  const api = fakeApi()
  // Compte Ravelry relié par défaut
  api.knitting.getRavelryAccount.mockResolvedValue({ username: 'lucile' })
  options.configure?.(api)
  const user = userEvent.setup()
  const stash = options.stash ?? STASH
  renderWithApp(<YarnIdeasSection item={options.current ?? stash[0]!} stash={stash} emphasize={options.emphasize ?? true} />, {
    api,
    extraRoutes: <Route path="/tricot/patrons/nouveau" element={<NewPatternPage />} />,
  })
  return { api, user }
}

const ideasList = () => screen.findByRole('list', { name: 'Idées de modèles' })

describe('Des idées pour ma laine', () => {
  it('sans idées gardées : bouton mis en avant, coût sans recherche, puis idées gardées', async () => {
    const { api, user } = setup()
    api.knitting.yarnIdeas.mockResolvedValue({ ideas: [SWEATER, HAT], weight: 'worsted' })
    await waitFor(() => expect(api.knitting.getStashIdeas).toHaveBeenCalledWith(['st1']))
    expect(screen.getByText('≈ 0,1 ct · patrons de Ravelry gratuits')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Idées de modèles' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Des idées avec l’IA' }))
    expect(api.knitting.yarnIdeas).toHaveBeenCalledWith([MERINO], { wish: '' })
    const ideas = await ideasList()
    expect(within(ideas).getAllByRole('listitem')).toHaveLength(2)
    expect(api.knitting.saveStashIdeas).toHaveBeenCalledWith(expect.objectContaining({ stashIds: ['st1'], wish: '', ideas: [SWEATER, HAT], weight: 'worsted' }))
    // Le bouton devient « Relancer »
    expect(screen.getByRole('button', { name: 'Relancer' })).toBeInTheDocument()
  })

  it('métrage : il manque (avec les pelotes) ou assez', async () => {
    const { api, user } = setup()
    api.knitting.yarnIdeas.mockResolvedValue({ ideas: [SWEATER, HAT], weight: null })
    await user.click(screen.getByRole('button', { name: 'Des idées avec l’IA' }))
    const ideas = await ideasList()
    // 840 m en stock, 1100 m nécessaires : 260 m, soit 3 pelotes de 105 m
    expect(ideas).toHaveTextContent('Il manque ≈ 260 m (3 pelotes)')
    expect(ideas).toHaveTextContent('Assez de laine (reste ≈ 690 m)')
    expect(ideas).toHaveTextContent('Pull raglan · femme M')
  })

  it('montre les idées gardées sans rappeler le modèle, avec leur date et l’envie', async () => {
    const { api } = setup({ configure: (api) => api.knitting.getStashIdeas.mockResolvedValue(SAVED) })
    const ideas = await ideasList()
    expect(ideas).toHaveTextContent('Bonnet')
    expect(screen.getByText('Idées du 10 novembre · envie : pour bébé')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Relancer' })).toBeInTheDocument()
    expect(api.knitting.yarnIdeas).not.toHaveBeenCalled()
  })

  it('relance avec une envie', async () => {
    const { api, user } = setup({ configure: (api) => api.knitting.getStashIdeas.mockResolvedValue(SAVED) })
    api.knitting.yarnIdeas.mockResolvedValue({ ideas: [SWEATER], weight: 'worsted' })
    await ideasList()
    await user.type(screen.getByLabelText('Envie de…'), '  un pull ')
    await user.click(screen.getByRole('button', { name: 'Relancer' }))
    expect(api.knitting.yarnIdeas).toHaveBeenCalledWith([MERINO], { wish: '  un pull ' })
    await waitFor(() => expect(screen.getByRole('list', { name: 'Idées de modèles' })).toHaveTextContent('Pull raglan'))
    expect(api.knitting.saveStashIdeas).toHaveBeenCalledWith(expect.objectContaining({ wish: 'un pull' }))
    expect(screen.getByText(/envie : un pull$/)).toBeInTheDocument()
  })

  it('pendant la recherche : bouton occupé, champs bloqués', async () => {
    const { api, user } = setup()
    let resolve!: (value: { ideas: YarnIdea[]; weight: string | null }) => void
    api.knitting.yarnIdeas.mockReturnValue(new Promise((r) => (resolve = r)))
    await user.click(screen.getByRole('button', { name: 'Des idées avec l’IA' }))
    expect(screen.getByRole('button', { name: 'Recherche d’idées…' })).toBeDisabled()
    expect(screen.getByLabelText('Envie de…')).toBeDisabled()
    resolve({ ideas: [HAT], weight: null })
    expect(await ideasList()).toHaveTextContent('Bonnet')
  })

  it('erreur du modèle lisible ; les idées restent affichées si elles n’ont pas pu être gardées', async () => {
    const { api, user } = setup()
    api.knitting.yarnIdeas.mockRejectedValueOnce(new AppError('La recherche d’idées a échoué.'))
    await user.click(screen.getByRole('button', { name: 'Des idées avec l’IA' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La recherche d’idées a échoué.')

    api.knitting.yarnIdeas.mockResolvedValue({ ideas: [HAT], weight: null })
    api.knitting.saveStashIdeas.mockRejectedValue(new AppError('Impossible de garder les idées.'))
    await user.click(screen.getByRole('button', { name: 'Des idées avec l’IA' }))
    expect(await ideasList()).toHaveTextContent('Bonnet')
    expect(screen.queryByRole('alert', { name: /recherche/ })).not.toBeInTheDocument()
    expect(await screen.findByText('Impossible de garder les idées.')).toBeInTheDocument()
  })

  it('associe d’autres laines du stock (4 au plus) : idées et métrage de l’ensemble', async () => {
    const { api, user } = setup()
    api.knitting.yarnIdeas.mockResolvedValue({ ideas: [SWEATER], weight: null })
    const others = screen.getByRole('group', { name: 'Avec d’autres laines du stock' })
    expect(within(others).getAllByRole('checkbox')).toHaveLength(4)
    expect(within(others).getByText('· Gris')).toBeInTheDocument()

    await user.click(within(others).getByRole('checkbox', { name: /Drops Alpaca/ }))
    await waitFor(() => expect(api.knitting.getStashIdeas).toHaveBeenLastCalledWith(['st1', 'st2']))
    await user.click(screen.getByRole('button', { name: 'Des idées avec l’IA' }))
    expect(api.knitting.yarnIdeas).toHaveBeenCalledWith([MERINO, ALPACA], { wish: '' })
    // 840 + 334 m : assez pour 1100 m ; pelotes non comptées pour plusieurs laines
    expect(await ideasList()).toHaveTextContent('Assez de laine (reste ≈ 74 m)')
    expect(api.knitting.saveStashIdeas).toHaveBeenCalledWith(expect.objectContaining({ stashIds: ['st1', 'st2'] }))

    // Au plus 4 laines : la 5e ne peut pas être cochée
    await user.click(within(others).getByRole('checkbox', { name: /DROPS Cotton/ }))
    await user.click(within(others).getByRole('checkbox', { name: /DROPS Silk/ }))
    expect(within(others).getByRole('checkbox', { name: /Inconnue/ })).toHaveAttribute('aria-disabled', 'true')
    // Décocher libère la place
    await user.click(within(others).getByRole('checkbox', { name: /DROPS Silk/ }))
    expect(within(others).getByRole('checkbox', { name: /Inconnue/ })).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('changer les laines associées affiche les idées gardées de cet ensemble', async () => {
    const { user } = setup({ configure: (api) => api.knitting.getStashIdeas.mockImplementation(async (ids: string[]) => (ids.length === 2 ? { ...SAVED, stashIds: ids, ideas: [SWEATER], wish: '' } : SAVED)) })
    expect(await ideasList()).toHaveTextContent('Bonnet')
    await user.click(screen.getByRole('checkbox', { name: /Drops Alpaca/ }))
    await waitFor(() => expect(screen.getByRole('list', { name: 'Idées de modèles' })).toHaveTextContent('Pull raglan'))
    expect(screen.getByRole('list', { name: 'Idées de modèles' })).not.toHaveTextContent('Bonnet')
    await user.click(screen.getByRole('checkbox', { name: /Drops Alpaca/ }))
    await waitFor(() => expect(screen.getByRole('list', { name: 'Idées de modèles' })).toHaveTextContent('Bonnet'))
  })

  it('une seule laine dans le stock : pas de choix d’autres laines ; métrage inconnu : pas de badge', async () => {
    const { api, user } = setup({ stash: [item('st3', NO_METERS)] })
    api.knitting.yarnIdeas.mockResolvedValue({ ideas: [HAT], weight: null })
    expect(screen.queryByRole('group', { name: 'Avec d’autres laines du stock' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Des idées avec l’IA' }))
    const ideas = await ideasList()
    expect(ideas).not.toHaveTextContent('Assez')
    expect(ideas).not.toHaveTextContent('Il manque')
  })

  // Test de rendu (variante du bouton, sans équivalent accessible).
  it('bibliothèque qui convient déjà : bouton secondaire', async () => {
    setup({ emphasize: false })
    expect(screen.getByRole('button', { name: 'Des idées avec l’IA' })).not.toHaveClass('bg-primary')
    cleanup()
    setup({ emphasize: true })
    expect(screen.getByRole('button', { name: 'Des idées avec l’IA' })).toHaveClass('bg-primary')
  })

  it('trouve les patrons d’une idée à la demande, et les garde', async () => {
    const { api, user } = setup({ configure: (api) => api.knitting.getStashIdeas.mockResolvedValue({ ...SAVED, ideas: [SWEATER, HAT] }) })
    api.knitting.ideaPatterns.mockResolvedValue([{ title: 'Raglan facile', url: 'https://www.garnstudio.com/pattern.php?id=9', free: true, language: 'fr', meters: null, metersMax: null }])
    const ideas = await ideasList()
    expect(within(ideas).getAllByText('≈ 2 ct')).toHaveLength(2)
    expect(within(ideas).getAllByText('Rien sur Ravelry.')).toHaveLength(2)
    await user.click(within(ideas).getByRole('button', { name: 'Chercher sur internet : Pull raglan' }))
    expect(api.knitting.ideaPatterns).toHaveBeenCalledWith(SWEATER, [MERINO], 'dk')
    const found = await within(ideas).findByRole('list', { name: 'Patrons trouvés : Pull raglan' })
    expect(within(found).getByRole('link', { name: 'Raglan facile · garnstudio.com · Gratuit · FR' })).toHaveAttribute('href', 'https://www.garnstudio.com/pattern.php?id=9')
    expect(api.knitting.saveStashIdeas).toHaveBeenCalledWith(
      expect.objectContaining({ ideas: [{ ...SWEATER, patterns: [{ title: 'Raglan facile', url: 'https://www.garnstudio.com/pattern.php?id=9', free: true, language: 'fr', meters: null, metersMax: null }] }, HAT] }),
    )
    // L'autre idée garde son bouton
    expect(within(ideas).getByRole('button', { name: 'Chercher sur internet : Bonnet' })).toBeEnabled()
  })

  it('aucun patron trouvé : on le dit ; erreur de recherche lisible', async () => {
    const { api, user } = setup({ configure: (api) => api.knitting.getStashIdeas.mockResolvedValue({ ...SAVED, ideas: [SWEATER, HAT] }) })
    api.knitting.ideaPatterns.mockResolvedValueOnce([]).mockRejectedValueOnce(new AppError('La recherche de patrons a échoué.'))
    const ideas = await ideasList()
    await user.click(within(ideas).getByRole('button', { name: 'Chercher sur internet : Pull raglan' }))
    expect(await within(ideas).findByText('Aucun patron trouvé sur internet.')).toBeInTheDocument()
    await user.click(within(ideas).getByRole('button', { name: 'Chercher sur internet : Bonnet' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La recherche de patrons a échoué.')
    expect(within(ideas).getByRole('button', { name: 'Chercher sur internet : Bonnet' })).toBeEnabled()
  })

  it('deux recherches de patrons à la suite : les deux résultats sont gardés', async () => {
    const { api, user } = setup({ configure: (api) => api.knitting.getStashIdeas.mockResolvedValue({ ...SAVED, ideas: [SWEATER, HAT] }) })
    const raglan = { title: 'Raglan facile', url: 'https://www.garnstudio.com/pattern.php?id=9', free: true, language: 'fr', meters: null, metersMax: null }
    const beanie = { title: 'Bonnet simple', url: 'https://www.garnstudio.com/pattern.php?id=10', free: true, language: 'fr', meters: null, metersMax: null }
    let answerSweater!: (p: (typeof raglan)[]) => void
    let answerHat!: (p: (typeof raglan)[]) => void
    api.knitting.ideaPatterns
      .mockReturnValueOnce(new Promise((resolve) => (answerSweater = resolve)))
      .mockReturnValueOnce(new Promise((resolve) => (answerHat = resolve)))
    const ideas = await ideasList()
    await user.click(within(ideas).getByRole('button', { name: 'Chercher sur internet : Pull raglan' }))
    await user.click(within(ideas).getByRole('button', { name: 'Chercher sur internet : Bonnet' }))
    answerSweater([raglan])
    await within(ideas).findByRole('list', { name: 'Patrons trouvés : Pull raglan' })
    answerHat([beanie])
    await within(ideas).findByRole('list', { name: 'Patrons trouvés : Bonnet' })
    // Le premier résultat est toujours là, à l'écran comme en base
    expect(within(ideas).getByRole('list', { name: 'Patrons trouvés : Pull raglan' })).toBeInTheDocument()
    expect(api.knitting.saveStashIdeas).toHaveBeenLastCalledWith(expect.objectContaining({ ideas: [{ ...SWEATER, patterns: [raglan] }, { ...HAT, patterns: [beanie] }] }))
  })

  it('pendant la recherche de patrons : bouton occupé', async () => {
    const { api, user } = setup({ configure: (api) => api.knitting.getStashIdeas.mockResolvedValue(SAVED) })
    api.knitting.ideaPatterns.mockReturnValue(new Promise(() => {}))
    const ideas = await ideasList()
    await user.click(within(ideas).getByRole('button', { name: 'Chercher sur internet : Bonnet' }))
    expect(within(ideas).getByRole('button', { name: 'Chercher sur internet : Bonnet' })).toBeDisabled()
    expect(ideas).toHaveTextContent('Recherche…')
  })

  it('compte Ravelry non relié : rappel avec un lien vers les Réglages', async () => {
    const { api } = setup({
      configure: (api) => {
        api.knitting.getRavelryAccount.mockResolvedValue(null)
        api.knitting.getStashIdeas.mockResolvedValue(SAVED)
      },
    })
    const ideas = await ideasList()
    expect(await screen.findByRole('link', { name: 'relie ton compte Ravelry dans les Réglages' })).toHaveAttribute('href', '/reglages')
    expect(screen.getByText('≈ 0,1 ct')).toBeInTheDocument()
    expect(within(ideas).getByText('Pas de patron.')).toBeInTheDocument()
    expect(api.knitting.getRavelryAccount).toHaveBeenCalled()
  })

  it('compte Ravelry illisible : pas de rappel', async () => {
    setup({ configure: (api) => api.knitting.getRavelryAccount.mockRejectedValue(new AppError('Hors ligne.')) })
    await waitFor(() => expect(screen.getByText('≈ 0,1 ct · patrons de Ravelry gratuits')).toBeInTheDocument())
    expect(screen.queryByRole('link', { name: /Ravelry dans les Réglages/ })).not.toBeInTheDocument()
  })

  it('« Garder » ouvre l’ajout à la bibliothèque avec le lien du patron', async () => {
    const pattern = { title: 'Cowl', url: 'https://p.exemple/cowl', free: false, language: null, meters: 300, metersMax: 600 }
    const { user } = setup({ configure: (api) => api.knitting.getStashIdeas.mockResolvedValue({ ...SAVED, ideas: [{ ...HAT, patterns: [pattern] }] }) })
    const ideas = await ideasList()
    expect(within(ideas).getByRole('link', { name: 'Cowl · p.exemple · Payant · 300 à 600 m' })).toBeInTheDocument()
    expect(within(ideas).queryByRole('button', { name: /Chercher sur internet/ })).not.toBeInTheDocument()
    await user.click(within(ideas).getByRole('link', { name: 'Garder Cowl dans ma bibliothèque' }))
    expect(await screen.findByText('Nouveau patron : https://p.exemple/cowl · Cowl · DROPS Merino · 150 ·')).toBeInTheDocument()
  })

  it('recherche Ravelry filtrée avec le métrage de l’ensemble', async () => {
    setup({ configure: (api) => api.knitting.getStashIdeas.mockResolvedValue({ ...SAVED, ideas: [SWEATER] }) })
    const ideas = await ideasList()
    expect(within(ideas).getByRole('link', { name: 'Plus de patrons sur Ravelry' })).toHaveAttribute(
      'href',
      'https://www.ravelry.com/patterns/search#craft=knitting&weight=dk&yardage=0%7C918&needles=3.5mm%7C3.75mm%7C4.0mm%7C4.5mm&query=raglan%20sweater',
    )
  })
})
