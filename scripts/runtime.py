"""Local configuration; environment secrets always take precedence."""
import os
from pathlib import Path


def load_env(root: Path) -> None:
    path = root / '.env'
    if path.exists():
        for line in path.read_text(encoding='utf-8').splitlines():
            if line.strip() and not line.lstrip().startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                os.environ.setdefault(key.strip(), value.strip().strip('\"').strip("'"))


def safe_error(error: Exception) -> str:
    # HTTP exceptions can include query-string API keys. Never log their URL.
    code = getattr(error, 'code', None)
    return f'{type(error).__name__}' + (f' (HTTP {code})' if code else '')
