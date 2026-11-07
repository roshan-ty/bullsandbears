// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Partners } from './Partners'

afterEach(cleanup)
it('filters partner categories and preserves the TradersYard offer destination', () => {
  render(<Partners />)
  const filter = screen.getByLabelText('Partner category') as HTMLSelectElement
  expect([...filter.options].map(option => option.value)).toEqual(['All', 'Futures Prop Firms', 'CFDs Prop Firms', 'Brokers'])
  expect(screen.getByRole('link', { name: 'Explore TradersYard accounts' }).getAttribute('href')).toBe('https://shop.tradersyard.com/ref/1486')
  expect(screen.getByText('RSHN')).toBeTruthy()
  fireEvent.change(filter, { target: { value: 'Futures Prop Firms' } })
  expect(screen.getByRole('heading', { name: 'TradersYard' })).toBeTruthy()
  for (const category of ['CFDs Prop Firms', 'Brokers']) {
    fireEvent.change(filter, { target: { value: category } })
    expect(screen.queryByRole('heading', { name: 'TradersYard' })).toBeNull()
    expect(screen.getByText(/have been added yet/)).toBeTruthy()
  }
  fireEvent.change(filter, { target: { value: 'All' } })
  expect(screen.getByRole('heading', { name: 'TradersYard' })).toBeTruthy()
})
