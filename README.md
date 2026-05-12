# Jídelníček

Dva nezávislé klienty, jedno JSON schéma:

| Soubor | Role | Distribuuje |
|---|---|---|
| `jidelnicek_sablona.html` | PC grid + tisk A4, editace | BEN injektuje JSON → hotový HTML |
| `jidelnicek_app.html` | Mobilní PWA (multi-plan, tracking, foto, chat) | Nainstalovaná na telefonu; BEN doručí JSON, uživatel ho importuje |

---

## Workflow pro BEN

1. Sestav plán podle interních pravidel.
2. Vlož JSON do `shared/sample-plan.json` (nebo pošli jako `<id>.json`).
3. **PC šablona:** spusť build skript — vznikne hotový HTML:
   ```
   node scripts/inject-plan.js shared/<id>.json
   # → dist/jidelnicek_<id>.html
   ```
4. **Mobilní app:** doruč JSON uživateli (e-mail / Slack). Uživatel ho zkopíruje
   a vloží v app přes „+ Přidat plán".
5. **Klíčové pravidlo:** BEN mění pouze data (JSON). Strukturu šablony ani app
   neupravuje — to dělá Claude / hlavní orchestrátor.

---

## Workflow pro vývoj (Claude / Jakub)

```bash
# Klonuj repo
git clone https://github.com/dpuenergy/jidelnicek.git
cd jidelnicek

# Instaluj pre-commit hook (secret scanning)
cp .github/hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

# Generuj testovací výstup ze sample plánu
node scripts/inject-plan.js
# → dist/jidelnicek_2026-jidla-1105-1605.html

# Otevři v prohlížeči a ověř
```

### Struktura repozitáře

```
jidelnicek_sablona.html    # PC šablona (čistý desktop view + tisk)
jidelnicek_app.html        # Mobilní PWA (Photo + Chat + multi-plan)
CLAUDE_meal_plan_output.md # BEN schema docs & workflow reference
shared/
  sample-plan.json         # Vzorový plán (6 dní, Kuba + Verča)
scripts/
  inject-plan.js           # Build skript: JSON → standalone HTML
.github/
  hooks/pre-commit         # Secret scanner (zkopíruj do .git/hooks/)
  workflows/
    validate-json.yml      # CI: JSON syntax + schema check při push
.env.example               # Ukázka env proměnných (nikdy necommituj .env)
dist/                      # .gitignore — výstupy build skriptu
```

### Větvení

- `main` — chráněná větev; merge pouze přes PR
- Feature větve: `feat/<co>`, opravy: `fix/<co>`

### Přidání nového plánu

```bash
git checkout -b feat/plan-<id>
cp shared/sample-plan.json shared/<id>.json
# ... edituj JSON ...
node scripts/inject-plan.js shared/<id>.json   # ověř výstup
git add shared/<id>.json
git commit -m "feat: add plan <id>"
# otevři PR → po merge do main
```

---

## Phase 2 roadmap

Viz [GitHub Issues](https://github.com/dpuenergy/jidelnicek/issues) — label `phase-2`.

Plánované kroky (prioritou):
1. **Cloudflare Worker proxy** — API klíč ze `localStorage` přesune za Worker secret
2. **Recept knihovna** — `shared/recipes/` JSON databáze; inject-plan.js ji použije pro výpočet maker
3. **Mobile → BEN sync** — co bylo snědeno posílá se zpět (vyžaduje backend)
