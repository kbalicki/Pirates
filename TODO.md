# TODO — Pirates' Chronicles (handoff)

**Stan na:** 2026-09-01 · **Wersja:** v0.9.8.2 · **Branch:** `main`
**Kod:** 113 plików `.ts`, ~21 500 LOC · `tsc --noEmit` czysty · `npm test` — **119 przechodzi, 0 failuje, 0 `todo`**

Ten plik jest źródłem prawdy dla **kolejności prac**.
[documentation/11-ROADMAP.md](documentation/11-ROADMAP.md) opisuje **wizję i zakres** modułów.

> **Zaczynasz pracę?** Wywołaj skill `/task` — prowadzi pełny cykl jednego zadania: wybór, implementacja, testy, weryfikacja w grze, changelog, dokumentacja, commit, push i deploy. Playbooki w `.claude/skills/task/playbooks/`. Do generowania grafiki jest skill `/comfyui`.

---

## 1. Gdzie stoimy

### Gotowe

| Moduł | Stan | Realizacja w kodzie |
|---|---|---|
| Statki NPC na mapie | ✅ | `NpcSpawnSystem` (324 l.), `NpcAiSystem` (293 l.), `PortWaterPositions`, mgła wojny, zasięg wzroku = f(maszt), flagi frakcji |
| Bitwy morskie | ✅ ~80% | `SeaBattleScene` (1127 l.) + `CombatEngine`: 3 typy amunicji, łuki ostrzału ±60°, reload = f(załoga × morale × wyszkolenie), abordaż, kapitulacja, przejęcie statku |
| Wydarzenia świata | ✅ | `WorldEventSystem` (538 l.): 10 wojen 1568-1697 + 15 typów wydarzeń |
| Żywa ekonomia | ✅ | `EconomyTickSystem` + `EventEffectsSystem` (301 l.): populacja / wealth / defense, dzienny tick, ceny reagują na podaż |
| Flota gracza | ✅ | `FleetSystem`: max 3 statki, kupno/sprzedaż/porzucenie, prędkość = najwolniejszy, wzrok = najwyższy maszt |
| Zapis/odczyt | ✅ | `SaveRepository` + `Migrations` (v8), 5 slotów IndexedDB — UI w `OptionsMenuScene`, nie w osobnej scenie |
| Obieg newsów | ✅ | `NpcNewsSystem`: NPC zbierają newsy w portach i przekazują graczowi w `ShipEncounterScene` |

### Nietknięte

Bitwy lądowe / szturm na miasto · pojedynki szermiercze · córki gubernatorów · poszukiwanie rodziny · mapy skarbów · starzenie kapitana (`calculateAge()` tylko **wyświetla** wiek w `OptionsMenuScene:390`, zero efektów) · podział łupów · system questów (`QUESTS` = pusta mapa)

### Świadome placeholdery (zostawione celowo)

| Plik | Po co zostaje |
|---|---|
| `src/core/systems/QuestSystem.ts` | Prymitywy logu zadań — działają, brakuje FSM. Pierwszy konsument: mapy skarbów |
| `src/core/data/quests.ts` | Pusta mapa `QUESTS` czekająca na pierwsze zadania |
| `src/core/services/Pathfinding.ts` | Hak pod A\*; NPC sterują dziś reaktywnie |

W v0.9.8.1 usunięto trzy pliki, do których nic nie prowadziło: `SaveLoadScene`, `DialogueScene`, `PalmRenderer.backup.ts`.

> **Uwaga:** `src/core/systems/CombatSystem.ts` **nie** jest atrapą, mimo dawnego nagłówka „Placeholder for Phase 6". To żywy moduł stałych walki (`effectiveReloadTicks`, `CANNON_RANGE`, obrażenia), importowany przez `CombatEngine`. Nagłówek poprawiono.

---

## 2. P0 — dług techniczny

### ~~P0-1. Naprawić failujące testy `NavigationSystem.test.ts`~~ ✅ v0.9.8.1
Testy sprawdzały model wiatru sprzed v0.9.4 (kosinusoidę zamiast diagramu polarnego). Przepisane pod aktualną krzywą, doszło pokrycie martwej strefy per takielunek, symetrii halsów i skalowania siłą wiatru. Test `disembark into land box` **nie był regresem** detekcji lądu — slup pokonuje ~0.19 px na tick, a fixture stawiał go 2 px od brzegu, więc nigdy nie mógł tam dopłynąć w jednym ticku.

### ~~P0-2. Nieciągłość krzywej polarnej wiatru~~ ✅ v0.9.8.2
`src/core/systems/WeatherSystem.ts:118-140`

