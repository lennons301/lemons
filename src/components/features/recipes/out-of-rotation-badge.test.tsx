import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OutOfRotationBadge } from './out-of-rotation-badge'

describe('OutOfRotationBadge', () => {
  it('renders "Out of rotation" when the recipe is out of rotation', () => {
    render(<OutOfRotationBadge inRotation={false} />)
    expect(screen.getByText('Out of rotation')).toBeInTheDocument()
  })

  it('renders nothing when the recipe is in rotation', () => {
    const { container } = render(<OutOfRotationBadge inRotation={true} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when rotation state is missing (default is in rotation)', () => {
    const { container: undefinedContainer } = render(
      <OutOfRotationBadge inRotation={undefined} />
    )
    expect(undefinedContainer).toBeEmptyDOMElement()

    const { container: nullContainer } = render(<OutOfRotationBadge inRotation={null} />)
    expect(nullContainer).toBeEmptyDOMElement()
  })
})
