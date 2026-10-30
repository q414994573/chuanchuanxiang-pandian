#!/usr/bin/env python3
"""Run all isolated browser fixtures; never use production orders.
Set CCX_PLAYWRIGHT_MODULE to an installed Playwright module.
Optional: CCX_BROWSER_OUTPUT_ROOT and CCX_BROWSER_ENGINES=chromium,webkit.
System library/font environment is inherited, not hardcoded here.
"""
import concurrent.futures, hashlib, json, os, subprocess, time
from pathlib import Path

repo = Path(__file__).resolve().parent.parent
root = Path(os.environ.get('CCX_BROWSER_OUTPUT_ROOT', repo / 'test-output/browser-regression')).resolve()
root.mkdir(parents=True, exist_ok=True)
suites = ['search-progress', 'speech-navigation', 'input-speech', 'search-hub',
          'mobile-workflow', 'mobile-layout', 'feedback', 'multi-search',
          'count-search-screen', 'catalog-expansion', 'shipped-bundle', 'catalog-name-correction']
engines = os.environ.get('CCX_BROWSER_ENGINES', 'chromium,webkit').split(',')
if not engines or any(e not in ('chromium', 'webkit') for e in engines):
    raise SystemExit('Only chromium and webkit are supported')
tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=repo).decode().split('\0')
files = [p for p in tracked if p and Path(p).suffix in ('.js', '.cjs', '.json', '.css', '.html')
         and not p.startswith(('tests/', 'docs/', 'backups/', 'archive/'))]

def hashes():
    return {p: hashlib.sha256((repo / p).read_bytes()).hexdigest() for p in files}

frozen = hashes()

def run(engine):
    env = os.environ.copy()
    env.update(CCX_BROWSER_ENGINE=engine, CCX_BROWSER_SOURCE=str(repo))
    for key in ['CCX_BROWSER_WIDTHS', 'CCX_BROWSER_ROLES', 'CCX_BROWSER_MODES',
                'CCX_LAYOUT_CSS', 'CCX_BROWSER_CASE_PATTERN']:
        env.pop(key, None)
    results = []
    for suite in suites:
        output = root / engine / suite
        output.mkdir(parents=True, exist_ok=True)
        # Do not accidentally count a previous successful report after launch failure.
        for old in output.glob('*report.json'):
            old.unlink()
        env['CCX_BROWSER_OUTPUT'] = env['CCX_FEEDBACK_OUTPUT'] = str(output)
        runner = repo / 'tests' / (suite + '.browser.cjs')
        before, started = hashes(), time.monotonic()
        print(json.dumps(dict(engine=engine, suite=suite, status='started')), flush=True)
        with (output / 'runner.log').open('w') as stream:
            try:
                code = subprocess.run(['node', str(runner)], cwd=repo, env=env,
                                      stdout=stream, stderr=subprocess.STDOUT, timeout=420).returncode
            except subprocess.TimeoutExpired:
                code = 'timeout'
        entry = dict(engine=engine, suite=suite, exitCode=code,
                     seconds=round(time.monotonic()-started, 2),
                     runnerSha256=hashlib.sha256(runner.read_bytes()).hexdigest(),
                     sourceUnchanged=before == hashes() == frozen)
        reports = list(output.glob('*report.json'))
        if len(reports) == 1:
            data = json.loads(reports[0].read_text())
            entry.update(report=str(reports[0]), passed=data.get('passed'),
                         failed=data.get('failed'), pageErrors=data.get('errors', []),
                         browserVersion=data.get('browserVersion'))
        entry['ok'] = (code == 0 and entry['sourceUnchanged'] and len(reports) == 1
                       and isinstance(entry.get('passed'), int) and entry['passed'] > 0
                       and entry.get('failed') == 0 and not entry.get('pageErrors'))
        results.append(entry)
        (root / engine / 'summary.json').write_text(json.dumps(results, indent=2))
        print(json.dumps(entry), flush=True)
    return results

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results = [entry for group in pool.map(run, engines) for entry in group]
summary = dict(sourceHashes=frozen, runs=results, allPassed=all(r['ok'] for r in results))
(root / 'summary.json').write_text(json.dumps(summary, indent=2))
print(json.dumps(dict(done=True, runs=len(results), allPassed=summary['allPassed'])), flush=True)
raise SystemExit(0 if summary['allPassed'] else 1)
