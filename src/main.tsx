import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { createApi } from '@/api'
import { getSupabase } from '@/lib/supabase'
import { App } from './App'
import './index.css'

// Thème clair / sombre selon le système.
const dark = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = () => document.documentElement.classList.toggle('dark', dark.matches)
applyTheme()
dark.addEventListener('change', applyTheme)

const supabase = getSupabase()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App api={createApi(supabase)} auth={supabase.auth} />
    </BrowserRouter>
  </StrictMode>,
)