Gałąź półwiatru była pełną sinusoidą wracającą do 0.4 na 120°, gdzie fordewind startował od 1.1 — kurs 119° dawał 0.4×, a 121° już 1.1×.

Poprawka rozbija przedział na **dwie ćwiartki sinusoidy**: wznoszącą 0.4 → 1.5 do szczytu w połowie przedziału i opadającą 1.5 → 1.1 do granicy 120°. Wybrano to zamiast `Math.max(peak, tail)` sugerowanego wcześniej w tym pliku, bo `max` robił lokalne wgłębienie ok. 110° (spadek do ~0.99 i ponowny wzrost do 1.1) — krzywa dwułukowa jest ciągła **i** monotoniczna za szczytem.

Efekt uboczny, zamierzony: szczyt zależy od takielunku — slup (martwa strefa 30°) osiąga 1.5× przy 90°, galeon (60°) przy 105°.

Krzywa dla martwej strefy 30°: `60°=0.40 · 90°=1.50 · 110°=1.30 · 120°=1.10 · 150°=1.00 · 180°=0.90`.

Testy: `it.todo` zamieniony na cztery realne testy (ciągłość na szwie dla każdego takielunku, skan ciągłości całej krzywej, monotoniczny spadek za szczytem, przekazanie na 1.1× w 120°).

### P0-3. Rozszerzyć pokrycie testami
Jeden plik testowy na ~21 500 LOC. Kandydaci o wysokiej wartości (czysta logika, zero Phasera):
`WeatherSystem` · `EconomyTickSystem` · `EventEffectsSystem` · `BoardingSystem` · `FleetSystem` · `SailSystem` · `CombatEngine` (reload/obrażenia/kapitulacja) · `Migrations` (v1→v8 na sztucznych zapisach).

Priorytet dla `Migrations` — jedyny moduł, którego błąd niszczy dane gracza bezpowrotnie.

---

## 3. Plan rozwoju — kolejność

Zasada: **najpierw domknąć pętle, które już istnieją**, dopiero potem otwierać nowe moduły.
Gracz ma dziś świat, ekonomię, NPC i bitwy morskie — ale nie ma **po co** walczyć (brak celów) ani **czym** przegrywać (brak konsekwencji).

### v0.9.9 — Domknięcie bitwy morskiej
*Największy zwrot z inwestycji: system gotowy w 80%, brakuje sprzężenia zwrotnego.*

- **Stopnie uszkodzeń kadłuba** — 100→75 sprawny, 75→50 przeciek (wolniej), 50→25 ciężkie, <25 tonie
- **Wizualizacja** — dym, ogień, przechył; animacja zatonięcia + utrata ładunku
- **Uszkodzenia ożaglowania** — łańcuchówki mają już mnożniki w `ammo.ts`, brakuje progresji (podarte żagle → zerwany maszt → dryf)
- **Naprawa prowizoryczna na morzu** — powolna, limitowana; `repairShip()` w `PortInteractionSystem:241` obsługuje tylko port
- Pliki: `SeaBattleScene.ts`, `CombatEngine.ts`, `EntityState.ts` (`hullHp`/`sailsHp` są — potrzebny próg stanu + FX)

### v0.10.0 — Pojedynki szermiercze
*Umiejętność `fencing` istnieje, ale wpływa wyłącznie na jeden mnożnik w `BoardingSystem.ts:53`.*

- Nowa scena `DuelScene`: atak wysoki/średni/niski, parada, riposta
- Wejście: abordaż (zamiast obecnego rzutu kośćmi), wyzwanie w porcie, wątek fabularny
- Wyjście: przejęcie statku / awans / rana kapitana / więzienie
- **Zbudować system dialogów od zera** — będzie potrzebny w v0.12.0 i v0.14.0

### v0.11.0 — Cele i konsekwencje
*Bez tego gra nie ma łuku — można żeglować w nieskończoność bez presji i bez zakończenia.*

- **Podział łupów** — załoga domaga się co N dni; zwłoka obniża morale (morale wpływa już na reload); po podziale załoga się rozprasza
- **Starzenie kapitana** — 20-35 pełna sprawność, 35-50 spadek szermierki / wzrost dyplomacji, 50+ wyraźny spadek fizyczny
- **Emerytura + punktacja końcowa** — bogactwo + rangi + rodzina + skarby; ekran wyniku
- Pliki: `CaptainState.ts`, `TimeSystem.ts`, `CrewConsumptionSystem.ts`, nowy `PlunderSystem.ts`

