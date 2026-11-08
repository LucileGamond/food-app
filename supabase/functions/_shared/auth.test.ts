import { createSignedInCheck } from './auth.ts'

const URL_USER = 'https://projet.supabase.co/auth/v1/user'

function check(reply: Response | Error) {
  const doFetch = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => {
    if (reply instanceof Error) throw reply
    return reply.clone()
  })
  return { isSignedIn: createSignedInCheck('https://projet.supabase.co', 'cle-publique', doFetch), doFetch }
}

describe('createSignedInCheck', () => {
  it('accepte le jeton d’un utilisateur connecté, vérifié par le service d’authentification, et renvoie son id', async () => {
    const { isSignedIn, doFetch } = check(new Response(JSON.stringify({ id: 'u1' })))
    expect(await isSignedIn('Bearer jeton')).toBe('u1')
    expect(doFetch).toHaveBeenCalledWith(URL_USER, { headers: { authorization: 'Bearer jeton', apikey: 'cle-publique' } })
  })

  it('refuse sans jeton, sans « Bearer », sans demander au service', async () => {
    const { isSignedIn, doFetch } = check(new Response(JSON.stringify({ id: 'u1' })))
    expect(await isSignedIn(null)).toBeNull()
    expect(await isSignedIn('Basic abc')).toBeNull()
    expect(doFetch).not.toHaveBeenCalled()
  })

  it('refuse un jeton rejeté, une réponse sans utilisateur ou illisible, et le service injoignable', async () => {
    expect(await check(new Response('{}', { status: 401 })).isSignedIn('Bearer expiré')).toBeNull()
    expect(await check(new Response('{}')).isSignedIn('Bearer anonyme')).toBeNull()
    expect(await check(new Response('pas du json')).isSignedIn('Bearer x')).toBeNull()
    expect(await check(new Error('réseau')).isSignedIn('Bearer x')).toBeNull()
  })
})
