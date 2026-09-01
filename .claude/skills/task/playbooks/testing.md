# Playbook — testy i weryfikacja

## Zestaw obowiązkowy

```bash
npx tsc --noEmit     # typy — musi być czysto
npm test             # vitest — musi być zielono
npm run build        # tsc + vite — musi przejść
```

Konkretny plik: `npx vitest run src/core/systems/__tests__/NavigationSystem.test.ts`
Tryb watch przy pisaniu: `npm run test:watch`

## Co testować

Testy pisze się dla **czystych funkcji z `src/core/`** — tam gdzie nie ma Phasera i wszystko jest deterministyczne.

Priorytety pokrycia (stan: tylko `NavigationSystem` ma testy):

1. `Migrations` — **najwyższy priorytet**, jedyny moduł, którego błąd niszczy dane gracza bezpowrotnie. Test: sztuczny zapis v1 → `migrateWorldState()` → sprawdź, że wszystkie pola v8 istnieją i mają sens.
2. `CombatEngine` / `CombatSystem` — przeładowanie, obrażenia, progi kapitulacji.
3. `EconomyTickSystem` + `EventEffectsSystem` — dzienny tick, powrót do baseline'u, skutki wydarzeń.
4. `BoardingSystem`, `FleetSystem`, `SailSystem`, `WeatherSystem`.

Sceny Phasera testuj przez zrzuty ekranu (niżej), nie przez vitest.

## Kiedy test failuje

**Najpierw ustal, która strona ma rację.** W tym projekcie zdarzyło się, że siedem testów failowało nie z powodu regresu w kodzie, tylko dlatego że kodowały model fizyki sprzed czterech wydań. Rozluźnienie asercji byłoby wtedy zamaskowaniem prawdy, a „naprawa" kodu pod testy — zepsuciem działającej mechaniki.

Procedura:
1. Sprawdź, kiedy test ostatnio przechodził: `git log -p --follow <plik testu>`.
2. Porównaj asercję z **komentarzem nad testowaną funkcją** — komentarz mówi, jaka była intencja.
3. Rozstrzygnij: czy zmienił się kod (regres), czy zmieniła się intencja (test do przepisania)?
4. Jeśli komentarz i implementacja się nie zgadzają — to znalazłeś prawdziwy błąd. Zgłoś go w TODO.md.

**Nie zmieniaj asercji, żeby zrobiła się zielona.** Zielony test, który nic nie sprawdza, jest gorszy niż czerwony.

## Pisanie testów — pułapki tego projektu

### Jednostki ruchu

Slup przy fordewindzie pokonuje **~0.19 px na tick**. Fixture stawiający statek 2 px od brzegu i oczekujący kolizji w jednym ticku nie ma prawa przejść. Licz dystans, zanim ustawisz pozycję startową.

### Kierunek wiatru

`windDirRad` = kierunek, **z którego** wieje. Stała nazwana `TAILWIND` z `windDirRad: Math.PI` oznacza wiatr z południa — statek na kursie 0 (północ) ma go w plecy. Łatwo się pomylić i napisać test, który testuje coś innego, niż sugeruje jego nazwa.

### Krzywa polarna wiatru

Przy pełnej sile: martwa strefa = **0**, ostro na wiatr 0→0.4, półwiatr szczyt **1.5** przy 90°, fordewind 0.9. Skalowanie siłą: `1 + (factor − 1) × strength`, więc przy ciszy każdy kurs daje 1.0. Test „modyfikator nigdy nie jest zerem" jest **fałszywy** — martwa strefa ma być zerem.

### Landmasses w testach

`beforeAll(() => { if (LANDMASSES.length === 0) setLandmasses(getFallbackLandmasses()); })` — bez tego testy terenu operują na pustej mapie.

## Weryfikacja w działającej grze

Testy jednostkowe nie pokażą, że coś wygląda źle albo źle się gra.

### Zrzut ekranu przez Puppeteer

```bash
node scripts/screenshot.mjs <url> <plik-wyjściowy> <czas-oczekiwania-ms> <akcja>
```

Argumenty są **pozycyjne**, nie flagowe. Akcje: `none` (domyślna), `step2`, `start_game`, `options`.

```bash
# mapa gry po pominięciu tworzenia postaci
node scripts/screenshot.mjs "http://localhost:3000/?skip&zoom=z10" out.png 6000

# menu SPACE
node scripts/screenshot.mjs http://localhost:3000 out.png 4000 options

# bitwa morska z konkretnym przeciwnikiem
node scripts/screenshot.mjs "http://localhost:3000/?battle=navy" out.png 6000
```

Zapisuj zrzuty do katalogu scratchpad sesji albo do `temp/` (gitignorowane) — **nie** do katalogu głównego repo.
Potem **obejrzyj plik** narzędziem Read. Zrzut, którego nie otworzyłeś, niczego nie weryfikuje.

### Co obejrzeć zależnie od zmiany

| Zmiana | Sprawdź |
|---|---|
| Rendering (woda, ląd, chmury, góry) | zrzuty na 2–3 poziomach zoomu — artefakty pojawiają się przy skrajnych |
| Ruch, sterowanie, żagle | ruch płynny bez drgań; przy podejrzeniu jittera patrz na `setRoundPixels` |
| Bitwa | `?battle=...`, sprawdź łuki ostrzału, przeładowanie, HUD |
| Ekonomia, wydarzenia | menu miasta (`CityInfoScene`) — wartości i trendy |
| UI, teksty | oba języki; polskie znaki `ą ć ę ł ń ó ś ź ż` muszą się renderować |

### Playtest użytkownika

Zmiany wpływające na **odczucie** gry — prędkość, sterowność, tempo bitwy, balans ekonomii — weryfikuje użytkownik, nie zrzut ekranu. Postaw serwer na porcie 3000, powiedz dokładnie co i jak sprawdzić, i poczekaj na ocenę **przed** wdrożeniem.
