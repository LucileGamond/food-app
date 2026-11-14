import { BackLink } from '../components/BackLink'
import { MeasuresSection } from '../components/MeasuresSection'

/** Fiches de mesures (`/tricot/mesures`) : elles servent à conseiller une taille à la lecture d'un patron. */
export function KnittingMeasuresPage() {
  return (
    <>
      <BackLink to="/tricot">Tricot</BackLink>
      <MeasuresSection />
    </>
  )
}
