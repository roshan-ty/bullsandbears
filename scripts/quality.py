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