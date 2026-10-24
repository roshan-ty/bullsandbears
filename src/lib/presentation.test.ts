import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatTime, readTheme, saveTheme } from './presentation'

afterEach(() => vi.unstubAllGlobals())

describe('resilient presentation', () => {
  it('does not throw on malformed source timestamps', () => {
    expect(formatTime('not-a-date')).toBe('Invalid source timestamp')
    expect(formatTime(null)).toBe('Not yet published')
  })
  it('supports browsers that deny storage access', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('Storage denied') },
      setItem: () => { throw new Error('Storage denied') },
    })
    expect(readTheme()).toBe('dark')
    expect(() => saveTheme('light')).not.toThrow()
  })
})