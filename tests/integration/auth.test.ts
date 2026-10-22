import { ERIC, TEST_PASSWORD, anonClient } from './helpers'

describe('authentification', () => {
  it('refuse les inscriptions', async () => {
    const { data, error } = await anonClient().auth.signUp({ email: 'intrus@food.test', password: 'motdepasse-intrus' })
    expect(error).not.toBeNull()
    expect(data.user).toBeNull()
  })

  it('refuse un mauvais mot de passe', async () => {
    const { error } = await anonClient().auth.signInWithPassword({ email: ERIC.email, password: 'mauvais-mdp' })
    expect(error?.status).toBe(400)
  })

  it('connecte un compte existant', async () => {
    const { data, error } = await anonClient().auth.signInWithPassword({ email: ERIC.email, password: TEST_PASSWORD })
    expect(error).toBeNull()
    expect(data.user?.id).toBe(ERIC.id)
  })
})
