/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RotationToggle } from './rotation-toggle'

afterEach(cleanup)

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: { error: (...args: any[]) => toastError(...args) },
}))

describe('RotationToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows "Take out of rotation" for a recipe in rotation', () => {
    render(<RotationToggle recipeId="r1" inRotation={true} />)
    expect(screen.getByRole('button', { name: 'Take out of rotation' })).toBeInTheDocument()
  })

  it('shows "Return to rotation" for a recipe out of rotation', () => {
    render(<RotationToggle recipeId="r1" inRotation={false} />)
    expect(screen.getByRole('button', { name: 'Return to rotation' })).toBeInTheDocument()
  })

  it('persists taking a recipe out of rotation via PATCH and refreshes', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as any
    render(<RotationToggle recipeId="r1" inRotation={true} />)

    await userEvent.click(screen.getByRole('button', { name: 'Take out of rotation' }))

    expect(global.fetch).toHaveBeenCalledWith('/api/recipes/r1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ in_rotation: false }),
    })
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('persists returning a recipe to rotation via PATCH', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as any
    render(<RotationToggle recipeId="r2" inRotation={false} />)

    await userEvent.click(screen.getByRole('button', { name: 'Return to rotation' }))

    expect(global.fetch).toHaveBeenCalledWith('/api/recipes/r2', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ in_rotation: true }),
    })
  })

  it('shows an error and does not refresh when the update fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as any
    render(<RotationToggle recipeId="r1" inRotation={true} />)

    await userEvent.click(screen.getByRole('button', { name: 'Take out of rotation' }))

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(refresh).not.toHaveBeenCalled()
  })

  it('renders the compact variant with an accessible label', () => {
    render(<RotationToggle recipeId="r1" inRotation={true} compact />)
    const button = screen.getByRole('button', { name: 'Take out of rotation' })
    expect(button).toHaveAttribute('title', 'Take out of rotation')
  })
})