### v0.12.0 — Mapy skarbów
*Pierwszy realny cel eksploracji; wykorzystuje tryb pieszy (`isOnFoot`) i tawerny.*

- Zdobywanie: plotki w tawernie (`getRumorKey()` już istnieje), łupy z piratów, nagrody
- Mapa = fragment świata + X; poziomy precyzji wskazówek
- Desant → chodzenie po wyspie → wykopanie; część map to zasadzki
- **Wymaga systemu questów** — dziś `QUESTS = {}`

### v0.13.0 — Bitwy lądowe
*Największa nowa mechanika; `defense` per port już jest w `PortRuntimeState` i spada po najazdach.*

- Ostrzał fortów z morza ↔ odpowiedź fortów
- Desant po osłabieniu; siła obrony = garnizon + fortyfikacje + wielkość miasta
- Auto-resolve z modyfikatorami (nie pełna gra taktyczna)
- Przejęcie miasta → zmiana `factionId` portu, kaskada w ekonomii i spawnie NPC

### v0.14.0+ — Warstwa fabularna
Córki gubernatorów, poszukiwanie rodziny. Na koniec — wymaga dialogów (v0.10.0) i questów (v0.12.0).

---

## 4. Zadania równoległe (można wpleść w każdy release)

- **Muzyka** — `MusicManager` ma 5 slotów, wypełniony **jeden** (`menu` → `pirate_theme.mp3`). `sailing` / `port` / `tavern` / `battle` = `null`. Ścieżki dla portu i bitwy dałyby najwięcej.
- **Pathfinding A\*** — `Pathfinding.ts` to pusty hak; NPC nawigują reaktywnie. Prawdziwe szlaki handlowe = wiarygodniejszy ruch morski, ale duża zmiana w `NpcAiSystem`.
- **Retrening LoRA `amigapxl_pirates_v1`** — obecna wersja była trenowana na **pełnych zrzutach ekranu** z Amigi, więc generuje całe ekrany gry z HUD-em zamiast pojedynczych sprite'ów (potwierdzone testami przy sile 0.8 i 0.45; prompt negatywny nie pomaga). Naprawa: zbiór treningowy z **wyciętych pojedynczych obiektów na przezroczystym tle**, retrening w `C:\AI\kohya_ss`. Do czasu retreningu izolowane assety rób checkpointem `pixel-art-diffusion-v1` bez tej LoRA — ta ścieżka działa i jest sprawdzona.
- **Assety AI** — sprite'y statków dalej z jednego arkusza `sailship.png` (8 kierunków, brak wariantów klas i frakcji). Moduł uszkodzeń (v0.9.9) będzie potrzebował klatek zniszczeń. Narzędzie: `node sd-pipeline/tools/comfy.mjs`, playbook `.claude/skills/task/playbooks/assets.md`.
- **`WorldRenderer.ts:239`** — TODO: flaga frakcji jako sprite obok statku NPC zamiast tintu.

---

## 5. Zasady projektu (dla agenta przejmującego)

- Wersjonowanie **czteroczłonowe** `0.x.y.z`, nie semver. Release = bump w `package.json` **i** `src/version.ts` **i** wpis na górze `src/changelog.ts`.
- Dev server **wyłącznie na porcie 3000**; najpierw `taskkill //F //IM node.exe`, potem `npm run dev`. Nigdy dwie instancje.
- Font: zawsze `UI_FONT` / `txt()` z `src/game/ui/textStyle.ts` — nigdy hardkodowany.
- `pixelArt: true` wymusza `roundPixels: true` → w `MainMapScene.create()` musi zostać `camera.setRoundPixels(false)` (inaczej wraca jitter statku).
- Assety **zawsze kompresować przed commitem** (`sharp` dla PNG, ffmpeg dla JPEG).
- Zmiany w `WorldState` wymagają migracji w `src/persistence/Migrations.ts` (obecnie v8) — pętla rzuca wyjątkiem przy brakującym kroku i psuje wszystkie stare zapisy.
- Nowe teksty → `src/core/i18n/locales/en.ts` **i** `pl.ts`.
- Nie rejestruj scen „na zapas" — scena bez wejścia to martwy kod.
- `src/core/` nie importuje Phasera. Nigdy.
- Deploy: pirates.k4.pl — najpierw czyszczenie starych bundli.
- Parametry debugowania: `?skip`, `?zoom=`, `?debug=`, `?battle=1|trader|navy|pirate|hunter`.
- Skill `/task` i jego playbooki są częścią repozytorium (`.claude/skills/`). Jeśli któraś procedura się zdezaktualizuje — popraw ją w tym samym commicie, w którym to zauważyłeś.
