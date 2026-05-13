"""
Build cnfd.json from Open Food Facts full CSV dump.
Filters: countries_tags contains en:czechia or en:slovakia
         + valid kcal, protein, carbs, fat per 100g
         + non-empty product name
Output: shared/cnfd.json  (array of {name, kcal, p, c, f, cat})
"""
import gzip, csv, json, sys, os, re, html
sys.path.insert(0, os.path.dirname(__file__))
from translate_sk_cs import translate, is_slovak
csv.field_size_limit(10_000_000)

CZ_CHARS = set('áéíóúůčřšžýěďťňÁÉÍÓÚŮČŘŠŽÝĚĎŤŇ')

def has_czech(s):
    return any(c in CZ_CHARS for c in s)

SRC  = os.environ.get('CNFD_SRC', r'c:\Users\jakub\cos\nove\en.openfoodfacts.org.products.csv.gz')
OUT  = os.path.join(os.path.dirname(__file__), '..', 'shared', 'cnfd.json')

# Column indices (0-based), identified from header
COL_NAME     = 10   # product_name
COL_COUNTRIES= 40   # countries_tags
COL_CAT      = 81   # main_category_en
COL_KCAL     = 89   # energy-kcal_100g
COL_FAT      = 92   # fat_100g
COL_CARBS    = 129  # carbohydrates_100g
COL_PROT     = 150  # proteins_100g

REQUIRED_COLS = [COL_NAME, COL_KCAL, COL_FAT, COL_CARBS, COL_PROT]
MAX_COL = max(COL_NAME, COL_COUNTRIES, COL_CAT, COL_KCAL, COL_FAT, COL_CARBS, COL_PROT)

CZ_SK_TAGS = {'en:czech-republic', 'en:czechia', 'en:slovakia'}

def to_float(s):
    try:
        v = float(s)
        return v if 0 <= v <= 9000 else None
    except (ValueError, TypeError):
        return None

def clean_name(s):
    # Strip leading/trailing whitespace and collapse internal spaces
    s = s.strip()
    s = re.sub(r'\s+', ' ', s)
    return s

def short_cat(s):
    # Take first meaningful English category word
    if not s:
        return ''
    # categories_en is comma-separated, main_category_en is a single value like "en:meats"
    cat = s.split(':')[-1].replace('-', ' ').strip()
    return cat[:40] if cat else ''

results = []
seen_names = set()
total = 0
kept  = 0

print('Streaming CSV...', flush=True)

with gzip.open(SRC, 'rt', encoding='utf-8', errors='replace') as f:
    reader = csv.reader(f, delimiter='\t')
    header = next(reader)  # skip header

    for row in reader:
        total += 1
        if total % 500_000 == 0:
            print(f'  {total:,} rows processed, {kept:,} kept so far...', flush=True)

        if len(row) <= MAX_COL:
            continue

        # Country filter
        countries = row[COL_COUNTRIES]
        if not any(tag in countries for tag in CZ_SK_TAGS):
            continue

        name = clean_name(html.unescape(row[COL_NAME]))
        if not name or len(name) < 2 or len(name) > 120:
            continue

        # Deduplicate by lowercase name
        key = name.lower()
        if key in seen_names:
            continue

        kcal = to_float(row[COL_KCAL])
        prot = to_float(row[COL_PROT])
        carb = to_float(row[COL_CARBS])
        fat  = to_float(row[COL_FAT])

        if None in (kcal, prot, carb, fat):
            continue

        # Sanity: kcal roughly consistent with macros (allow 30% tolerance)
        calc = prot * 4 + carb * 4 + fat * 9
        if kcal > 10 and calc > 0:
            ratio = kcal / calc
            if ratio < 0.5 or ratio > 2.0:
                continue  # bad data

        cat = short_cat(row[COL_CAT])

        translated = translate(name)
        results.append({
            'name': translated,
            'kcal': round(kcal),
            'p':    round(prot, 1),
            'c':    round(carb, 1),
            'f':    round(fat, 1),
            'cat':  cat,
            '_cz':  1 if has_czech(translated) else 0,  # for sorting
        })
        seen_names.add(key)
        kept += 1

print(f'\nTotal rows: {total:,}')
print(f'Czech/Slovak products with valid macros: {kept:,}')

# Czech-named items first, then alphabetical
results.sort(key=lambda x: (1 - x['_cz'], x['name'].lower()))
# Strip the sort helper from output
for r in results:
    del r['_cz']

out_path = os.path.normpath(OUT)
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, separators=(',', ':'))

size_kb = os.path.getsize(out_path) / 1024
print(f'Written: {out_path}')
print(f'Size: {size_kb:.0f} KB  ({kept:,} items)')
