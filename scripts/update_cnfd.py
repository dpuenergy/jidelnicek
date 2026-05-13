"""
Full CNFD update pipeline — spusť z libovolného adresáře.

Workflow:
  1. Najde OFF dump (en.openfoodfacts.org.products.csv.gz) v nove/ nebo
     v cestě předané jako argument
  2. build_cnfd.py  — streamuje dump, filtruje CZ/SK, překládá SK→CS
  3. merge_cnfd.py  — přidá bázové suroviny na začátek
  4. Bumpe cache verzi v sw.js a index.html
  5. Git add + commit + push do dpuenergy/jidelnicek

Použití:
  python3 scripts/update_cnfd.py [cesta/k/dump.csv.gz]
"""
import subprocess, sys, os, re, hashlib, json
from datetime import datetime, timezone

REPO   = os.path.normpath(os.path.join(os.path.dirname(__file__), '..'))
NOVE   = r'c:\Users\jakub\cos\nove'
DUMP_DEFAULT = os.path.join(NOVE, 'en.openfoodfacts.org.products.csv.gz')

SW_JS      = os.path.join(REPO, 'sw.js')
INDEX_HTML = os.path.join(REPO, 'index.html')
CNFD_JSON  = os.path.join(REPO, 'shared', 'cnfd.json')

BUILD_SCRIPT = os.path.join(REPO, 'scripts', 'build_cnfd.py')
MERGE_SCRIPT = os.path.join(REPO, 'scripts', 'merge_cnfd.py')


def run(cmd, **kw):
    print(f'  $ {" ".join(cmd)}')
    result = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if result.stdout.strip():
        for line in result.stdout.strip().splitlines():
            print(f'    {line}')
    if result.returncode != 0:
        print(f'  ERROR: {result.stderr.strip()}')
        sys.exit(1)
    return result.stdout.strip()


def bump_cache_version():
    """Generate a new 7-char hex version tag and update sw.js + index.html."""
    new_ver = hashlib.md5(datetime.now(timezone.utc).isoformat().encode()).hexdigest()[:7]
    for path in [SW_JS, INDEX_HTML]:
        with open(path, encoding='utf-8') as f:
            content = f.read()
        updated = re.sub(r'v[0-9a-f]{7}', f'v{new_ver}', content)
        if updated != content:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(updated)
            print(f'  Bumped cache → v{new_ver} in {os.path.basename(path)}')
    return new_ver


def cnfd_stats():
    with open(CNFD_JSON, encoding='utf-8') as f:
        data = json.load(f)
    size_kb = os.path.getsize(CNFD_JSON) / 1024
    return len(data), size_kb


def main():
    dump = sys.argv[1] if len(sys.argv) > 1 else DUMP_DEFAULT

    if not os.path.exists(dump):
        print(f'ERROR: OFF dump nenalezen: {dump}')
        print(f'Stáhni https://world.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz')
        print(f'a ulož do {NOVE}')
        sys.exit(1)

    print(f'\n=== CNFD update pipeline ===')
    print(f'Dump: {dump}  ({os.path.getsize(dump)/1024/1024:.0f} MB)\n')

    # 1. Build (filter + translate)
    print('[1/4] build_cnfd.py — filtrování a překlad SK→CS...')
    env = os.environ.copy()
    env['CNFD_SRC'] = dump   # skript čte z env pokud existuje
    run([sys.executable, BUILD_SCRIPT], env=env, cwd=REPO)

    # 2. Merge base ingredients
    print('[2/4] merge_cnfd.py — přidání bázových surovin...')
    run([sys.executable, MERGE_SCRIPT], cwd=REPO)

    items, size_kb = cnfd_stats()
    print(f'  Výsledek: {items:,} položek, {size_kb:.0f} KB\n')

    # 3. Bump SW cache version
    print('[3/4] Bumping cache version...')
    ver = bump_cache_version()
    print()

    # 4. Git commit + push
    print('[4/4] Git commit + push...')
    ts = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    msg = (
        f'chore: cnfd.json aktualizace {ts} — {items:,} CZ/SK položek\n\n'
        f'Zdroj: Open Food Facts full dump\n'
        f'Překlad SK→CS: translate_sk_cs.py\n'
        f'Velikost: {size_kb:.0f} KB\n'
        f'Cache: v{ver}\n\n'
        f'Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>'
    )
    run(['git', 'add',
         'shared/cnfd.json', 'sw.js', 'index.html'], cwd=REPO)
    run(['git', 'commit', '-m', msg], cwd=REPO)
    run(['git', 'push'], cwd=REPO)

    print(f'\n✓ Hotovo — {items:,} položek pushed na GitHub.')
    print(f'  PWA se aktualizuje při příštím otevření appky (SW v{ver}).\n')


if __name__ == '__main__':
    main()
