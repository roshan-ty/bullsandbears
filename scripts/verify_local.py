"""Run local checks without Windows npm shims; save observable UTF-8 results."""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / '.git' / 'verification.json'
COMMANDS = [
    ['node', 'node_modules/eslint/bin/eslint.js', '.', '--max-warnings=0'],
    ['node', 'node_modules/vitest/vitest.mjs', 'run'],
    ['node', 'node_modules/typescript/bin/tsc', '-b'],
    ['node', 'node_modules/vite/bin/vite.js', 'build'],
    [sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-v'],
    [sys.executable, 'scripts/validate_snapshot.py'],
    ['git', 'diff', '--check'],
]


def main():
    results = []
    for command in COMMANDS:
        try:
            result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True,
                                    encoding='utf-8', errors='replace', timeout=300)
            results.append({'command': command, 'exit': result.returncode,
                            'output': result.stdout + result.stderr})
        except (OSError, subprocess.TimeoutExpired) as error:
            results.append({'command': command, 'exit': -1, 'output': str(error)})
        REPORT.write_text(json.dumps({'complete': False, 'results': results}, indent=2), encoding='utf-8')
    REPORT.write_text(json.dumps({'complete': True, 'results': results}, indent=2), encoding='utf-8')
    return int(any(row['exit'] for row in results))


if __name__ == '__main__':
    sys.exit(main())