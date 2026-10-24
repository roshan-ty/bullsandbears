"""Versioned economic channels. Mechanisms are established; return mappings are assumptions."""
RULES = [
    {'id':'policy','name':'Monetary policy','indicators':['policy-rate'],
     'mechanism':'Policy rates influence financing costs, asset discount rates and relative currency returns.',
     'mapping':'Higher policy-rate changes support the currency channel; they weigh on equity, crypto and precious-metal discount-rate channels.',
     'limit':'Markets react to expected future policy and surprises. A rate hike already priced in can coincide with a weaker currency.',
     'reference':'https://www.federalreserve.gov/monetarypolicy/monetary-policy-what-are-its-goals-how-does-it-work.htm'},
    {'id':'inflation','name':'Inflation and wages','indicators':['inflation','core-inflation','wages'],
     'mechanism':'Inflation and wages inform purchasing power, profit margins and the policy outlook.',
     'mapping':'The currency model assumes higher inflation increases tightening pressure. Index and crypto models apply the discount-rate channel.',
     'limit':'Supply shocks, stagflation and credibility concerns can reverse the currency response. High inflation is not automatically risk-on.',
     'reference':'https://www.federalreserve.gov/monetarypolicy/monetary-policy-what-are-its-goals-how-does-it-work.htm'},
    {'id':'labour','name':'Employment','indicators':['employment-change','unemployment-rate','jobless-claims'],
     'mechanism':'Employment and unemployment inform income, demand and resource slack.',
     'mapping':'Stronger employment supports currency and earnings channels; unemployment and claims use inverse direction.',
     'limit':'Strong jobs can also increase expected interest rates. Revisions, labour-force participation and the business cycle matter.',
     'reference':'https://www.bls.gov/cps/definitions.htm'},
    {'id':'growth','name':'Growth and activity','indicators':['gdp','manufacturing-pmi','services-pmi','business-sentiment','retail-sales','industrial-production','housing'],
     'mechanism':'Output and demand influence earnings, imports and industrial commodity consumption.',
     'mapping':'Improving activity supports the currency and index earnings channels; commodity effects depend on the mapped consuming economy.',
     'limit':'A rising PMI below 50 is improvement, not necessarily expansion. Annual and quarterly series cannot be treated as interchangeable.',
     'reference':'https://www.bea.gov/resources/learning-center/what-to-know-gdp'},
    {'id':'external','name':'External balance','indicators':['trade-balance','imports','exports','foreign-reserves'],
     'mechanism':'Trade flows and external financing affect demand for currencies.',
     'mapping':'Only explicitly classified releases are used; a trade-balance improvement is a conditional currency support.',
     'limit':'Imports can rise because domestic demand is strong. Reserve changes and managed exchange rates do not have a universal trading sign.',
     'reference':'https://www.bea.gov/resources/learning-center/what-to-know-gdp'},
    {'id':'inventories','name':'Energy inventories','indicators':['oil-inventories'],
     'mechanism':'Inventory changes reflect the balance between production, imports and consumption.',
     'mapping':'Inventory draws support the oil demand/supply channel; builds weigh on it.',
     'limit':'Seasonality, refinery maintenance, exports and expectations can change the interpretation. The direction alone is not a forecast.',
     'reference':'https://www.eia.gov/petroleum/supply/weekly/'},
    {'id':'positioning','name':'Reported futures positioning','indicators':[],
     'mechanism':'COT measures positions in specified futures markets and trader categories.',
     'mapping':'Net contracts divided by open interest is a positioning input. One family and contract avoid duplicate votes.',
     'limit':'Positions are lagged holdings, not certain intentions. Extreme positioning is not an automatic reversal signal; non-reportable does not mean retail.',
     'reference':'https://www.cftc.gov/MarketReports/CommitmentsofTraders/ExplanatoryNotes/index.htm'},
    {'id':'network','name':'Crypto network and liquidity','indicators':[],
     'mechanism':'Activity, issuance and stablecoin balances describe usage, supply pressure and chain liquidity.',
     'mapping':'Complete 7/30-day windows create separate network, supply and liquidity factors, then blend with macro and direct positioning.',
     'limit':'Bots, congestion and token design break simple usage-to-price relationships. Unlocks, value capture and ETF flows are incomplete.',
     'reference':'https://docs.coinmetrics.io/api/v4/'},
]
GROUPS = {indicator: row['id'] for row in RULES for indicator in row['indicators']}
MODEL_VERSION = 'balanced-evidence-v3'


def component(key, name, score, weight, available=True, rule=None):
    return {'key':key, 'name':name, 'score':score if available else None, 'weight':weight if available else 0,
            'contribution':score * weight if available else 0, 'available':available, 'ruleId':rule or key}


def record_scores(previous, pairs, prices, stamp):
    """First observation per UTC day/model/horizon is immutable. No retroactive history."""
    from datetime import datetime, timezone, timedelta
    now = datetime.fromisoformat(stamp.replace('Z','+00:00'))
    cutoff = (now - timedelta(days=1095)).date().isoformat()
    records = {(r['instrument'],r['horizon'],r['recordedAt'][:10],r['modelVersion']):r for r in previous
               if cutoff <= r['recordedAt'][:10] <= stamp[:10]}
    quotes = {r['instrument']:r for r in prices}
    for pair in pairs:
        for horizon in ('shortTerm','longTerm'):
            reading = pair[horizon]
            key = (pair['symbol'],horizon,stamp[:10],pair.get('modelVersion', MODEL_VERSION))
            if key in records: continue
            quote = quotes.get(pair['symbol'])
            if quote:
                date = datetime.fromisoformat(quote['asOf'].replace('Z','+00:00'))
                if date.tzinfo is None: date = date.replace(tzinfo=timezone.utc)
                if not 0 <= (now-date).total_seconds() <= 5*86400: quote = None
            records[key] = {'instrument':pair['symbol'],'horizon':horizon,'recordedAt':stamp,'modelVersion':key[3],
                            'score':reading['score'],'label':reading['label'],'coverage':reading['coverage'],
                            'referencePrice':quote['price'] if quote else None,'priceAsOf':quote['asOf'] if quote else None}
    return sorted(records.values(),key=lambda r:(r['recordedAt'],r['instrument'],r['horizon']))
