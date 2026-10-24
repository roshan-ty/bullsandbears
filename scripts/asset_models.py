"""Explicit calendar sensitivities. These are directional rules, not return forecasts."""

CRYPTO = {'AVAXUSD', 'BTCUSD', 'ETHUSD', 'LTCUSD', 'SOLUSD', 'SUIUSD', 'XLMUSD', 'XRPUSD'}
INDEX_REGIONS = {'AUS200': 'AUD', 'CH20': 'CHF', 'ES35': 'EUR', 'EU50': 'EUR',
                 'FR40': 'EUR', 'GB100': 'GBP', 'GE40': 'EUR', 'HK50': 'CNY',
                 'JP225': 'JPY', 'US100': 'USD', 'US30': 'USD', 'US500': 'USD'}
GROWTH = {'gdp', 'manufacturing-pmi', 'services-pmi', 'business-sentiment',
          'retail-sales', 'industrial-production', 'housing'}
TIGHTENING = {'policy-rate', 'inflation', 'core-inflation'}


def macro_weights(instrument, defaults):
    if instrument in INDEX_REGIONS:
        region = INDEX_REGIONS[instrument]
        if instrument == 'HK50':
            return {'CNY': 0.6, 'HKD': 0.25, 'USD': 0.15}
        return {region: 1.0} if region == 'USD' else {region: 0.8, 'USD': 0.2}
    if instrument in CRYPTO or instrument in {'XAUUSD', 'XAGUSD', 'XPDUSD', 'XPTUSD'}:
        return {'USD': 1.0}
    return {key: abs(value) for key, value in defaults.items()}


def sensitivity(instrument, event):
    indicator = event.get('indicatorId')
    if instrument in CRYPTO:
        # No token-specific inference from payrolls, exports or USD positioning.
        return -1.0 if indicator in TIGHTENING else None
    if instrument in INDEX_REGIONS:
        if indicator in TIGHTENING:
            return -1.2 if instrument == 'US100' else -0.8 if instrument == 'US30' else -1.0
        if indicator in GROWTH:
            return 0.8
        if indicator in {'employment-change', 'unemployment-rate', 'jobless-claims'}:
            return 0.4
        return None
    if instrument in {'XAUUSD', 'XAGUSD', 'XPTUSD', 'XPDUSD'}:
        return -1.0 if indicator in TIGHTENING else None
    if instrument in {'OIL', 'BRENT'}:
        if indicator == 'oil-inventories':
            return 1.0
        if indicator in GROWTH:
            return 0.6
        return -0.5 if indicator in TIGHTENING else None
    if instrument == 'COPPER':
        if event.get('currency') == 'CNY' and indicator in GROWTH:
            return 1.0
        return -1.0 if event.get('currency') == 'USD' and indicator in TIGHTENING else None
    return None


def asset_events(instrument, events, weights):
    output = []
    for event in events:
        currency = event.get('currency')
        direct = instrument in event.get('affectedCurrencies', [])
        if currency not in weights and not direct:
            continue
        effect = sensitivity(instrument, event)
        if effect is None or event.get('signal') is None:
            continue
        contribution = event['contribution'] * effect * (1.0 if direct else weights[currency])
        output.append({**event, 'contribution': contribution,
                       'signal': 1 if contribution > 0 else -1 if contribution < 0 else 0,
                       'bias': 'bullish' if contribution > 0 else 'bearish' if contribution < 0 else 'neutral',
                       'assetEffect': effect, 'affectedCurrencies': [instrument]})
    return output


def model_note(instrument, has_positioning):
    if instrument in CRYPTO:
        return ('US inflation and policy-rate changes describe the shared liquidity backdrop. '
                + ('Direct futures positioning adds instrument-specific evidence. ' if has_positioning else 'No direct positioning is available; token fundamentals are not measured. ')
                + 'This is a macro sensitivity model, not a calibrated return forecast.')
    if instrument in INDEX_REGIONS:
        return ('Growth and employment improvements support earnings; rising policy rates and inflation weigh on the discount-rate channel. '
                'Regional calendar inputs and direct positioning are used when available. Sector earnings and valuations are not measured.')
    return 'Released calendar changes use explicit demand, inventory and monetary-policy sensitivities, with direct positioning when available.'
