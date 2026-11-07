export const isTradersYard = import.meta.env.VITE_EDITION === 'tradersyard'
export const productName = isTradersYard ? 'TradersYard Screener' : 'Bulls & Bears Screener'
export const logoLabel = isTradersYard ? 'TradersYard' : 'Bulls & Bears'
