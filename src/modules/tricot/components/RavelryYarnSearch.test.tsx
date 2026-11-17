import { screen, waitFor, within } from '@testing-library/react'
import { setupUser } from '@/test/user'
import { AppError } from '@/api'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { EMPTY_YARN } from '../lib/yarn'
import { ravelryYarnDetails, type RavelryYarnHit } from '../lib/ravelry'
import { YarnDialog } from './YarnPanel'

const HIT: RavelryYarnHit = { id: 25852, brand: 'Garnstudio', name: 'DROPS Merino Extra Fine', weightG: 50, lengthM: 105, category: 'DK' }
const FOUND = { ...EMPTY_YARN, brand: 'Garnstudio', name: 'DROPS Merino Extra Fine', composition: '100 % mérinos', weight_g: 50, length_m: 105, needle_mm: 4 }

function setup(linked = true) {
  const api = fakeApi()
  if (linked) api.knitting.getRavelryAccount.mockResolvedValue({ username: 'lucile' })
  const onSave = vi.fn(async () => true)
  renderWithApp(<YarnDialog yarn={null} title="Ajouter au stock" open onOpenChange={() => {}} onSave={onSave} />, { api })
  return { api, onSave, user: setupUser() }
}

describe('laine trouvée sur Ravelry', () => {
  it('aperçu : marque, poids et métrage, grosseur', () => {
    expect(ravelryYarnDetails(HIT)).toBe('Garnstudio · 50 g / 105 m · DK')
    expect(ravelryYarnDetails({ ...HIT, brand: null, weightG: 12.5, lengthM: null, category: null })).toBe('12,5 g')
  })

  it('compte non relié : rien n’est proposé', async () => {
    const { api } = setup(false)
    await waitFor(() => expect(api.knitting.getRavelryAccount).toHaveBeenCalled())
    expect(screen.queryByLabelText('Chercher sur Ravelry')).not.toBeInTheDocument()
  })

  it('cherche, choisit : les champs se remplissent, pelotes et coloris saisis restent', async () => {
    const { api, onSave, user } = setup()
    api.knitting.searchRavelryYarns.mockResolvedValue([HIT, { ...HIT, id: 2, name: 'DROPS Merino', weightG: null }])
    api.knitting.getRavelryYarn.mockResolvedValue(FOUND)
    await user.type(await screen.findByLabelText(/Nombre de pelotes/), '8')
    await user.type(screen.getByLabelText('Coloris'), 'Bleu')
    await user.type(screen.getByLabelText('Nom de la laine'), 'à remplacer')
    // Entrée cherche sans enregistrer la laine
    await user.type(screen.getByLabelText('Chercher sur Ravelry'), ' drops merino {Enter}')
    expect(api.knitting.searchRavelryYarns).toHaveBeenCalledWith('drops merino')
    expect(onSave).not.toHaveBeenCalled()
    const list = await screen.findByRole('list', { name: 'Laines trouvées sur Ravelry' })
    expect(within(list).getAllByRole('button')).toHaveLength(2)
    expect(list).toHaveTextContent('Garnstudio · 50 g / 105 m · DK')

    await user.click(within(list).getByRole('button', { name: /DROPS Merino Extra Fine/ }))
    expect(api.knitting.getRavelryYarn).toHaveBeenCalledWith(25852)
    await waitFor(() => expect(screen.getByLabelText('Nom de la laine')).toHaveValue('DROPS Merino Extra Fine'))
    expect(screen.getByLabelText('Marque')).toHaveValue('Garnstudio')
    expect(screen.getByLabelText('Composition')).toHaveValue('100 % mérinos')
    expect(screen.getByLabelText(/Métrage d’une pelote/)).toHaveValue('105')
    expect(screen.getByLabelText(/Aiguilles/)).toHaveValue('4')
    expect(screen.getByLabelText(/Nombre de pelotes/)).toHaveValue('8')
    expect(screen.getByLabelText('Coloris')).toHaveValue('Bleu')
    expect(screen.queryByRole('list', { name: 'Laines trouvées sur Ravelry' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Chercher sur Ravelry')).toHaveValue('')
    expect(await screen.findByText('Laine trouvée sur Ravelry : vérifie les champs')).toBeInTheDocument()
  })

  it('aucune laine trouvée ; bouton désactivé sans texte', async () => {
    const { api, user } = setup()
    expect(await screen.findByRole('button', { name: 'Chercher' })).toBeDisabled()
    await user.type(screen.getByLabelText('Chercher sur Ravelry'), 'introuvable')
    await user.click(screen.getByRole('button', { name: 'Chercher' }))
    expect(await screen.findByText('Aucune laine trouvée sur Ravelry.')).toBeInTheDocument()
    expect(api.knitting.getRavelryYarn).not.toHaveBeenCalled()
  })

  it('erreurs lisibles : recherche, puis lecture de la laine', async () => {
    const { api, user } = setup()
    api.knitting.searchRavelryYarns.mockRejectedValueOnce(new AppError('La recherche sur Ravelry a échoué.')).mockResolvedValue([HIT])
    api.knitting.getRavelryYarn.mockRejectedValue(new AppError('Impossible de lire cette laine sur Ravelry.'))
    await user.type(await screen.findByLabelText('Chercher sur Ravelry'), 'merino')
    await user.click(screen.getByRole('button', { name: 'Chercher' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La recherche sur Ravelry a échoué.')
    await user.click(screen.getByRole('button', { name: 'Chercher' }))
    await user.click(await screen.findByRole('button', { name: /DROPS Merino Extra Fine/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de lire cette laine sur Ravelry.')
    // La liste reste pour en choisir une autre
    expect(screen.getByRole('list', { name: 'Laines trouvées sur Ravelry' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nom de la laine')).toHaveValue('')
  })
})
