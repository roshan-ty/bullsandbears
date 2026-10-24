"""Coverage reporting and bounded archives; never manufactures missing values."""
from datetime import datetime, timezone


def calendar_health(events, attempted):
    released = sum(item.get('actual') is not None for item in events)
    return {'feed': 'calendar', 'status': 'healthy' if released else 'degraded',
            'lastAttemptAt': attempted, 'lastSuccessAt': attempted if events else None,
            'staleAfterHours': 12, 'itemCount': len(events),
            'message': f'{len(events)} events; {released} have reported actuals.'}


def archive_positions(current, previous, now):
    cutoff = now.timestamp() - 3 * 366 * 86400
    archive = {}
    for row in [*previous, *current]:
        try:
            date = datetime.fromisoformat(row['reportDate']).replace(tzinfo=timezone.utc)
            if cutoff <= date.timestamp() <= now.timestamp():
                archive[(row['marketId'], row['category'], row['reportDate'])] = row
        except (KeyError, ValueError, TypeError):
            continue
    return sorted(archive.values(), key=lambda row: row['reportDate'], reverse=True)


def observation_health(feed, rows, date_key, attempted, max_age_days):
    now = datetime.fromisoformat(attempted.replace('Z', '+00:00'))
    times = []
    for row in rows:
        try:
            date = datetime.fromisoformat(str(row[date_key]).replace('Z', '+00:00'))
            if date.tzinfo is None:
                date = date.replace(tzinfo=timezone.utc)
            if date <= now:
                times.append(date)
        except (KeyError, ValueError, TypeError):
            continue
    latest = max(times) if times else None
    healthy = latest is not None and (now - latest).total_seconds() <= max_age_days * 86400
    return {'feed': feed, 'status': 'healthy' if healthy else 'degraded' if rows else 'unavailable',
            'lastAttemptAt': attempted, 'lastSuccessAt': latest.isoformat().replace('+00:00', 'Z') if latest else None,
            'staleAfterHours': max_age_days * 24, 'itemCount': len(rows),
            'message': 'Latest observation date is preserved.'}
