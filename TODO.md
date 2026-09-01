# TODO — Pirates' Chronicles (handoff)

**Stan na:** 2026-09-01 · **Wersja:** v0.11.0.0 · **Branch:** `main`
**Kod:** 118 plików `.ts`, ~23 000 LOC · `tsc --noEmit` czysty · `npm test` — **448 przechodzi, 0 failuje, 0 `todo`** w 12 plikach

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

**Domknięte w v0.10.0.0:**
- **Naprawa prowizoryczna na morzu** — `ShipRepairSystem.repairAtSea()`, raz na dobę, tylko na morzu. Sufit 50% kadłuba i 60% takielunku, tempo = `ręce × morale` (najlepszy przypadek 2.5% / 3.5% dziennie), poniżej 20% obsady nikt nie pracuje. Wystarczy, żeby zejść ze stanu „tonie" i dopłynąć do portu — nigdy, żeby odbudować się do walki
- **Ratowanie rozbitków** — `rescueSurvivors()`, 40% żywej załogi zatopionego wroga, w miarę wolnych koi; wcieleni rozcieńczają wyszkolenie
- Przechył pominięty świadomie — widok z góry, nie byłoby go widać

### ~~v0.10.0 — Pojedynki szermiercze~~ ✅ mechanika (v0.10.0.0)

`src/core/systems/DuelSystem.ts` + `src/game/scenes/DuelScene.ts`. Do tej pory `fencing` dotykało dokładnie **jednego** mnożnika w `BoardingSystem.ts:53` — teraz kapitanowie biją się na pokładzie.

Pojedynek to jedna liczba: `advantage`, dystans na pokładzie. `±6` kończy sprawę. W każdym starciu obie strony wybierają akcję na jednej z trzech linii:

| Ty | Przeciwnik | Kto zyskuje |
|---|---|---|
| atak | zasłona **tej samej** linii | on — sparowane, riposta |
| atak | zasłona **innej** linii | ty — cios trafia |
| zasłona | atak w **tę samą** linię | ty — chwytasz klingę i odpowiadasz |
| zasłona | atak w **inną** linię | on |
| atak | atak | lepsza ręka |
| zasłona | zasłona | nikt, obaj łapią oddech |

Wartość ciosu `1 + fencing/10`, przy kondycji < 3 przez 0.5. Atak kosztuje 2 kondycji, zasłona zwraca 3. Stąd taktyka: atakuj, żeby zyskać dystans, zasłaniaj się, żeby wywołać ripostę i złapać oddech. AI przy niskiej kondycji zawsze się zasłania, z szansą `fencing/20` zasłania linię, której właśnie użyłeś, i atakuje częściej, gdy prowadzi. Deterministyczne z ziarna.

Sterowanie: **Q/W/E** cios wysoki/średni/niski, **A/S/D** zasłona. Wejście: klawisz **B** w bitwie — `SeaBattleScene` sprawdza `canBoard()`, pauzuje bitwę, uruchamia `DuelScene`; wynik idzie do `CombatEngine.setDuelResult()`, a `resolveBoarding(..., forcedCapture)` rozstrzyga abordaż z tym wynikiem. Straty załóg liczone jak dotąd, z siły obu stron — pojedynek decyduje **kto**, nie **jakim kosztem**.

**Zostało z tego modułu:**
- **Wyzwanie w porcie** i **wątek fabularny** jako kolejne konteksty wejścia w pojedynek
- **Awans / rana kapitana / więzienie** jako dodatkowe wyjścia (dziś tylko przejęcie statku albo przegrany abordaż)

### ~~v0.11.0 — Cele i konsekwencje~~ ✅ (v0.11.0.0)

Trzy rzeczy, które razem dają grze łuk: coś zabiera, coś się zużywa, coś się kończy.

**System dialogów** (`DialogueSystem.ts` + `data/dialogues.ts`) — rozmowa to dane: węzły, odpowiedzi z warunkami (`flag` / `reputation` / `gold` / `skill` / `day`, plus `not` / `all` / `any`) i efektami (`set_flag`, `gold`, `reputation`, `log` oraz furtka `custom` dla wywołującego). `validateTree()` pilnuje spójności drzewa na etapie autorskim. Świadomie **nie jest sceną** — to samo drzewo rysuje się w oknie portu, w osobnej scenie i w teście bez Phasera. Pierwszy konsument: gubernator, który zastąpił poprzedni sztywny panel (list kaperski, plotki, notowania, emerytura). Przy okazji usunięty `getGovernorDialogueKey()`, do którego nic już nie prowadziło.

**Podział łupów** (`PlunderSystem.ts`) — załoga upomina się co 60 dni; po terminie morale spada 0.4%/dzień do podłogi 15%. Morale steruje już przeładowaniem, abordażem i naprawami, więc zaniedbana załoga jest mierzalnie gorsza we wszystkim, zanim dojdzie do buntu. Podział w tawernie: kapitan zatrzymuje 35-60% (rangi + sława), 65% ludzi schodzi na ląd, reszta ma morale 1.0, zegar rusza od nowa.

**Starzenie kapitana** (`AgingSystem.ts`) — 20-35 pełnia, 35-50 szermierka i artyleria słabną (do ×0.85) a nawigacja/urok/medycyna rosną, 50+ wyraźny schyłek (podłoga ×0.55, sufit ×1.30). Krzywe ciągłe na granicach. Mnożniki działają na **efektywną** umiejętność w miejscu użycia, nie na zapisany profil. `calculateAge()` istniało od v0.5.6 i do tej pory wyłącznie wyświetlało liczbę.

**Emerytura i punktacja** (`RetirementSystem.ts` + `RetirementScene.ts`) — gubernator proponuje ziemię i tytuł po roku na morzu. Punkty: złoto ÷10, flota ÷20, rangi ×300, dodatnia reputacja ×4, sława ×12, lata na morzu ×40 minus 70 za każdy rok po pięćdziesiątce. Wynik ma szczyt dokładnie w momencie schyłku — i za wczesne, i za późne odejście kosztuje.

**Znaleziony przy okazji błąd:** `CombatEngine.setSwordsmanship()` **nigdy** nie było wołane, więc szermierka kapitana w ogóle nie docierała do abordażu — każdy kapitan bił się jak przeciętniak (5). Teraz przekazywana jest wartość efektywna, po korekcie wiekowej.

**Migracja v10** — `player.lastPlunderDay`. W starych zapisach zegar liczy się od dnia wczytania, nie od dnia 1: inaczej każdy długi zapis otwierałby się wściekłą załogą, której gracz nie miał szans zobaczyć.

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
