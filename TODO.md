# TODO — Pirates' Chronicles (handoff)

**Stan na:** 2026-09-01 · **Wersja:** v0.9.8.0 · **Branch:** `main` (czysty, commit `9ee4d90`)
**Kod:** 116 plików `.ts`, ~22 000 LOC · `tsc --noEmit` przechodzi · **`npm test` — 7/109 testów FAILUJE** (patrz P0-1)

Ten plik zastępuje nieaktualną sekcję statusu w `documentation/11-ROADMAP.md`.
Roadmapa nadal jest źródłem prawdy dla **wizji** faz 8–15; ten plik dla **kolejności prac**.

---

## 1. Gdzie stoimy

### Gotowe (poza tym, co roadmapa twierdzi)

| Faza wg roadmapy | Stan | Realizacja w kodzie |
|---|---|---|
| 6 — Statki NPC na mapie | ✅ pełna | `NpcSpawnSystem` (324 l.), `NpcAiSystem` (293 l.), `PortWaterPositions`, fog-of-war, zasięg wzroku = f(maszt), flagi frakcji |
| 7 — Bitwy morskie | ✅ ~80% | `SeaBattleScene` (1127 l.) + `CombatEngine` (~600 l.): 3 typy amunicji, łuki ostrzału ±60°, reload = f(załoga × morale × wyszkolenie), abordaż, kapitulacja, przejęcie statku do floty |
| 10.1 — Wydarzenia historyczne | ✅ | `WorldEventSystem` (538 l.): 10 wojen 1568–1697 + 15 typów eventów |
| 10.2 — Dynamika miast | ✅ | `EconomyTickSystem` + `EventEffectsSystem` (301 l.): populacja / wealth / defense, dzienny tick, ceny reagują na podaż |
| 14 — Flota gracza | ✅ | `FleetSystem`: max 3 statki, kupno/sprzedaż/porzucenie, prędkość = najwolniejszy, wzrok = najwyższy maszt |
| 5.5 — Zapis/odczyt | ✅ | `SaveRepository` + `Migrations` (v8), 5 slotów IndexedDB — UI w `OptionsMenuScene`, **nie** w `SaveLoadScene` |
| — Świat NPC-newsów | ✅ | `NpcNewsSystem`: NPC zbierają newsy w portach i przekazują graczowi w `ShipEncounterScene` |

### Martwy kod / atrapy (do usunięcia albo dokończenia)

| Plik | Stan |
|---|---|
| `src/game/scenes/SaveLoadScene.ts` (37 l.) | atrapa „coming in Phase 7"; zarejestrowana w `GameApp.ts:179`, ale **nigdy nie startowana** → usunąć |
| `src/core/systems/CombatSystem.ts` (63 l.) | atrapa „Phase 6"; prawdziwa walka żyje w `src/core/engine/CombatEngine.ts` → usunąć |
| `src/core/systems/QuestSystem.ts` (19 l.) + `src/core/data/quests.ts` | puste `QUESTS = {}` |
| `src/game/scenes/DialogueScene.ts` (15 l.) | rysuje napis „Dialogue Scene (TODO)" |
| `src/core/services/Pathfinding.ts` | pusty placeholder; NPC AI używa sterowania bezpośredniego + unikania brzegu |
| `src/game/render/PalmRenderer.backup.ts` | plik `.backup` w repo → usunąć |

### Nietknięte fazy

8 (bitwy lądowe / szturm na miasto) · 9 (pojedynki szermiercze) · 11 (córki gubernatorów) · 12 (rodzina) · 13 (mapy skarbów) · 10.3 (starzenie — `calculateAge()` tylko **wyświetla** wiek w `OptionsMenuScene:390`, zero efektów) · 10.4 (podział łupów) · 15 (moduły dodatkowe)

---

## 2. P0 — dług techniczny (zrobić PRZED nowymi fazami)

