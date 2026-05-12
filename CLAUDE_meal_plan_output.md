# BEN — Generování jídelníčku pro PC verzi i mobilní aplikaci

## Dva výstupy, jeden formát dat

BEN nyní zásobuje **dva nezávislé klienty stejným JSON formátem**:

| Klient | Soubor | Účel | Distribuce |
|---|---|---|---|
| **PC verze** | `jidelnicek_sablona.html` | Týdenní přehled, tisk A4, edit/swap při sestavování | BEN nahradí JSON v souboru → uživatel otevře v prohlížeči |
| **Mobile App** | `jidelnicek_app.html` | Denní tracking, fotky, chat, multi-plan | Uživatel app má nainstalovanou (PWA na home screen). BEN exportuje JSON; uživatel ho vloží přes "+ Přidat plán" |

**Stejné JSON schéma platí pro oba.** Šablona ho injektuje do `<script id="plan-data">`, app ho parsuje při importu a uloží do `localStorage` jako jeden z mnoha plánů.

## Workflow pro BEN

1. BEN sestaví plán podle interních pravidel (recepty, cíle, batch logika)
2. BEN vytvoří JSON podle schématu níže
3. **Pro PC verzi**: BEN otevře `jidelnicek_sablona.html`, najde blok `<script id="plan-data" type="application/json">…</script>` a nahradí jeho obsah; uloží jako `jidelnicek_<id>.html`
4. **Pro mobil**: BEN uloží JSON jako `<id>.json` a doručí uživateli (e-mail, Slack, file share). Uživatel ho otevře, zkopíruje, vloží v aplikaci přes "+ Přidat plán".
5. **Klíč pravidlo**: BEN šablonu ani app nemodifikuje strukturálně. Vizuální změny řeší Claude / hlavní orchestrátor, ne generační skript.

## Mobile App: rozdělení odpovědností

Uživatel v mobile app může:
- **Přepínat mezi více plány** (multi-plan storage v localStorage)
- **Procházet plán po dnech** (day pager, swipe gestures)
- **Označit pokrm jako "Snědeno"** (toggle, persistuje per plan)
- **Vyfotit jídlo nebo vybrat z galerie** → Claude vision API → odhad maker → nahradit pokrm v plánu s notou `"odhad z fotky"`
- **Položit otázku k pokrmu** ("co kdybych snědl jen půlku rýže?") — chat s Claude API, historie persisted per meal
- **Smazat plán** (long-press na kartě 0.8 s)

Mobile app **nevolá BEN** — je čistě client-side. Komunikace s BEN je jednosměrná (BEN → JSON → app). Pokud bys chtěl obousměrnou ("App ti pošle seznam co Verča snědla zpět k BEN-ovi"), to je Phase 2.

## Co mobile app NEDĚLÁ v aktuální verzi (Phase 2 / 3)

- **Nahradit pokrm jinak než fotkou** — recept-picker (z BEN-ových importovaných receptů), manual entry (jen název + makra) → nemá zatím UI
- **Recept knihovna** — žádný import receptů z BEN
- **Sync mobile → BEN** — co bylo snědeno se neposílá zpět
- **Offline mode** — bez service workeru je závislost na cache prohlížeče
- **Push notifikace** — žádné (potřebovalo by backend)
- **Sdílení plánů mezi zařízeními** — localStorage je per-device. Vám dvěma (ty + Verča) musí BEN poslat JSON na obě zařízení zvlášť.

## JSON schéma

### Top-level
```json
{
  "id": "string",            // POVINNÉ. Unikátní ID pro tento běh (invaliduje localStorage)
  "plan_title": "string",    // volitelné. H1 nadpis. Default "Jídelníček"
  "date_range": "string",    // volitelné. Např. "11. – 16. května 2026" nebo "12. května 2026"
  "persons": { ... },        // POVINNÉ
  "slots": [ ... ],          // POVINNÉ
  "slot_labels": { ... },    // POVINNÉ
  "days": [ ... ]            // POVINNÉ. Libovolný počet (1, 3, 5, 7, 14...)
}
```

