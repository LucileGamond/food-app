import { render, screen } from '@testing-library/react'
import { EMPTY_YARN } from '../lib/yarn'
import { YarnBand } from './YarnBand'

describe('YarnBand', () => {
  it('présente la laine comme sa bande : pelote, nom, puis les infos, le bain en avant', () => {
    render(<YarnBand yarn={{ ...EMPTY_YARN, brand: 'Drops', name: 'Merino', color: '0012 Ciel', dye_lot: '4471', weight_g: 50, length_m: 105, skeins: 5, hues: ['#8fb3d9'] }} />)
    const band = screen.getByTestId('yarn-band')
    expect(band).toHaveTextContent('Drops Merino')
    expect(band).toHaveTextContent('coloris 0012 Ciel')
    expect(band).toHaveTextContent('50 g · 105 m')
    expect(band).toHaveTextContent('× 5')
    expect(screen.getByText('bain 4471').tagName).toBe('STRONG')
    expect(screen.getByTestId('yarn-ball').innerHTML).toContain('#8fb3d9')
  })

  it('laine sans couleur ni infos : pelote indigo et « Laine »', () => {
    render(<YarnBand yarn={{ ...EMPTY_YARN, composition: 'mohair' }} />)
    expect(screen.getByTestId('yarn-band')).toHaveTextContent('Laine')
    expect(screen.getByTestId('yarn-ball').innerHTML).toContain('#3f4fa0')
  })
})
