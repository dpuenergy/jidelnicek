"""
Slovak → Czech word-level + character-level translation for food names.
Only translates items detected as Slovak (contain SK-specific characters
or known Slovak-only words).
"""
import re

# Slovak-specific characters (not in Czech)
SK_CHARS = set('ľĺôäŕ')

# Full-word replacements (lowercase keys, applied word-by-word)
# Longer / more specific entries must come before shorter ones — handled by
# sorting keys by descending length in _build_regex().
WORD_MAP = {
    # Meat
    'mäso':         'maso',
    'mäsa':         'masa',
    'mäsom':        'masem',
    'mäsový':       'masový',
    'mäsová':       'masová',
    'mäsové':       'masové',
    'hovädzie':     'hovězí',
    'hovädzia':     'hovězí',
    'hovädzí':      'hovězí',
    'bravčové':     'vepřové',
    'bravčová':     'vepřová',
    'bravčový':     'vepřový',
    'bravčoviny':   'vepřového masa',
    'bravčovina':   'vepřové maso',
    'kurčacie':     'kuřecí',
    'kurčacia':     'kuřecí',
    'kurací':       'kuřecí',
    'kuracia':      'kuřecí',
    'kurča':        'kuřátko',
    'hydinové':     'drůbeží',
    'hydina':       'drůbež',
    'hydinový':     'drůbeží',
    'jahňacie':     'jehněčí',
    'jahňacia':     'jehněčí',
    'teľacie':      'telecí',
    'teľacia':      'telecí',
    'králičie':     'králičí',
    'zverina':      'zvěřina',
    'zveriny':      'zvěřiny',

    # Dairy
    'mlieko':       'mléko',
    'mlieka':       'mléka',
    'mliekom':      'mlékem',
    'mliečny':      'mléčný',
    'mliečna':      'mléčná',
    'mliečne':      'mléčné',
    'mliečnych':    'mléčných',
    'mliečnou':     'mléčnou',
    'smotana':      'smetana',
    'smotany':      'smetany',
    'smotanou':     'smetanou',
    'smotanový':    'smetanový',
    'smotanová':    'smetanová',
    'smotanové':    'smetanové',
    'maslo':        'máslo',
    'masla':        'másla',
    'maslový':      'máslový',
    'maslová':      'máslová',
    'maslové':      'máslové',
    'syr':          'sýr',
    'syra':         'sýra',
    'syre':         'sýru',
    'syrom':        'sýrem',
    'syrový':       'sýrový',
    'syrová':       'sýrová',
    'syrové':       'sýrové',
    'bryndza':      'bryndza',   # keep — known brand/product name
    'acidofilné':   'acidofilní',
    'acidofilný':   'acidofilní',

    # Vegetables
    'zemiaky':      'brambory',
    'zemiakov':     'brambor',
    'zemiak':       'brambora',
    'zemiakový':    'bramborový',
    'zemiakové':    'bramborové',
    'paradajky':    'rajčata',
    'paradajiek':   'rajčat',
    'paradajka':    'rajče',
    'paradajkový':  'rajčatový',
    'paradajková':  'rajčatová',
    'paradajkové':  'rajčatové',
    'cibule':       'cibule',    # same
    'cibuľa':       'cibule',
    'cibuľový':     'cibulový',
    'cibuľová':     'cibulová',
    'cesnak':       'česnek',
    'cesnaku':      'česneku',
    'cesnakom':     'česnekem',
    'cesnakový':    'česnekový',
    'cesnakové':    'česnekové',
    'mrkva':        'mrkev',
    'mrkvy':        'mrkve',
    'mrkvový':      'mrkvový',   # same
    'kapusta':      'kapusta',   # same in both (white cabbage)
    'šalát':        'salát',
    'šalátu':       'salátu',
    'šošovica':     'čočka',
    'šošovice':     'čočky',
    'šošovicová':   'čočková',
    'šošovicový':   'čočkový',
    'hrach':        'hrách',
    'hrachu':       'hráchu',
    'fazuľa':       'fazole',
    'fazule':       'fazole',    # same
    'kukurica':     'kukuřice',
    'kukurice':     'kukuřice',
    'kukuricový':   'kukuřičný',
    'kukuricová':   'kukuřičná',
    'kukuricové':   'kukuřičné',
    'hrášok':       'hrášek',
    'hrášku':       'hrášku',    # same
    'repa':         'řepa',
    'repy':         'řepy',
    'repový':       'řepový',
    'repkový':      'řepkový',   # same
    'špargľa':      'chřest',
    'pór':          'pórek',

    # Fruit
    'ovocie':       'ovoce',
    'ovocia':       'ovoce',
    'ovocný':       'ovocný',    # same
    'jablká':       'jablka',
    'jabĺk':        'jablek',
    'jablkový':     'jablkový',  # same
    'čučoriedky':   'borůvky',
    'čučoriedka':   'borůvka',
    'čučoriediek':  'borůvek',
    'čučoriedková': 'borůvková',
    'čučoriedkový': 'borůvkový',
    'čučoriedkové': 'borůvkové',
    'ríbezle':      'rybíz',
    'ríbezlí':      'rybízu',
    'broskyne':     'broskve',
    'broskyňa':     'broskev',
    'broskyňový':   'broskvový',
    'slivky':       'švestky',
    'slivka':       'švestka',
    'slivkový':     'švestkový',
    'pomaranč':     'pomeranč',
    'pomaranča':    'pomeranče',
    'pomarančový':  'pomerančový',
    'pomarančová':  'pomerančová',
    'pomarančové':  'pomerančové',
    'citrón':       'citron',
    'citróna':      'citronu',
    'citrónový':    'citronový',
    'hrozno':       'hrozny',
    'hrozna':       'hroznů',
    'hroznový':     'hroznový',  # same
    'maliny':       'maliny',    # same
    'jahody':       'jahody',    # same
    'jahoda':       'jahoda',    # same

    # Grains / bakery
    'ryža':         'rýže',
    'ryže':         'rýže',
    'ryžový':       'rýžový',
    'ryžová':       'rýžová',
    'ryžové':       'rýžové',
    'cestoviny':    'těstoviny',
    'cestovín':     'těstovin',
    'chlieb':       'chléb',
    'chleba':       'chleba',    # same
    'chlebový':     'chlebový',  # same
    'múka':         'mouka',
    'múky':         'mouky',
    'múkou':        'moukou',
    'pšenica':      'pšenice',
    'pšeničná':     'pšeničná',  # same
    'pšeničný':     'pšeničný',  # same
    'ovos':         'oves',
    'ovsa':         'ovsa',
    'ovsený':       'ovesný',
    'ovsená':       'ovesná',
    'ovsené':       'ovesné',
    'jačmeň':       'ječmen',
    'jačmenný':     'ječmenný',
    'pohánka':      'pohanka',
    'pohánky':      'pohanky',
    'pohánková':    'pohanková',
    'pohánkový':    'pohankový',
    'pohánkové':    'pohankové',
    'kukuričný':    'kukuřičný',
    'kukuričná':    'kukuřičná',
    'kukuričné':    'kukuřičné',
    'celozrnná':    'celozrnná',  # same
    'celozrnný':    'celozrnný',  # same
    'celozrnné':    'celozrnné',  # same
    'knedľa':       'knedlík',
    'knedle':       'knedlíky',
    'knedlíky':     'knedlíky',  # same

    # Common descriptors
    'mrazený':      'mražený',
    'mrazená':      'mražená',
    'mrazené':      'mražené',
    'varený':       'vařený',
    'varená':       'vařená',
    'varené':       'vařené',
    'pečený':       'pečený',    # same
    'údený':        'uzený',
    'údená':        'uzená',
    'údené':        'uzené',
    'solený':       'solený',    # same
    'slaný':        'slaný',     # same
    'sladký':       'sladký',    # same
    'kyslý':        'kyselý',
    'kyslá':        'kyselá',
    'kyslé':        'kyselé',
    'horký':        'hořký',
    'horká':        'hořká',
    'horké':        'hořké',
    'čerstvý':      'čerstvý',   # same
    'sušený':       'sušený',    # same
    'organický':    'organický', # same
    'prírodný':     'přírodní',
    'prírodná':     'přírodní',
    'prírodné':     'přírodní',
    'bio':          'bio',       # same
    'light':        'light',     # same

    # Other common food words
    'soľ':          'sůl',
    'soli':         'soli',      # same
    'cukor':        'cukr',
    'cukru':        'cukru',     # same
    'cukrový':      'cukrový',   # same
    'olej':         'olej',      # same
    'polievka':     'polévka',
    'polievky':     'polévky',
    'polievkový':   'polévkový',
    'omáčka':       'omáčka',    # same
    'džem':         'džem',      # same
    'med':          'med',       # same
    'medu':         'medu',      # same
    'medový':       'medový',    # same
    'kakao':        'kakao',     # same
    'čokoláda':     'čokoláda',  # same
    'vanilka':      'vanilka',   # same
    'škorica':      'skořice',
    'škoricový':    'skořicový',
    'škoricová':    'skořicová',
    'škoricové':    'skořicové',
    'zázvor':       'zázvor',    # same
    'koriander':    'koriandr',
    'bazalka':      'bazalka',   # same
    'petržlen':     'petržel',
    'šunka':        'šunka',     # same
    'saláma':       'salám',
    'salámy':       'salámu',
    'klobása':      'klobása',   # same
    'párky':        'párky',     # same (párek)
    'tyčinka':      'tyčinka',   # same
    'tyčinky':      'tyčinky',   # same
    'kaša':         'kaše',
    'kaše':         'kaše',      # same
    'müsli':        'müsli',     # same
    'proteínový':   'proteinový',
    'proteínová':   'proteinová',
    'proteínové':   'proteinové',
    'proteín':      'protein',
    'lesné':        'lesní',
    'lesný':        'lesní',
    'domáci':       'domácí',
    'domáca':       'domácí',
    'domáce':       'domácí',
    'tradičný':     'tradiční',
    'tradičná':     'tradiční',
    'tradičné':     'tradiční',
    'kúsky':        'kousky',
    'kúsok':        'kousek',
    'plnený':       'plněný',
    'plnená':       'plněná',
    'plnené':       'plněné',
    'náplň':        'náplň',     # same
    'bez pridaného': 'bez přidaného',
    'bez pridaných': 'bez přidaných',
    'pridaný':      'přidaný',
    'pridaná':      'přidaná',
    'pridané':      'přidané',
    'nízkotučný':   'nízkotučný',  # same
    'nízkotučná':   'nízkotučná',  # same
    'nízkotučné':   'nízkotučné',  # same
    'plnotučný':    'plnotučný',   # same
    's obsahom':    's obsahem',
    'obsah':        'obsah',       # same
    'výrobok':      'výrobek',
    'výrobky':      'výrobky',     # same
    'výrobku':      'výrobku',     # same
    'surový':       'syrový',
    'surová':       'syrová',
    'surové':       'syrové',
}