**Vyhozené v aktuální verzi:**
- `week_label` — žádné "Týden 19". Plán nemusí být po-ne, datumy se ukazují přímo
- `shopping_list` — nákupní seznam BEN řeší separátně, ne v šabloně

### Persons (vždy obě)
```json
"persons": {
  "jakub": {
    "label": "K",                    // 1-2 char tag pro UI (vidět vedle pokrmů)
    "name": "Kuba",                  // plné jméno (vidět v denním souhrnu, target pillu)
    "targets": {
      "kcal":  2400,                 // POVINNÉ
      "p":     180,                  // bílkoviny (B) — volitelné, ale doporučeno
      "c":     200,                  // sacharidy (S) — volitelné, ale doporučeno
      "f":     130,                  // tuky      (T) — volitelné, ale doporučeno
      "fiber": 35                    // vláknina  (V) — VOLITELNÉ. Pokud chybí u obou osob, UI vláknu vůbec nezobrazí
    }
  },
  "partnerka": {
    "label": "V",
    "name":  "Verča",
    "targets": { ... }
  }
}
```

**Klíče `jakub` / `partnerka` jsou interní — neměň je.** Display name a label se mění přes `name` a `label`.

### Slots
```json
"slots": ["snidane", "obed", "svacina", "vecere"],
"slot_labels": {
  "snidane": "snídaně",
  "obed":    "oběd",
  "svacina": "svačina",
  "vecere":  "večeře"
}
```

Pořadí v `slots` určuje pořadí zobrazení. Můžeš mít méně slotů (např. jen `["snidane","obed","vecere"]`) — UI se přizpůsobí.

### Days
```json
"days": [
  {
    "name": "Pondělí",                       // POVINNÉ. Den v týdnu nebo libovolný popisek ("Den 1", "Tréninkový den")
    "date": "11. 5.",                        // volitelné. Krátké datum
    "note": "Kuba v Kloboučku",              // volitelné. Kontext celého dne (oranžový akcent v hlavičce karty)
    "meals": { ... }                         // POVINNÉ. Klíče = slot keys
  },
  ...
]
```

### Meals (uvnitř `day.meals[slotKey]`)

Pro každý slot máš **dvě možnosti** — individuální nebo sdílený:

#### Individuální (preferovaný pro reálná data)
Každá osoba má vlastní pokrm:
```json
"snidane": {
  "jakub":     { /* meal */ },
  "partnerka": { /* meal */ }
}
```
Jedna z osob může chybět (např. Verča má v daný slot prázdno).

#### Sdílený (jeden recept, různé porce)
```json
"obed": {
  "shared": {
    "name":              "Kuřecí prsa s rýží a brokolicí",
    "macros_jakub":      { "kcal": 780, "p": 58, "c": 85, "f": 18 },
    "macros_partnerka":  { "kcal": 620, "p": 46, "c": 68, "f": 14 },
    "note":              "volitelné"
  }
}
```
**Doporučení:** pro běžnou tvorbu používej **individuální** format. Sdílený má smysl jen když chceš v UI tag „K·V" a zákaz cross-person swapu. Pokud jsi v pochybnostech, jdi individuálně.

### Meal objekt
```json
{
  "name":   "Losos 250g + wakame 50g + bylinkové máslo 25g",
  "note":   "z batch úterý",                        // volitelné
  "macros": {
    "kcal": 718,
    "p":    52,
    "c":    4,
    "f":    58,
    "fiber": null                                   // volitelně, pokud trackuješ
  }
}
```

**Pravidla pro `name`:**
- Piš inline všechny ingredience včetně gramáže
- Konvence z reálného plánu: `"Losos 250g + wakame 50g + bylinkové máslo 25g"`
- Pro sendviče: `"Sendvič: chléb 60g + lučina 50g + fuet 50g + microgreens"`
- Položky bez gramáže (microgreens, sůl, koření) piš bez čísla
- Vejce: `"3× vejce tvrdé"` (s × prefixem)
- Z `name` musí být sestavitelný talíř — uživatel doslova řekl „z tohohle nedám dohromady talíř" jako důvod, proč ingredience musí být vidět

