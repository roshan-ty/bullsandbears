import { expect, it } from 'vitest'
import { researchView } from './privacy'
it('removes provider labels and links without changing evidence identifiers or numbers', () => {
  const original = { events: [{ id: 'fred-evidence', source: 'FRED', sourceUrl: 'https://provider.invalid', actual: 0, contribution: -2, name: 'FRED rate' }], news: [{ headline: 'Original headline', url: 'https://article.invalid' }] }
  const result = researchView(original)
  expect(result.events[0]).toMatchObject({ id: 'fred-evidence', actual: 0, contribution: -2 })
  expect(result.events[0]).not.toHaveProperty('source')
  expect(result.events[0]).not.toHaveProperty('sourceUrl')
  expect(result.events[0].name).not.toContain('FRED')
  expect(result.news).toEqual(original.news)
  expect(original.events[0].source).toBe('FRED')
})
