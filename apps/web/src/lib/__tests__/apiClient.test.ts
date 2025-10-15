import { describe, it, expect } from 'vitest'
import { api } from '../../lib/apiClient'

describe('apiClient', () => {
  it('maps detectHighlights response', async () => {
    const res = await api.detectHighlights({ videoUrl: 'blob:demo' })
    expect(Array.isArray((res as any).segments)).toBe(true)
  })
})