**Pravidla pro `note`:**
- Krátký kontext k tomuto konkrétnímu pokrmu (1-5 slov)
- Konvence z reálného plánu:
  - `"→ batch: St + Pá"` — z tohohle pokrmu vznikne porce pro Středu a Pátek
  - `"z batch úterý"` — tento pokrm je leftover z úterní várky
  - `"na cestách"`, `"v krabičce"` — kontext spotřeby
  - `"odhad"` — kdy macros jsou hrubý odhad
- Není to popis pokrmu! Popis patří do `name`.

### Placeholder meal (restaurace, hosté, untrackable)
```json
{
  "name":   "🍽 Klobouček",                          // emoji 🍽 nebo 🧳 doporučeno pro vizuální odlišení
  "type":   "placeholder",                          // POVINNÉ pro placeholder
  "note":   "restaurace — odhad",                   // volitelné
  "macros": {
    "kcal": 800,                                    // POVINNÝ odhad, klidně přibližný
    "p":    null,                                   // ostatní makra null (neznámá)
    "c":    null,
    "f":    null
  }
}
```

**Kdy použít placeholder:**
- Jídlo v restauraci, kde nemůžeš spočítat makra
- Návštěva u rodiny / hosté
- Volný kalorický prostor („tady někde sem zapadne X kcal navíc")
- Cokoliv kde znáš jen orientační kcal, ne přesnou skladbu

**Vizuální chování:** šablona rendruje placeholder s amber rámečkem a prefixem `≈` u kcal. Makra (B/S/T) se v celodenním součtu doplní z trackovatelných pokrmů; kcal se počítá včetně placeholderu.

## Příklad: minimální 1-denní plán
```json
{
  "id": "test-1den",
  "plan_title": "Jídelníček",
  "date_range": "11. května 2026",
  "persons": {
    "jakub":     { "label": "K", "name": "Kuba",  "targets": {"kcal":2400,"p":180,"c":200,"f":130} },
    "partnerka": { "label": "V", "name": "Verča", "targets": {"kcal":1700,"p":110,"c":150,"f":80}  }
  },
  "slots":       ["snidane","obed"],
  "slot_labels": { "snidane": "snídaně", "obed": "oběd" },
  "days": [{
    "name": "Pondělí", "date": "11. 5.",
    "meals": {
      "snidane": {
        "jakub":     { "name": "3× vejce + chléb 80g + lučina 40g", "macros": {"kcal":507,"p":28,"c":42,"f":25} },
        "partnerka": { "name": "Hollandia jogurt 180g + banán 150g + ořechy 15g", "macros": {"kcal":416,"p":12,"c":62,"f":16} }
      },
      "obed": {
        "jakub":     { "name": "Lasagne 450g", "macros": {"kcal":743,"p":47,"c":54,"f":32} },
        "partnerka": { "name": "Kuřecí prsa 160g + brokolice 200g + rýže 100g", "macros": {"kcal":384,"p":43,"c":38,"f":5} }
      }
    }
  }]
}
```

## Generátor checklist (BEN si projde před exportem)

- [ ] `id` je unikátní pro tento běh (jinak se ti localStorage zasekne ve starých datech)
- [ ] `date_range` reflektuje skutečné datumy plánu
- [ ] `persons` obsahuje klíče `jakub` a `partnerka` s `label`, `name`, alespoň `targets.kcal`
- [ ] `slots` má alespoň 1 položku, všechny mají odpovídající `slot_labels`
- [ ] Každý meal má `name` (vč. ingrediencí s gramáží) a `macros` (alespoň `kcal`)
- [ ] Pro shared meal: `macros_jakub` + `macros_partnerka` místo `macros`
- [ ] Pokud `targets.fiber` chybí u obou osob, žádný meal nemá `macros.fiber` (drž data konzistentní)
- [ ] Placeholdery mají `type: "placeholder"` a `macros.kcal` jako odhad (ne null)
- [ ] `day.note` je krátký kontext, ne popis pokrmů
- [ ] `meal.note` je metainformace, ne popis pokrmu

## Funkce, které šablona zvládá out-of-the-box

| Funkce | Co dělá |
|---|---|
| **Variabilní délka plánu** | Auto-fit grid. 1-7+ dní, layout se přizpůsobí. Container queries pro kompaktní/full denní souhrn podle šířky karty. |
| **Volitelné trackování maker** | Pokud `targets` nemá fiber, fiber se v UI nezobrazuje. Stejně pro p/c/f (kcal je vždy povinné). |
| **Over-target signalizace** | Když denní suma překročí target o >5 %, příslušné makro se obarví červeně, ukáže se `+Xg` badge a tip pro snížení (identifikuje nejvíce contributing pokrm). |
| **Placeholdery** | Amber dashed rámeček, `≈` prefix u kcal, ostatní makra skryté. |
| **Edit mode (uživatel)** | Tlačítko "Režim úprav" povolí: drag&drop pokrmů (6-tečkový grip), tap-to-tap swap, editace názvu (tužka ✎), přepnutí na placeholder (🍽). Cross-person swap automaticky přepočítá gramáž podle kcal cílů. Změny se ukládají do `localStorage` s `id` invalidací. |
| **Tisk na 1 A4** | Tlačítko "Tisk" → dedikovaný kompaktní A4 landscape layout (ne kopie obrazovky). Tabulka 6 dnů × 4 sloty + dva řádky se sumami maker (kcal + B/S/T). |
| **Stáhnout** | Tlačítko "Stáhnout" → HTML download včetně aktuálního stavu (i po manuálních editacích). |
| **PWA / mobilní instalace** | Manifest generovaný za běhu jako Blob URL + iOS meta tagy. Android Chrome nabídne "Add to Home Screen", iOS Safari přes Share → Add to Home Screen. Vlastní theme color, SVG ikona. **Bez offline (žádný service worker)** — pro offline potřebuje hosting s SW souborem, viz "Co řeší BEN/infra dál". |
| **📷 Foto pokrmu → Claude vision** | Ad-hoc logging: uživatel vyfotí jídlo, Claude API vrátí JSON `{name, macros, confidence, notes}`, uživatel vybere den/slot/osobu a vloží do plánu jako individuální meal s notou `"odhad z fotky"`. **Nezávislé na BEN** — funguje i bez generovaného plánu, jen vyžaduje API klíč uložený v Nastavení (⚙). |

## Photo → Claude API: jak to funguje

Toto je **mimo BEN workflow** — uživatel to používá ad-hoc, když je v restauraci / na cestách / si chce ověřit makra pokrmu, který v plánu nemá.

**Flow:**
1. Uživatel klepne na `⚙ Nastavení` → vloží Claude API klíč (sk-ant-...) → vybere model → Uložit.
2. Uživatel klepne na `📷 Foto pokrmu` → otevře se fotoaparát (mobile) nebo file picker (desktop).
3. Po vyfocení se obrázek pošle jako base64 přímo na `api.anthropic.com/v1/messages` s headerem `anthropic-dangerous-direct-browser-access: true`.
4. Použitý prompt vrací JSON ve formátu:
   ```json
   {
     "name": "popis s gramážemi, např. 'Losos 250g + rýže 150g'",
     "macros": {"kcal": 0, "p": 0, "c": 0, "f": 0},
     "confidence": "low|medium|high",
     "notes": "co je na odhadu nejistý"
   }
   ```
5. Šablona zobrazí výsledek + 3 dropdowny (den, slot, osoba) → tlačítko `Vložit do plánu`.
6. Vložený meal má `note: "odhad z fotky"` — BEN by ho měl při příští generaci přepsat nebo respektovat, podle situace.

**Bezpečnostní poznámka pro BEN:** API klíč je v `localStorage` na zařízení uživatele. Při generování nového plánu BEN ho **neresetuje** (smaž jen plán data, ne `claude_api_key` a `claude_model`). Klíče v localStorage:
- `claude_api_key` — Anthropic API key
- `claude_model` — vybraný model (default `claude-sonnet-4-5`)
- `ben_meal_plan_id_v2` — ID aktuálního plánu
- `ben_meal_plan_data_v2` — JSON dat plánu

## Co šablona NEdělá (BEN / infra řeší dál)

- Nákupní seznam — generuj separátně
- Validace cílů vs makra — pokud chceš proaktivně řešit „protein je pod cílem", BEN to musí flagnout sám (UI signalizuje jen překročení targetu, ne nedosažení)
- Recept-level macro výpočty — BEN posílá hotové součty, šablona je jen renderuje
- Batch chain propagation — `"z batch úterý"` poznámky musí BEN sám provázat se zdrojovým pokrmem
- Nutriční databáze ingrediencí — BEN má vlastní zdroj pravdy o makrech jednotlivých surovin

## Phase 2 roadmap (infra — mimo šablonu)

Šablona je v1 navržená jako single-file pro osobní použití. Pro produkční nasazení doporučuju tyto kroky v pořadí důležitosti:

### 1. Cloudflare Worker proxy pro API klíč (~30 min setup)
**Proč:** API klíč v `localStorage` je viditelný v JS sources. Pro osobní zařízení OK, ale pokud chceš jistotu, že Verča / někdo s přístupem k HTML souboru nemůže utratit tvoje credity:

```javascript
// Worker code (cloudflare workers, free tier stačí)
export default {
  async fetch(request, env) {
    const body = await request.json();
    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,  // v Cloudflare secrets, ne v kódu
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  }
};
```

V šabloně nahradíš endpoint za URL Workeru a smažeš `x-api-key` + `anthropic-dangerous-*` header.

### 2. Service Worker pro offline (vyžaduje hosting)
PWA bez SW funguje, ale nemá garantovaný offline. Pokud chceš plný offline:
- Hosting kde můžeš servírovat `service-worker.js` jako separate file
- SW s cache-first strategií pro HTML + fonts
- Network-only pro API calls (samozřejmě)

### 3. Capacitor wrapper pro App Store / TestFlight (volitelné)
Pokud bys chtěl distribuovat jako "skutečnou" aplikaci:
- `npx cap init Jídelníček com.dpu.jidelnicek`
- Wrapne HTML do nativního shellu (WebView)
- Camera/storage přes native APIs (lepší než `<input capture>`)
- Build na iOS vyžaduje Mac + Apple Developer Account ($99/rok); Android sideload zdarma
- Časová náročnost: 1–2 dny setup

### 4. Hetzner backend pro full BEN integraci
Když chceš BEN běžet jako služba (ne lokálně):
- FastAPI endpoint `/api/meal-plan/generate` na Hetzner VPS
- Frontend (jídelníček PWA) komunikuje s BEN přes REST
- Možnost dvoustupňového workflow: BEN generuje → uživatel mobilně edituje → změny se posílají zpět BEN-u
- Vyžaduje řešit auth (JWT / passwordless / atd.)

## Truth Policy připomínka

Macros čísla v JSON jsou autoritativní pro display. **NEVYMÝŠLEJ** je. Pokud BEN nemá spolehlivý zdroj pro nějaký pokrm, použij `type: "placeholder"` s odhadem kcal a nullovými makry — to je legitimní „neznám přesně". Konzervativní odhad je lepší než falešná přesnost.

## Verze
- `jidelnicek_sablona.html` — **PC verze 2.4** (PWA + Photo features bonus, primárně grid/print)
- `jidelnicek_app.html` — **Mobile App 1.0** (multi-plan, day-by-day, photo+chat)
- Změny tracker v git, BEN se nemusí o ně starat.