### P0-1. Naprawić 7 failujących testów `NavigationSystem.test.ts`
Testy pochodzą sprzed modelu polarnego wiatru z v0.9.4 i sprawdzają nieaktualny kontrakt.
Obecny model (`WeatherSystem.ts:104-134`):
- `deg < minWindAngle` → **0** (martwa strefa; testy zakładają ≥ 0.29)
- baksztag `120–180°` → 1.1 → 0.9 (test „tailwind > 1.0")
- półwiatr ~90° → **1.5** (test „crosswind ≤ 1.3")

**Zadanie:** przepisać oczekiwania testów pod aktualną krzywą polarną; osobno **zdiagnozować** `disembark into land box` (`NavigationSystem.test.ts:313`) — tam ship dostaje `mode: "sailing"` zamiast `"landed"`, co może być realnym regresem detekcji lądu, a nie tylko przestarzałym testem. Ustalić to najpierw.

### P0-2. Rozszerzyć pokrycie testami
Jeden plik testowy na 22 kLOC. Kandydaci o wysokiej wartości (czysta logika, zero Phasera):
`WeatherSystem` · `EconomyTickSystem` · `EventEffectsSystem` · `BoardingSystem` · `FleetSystem` · `SailSystem` · `CombatEngine` (reload/damage/surrender) · `Migrations` (v1→v8 na sztucznych save'ach).

### P0-3. Sprzątanie
Usunąć `SaveLoadScene`, `CombatSystem`, `PalmRenderer.backup.ts`; wypiąć `SaveLoadScene` z `GameApp.ts`.

### P0-4. Odświeżyć `documentation/11-ROADMAP.md`
Tabela statusu kończy się na v0.9.0 i twierdzi, że „Faza 6 — NASTĘPNA", choć fazy 6, 7, 10.1–10.2 i 14 są zrobione.

---

## 3. Plan rozwoju — kolejność

Zasada porządkująca: **najpierw domknąć pętle, które już istnieją**, dopiero potem otwierać nowe moduły.
Gracz ma dziś świat, ekonomię, NPC i bitwy morskie — ale nie ma **po co** walczyć (brak celów) ani **czym** przegrywać (brak konsekwencji).

### v0.9.9 — Domknięcie bitwy morskiej (faza 7.1)
*Największy zwrot z inwestycji: system jest gotowy w 80%, brakuje sprzężenia zwrotnego.*

- **Stopnie uszkodzeń kadłuba** — 100→75 sprawny, 75→50 przeciek (wolniej), 50→25 ciężkie, <25 tonie
- **Wizualizacja** — dym, ogień, przechył; animacja zatonięcia + utrata ładunku
- **Uszkodzenia ożaglowania** — łańcuchówki mają już obrażenia w danych (`ammo.ts`), brakuje wizualnej + mechanicznej progresji (podarte żagle → zerwany maszt → dryf)
- **Naprawa prowizoryczna na morzu** — powolna, limitowana; `repairShip()` w `PortInteractionSystem:241` obsługuje tylko port
- Pliki: `SeaBattleScene.ts`, `CombatEngine.ts`, `EntityState.ts` (`hullHp`/`sailsHp` już są — potrzebny próg stanu + FX)

### v0.10.0 — Pojedynki szermiercze (faza 9)
*Umiejętność `fencing` istnieje w `CaptainState`, ale wpływa wyłącznie na auto-rozstrzygnięcie abordażu (`BoardingSystem.ts:53`).*

- Osobna scena `DuelScene`: atak wysoki/średni/niski, parada, riposta
- Wejście: abordaż (zamiast obecnego rzutu kośćmi), wyzwanie w porcie, wątek fabularny
- Wyjście: przejęcie statku / awans / rana kapitana / więzienie
- Zastąpić `DialogueScene`-atrapę realnym systemem dialogów — będzie potrzebny w fazach 11–13

### v0.11.0 — Cele i konsekwencje (faza 10.3 + 10.4)
*Bez tego gra nie ma łuku — można żeglować w nieskończoność bez presji.*

- **Podział łupów** — załoga domaga się co N dni; brak podziału → spadek morale (morale już wpływa na reload w v0.9.8); po podziale załoga się rozchodzi
- **Starzenie kapitana** — 20–35 pełna sprawność, 35–50 spadek szermierki / wzrost dyplomacji, 50+ wyraźny spadek fizyczny
- **Emerytura + punktacja końcowa** — bogactwo + rangi + rodzina + skarby; ekran wyniku
- Pliki: `CaptainState.ts`, `TimeSystem.ts`, `CrewConsumptionSystem.ts`, nowy `PlunderSystem.ts`

### v0.12.0 — Mapy skarbów (faza 13)
*Pierwszy realny cel eksploracji; wykorzystuje istniejący tryb pieszy (`isOnFoot`) i tawerny.*

- Zdobywanie: plotki w tawernie (`getRumorKey()` już istnieje), łupy z piratów, nagrody
- Mapa = fragment świata + X; poziomy precyzji wskazówek
- Desant → chodzenie po wyspie → wykopanie; część map to zasadzki
- Wymaga: systemu questów (dziś `QUESTS = {}`)

### v0.13.0 — Bitwy lądowe (faza 8)
*Największa nowa mechanika; `defense` per port już jest w `PortRuntimeState` i spada po najazdach.*

- Ostrzał fortów z morza ↔ odpowiedź fortów
- Desant po osłabieniu; siła obrony = garnizon + fortyfikacje + wielkość miasta
- Auto-resolve z modyfikatorami (nie pełna gra taktyczna)
- Przejęcie miasta → zmiana `factionId` portu, kaskada w ekonomii i spawn NPC

### v0.14.0+ — Warstwa fabularna (fazy 11 + 12)
Córki gubernatorów, poszukiwanie rodziny. Zostawić na koniec — wymaga działającego systemu dialogów (v0.10.0) i questów (v0.12.0).

---

## 4. Zadania równoległe (można wpleść w każdy release)

- **Muzyka** — `MusicManager` ma 5 slotów, wypełniony **jeden** (`menu` → `pirate_theme.mp3`). `sailing` / `port` / `tavern` / `battle` = `null`. Ścieżki dla portu i bitwy dałyby najwięcej.
- **Pathfinding A\*** — `Pathfinding.ts` pusty; NPC nawigują reaktywnie. Prawdziwe szlaki handlowe = wiarygodniejszy ruch morski, ale to duża zmiana w `NpcAiSystem`.
- **Assety AI** — pipeline `ai-assets/` + `sd-pipeline/` opisany, sprite'y statków dalej z jednego arkusza `sailship.png` (8 kierunków, brak wariantów klas i frakcji).
- **`WorldRenderer.ts:239`** — TODO: flaga frakcji jako sprite obok statku NPC zamiast tintu.

---

## 5. Zasady projektu (dla agenta przejmującego)

- Wersjonowanie **4-członowe** `0.x.y.z`, nie semver. Każdy release = wpis w `src/changelog.ts` (najnowszy na górze) + bump w `package.json`.
- Dev server **wyłącznie na porcie 3000**; najpierw `taskkill //F //IM node.exe`, potem `npm run dev`. Nigdy dwie instancje.
- Font: zawsze `UI_FONT` / `txt()` z `src/game/ui/textStyle.ts` — nigdy hardkodowany.
- `pixelArt: true` wymusza `roundPixels: true` → w `MainMapScene.create()` musi zostać `camera.setRoundPixels(false)` (inaczej wraca jitter statku).
- Assety **zawsze kompresować przed commitem** (`sharp` dla PNG, ffmpeg dla JPEG).
- Zmiany w `WorldState` wymagają migracji w `src/persistence/Migrations.ts` (obecnie v8).
- Nowe teksty → `src/core/i18n/locales/en.ts` **i** `pl.ts`.
- Deploy: pirates.k4.pl — najpierw czyszczenie starych bundli (patrz pamięć projektu).
- Parametry debugowania: `?skip`, `?zoom=`, `?debug=`, `?battle=1|trader|navy|pirate|hunter`.
