# TODO — Pirates' Chronicles (handoff)

**Stan na:** 2026-09-01 · **Wersja:** v0.9.9.1 · **Branch:** `main`
**Kod:** 118 plików `.ts`, ~23 000 LOC · `tsc --noEmit` czysty · `npm test` — **295 przechodzi, 0 failuje, 0 `todo`** w 8 plikach

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

### ~~P0-3. Rozszerzyć pokrycie testami~~ ✅ v0.9.8.3
Z jednego pliku testowego zrobiło się siedem, ze 119 testów — 257.

| Plik | Testów | Co pokrywa |
|---|---|---|
| `persistence/__tests__/Migrations.test.ts` | 25 | łańcuch v1→v9, każda wersja jako punkt wejścia, idempotencja, brak mutacji wejścia |
| `systems/__tests__/CombatSystem.test.ts` | 11 | kadencja przeładowania = f(załoga, morale, wyszkolenie), clampy, monotoniczność |
| `systems/__tests__/BoardingSystem.test.ts` | 18 | warunki abordażu, rozstrzygnięcie walki, straty, łup |
| `systems/__tests__/FleetSystem.test.ts` | 29 | limit 3 kadłubów, prędkość najwolniejszego, wzrok najwyższego masztu, podsumowanie UI |
| `systems/__tests__/SailSystem.test.ts` | 22 | tabela poziomów, czas przejścia, odwrócenie rozkazu, `setImmediate` |
| `systems/__tests__/EconomyTickSystem.test.ts` | 33 | produkcja, konsumpcja, ceny, powrót do baseline, efekty wydarzeń, wojny |
| `systems/__tests__/NavigationSystem.test.ts` | 119 | nawigacja, wiatr (`WeatherSystem`), diagram polarny |

**Dwa błędy wyszły przy pisaniu testów i zostały naprawione w tym samym release:**

1. **Migracja v9** — porty przeniesione z zapisu sprzed v2 były wyłącznie *rozszerzane* (v2 dodało ceny i inwentarz, v7 numerykę ekonomii), więc te sprzed `shipyardQueue` / `availableCrew` nigdy ich nie dostały i docierały do v8 z dziurami. Nic nie wybuchało (oba miejsca czytają przez `?? 0`), ale kształt nie zgadzał się z `PortRuntimeState`, a pula załogi w tawernie była `undefined` do pierwszego odświeżenia. v9 normalizuje każdy port; kompletne przechodzą bez zmian.

2. **`SailSystem` — spam klawiszem W dawał żagle za darmo.** Czas przejścia liczył się od poprzedniego *rozkazu*, nie od faktycznego stanu ożaglowania, więc trzykrotne szybkie naciśnięcie W przenosiło statek ze zwiniętych na pełne w jednym kroku 2 s zamiast trzech. Poziom żagli moduluje szybkość skrętu w bitwie, więc to była realna przewaga. Teraz pozycja jest ułamkowym indeksem poziomu, a czas liczy się od niej — odwrócenie rozkazu w połowie kosztuje tylko to, co już postawiono.

Pozostaje nietknięte: `WorldEventSystem`, `NpcAiSystem`, `NpcNewsSystem`, `CombatEngine` (pełna pętla bitwy — wymaga fixture'a `CombatState`), `PortInteractionSystem`.

## 3. Plan rozwoju — kolejność

Zasada: **najpierw domknąć pętle, które już istnieją**, dopiero potem otwierać nowe moduły.
Gracz ma dziś świat, ekonomię, NPC i bitwy morskie — ale nie ma **po co** walczyć (brak celów) ani **czym** przegrywać (brak konsekwencji).

### ~~v0.9.9 — Domknięcie bitwy morskiej~~ ✅ w większości (v0.9.9.0)

Zrobione — `src/core/systems/DamageSystem.ts` + wpięcie w `CombatEngine`, `NavigationSystem` i `SeaBattleScene`:

- **Stopnie uszkodzeń kadłuba** — ≥75% sprawny, ≥50% przeciek, ≥25% ciężko uszkodzony, poniżej tonie. Prędkość ×1.00/×0.88/×0.70/×0.45, skręt ×1.00/×0.85/×0.65/×0.45
- **Uszkodzenia ożaglowania** — ≥75% sprawne, ≥40% podarte, ≥10% w strzępach, poniżej zerwany maszt. Mnożniki kadłuba i takielunku się mnożą
- **Tonięcie** — poniżej 25% kadłuba statek nabiera wody i idzie na dno w ~23 s bez ani jednego strzału, po obu stronach
- **Wizualizacja** — dym od „ciężko uszkodzony", dym + ogień przy tonięciu, animacja zatonięcia (osiadanie, obrót, pierścień na wodzie), baner wyniku czeka aż statek zniknie
- **Utrata ładunku** — zatonięcie zostawia 10-30% ładowni, zależnie od tego ile załogi przeżyło
- **Mapa świata** — te same stopnie, z jednym świadomym wyjątkiem: statek z zerwanym masztem pełznie ×0.15 zamiast stać. Naprawy istnieją wyłącznie w porcie, więc zero uwięziłoby gracza na zawsze

Przy okazji: HUD bitwy pokazuje stan kadłuba i takielunku, a odczyt prędkości przestał liczyć wiatr z ręcznie skopiowanej krzywej — ta kopia wciąż miała nieciągłość naprawioną w v0.9.8.2, więc HUD kłamał względem statku.

**Zostało w tym module:**
- **Naprawa prowizoryczna na morzu** — powolna, limitowana; `repairShip()` w `PortInteractionSystem:241` obsługuje tylko port
- **Ratowanie załogi** po zatonięciu
- Przechył pominięty świadomie — widok z góry, nie byłoby go widać

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
