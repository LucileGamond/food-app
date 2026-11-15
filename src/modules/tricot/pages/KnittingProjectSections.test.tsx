import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { KnittingProjectPage } from './KnittingProjectPage'
import { PROJECT, STEP, renderProject } from './knittingTestUtils'

// Le projet est gardé sur le téléphone (hors ligne) : chaque test repart sans copie.
beforeEach(() => localStorage.clear())

describe('sous-étapes d’une étape', () => {
  it('aiguille de la sous-étape : lisible sur la ligne, modifiable d’un toucher', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.steps[1]!.sections = [{ ...project.steps[1]!.sections[0]!, needle: 3 }, project.steps[1]!.sections[1]!]
    renderProject(fakeApi(), { ...project, needles: [3, 3.5] }, `${STEP}=s2`)
    // La 2e hérite de l'aiguille de la 1re
    const pills = await screen.findAllByRole('button', { name: /^Aiguille/ })
    expect(pills.map((b) => b.textContent)).toEqual(['Aiguille 3 mm', 'Aiguille 3 mm'])
    await user.click(pills[1]!)
    const form = await screen.findByRole('form', { name: 'Sous-étape' })
    expect(within(form).getByLabelText('Aiguille')).toHaveDisplayValue('Comme avant (3 mm)')
  })

  it('aiguille pas encore choisie : signalée sur la sous-étape ; aucune aiguille au projet : rien', async () => {
    const project = structuredClone(PROJECT)
    renderProject(fakeApi(), { ...project, needles: [3, 3.5] }, `${STEP}=s2`)
    expect((await screen.findAllByRole('button', { name: 'Aiguille à choisir' })).length).toBe(2)
    cleanup()
    renderProject(fakeApi(), project, `${STEP}=s2`)
    await screen.findByRole('heading', { name: 'Emmanchures' })
    expect(screen.queryByRole('button', { name: /Aiguille/ })).not.toBeInTheDocument()
  })

  it('aiguille de chaque sous-étape : à choisir avec plusieurs aiguilles, héritée de la précédente', async () => {
    const user = userEvent.setup()
    const project = { ...structuredClone(PROJECT), needles: [3, 3.5] }
    const { api } = renderProject(fakeApi(), project, `${STEP}=s2`)
    const alert = await screen.findByRole('alert')
    // La préparation compte ; le détail est sur chaque sous-étape, juste en dessous
    expect(alert).toHaveTextContent('2 choses à régler, signalées en orange dans les sous-étapes ci-dessous.')
    expect(within(alert).getByRole('button')).toHaveAccessibleName('Aller à la première: Sous-étape 1 (4 rangs : jersey) : aiguille à choisir.')
    expect(screen.getByRole('button', { name: 'Tricoter cette étape' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Actions pour « 4 rangs : jersey »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Modifier' }))
    const form = screen.getByRole('form', { name: 'Sous-étape' })
    expect(within(form).getByLabelText('Aiguille')).toHaveDisplayValue('À choisir')
    await user.selectOptions(within(form).getByLabelText('Aiguille'), '3 mm')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    const sections = [{ ...project.steps[1]!.sections[0]!, needle: 3 }, project.steps[1]!.sections[1]!]
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { sections })
  })

  it('sous-étapes ouvertes d’office : une fois tout réglé, elles restent ouvertes (pas de repli sous le doigt)', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    const project = { ...structuredClone(PROJECT), needles: [3, 3.5] }
    api.knitting.getProject.mockResolvedValue(structuredClone(project))
    // Rendu direct : sans le dépliage automatique des autres tests
    renderWithApp(<KnittingProjectPage />, { api, route: `${STEP}=s2`, path: '/tricot/:id' })
    const toggle = await screen.findByRole('button', { name: 'Sous-étapes' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('button', { name: 'Actions pour « 4 rangs : jersey »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Modifier' }))
    const form = screen.getByRole('form', { name: 'Sous-étape' })
    await user.selectOptions(within(form).getByLabelText('Aiguille'), '3 mm')
    // Rechargé : plus rien à régler (la 2e sous-étape hérite de l'aiguille)
    const fixed = structuredClone(project)
    fixed.steps[1]!.sections = [{ ...fixed.steps[1]!.sections[0]!, needle: 3 }, fixed.steps[1]!.sections[1]!]
    api.knitting.getProject.mockResolvedValue(fixed)
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByRole('link', { name: 'Tricoter cette étape' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sous-étapes' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('aiguille héritée : la 2e sous-étape prend celle de la 1re, l’étape est prête', async () => {
    const project = structuredClone(PROJECT)
    project.steps[1]!.sections = [{ ...project.steps[1]!.sections[0]!, needle: 3 }, project.steps[1]!.sections[1]!]
    renderProject(fakeApi(), { ...project, needles: [3, 3.5] }, `${STEP}=s2`)
    expect(await screen.findByRole('link', { name: 'Tricoter cette étape' })).toBeInTheDocument()
    expect(screen.queryByText('À préparer avant de tricoter')).not.toBeInTheDocument()
  })

  it('échantillon par aiguille : chaque sous-étape convertie avec celui de son aiguille, vérifiée une fois par aiguille', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.patternGauge = { stitches: 22, rows: 30 }
    project.needles = [3, 3.5]
    project.gauges = [{ needle: 3, stitches: null, rows: 40, checked: false }]
    project.steps[1]!.sections = [
      { kind: 'rows', rows: null, every: null, times: null, text: 'côtes', pattern: '5 cm', needle: 3 },
      { kind: 'rows', rows: null, every: null, times: null, text: 'jersey', pattern: '10 cm', needle: 3.5 },
    ]
    const { api } = renderProject(fakeApi(), project, `${STEP}=s2`)
    const sections = await screen.findByRole('region', { name: 'Sous-étapes' })
    // Aiguille 3 : son échantillon (40 rangs) ; 3,5 : celui du patron (30 rangs)
    expect(within(sections).getByText('20 rangs (≈ 5 cm) : côtes')).toBeInTheDocument()
    expect(within(sections).getByText('30 rangs (≈ 10 cm) : jersey')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tricoter cette étape' })).toBeDisabled()
    await user.click(within(sections).getByRole('button', { name: 'Valider pour l’aiguille 3,5 mm' }))
    expect(api.knitting.saveGauges).toHaveBeenLastCalledWith('p1', [
      { needle: 3, stitches: null, rows: 40, checked: false },
      { needle: 3.5, stitches: null, rows: null, checked: true },
    ])
  })

  it('aiguille hors patron : l’échantillon la fait proposer aux sous-étapes', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.needles = [3, 3.5]
    // Elle tricote trop serré : son échantillon est sur une 4,5 mm, que le patron ne conseille pas
    project.gauges = [{ needle: 4.5, stitches: 20, rows: 26, checked: false }]
    project.steps[1]!.sections = [{ kind: 'rows', rows: 10, every: null, times: null, text: 'jersey', pattern: null, needle: 3 }]
    renderProject(fakeApi(), project, `${STEP}=s2`)
    await user.click(await screen.findByRole('button', { name: 'Actions pour « 10 rangs : jersey »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Modifier' }))
    const form = screen.getByRole('form', { name: 'Sous-étape' })
    expect(Array.from((within(form).getByLabelText('Aiguille') as HTMLSelectElement).options).map((o) => o.textContent)).toEqual(['À choisir', '3 mm', '3,5 mm', '4,5 mm'])
  })

  it('aiguilles vérifiées : plus rien à valider, l’étape est prête', async () => {
    const project = structuredClone(PROJECT)
    project.patternGauge = { stitches: 22, rows: 30 }
    project.needles = [3, 3.5]
    project.gauges = [
      { needle: 3, stitches: null, rows: 40, checked: true },
      { needle: 3.5, stitches: null, rows: null, checked: true },
    ]
    project.steps[1]!.sections = [
      { kind: 'rows', rows: null, every: null, times: null, text: 'côtes', pattern: '5 cm', needle: 3 },
      { kind: 'rows', rows: null, every: null, times: null, text: 'jersey', pattern: '10 cm', needle: 3.5 },
    ]
    // 20 + 30 rangs convertis : le total de l'étape suit, sinon les sous-étapes la dépassent
    project.steps[1]!.totalRows = 50
    renderProject(fakeApi(), project, `${STEP}=s2`)
    expect(await screen.findByRole('link', { name: 'Tricoter cette étape' })).toBeInTheDocument()
    expect(screen.queryByText('À préparer avant de tricoter')).not.toBeInTheDocument()
    expect(screen.getByText(/Vérifié pour l’aiguille 3 mm/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Valider/ })).not.toBeInTheDocument()
  })

  it('sous-étapes plus longues que l’étape : signalé dans « À préparer », avec le total à reprendre', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    // L'étape annonce 30 rangs, les sous-étapes vont jusqu'au rang 40
    project.steps[1]!.sections = [{ kind: 'rows', rows: 40, every: null, times: null, text: 'jersey', pattern: null }]
    const { api } = renderProject(fakeApi(), project, `${STEP}=s2`)
    expect(await screen.findByText('À préparer avant de tricoter')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('sous-étapes plus longues que l’étape (jusqu’au rang 40, pour 30 rangs annoncés)')
    // Signalé, mais l'étape se tricote quand même : c'est à elle de trancher
    expect(screen.getByRole('link', { name: 'Tricoter cette étape' })).toBeInTheDocument()
    const sections = screen.getByRole('region', { name: 'Sous-étapes' })
    expect(within(sections).getByText(/L’étape annonce 30 rangs, mais les sous-étapes vont jusqu’au rang 40/)).toBeInTheDocument()

    await user.click(within(sections).getByRole('button', { name: 'Compter 40 rangs pour l’étape' }))
    expect(api.knitting.saveSections).toHaveBeenLastCalledWith([
      { id: 's2', sections: project.steps[1]!.sections, totalRows: 40, instructions: project.steps[1]!.instructions },
    ])
  })

  it('mailles au début : saisies, elles font foi ; reprendre celles de l’étape d’avant ; revenir au patron', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.steps[1]!.sections = [project.steps[1]!.sections[0]!, { ...project.steps[1]!.sections[1]!, actions: [{ text: '1 diminution de chaque côté', rank: null, stitches: -2 }] }]
    const { api } = renderProject(fakeApi(), project, `${STEP}=s2`)
    // 56 à la fin, 4 × −2 : 64 au début ; l'étape d'avant finit à 64
    expect((await screen.findByText(/Mailles au début :/)).parentElement).toHaveTextContent('Mailles au début : 64 mailles (d’après la fin du patron)')
    expect(screen.queryByRole('button', { name: /Reprendre les/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Modifier les mailles au début' }))
    const form = screen.getByRole('form', { name: 'Mailles au début' })
    await user.clear(within(form).getByLabelText('Mailles au début de l’étape'))
    await user.type(within(form).getByLabelText('Mailles au début de l’étape'), '0')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Un nombre entier de mailles')
    await user.clear(within(form).getByLabelText('Mailles au début de l’étape'))
    await user.type(within(form).getByLabelText('Mailles au début de l’étape'), '70')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { startStitches: 70 })
  })

  it('mailles au début saisies : la fin se recalcule, l’étape d’avant est proposée', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.steps[1]!.startStitches = 70
    // L'étape d'avant finit à 60 mailles, le patron en donne 64 au début de celle-ci : les deux sont proposés
    project.steps[0]!.stitches = 60
    project.steps[1]!.sections = [project.steps[1]!.sections[0]!, { ...project.steps[1]!.sections[1]!, actions: [{ text: '1 diminution de chaque côté', rank: null, stitches: -2 }] }]
    const { api } = renderProject(fakeApi(), project, `${STEP}=s2`)
    expect(await screen.findByText('Étape 2 sur 3')).toBeInTheDocument()
    expect(screen.getByText('62 mailles à la fin')).toBeInTheDocument()
    expect(screen.getByText(/Mailles au début :/).parentElement).toHaveTextContent('Mailles au début : 70 mailles')
    // Un seul bouton ouvre le choix : étape d'avant, patron, ou un autre nombre
    await user.click(screen.getByRole('button', { name: 'Modifier les mailles au début' }))
    const form = await screen.findByRole('form', { name: 'Mailles au début' })
    const choice = within(form).getByLabelText('Partir de')
    expect(Array.from((choice as HTMLSelectElement).options).map((o) => o.textContent)).toEqual([
      'Comme l’étape d’avant (60 mailles)',
      'Comme le patron (64 mailles)',
      'Un autre nombre',
    ])
    await user.selectOptions(choice, 'Comme l’étape d’avant (60 mailles)')
    expect(within(form).getByLabelText('Mailles au début de l’étape')).toHaveValue('60')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { startStitches: 60 })
    // Laisser le patron décider : la saisie est effacée
    await user.click(screen.getByRole('button', { name: 'Modifier les mailles au début' }))
    await user.click(within(await screen.findByRole('form', { name: 'Mailles au début' })).getByRole('button', { name: 'Laisser le patron décider' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { startStitches: null })
  })

  it('modifier une sous-étape : numérotée, reprise en entier en haut, les autres en retrait', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.steps[1]!.sections[0]!.source = 'Tricoter 4 rangs de jersey.'
    renderProject(fakeApi(), project, `${STEP}=s2`)
    // Numérotées, dans l'ordre
    const list = (await screen.findByRole('button', { name: 'Actions pour « 4 rangs : jersey »' })).closest('ol')!
    expect([...list.querySelectorAll(':scope > li')].map((li) => li.textContent!.trim()[0])).toEqual(['1', '2'])
    await user.click(screen.getByRole('button', { name: 'Actions pour « 4 rangs : jersey »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Modifier' }))
    // En haut : la sous-étape, son titre et le texte du patron
    const editing = screen.getByRole('listitem', { name: '4 rangs : jersey' })
    expect(editing).toHaveTextContent('Modifier la sous-étape 1')
    expect(editing).toHaveTextContent('Tricoter 4 rangs de jersey.')
    expect(within(editing).getByRole('form', { name: 'Sous-étape' })).toBeInTheDocument()
    // Les autres : une ligne discrète, sans actions ni détail
    const aside = screen.getAllByTestId('section-aside')
    expect(aside).toHaveLength(1)
    expect(aside[0]).toHaveTextContent('1 diminution de chaque côté — tous les 6 rangs (4 fois)')
    expect(screen.queryByRole('button', { name: /^Actions pour/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ajouter une sous-étape' })).not.toBeInTheDocument()
    await user.click(within(editing).getByRole('button', { name: 'Annuler' }))
    expect(screen.queryByTestId('section-aside')).not.toBeInTheDocument()
  })

  it('arrivée depuis le mode tricoter (?sous-etape=2) : la sous-étape à corriger s’ouvre', async () => {
    renderProject(fakeApi(), structuredClone(PROJECT), `${STEP}=s2&sous-etape=2`)
    const editing = await screen.findByRole('listitem', { name: '1 diminution de chaque côté — tous les 6 rangs (4 fois)' })
    expect(editing).toHaveTextContent('Modifier la sous-étape 2')
    expect(within(editing).getByRole('form', { name: 'Sous-étape' })).toBeInTheDocument()
  })

  it('règle, ajoute, déplace et supprime des sections', async () => {
    const user = userEvent.setup()
    const { api } = renderProject()
    const [jersey, legacy] = PROJECT.steps[1]!.sections
    // Réglée : l'action passe dans la liste des actions de la répétition
    const decrease = { ...legacy!, text: '', actions: [{ text: '1 diminution de chaque côté', rank: null }] }

    await user.click(await screen.findByRole('button', { name: 'Actions pour « 1 diminution de chaque côté — tous les 6 rangs (4 fois) »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Modifier' }))
    const form = screen.getByRole('form', { name: 'Sous-étape' })
    await user.clear(within(form).getByLabelText('Tous les … rangs'))
    await user.type(within(form).getByLabelText('Tous les … rangs'), '8')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { sections: [jersey, { ...decrease, every: 8 }] })
    expect(await screen.findByText('Rangs 5 à 36 · prochaine fois : rang 12')).toBeInTheDocument()

    // Nouvelle section sans répétition, à la fin
    await user.click(screen.getByRole('button', { name: 'Ajouter une sous-étape' }))
    const added = screen.getByRole('form', { name: 'Sous-étape' })
    await user.click(within(added).getByRole('button', { name: 'Enregistrer' }))
    expect(within(added).getByRole('alert')).toHaveTextContent('Indique le nombre de rangs.')
    await user.type(within(added).getByLabelText('Nombre de rangs'), '10')
    await user.type(within(added).getByLabelText('Description (facultatif)'), 'côtes')
    await user.click(within(added).getByRole('button', { name: 'Enregistrer' }))
    const rows10 = { kind: 'rows', rows: 10, every: null, times: null, text: 'côtes', pattern: null }
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { sections: [jersey, { ...decrease, every: 8 }, rows10] })
    expect(await screen.findByText('Rangs 37 à 46')).toBeInTheDocument()

    // Une répétition se crée aussi
    await user.click(screen.getByRole('button', { name: 'Ajouter une sous-étape' }))
    const repeatForm = screen.getByRole('form', { name: 'Sous-étape' })
    await user.click(within(repeatForm).getByRole('radio', { name: 'Répétition' }))
    await user.click(within(repeatForm).getByRole('button', { name: 'Enregistrer' }))
    expect(within(repeatForm).getByRole('alert')).toHaveTextContent('Indique quoi faire')
    await user.click(within(repeatForm).getByRole('button', { name: 'Annuler' }))

    // Déplacer, puis supprimer
    await user.click(screen.getByRole('button', { name: 'Actions pour « 10 rangs : côtes »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Monter' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { sections: [jersey, rows10, { ...decrease, every: 8 }] })
    await user.click(screen.getByRole('button', { name: 'Actions pour « 4 rangs : jersey »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Descendre' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { sections: [rows10, jersey, { ...decrease, every: 8 }] })
    await user.click(screen.getByRole('button', { name: 'Actions pour « 4 rangs : jersey »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Supprimer' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Supprimer cette sous-étape ?' })
    expect(confirm).toHaveTextContent('« 4 rangs : jersey »')
    await user.click(within(confirm).getByRole('button', { name: 'Supprimer' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { sections: [rows10, { ...decrease, every: 8 }] })
  })

  it('place plusieurs actions dans une répétition', async () => {
    const user = userEvent.setup()
    const { api } = renderProject()
    await user.click(await screen.findByRole('button', { name: 'Actions pour « 1 diminution de chaque côté — tous les 6 rangs (4 fois) »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Modifier' }))
    const form = screen.getByRole('form', { name: 'Sous-étape' })
    expect(within(form).getByRole('combobox', { name: 'Rang de l’action 1' })).toHaveValue('last')
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Rang de l’action 1' }), '1')
    await user.click(within(form).getByRole('button', { name: 'Ajouter une action' }))
    await user.type(within(form).getByRole('textbox', { name: 'Action 2' }), '1 augmentation')
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Rang de l’action 2' }), 'last')
    await user.click(within(form).getByRole('button', { name: 'Ajouter une action' }))
    await user.click(within(form).getByRole('button', { name: 'Supprimer l’action 3' }))
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', {
      sections: [
        PROJECT.steps[1]!.sections[0],
        {
          ...PROJECT.steps[1]!.sections[1],
          text: '',
          actions: [
            { text: '1 diminution de chaque côté', rank: 1 },
            { text: '1 augmentation', rank: null },
          ],
        },
      ],
    })

  })

  it('note les mailles ajoutées ou retirées par chaque action', async () => {
    const user = userEvent.setup()
    const { api } = renderProject()
    await user.click(await screen.findByRole('button', { name: 'Actions pour « 1 diminution de chaque côté — tous les 6 rangs (4 fois) »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Modifier' }))
    const form = screen.getByRole('form', { name: 'Sous-étape' })
    const stitches = within(form).getByRole('textbox', { name: 'Mailles de l’action 1' })
    // Effet deviné d'après le texte, proposé en exemple
    expect(stitches).toHaveValue('')
    expect(stitches).toHaveAttribute('placeholder', '-2')
    await user.type(stitches, 'beaucoup')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Mailles : un nombre entier entre -200 et 200')
    await user.clear(stitches)
    await user.type(stitches, '−2')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    const [jersey, legacy] = PROJECT.steps[1]!.sections
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', {
      sections: [jersey, { ...legacy, text: '', actions: [{ text: '1 diminution de chaque côté', rank: null, stitches: -2 }] }],
    })
  })

  it('montre la mesure du patron d’une section à régler', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.steps[1]!.sections = [{ kind: 'repeat', rows: null, every: null, times: 3, text: '1 augmentation', pattern: 'tous les 5 cm' }]
    renderProject(fakeApi(), project)
    const sections = await screen.findByRole('region', { name: 'Sous-étapes' })
    expect(within(sections).getByText('1 augmentation — tous les 5 cm (rangs à régler)')).toBeInTheDocument()
    expect(within(sections).getByRole('link', { name: 'Noter mon échantillon' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Actions pour « 1 augmentation/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Modifier' }))
    expect(screen.getByText('tous les 5 cm', { selector: 'span' })).toBeInTheDocument()
  })

  it('convertit les cm du patron en rangs avec l’échantillon : calcul expliqué, à valider ou régler', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.patternGauge = { stitches: 22, rows: 30 }
    project.gauges = [{ needle: null, stitches: 20, rows: 26, checked: false }]
    project.steps[1]!.sections = [
      { kind: 'rows', rows: null, every: null, times: null, text: 'jersey', pattern: '5 cm' },
      { kind: 'repeat', rows: null, every: null, times: 3, actions: [{ text: '1 augmentation', rank: null }], text: '', pattern: 'tous les 2,5 cm' },
    ]
    // 13 + 3 × 7 rangs convertis : le total de l'étape suit
    project.steps[1]!.totalRows = 34
    const { api } = renderProject(fakeApi(), project)
    const sections = await screen.findByRole('region', { name: 'Sous-étapes' })
    // 5 cm × 26 rangs pour 10 cm = 13 rangs ; 2,5 cm × 26 = 6,5 → 7 rangs
    expect(within(sections).getByText('13 rangs (≈ 5 cm) : jersey')).toBeInTheDocument()
    expect(within(sections).getByText('Rangs 1 à 13')).toBeInTheDocument()
    expect(within(sections).getByText('1 augmentation — tous les 7 rangs (≈ 2,5 cm) (3 fois)')).toBeInTheDocument()
    const notes = within(sections).getAllByRole('note')
    expect(notes[0]).toHaveTextContent('Converti depuis le patron : 5 cm × 26 rangs pour 10 cm (ton échantillon) ≈ 13 rangs (arrondi). Vérifie-le : valider vaut pour toutes les sous-étapes du projet.')

    // Valider : vaut pour tout le projet (sans aiguille choisie), une seule fois
    await user.click(within(notes[0]!).getByRole('button', { name: 'Valider' }))
    expect(api.knitting.saveGauges).toHaveBeenLastCalledWith('p1', [{ needle: null, stitches: 20, rows: 26, checked: true }])

    // Régler : le formulaire part du nombre calculé ; enregistré, il est validé
    await user.click(within(notes[1]!).getByRole('button', { name: 'Modifier' }))
    expect(screen.getByLabelText('Tous les … rangs')).toHaveValue('7')
    await user.clear(screen.getByLabelText('Tous les … rangs'))
    await user.type(screen.getByLabelText('Tous les … rangs'), '8')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', {
      sections: [expect.anything(), { kind: 'repeat', rows: null, every: 8, times: 3, actions: [{ text: '1 augmentation', rank: null }], text: '', pattern: 'tous les 2,5 cm' }],
    })
  })

  it('section « en même temps » : début à un rang, réglé dans le formulaire ; hauteur du patron convertie', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.patternGauge = { stitches: 22, rows: 30 }
    project.steps[1]!.sections = [
      { kind: 'repeat', rows: null, every: 2, times: 10, actions: [{ text: 'raglan', rank: null }], text: '', pattern: null },
      { kind: 'repeat', rows: null, every: 2, times: 2, actions: [{ text: 'encolure', rank: null }], text: '', pattern: null, at: { row: null, pattern: '5 cm' } },
    ]
    const { api } = renderProject(fakeApi(), project)
    const sections = await screen.findByRole('region', { name: 'Sous-étapes' })
    // 5 cm × 30 rangs pour 10 cm = 15 rangs : début au rang 16
    expect(within(sections).getByText('En même temps, dès le rang 16 (≈ 5 cm) : encolure — tous les 2 rangs (2 fois)')).toBeInTheDocument()
    expect(within(sections).getByText('Rangs 16 à 19')).toBeInTheDocument()
    expect(within(sections).getByRole('note')).toHaveTextContent('Converti depuis le patron : début : 5 cm × 30 rangs pour 10 cm (échantillon du patron) ≈ rang 16 (arrondi).')

    // Régler : « En même temps » au rang 18, enregistré validé (hauteur du patron gardée)
    await user.click(within(within(sections).getByRole('note')).getByRole('button', { name: 'Modifier' }))
    expect(screen.getByRole('radio', { name: 'En même temps' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('à 5 cm')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('À partir du rang'))
    await user.type(screen.getByLabelText('À partir du rang'), '18')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', {
      sections: [expect.anything(), { kind: 'repeat', rows: null, every: 2, times: 2, actions: [{ text: 'encolure', rank: null }], text: '', pattern: null, at: { row: 18, pattern: '5 cm' } }],
    })

    // Repasser la section « à la suite » : plus de début
    await user.click(screen.getByRole('button', { name: /^Actions pour « En même temps/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Modifier' }))
    await user.click(screen.getByRole('radio', { name: 'À la suite' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { sections: [expect.anything(), expect.not.objectContaining({ at: expect.anything() })] })
  })

  it('cm du patron sans échantillon : le lien mène à « Démarrer », sur l’aiguille concernée', async () => {
    const user = userEvent.setup()
    const project = { ...structuredClone(PROJECT), needles: [3, 3.5] }
    project.steps[1]!.sections = [{ kind: 'rows', rows: null, every: null, times: null, text: 'jersey', pattern: '5 cm', needle: 3.5 }]
    renderProject(fakeApi(), project)
    const sections = await screen.findByRole('region', { name: 'Sous-étapes' })
    expect(within(sections).getByText('5 cm (à régler) : jersey')).toBeInTheDocument()
    expect(within(sections).getByText(/Sans échantillon, les centimètres ne se convertissent pas/)).toBeInTheDocument()
    expect(within(sections).queryByRole('note')).not.toBeInTheDocument()

    // Les échantillons se notent au même endroit, dans « Démarrer » : le lien ouvre celui de cette aiguille
    const link = within(sections).getByRole('link', { name: 'Noter mon échantillon à l’aiguille 3,5 mm' })
    expect(link).toHaveAttribute('href', '/tricot/p1?onglet=demarrer&echantillon=3.5')
    await user.click(link)
    const form = await screen.findByRole('form', { name: 'Échantillon' })
    expect(within(form).getByLabelText('Aiguille')).toHaveDisplayValue('3,5 mm')
  })
})
