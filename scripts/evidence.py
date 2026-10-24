"""Evidence balancing and crypto trends. Scores are not calibrated probabilities."""
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from math import log, tanh, isfinite
from statistics import mean

GROUPS = {'policy-rate': 'policy', 'inflation': 'inflation', 'core-inflation': 'inflation', 'wages': 'inflation',
          'employment-change': 'labour', 'unemployment-rate': 'labour', 'jobless-claims': 'labour',
          'trade-balance': 'external', 'imports': 'external', 'exports': 'external', 'foreign-reserves': 'external',
          'oil-inventories': 'inventories'}


def balance_events(weighted):
    groups = defaultdict(list)
    for event, decay in weighted:
        groups[GROUPS.get(event.get('indicatorId'), 'growth')].append(float(event['contribution']) * decay)
    factors = [{'name': name, 'score': 3 * tanh(sum(values) / 3), 'count': len(values)} for name, values in groups.items()]
    total = sum(row['score'] for row in factors)
    gross = sum(abs(value) for values in groups.values() for value in values)
    agreement = abs(sum(value for values in groups.values() for value in values)) / gross if gross else 1.0
    return tanh(total / 6), factors, agreement


def crypto_fundamentals(points, now):
    assets = defaultdict(lambda: defaultdict(dict))
    metadata = {}
    for row in points:
        if isinstance(row.get('value'), (int, float)) and isfinite(row['value']) and row['value'] >= 0 and row['date'] < now.date().isoformat():
            assets[row['instrument']][row['metric']][row['date']] = row['value']
            metadata[(row['instrument'], row['metric'])] = row
    output = []
    for symbol, metrics in assets.items():
        horizons = {}
        for horizon, days in [('shortTerm', 7), ('longTerm', 30)]:
            signals = []
            for metric, series in metrics.items():
                latest = datetime.fromisoformat(max(series)).replace(tzinfo=timezone.utc)
                if not 0 <= (now - latest).total_seconds() <= 4 * 86400:
                    continue
                # Fixed calendar windows, not the last N non-null observations.
                end = now.date() - timedelta(days=1)
                recent, prior = [], []
                for offset in range(days * 2):
                    date = end - timedelta(days=offset)
                    value = series.get(date.isoformat())
                    if metric == 'SplyCur':
                        yesterday = series.get((date - timedelta(days=1)).isoformat())
                        value = log(value / yesterday) if value and yesterday and yesterday > 0 else None
                    if value is not None:
                        (recent if offset < days else prior).append(value)
                if min(len(recent), len(prior)) < days * 0.8:
                    continue
                current, before = mean(recent), mean(prior)
                if metric == 'SplyCur':
                    # Falling issuance pressure supports scarcity; do not treat
                    # nominal supply growth itself as adoption.
                    change = (current - before) * 365 * 100
                    score = -tanh(change / 2)
                    unit = 'annualised percentage-point change in issuance'
                else:
                    if before <= 0 or current < 0:
                        continue
                    change = (current / before - 1) * 100
                    score = tanh(change / 20)
                    unit = '% change between window averages'
                meta = metadata[(symbol, metric)]
                signals.append({'metric': metric, 'name': meta['name'], 'group': 'network' if meta['group'] in {'usage', 'fees'} else meta['group'],
                    'score': score, 'change': change, 'changeUnit': unit, 'current': current, 'previous': before,
                    'observations': len(recent) + len(prior), 'asOf': latest.date().isoformat(), 'windowDays': days})
            groups = defaultdict(list)
            for signal in signals:
                groups[signal['group']].append(signal['score'])
            group_scores = [mean(values) for values in groups.values()]
            horizons[horizon] = {'score': mean(group_scores) if group_scores else 0, 'coverage': len(groups) / 3,
                'groupCount': len(groups), 'metrics': signals, 'available': bool(group_scores),
                'agreement': abs(sum(group_scores)) / sum(abs(v) for v in group_scores) if any(group_scores) else 1}
        output.append({'instrument': symbol, **horizons})
    return output


def blend_crypto(horizon, direct, config):
    macro_weight = 0.45 if config['maxAgeDays'] == 30 else 0.25
    network_weight = 0.4
    position_weight = config['cotWeight']
    # horizon retains presence flags, since a measured zero is still evidence.
    has_macro = horizon['eventCount'] > 0
    has_position = horizon.get('hasPositioning', False)
    has_direct = bool(direct and direct['available'])
    components = [(horizon['eventScore'], macro_weight, has_macro),
                  (horizon['cotScore'], position_weight, has_position),
                  (direct['score'] if has_direct else 0, network_weight, has_direct)]
    weight = sum(w for _, w, available in components if available)
    score = sum(s * w for s, w, available in components if available) / weight if weight else 0
    coverage = macro_weight * min(1, horizon.get('factorCount', 0) / 2) + position_weight * has_position
    coverage += network_weight * (direct['coverage'] if has_direct else 0)
    if not has_direct and not has_position:
        coverage = min(coverage, 0.35)
    if has_direct and direct['groupCount'] < 2 and not has_position:
        coverage = min(coverage, 0.5)
    active = [s for s, _, available in components if available and abs(s) > 0.08]
    conflict = bool(active and min(active) < 0 < max(active))
    agreement = min(horizon.get('agreement', 1) if has_macro else 1, direct.get('agreement', 1) if has_direct else 1)
    return {**horizon, 'agreement': agreement, 'score': score, 'coverage': round(coverage, 4), 'directScore': direct['score'] if has_direct else None,
            'directGroupCount': direct['groupCount'] if has_direct else 0, 'componentConflict': conflict,
            'evidenceQuality': 'limited' if coverage < .5 or conflict or agreement < .35 else 'moderate' if coverage < .8 else 'broad'}
