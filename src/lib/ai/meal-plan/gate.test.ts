import { describe, it, expect, afterEach } from 'vitest'
import { NextResponse } from 'next/server'
import { notFoundIfDisabled } from './gate'

const original = process.env.MEAL_GEN_ENABLED

describe('notFoundIfDisabled', () => {
  afterEach(() => {
    if (original === undefined) delete process.env.MEAL_GEN_ENABLED
    else process.env.MEAL_GEN_ENABLED = original
  })

  it('returns null when MEAL_GEN_ENABLED is true', () => {
    process.env.MEAL_GEN_ENABLED = 'true'
    expect(notFoundIfDisabled()).toBeNull()
  })

  it('returns a 404 NextResponse when disabled', () => {
    process.env.MEAL_GEN_ENABLED = 'false'
    const response = notFoundIfDisabled()
    expect(response).not.toBeNull()
    expect(response).toBeInstanceOf(NextResponse)
    expect(response!.status).toBe(404)
  })

  it('returns 404 when env var is not set at all', () => {
    delete process.env.MEAL_GEN_ENABLED
    const response = notFoundIfDisabled()
    expect(response).not.toBeNull()
    expect(response!.status).toBe(404)
  })
})
