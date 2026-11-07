// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { FullVersion } from './FullVersion'

afterEach(cleanup)
it('offers four real screenshots with an accessible enlarged preview', () => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  render(<FullVersion />)
  expect(screen.getAllByRole('img')).toHaveLength(4)
  for (const image of screen.getAllByRole('img')) expect(image.getAttribute('src')).toMatch(/screenshots\/desktop-(charts|macro|positioning|retail)\.png$/)
  fireEvent.click(screen.getByRole('button', { name: 'Preview Charts' }))
  const dialog = screen.getByRole('dialog', { name: 'Charts' })
  expect(within(dialog).getByRole('img').getAttribute('src')).toContain('desktop-charts.png')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close preview' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Preview Charts' }))
  fireEvent.click(screen.getByRole('button', { name: 'Preview Macro map' }))
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('link', { name: 'Email to buy the full version' }).getAttribute('href')).toContain('mailto:bullsandbears@gmail.com?')
})