# Character-level fallback (applied after word map, for remaining SK chars)
CHAR_MAP = str.maketrans({'ľ': 'l', 'ĺ': 'l', 'ô': 'ů', 'ä': 'e', 'ŕ': 'r'})

# Build word-matching regex (longest keys first to avoid partial overlaps)
def _build_pattern():
    keys = sorted(WORD_MAP.keys(), key=len, reverse=True)
    escaped = [re.escape(k) for k in keys]
    return re.compile(r'\b(' + '|'.join(escaped) + r')\b', re.IGNORECASE)

_PATTERN = _build_pattern()

def _replace(m):
    word = m.group(0)
    key = word.lower()
    replacement = WORD_MAP.get(key, word)
    # Preserve original capitalisation
    if word[0].isupper():
        replacement = replacement[0].upper() + replacement[1:]
    return replacement

def is_slovak(name: str) -> bool:
    """Returns True if the name is likely Slovak."""
    if any(c in SK_CHARS for c in name):
        return True
    low = name.lower()
    sk_markers = [
        'mlieko', 'hovädz', 'bravčov', 'kurčac', 'kurací', 'jahňac',
        'zemiaky', 'paradajk', 'čučoried', 'ovocie', 'ryža',
        'cestoviny', 'chlieb', 'múka', 'šošovic', 'fazuľ', 'kukurica',
        'smotana', 'maslo', 'varený', 'mrazený', 'údený', 'kyslý',
        'prírodný', 'polievka', 'lesné', 'kúsky', 'domáci',
        'mäso', 'soľ', 'syr ', 'syra', 'syre', 'syrom',
    ]
    return any(m in low for m in sk_markers)

def translate(name: str) -> str:
    """Translate a Slovak food name to Czech. Returns original if not Slovak."""
    if not is_slovak(name):
        return name
    result = _PATTERN.sub(_replace, name)
    result = result.translate(CHAR_MAP)
    return result


if __name__ == '__main__':
    tests = [
        '100% Ovčia Bryndza',
        'Kúsky tvarohu protein lesné ovocie',
        'Activia Jogurt Višňový s Bifidogénnou Kultúrou',
        'Hovädzie mäso varené',
        'Bravčové kotlety',
        'Zemiakové lupienky so soľou',
        'Čučoriedkový jogurt',
        'Kuřecí prsa',    # Czech — should not change
        'Ovesné vločky',  # Czech — should not change
    ]
    for t in tests:
        out = translate(t)
        marker = '  ✓' if out == t else f'  → {out}'
        print(f'{t}{marker}')
