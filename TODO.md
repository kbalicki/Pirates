# TODO — Pirates' Chronicles (handoff)

**Stan na:** 2026-09-04 · **Wersja:** v0.24.0.0 · **Branch:** `main`
**Kod:** 181 plików `.ts` · `tsc --noEmit` czysty · `npm test` — **1191 przechodzi, 0 failuje, 0 `todo`** w 34 plikach

**Repo przeniesione (2026-09-04):** `origin` → https://github.com/kbalicki/Pirates (publiczne).
Stare firmowe repo zostało jako remote `websystems` (websystemspl/PiratesChronicles).
**W commitach i PR-ach nie wymieniamy Claude'a** — żadnego `Co-Authored-By`, żadnej stopki.

Ten plik jest źródłem prawdy dla **kolejności prac**.
[documentation/11-ROADMAP.md](documentation/11-ROADMAP.md) opisuje **wizję i zakres** modułów.

> **Start sesji w jednym zdaniu:** v0.24.0.0 jest na `main` i **wdrożona** na pirates.k4.pl, testy 1191/1191 zielone; v0.23.0 sprawiła, że towar naprawdę wędruje, ale **nikt za nic nie płacił** — ta wersja domyka pętlę pieniężną (dostawa szlakiem płaci oba końce, ceny jadą w trakcie handlu), przepuszcza reputację przez cztery lady w porcie i daje magazyn na wynajem w dowolnym mieście — lista kandydatów na v0.25.0 jest niżej.

> **Kierunek artystyczny rozstrzygnięty 2026-09-04: cała gra to pixel art.** `sailship.png` i sprite'y miast są tymczasowe i idą do podmiany, a każda z dziewięciu klas statków dostaje **własny** art (8 klatek kierunkowych na klasę = 72 klatki). Szczegóły i dwie pułapki techniczne — sekcja 6.

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
| Bitwy lądowe | ✅ | `SiegeSystem` (~560 l.) + `CityAssaultScene`: ostrzał rundowy, desant falami, trzy zakończenia, port zmienia właściciela |
| Córki gubernatorów | ✅ | `RomanceSystem`: jedna na miasto, cztery podejścia, ślub raz na karierę |
| Wątek rodzinny | ✅ | `FamilyQuestSystem`: trzy miasta markiza, pojedynek za każdego krewnego |
| Odbicie miast przez koronę | ✅ | `ReconquestSystem` (~700 l.): eskadry odbijające jako newsy, załoga miasta jako dźwignia, `settleRelief` jako jedyne miejsce zapisu wyniku desantu |
| Rozgrywalna bitwa obronna | ✅ | `CityDefenseSystem` (~540 l.) + `CityDefenseScene`: wybór celu ostrzału, eskorta zasłaniająca szalupy, ludzie na mury kosztem dział okrętowych |
| Korona kontra korona | ✅ | `CrownCampaignSystem` (~290 l.): wojny wystawiają wyprawy na najsłabsze kolonie przeciwnika, tą samą siecią newsów |
| Wyprawa jako eskadra na mapie | ✅ | `ExpeditionFleetSystem` (~470 l.): desant dostaje kadłuby, transportowce wiozą ludzi, ledger przeliczany co tick |
| Zlecenie obrony u gubernatora | ✅ | `DefenseContractSystem` (~250 l.): pierwszy ręcznie pisany łańcuch questowy, pierwszy odpalacz `reach_port` |
| Załoga konsorty | ✅ | `FleetShip.crew?` + `consortCrew()`/`manConsorts()`: straty w ludziach wreszcie zostają |
| Kurs wyprawy na mapie | ✅ | `ExpeditionCourseRenderer`: kreskowany kurs, pierścień celu, grot zliczenia — tylko dla znanych wypraw |
| Port macierzysty | ✅ | `HomePortSystem`: posag, darmowe klarowanie całej floty, magazyn 300 ton; wygasa, gdy miasto zmieni ręce |
| Bandery statków NPC | ✅ | `WorldRenderer.syncFlag`: mała bandera przy kadłubie, idzie za alfą mgły, stały rozmiar ekranowy |
| Ekonomia miast pirackich | ✅ | `heldEconomyCeiling`: ludzie i pieniądze przestają dryfować ku liczbom kolonii |
| Morale konsorty | ✅ | `FleetShip.morale?` + `fleetMorale()`: własne morale, ważone ludźmi w oblężeniu |
| Import do portów | ✅ | `EconomyTickSystem` krok 3.5: kolonia dostaje, czego nie produkuje; czarna bandera tylko przemytników |
| Wojna na nabrzeżu | ✅ | `EventDailyEffects.importMul`: wojna zabiera 30% dostaw, pokój oddaje |
| Wyszkolenie konsorty | ✅ | `FleetShip.training?` + `fleetTraining()`: zielona załoga pryzowa, ważona ludźmi |
| Szlaki handlowe | ✅ | `TradeRouteSystem` (81 szlaków): nazwany dostawca per towar, kurs liczony morzem |
| Pathfinding morski | ✅ | `Pathfinding.ts`: A\* po siatce 40 px, kara przybrzeżna, sznurkowanie kursu |
| Blokada portu | ✅ | `BlockadeSystem`: kordon przez *bycie tam*, głód, topniejący garnizon, wściekła korona |
| Ładownia pryzu | ✅ | `PrizeSystem`: kupiec wiezie towar swojego szlaku; kiesa z tonażu, nie z kostki |
| Fracht dla gracza | ✅ | `CargoContractSystem` + kantor w porcie: przewóz na zlecenie, dodatek za ryzyko, pokusa kradzieży |
| Towar naprawdę płynie | ✅ | `NpcSpawnSystem`: kupiec ładuje się z magazynu i wysypuje ładownię w celu |
| Przekierowanie dostaw | ✅ | `alternateSuppliers`: blokada boli tylko tam, gdzie nie ma drugiego źródła |

### Nietknięte

Mini-gra taneczna · ciotka i wujek jako czwarty i piąty krewny · wioski Indian · misje jezuickie · pathfinding A\* · muzyka poza menu

### Świadome placeholdery (zostawione celowo)

| Plik | Po co zostaje |
|---|---|
| `src/core/data/quests.ts` | Pusta mapa `QUESTS` — miejsce na questy pisane ręcznie. Skarby **i** wątek rodzinny są instancjami odbudowywanymi z `questLog` przez `buildQuestRegistry()`, więc tu ich nie ma |
| — | `Pathfinding.ts` **przestał** być placeholderem w v0.22.0. Zostały same questy |

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

### ~~v0.12.0 — Mapy skarbów~~ ✅ (v0.12.0.0)

**System questów** (`QuestSystem.ts`) — to, co placeholder obiecywał od v0.5.6. Zadanie to zbiór etapów; etap mówi, co robić, i wylicza wyzwalacze (`reach_port`, `dig_at`, `flag_set`, `days_passed`) prowadzące do kolejnych etapów. Nagrody używają `DialogueEffect` — żadnego drugiego słownika efektów. Dwie reguły pilnowane testami: **jedno przejście na zdarzenie** (inaczej jedno kopnięcie przeskoczyłoby dwa etapy) i **zakończone zadanie nie reaguje już na nic** (kopanie w tym samym dole nie zapłaci drugi raz). `validateQuest()` łapie ślepe zaułki i etapy końcowe z przejściami.

**Mapy skarbów** (`TreasureSystem.ts`) — pierwszy powód, żeby zejść na ląd; chodzenie pieszo istnieje od v0.9.3 i nie miało do tej pory żadnego celu.

| Jakość | Promień | Cena |
|---|---|---|
| koślawy szkic | 220 | 300 |
| przyzwoita mapa | 110 | 800 |
| mapa z pomiarami | 45 | 2000 |

Tawerna oferuje jedną mapę na port na dzień, zamożniejszy port częściej ma prawdziwą. Skrzynia leży 40-150 od wskazanego miasta; pozycja bierze się z `CityDef.pos`, a nie z siatki lądu (tę zna wyłącznie `MainMapScene`), a promień wyszukiwania jest znacznie większy od przesunięcia, więc obszar zawsze pokrywa ląd. Kopanie: **X** na lądzie, wynik `found` / `warm` (do 3× promienia) / `cold`, przy chybieniu z kierunkiem — dlatego koślawa mapa dalej działa, tylko wolniej.

**25% map to przynęta** — kopanie odpala pojedynek w `DuelScene`. Wygrana daje skrzynię, przegrana kosztuje ćwiartkę złota.

**Zostało z tego modułu:**
- Mapy jako **łup z pirackich statków** (dziś tylko kupno w tawernie)
- **Fragmenty map** składane w całość, zwiększające precyzję

### ~~v0.13.0 — Bitwy lądowe~~ ✅ (v0.13.0.0)

`src/core/systems/SiegeSystem.ts` + `src/game/scenes/CityAssaultScene.ts`. Odpowiedź „ATAK" w `PortApproachScene` startowała do tej pory bitwę morską z `enemyId = portId` — przeciwnikiem, którego nie ma w `entities`, bez kadłuba i bez dział. `PortRuntimeState.defense` istniało od v7, było popychane przez wydarzenia świata i nikt go nie czytał. Oba te braki spotykały się dokładnie tutaj.

**Trzy etapy, z czego tylko środkowy nie jest decyzją.** Ostrzał jest interaktywny, runda po rundzie: obie strony strzelają jednocześnie, więc uciszenie ostatniego działa i tak kosztuje jego ostatnią salwę. Desant jest auto-resolve'em falami — taktyczna bitwa lądowa to inna gra; gracz kontroluje **kiedy** wysadzić ludzi, nie gdzie każdy z nich idzie. Łupy to wybór, co zrobić z miastem bez garnizonu.

Mury są warte do **2.5×** siły garnizonu (`wallFactor` 0.5-1.3), i to jest cała argumentacja za płaceniem kadłubem, zanim zapłaci się ludźmi: desant na nietknięty fort I klasy to 39%, ten sam po porządnym ostrzale — 70%.

Fregata ucisza Kartagenę w 8-12 rundach kosztem ~80 kadłuba; slup zostaje odparty, zanim działa umilkną. Działa, kadłuby i ludzie liczą się **z całej floty** — to pierwsza mechanika, która płaci za drugi i trzeci statek czymś innym niż ładownia.

Garnizon skaluje się populacją, którą ekonomia faktycznie zostawiła miastu (`popFactor` 0.4-1.3), więc miasto po epidemii albo głodzie jest mierzalnie łatwiejsze do wzięcia. To pierwsze miejsce, w którym numeryka żywego świata rozstrzyga coś, co gracz czuje.

**Zakończenia:** złupić (100% łupu, stara flaga zostaje nad ruiną), zatrzymać dla bractwa (70%, port przechodzi piratom), oddać koronie z listu kaperskiego (50% + ranga). Zmiana `PortRuntimeState.factionId` kaskaduje na flagę na mapie, gubernatora, ceny i spawn NPC — wszystko czyta teraz `portFaction(world, portKey)` zamiast `CityDef.factionId`.

**Znaleziony przy okazji błąd:** wszystkie sceny portowe czytały właściciela ze statycznego `CityDef`, więc miasto zdobyte miesiąc temu dalej powiewałoby hiszpańską flagą. `portFaction()` jest teraz jedynym poprawnym odczytem.

**Zostało z tego modułu:**
- ~~**Obrona miast przez AI**~~ ✅ v0.15.0.0 — `ReconquestSystem`, opisany niżej
- ~~**Bronienie sojusznika** przed cudzym szturmem, za reputację i złoto~~ ✅ v0.16.0.0 — `CityDefenseSystem`, opisany niżej
- **Straty konsorty w ludziach** nie są zapisywane: `FleetShip` nie ma pola załogi, więc konsorta odzyskuje pełną obsadę do kolejnego oblężenia (`SiegeSystem.writeBackForce`)

### ~~v0.14.0 — Warstwa fabularna~~ ✅ trzon (v0.14.0.0)

**Córki gubernatorów** (`RomanceSystem.ts`) — `charm` istniał w `CaptainSkills` od tworzenia postaci i do tej pory **nie był czytany nigdzie w kodzie**. Każde miasto powyżej przystani ma jedną córkę, **wyprowadzoną** z klucza portu hashem FNV-1a, a nie losowaną: to samo imię i ta sama uroda w każdym zapisie. W `WorldState` ląduje jedna liczba, `player.courtship[portKey]`.

Cztery podejścia opierają się na różnych rzeczach: komplement i taniec na uroku, podarunek na złocie (500), przechwałka na sławie — nieznany kapitan, który się przechwala, wychodzi na głupca. Pudło kosztuje grunt, więc właściwy ruch zależy od tego, kim kapitan naprawdę jest. Przy 30 dzieli się tropem (darmowe wejście w wątek rodzinny), przy 85 i randze 2 u jej korony przyjmuje oświadczyny. Ślub jest jeden na karierę i wart 500-1500 punktów na emeryturze.

**Poszukiwanie rodziny** (`FamilyQuestSystem.ts`) — pierwszy pisany ręcznie wątek, nie generowana dziura w piasku. Markiz korony, która najbardziej nie znosi korony kapitana, rozproszył rodzinę po trzech swoich miastach. Łańcuch jest instancją jak mapa skarbu: trzy miasta losowane raz i zapisane w `data.chain`, `QuestDef` odbudowywany z nich. Flagi `family_step_N` są spoiną między maszyną questów a sceną pojedynku — `QuestSystem` nie wie nic o pojedynkach, `DuelScene` nie wie nic o questach. Przegrany pojedynek nie kosztuje nic poza drogą powrotną; ślepy zaułek uwięziłby wątek.

**QuestRegistry** — `advanceQuests` dostawało do tej pory rejestr budowany w locie z map skarbów, które akurat trzymał wywołujący. Przy drugim źródle questów to przestaje działać: kopanie widziałoby rejestr bez wątku rodzinnego, a odbicie krewnego — bez polowań na skarby. `buildQuestRegistry(world)` odbudowuje wszystko z `questLog`.

**Emerytura** liczy trzy nowe linie: zdobyte miasta (400 każde), odzyskana rodzina (700 każdy) i małżeństwo. Żadnej z nich nie da się wyharować w ostatnim roku rajdów, i o to chodzi.

**Znaleziony przy okazji błąd:** `PortScene.tavernMessage` rysował się **tylko** w menu portu, więc każda odpowiedź tawerny — kupiona mapa, cena, której nie stać było zapłacić — była zapisywana i wyrzucana, zanim ktokolwiek ją zobaczył. Naprawione przy okazji dokładania odpowiedzi informatora.

**Migracja v11** — `player.citiesCaptured` i `player.courtship`, oba startują puste. Nic nie jest zgadywane ze starego zapisu: wymyślona historia zdobyczy pojawiłaby się w punktacji jako punkty, których nikt nie zarobił.

**Zostało z tego modułu:**
- **Posag i baza w porcie żony** — dziś ślub daje reputację i punkty, nic więcej
- **Mini-gra taneczna** zamiast rzutu kością na urok
- **Ciotka i wujek** jako czwarty i piąty krewny, z unikalnymi nagrodami (brat jako pierwszy oficer, mapa wielkiego skarbu od wujka)
- **Tropy od kupców i z tawern** jako alternatywa dla nazwania miasta wprost

### ~~v0.15.0 — Korona wraca po swoje~~ ✅ (v0.15.0.0)

`src/core/systems/ReconquestSystem.ts`. Druga połowa v0.13.0: do tej pory zdobycz
była wieczna, więc największa mechanika gry miała tylko połowę pętli. Konkwista,
której nie da się stracić, jest trofeum, nie posiadłością.

**Pętla.** Miasto zmienia właściciela → `capturePort` stempluje `capturedDay` →
po 12 dniach karencji każdy dzień to rzut o wypłynięcie eskadry → eskadra jest
zwykłym `WorldEventState` typu `reconquest`, więc **jedzie istniejącą siecią
newsów**: tawerny wszystkich portów tej korony i NPC roznoszący plotki → 6-14 dni
później desant rozstrzyga się poza ekranem.

To ostrzeżenie jest sensem całości. Gracz nie dowiaduje się, że stracił miasto —
dowiaduje się, że **może** je stracić, i ma czas coś z tym zrobić.

**Dwie dźwignie, celowo różne w naturze.** *Zostaw ludzi* — załoga na murach liczy
się 1:1 jako żołnierze w `garrisonFor`, pojemność 2× etatu miasta, dezercja
0.4%/dzień; odpowiedź na miasto, przy którym nie da się być. *Bądź tam* — flota w
promieniu 400 px rzuca desant do obrony, a załoga fregaty na brzegu przeważa
wszystko, co zostało złupionemu miastu; odpowiedź na miasto, po które warto wrócić.

Samo miasto **nie** jest dźwignią: `heldDefenseCeiling` ciągnie `defense` ku 45%
baseline'u zamiast ku pełnemu, bo za garnizon nikt już nie płaci. Bez tego miasto
odbudowałoby się samo w jeden sezon i nie byłoby czego decydować.

| Stała | Wartość | Po co |
|---|---|---|
| `RELIEF_GRACE_DAYS` | 12 | zanim korona w ogóle zbierze okręty |
| `RELIEF_DAILY_BASE` | 0.06 | ×priorytet rozmiaru ×siła korony ×(wojna 0.5) |
| `RELIEF_COOLDOWN_DAYS` | 45 | po odparciu |
| `ESCALATION_DAYS` | 180 | wyprawa podwaja się przez pół roku |
| `RESOLVE_SHARPNESS` | 1.8 | wyrównana walka = rzut monetą, nierówna zachowuje się jak arytmetyka |
| `HELD_DEFENSE_SHARE` | 0.45 | sufit odbudowy zdobytego miasta |

**Migracja v12** — `garrison`, `capturedDay`, `nextReliefDay` w `PortRuntimeState`.
Miasto, które w zapisie v11 jest już w cudzych rękach, dostaje `capturedDay` równy
**dniowi wczytania**, nie zgadywanej dacie upadku: pomyłka w drugą stronę otwierałaby
zapis eskadrą już na redzie. Ta sama zasada, co przy zegarze łupów w v10.

**Naprawione przy okazji:** flagi na mapie były snapshotem z `MainMapScene.create()`
— wystarczało, dopóki właściciel zmieniał się wyłącznie po oblężeniu przebudowującym
scenę. Teraz `refreshPortFlags` podmienia teksturę flagi w każdym dniu, w którym
właściciel się rozjechał z tym, co narysowano.

**Weryfikacja w grze:** `?relief=<port>` (+ `&garrison=N`, `&soldiers=N`) stawia
gracza pod miastem, które trzyma, z eskadrą docierającą dzisiaj i zegarem
przyspieszonym do doby na sekundę. Obie gałęzie przejechane: `reconquest.log_held_present`
(garnizon 120 → 88, obrona 40 → 34, flaga zostaje) i `reconquest.log_lost` (flaga
wraca do Hiszpanii). `drive.mjs` ma nowe pole `staleFlags` — porty, których
narysowana flaga nie zgadza się z właścicielem; w obu przebiegach puste.

**Zostało z tego modułu:** nic — wszystkie trzy pozycje domknięte w v0.16.0.0:
~~rozgrywalna bitwa obronna~~, ~~bronienie sojusznika~~, ~~korona kontra korona~~.

### ~~v0.16.0 — Miasto się broni, korony się biją~~ ✅ (v0.16.0.0)

Trzy rzeczy, które razem domykają moduł bitew lądowych: desant, który da się
rozegrać; wojny, które przesuwają flagi; i powód, żeby stać na cudzym murze.

**Rozgrywalna bitwa obronna** (`CityDefenseSystem.ts` + `CityDefenseScene.ts`) —
do v0.15.0 desant korony rozstrzygał się poza ekranem **także wtedy, gdy gracz
stał na redzie**. To było jedyne miejsce w grze, gdzie obecność gracza dawała mu
komunikat zamiast sterów.

Scena jest `CityAssaultScene` odbite w lustrze — ten sam układ pasków, ta sama
narracja, ta sama klawiatura — ale decyzja jest inna. Ostrzał to wybór celu:

| Cel | Co daje | Co kosztuje |
|---|---|---|
| **T — szalupy** | żołnierze, którzy nie dojdą do piasku | mur leci dalej, bo eskorta strzela bez przeszkód |
| **G — eskorta** | mniej ognia w mur **i** odsłonięte szalupy | żołnierze schodzą w komplecie |

Sensem całości jest `ESCORT_COVER = 0.65`: nietknięta eskorta zasłania
transportowce i przepuszcza ok. 35% ognia w ich stronę. Bez tego ogień do szalup
był **zawsze** lepszy — szedł prosto w liczbę rozstrzygającą plażę — a eskorta
była dekoracją. Teraz droga do szalup prowadzi przez eskortę i płaci się ją
murem, więc właściwa odpowiedź zależy od tego, czy wyprawa to głównie ludzie,
czy głównie działa.

Druga oś: **L — ludzie na mury**. Desant floty liczy się jako garnizon 1:1, ale
to ci sami ludzie obsługiwali działa okrętowe, więc `fleetGuns` spada
proporcjonalnie. Pełny mur albo cicha reda. Przy utracie miasta wraca 30% z nich.

Eskadra decyduje sama, kiedy schodzi: 8 rund cierpliwości albo mur poniżej 40%.
Przeczekać się nie da — i to jest presja, wokół której zbudowany jest ekran.
Wybicie wszystkich żołnierzy przed desantem kończy sprawę bez plaży.

**Korona kontra korona** (`CrownCampaignSystem.ts`) — dziesięć wojen
historycznych siedziało na tablicy newsów od v0.9.7 i nie przesunęło ani jednej
flagi. Teraz korona w stanie wojny wystawia wyprawy przeciw najsłabszym koloniom
przeciwnika, jadące tą samą siecią newsów (10-20 dni) i rozstrzygane tym samym
kodem co eskadra odbijająca.

Waga celu to `(1.05 − defense/100)² × SIZE_PRIORITY`. Kwadrat jest tam po to,
żeby „najpierw słabe" było prawdą: liniowo człon rozmiaru wygrywał i obwarowane
średnie miasto biło bezbronną przystań. Miasto, które gracz właśnie złupił, jest
teraz na szczycie cudzej listy — i to jest cała strategiczna treść modułu.

Tempo jest **celowo** wolniejsze od gracza: `CAMPAIGN_DAILY_BASE = 0.03` (połowa
`RELIEF_DAILY_BASE`), 90 dni karencji na miasto, najwyżej dwie wyprawy naraz na
morzu. Mapa, która się kotłuje, odbiera zdobyciu miasta znaczenie.

**Obrona sojusznika** — desant na kolonię korony, która liczy gracza za swojego
(list kaperski albo reputacja „allied", ≥ 60), jest rozgrywalny tak samo.
Wygrana płaci +25 reputacji i złotem z rozbitych transportowców. Samo bycie w
pobliżu to **nie** udział: `playerDefends` wymaga własnego miasta, a udział w
cudzej obronie jest decyzją i zapada w scenie, nie przez odległość.

**Zmiana bilansu, którą warto znać:** `heldDefenseCeiling` obcina odbudowę
obrony do 45% wyłącznie pod **czarną banderą**. Kolonia pod koroną — także
oddana sponsorowi albo zdobyta przez inną koronę — dostaje gubernatora i budżet
na garnizon, więc wraca do pełnego baseline'u. Wcześniej kryterium było „zmieniła
właściciela", co po dołożeniu wojen między koronami byłoby po prostu błędne.

**Jedno miejsce rozliczenia.** `settleRelief` wydzielone z `resolveRelief`: są
teraz trzy drogi do tego samego zapisu (eskadra poza ekranem, wyprawa korony,
bitwa rozegrana ręcznie), więc arytmetyka może się różnić, a księgowość nie.
`capturedDay` przy utracie miasta kasuje się tylko wtedy, gdy zdobywcą jest
korona założycielska; w każdym innym wypadku startuje od nowa — i to ta gałąź
otwiera rekonkwistę przeciw koloniom przechodzącym między koronami.

**Bez migracji, świadomie.** `PortRuntimeState.nextCampaignDay` jest opcjonalne i
czytane przez `?? 0`, `WorldEventType` rozszerzony o `"campaign"` nie zmienia
kształtu żadnego starego zapisu. `CURRENT_WORLD_VERSION` zostaje na **v12** —
krok migracji, który nic nie robi, to hałas w łańcuchu, który i tak trzeba
utrzymywać.

**Naprawione przy okazji:**
- Trzy toasty z `CrewConsumptionSystem` rysowały surowe klucze i18n („event.food_out"
  zamiast zdania). Teraz przechodzą przez `t()` w miejscu tworzenia zdarzenia,
  a komunikat o śmierci załogi wreszcie dostaje `{{count}}`.
- Stała nakładka mapy (`UIOverlayScene` — róża wiatrów, data, wersja) zostawała
  nad bitwą lądową startowaną z mapy: `scene.start` z wnętrza `MainMapScene.update`
  nie zabiera jej ze sobą. Obie sceny lądowe zatrzymują ją teraz w `create()`;
  `CityAssaultScene` miała ten błąd od v0.13.0.

**Weryfikacja w grze:** `?defend=<port>` (+ `&ally=1`, `&garrison=N`,
`&soldiers=N`) wchodzi wprost w bitwę obronną. Przejechane: własne miasto
obronione (`reconquest.log_held_present`, garnizon i obrona ścięte, flaga
zostaje), cudza kolonia utracona (`reconquest.log_lost`, flaga do Hiszpanii,
`staleFlags` puste), cudza kolonia obroniona (+25 reputacji, linia „England will
remember who stood on their wall"). Ścieżka produkcyjna sprawdzona przez
`?relief=cartagena` — dzienny tick otwiera teraz scenę zamiast rozstrzygać
desant w komunikacie.

**Zostało z tego modułu:**
- **Bitwa obronna z pozycjami** — dziś to ekran liczb, tak jak `CityAssaultScene`. Taktyczna bitwa lądowa to inny projekt
- **Sojusznik prosi o pomoc** — dziś gracz musi sam się nawinąć; brak zlecenia „broń Port Royale" u gubernatora, choć `QuestSystem` i `DialogueSystem` mają wszystko, czego to wymaga
- **Wyprawy korony nie mają floty na mapie** — wyprawa jest newsem i wynikiem, nie eskadrą NPC, którą dałoby się przechwycić na morzu

### ~~v0.17.0 — Inwazja dostaje kadłuby, gubernator prosi~~ ✅ (v0.17.0.0)

Trzy zadania i jeden błąd, który przy okazji wyszedł i okazał się większy od
całej reszty.

**Wyprawa jako eskadra na morzu** (`ExpeditionFleetSystem.ts`) — od v0.15.0
wyprawa korony była nagłówkiem w tawernie i datą przybycia, a **między jednym a
drugim niczym**. Gracz mógł usłyszeć, że czterystu Hiszpanów jest dwanaście dni
od Kartageny, i nie mógł zrobić nic poza staniem na murze, kiedy dopłyną. Dziwny
kształt dla gry pirackiej: jedyną rzeczą, jaką kapitan mógł z inwazją zrobić,
było spotkać ją na morzu.

Dopóki gracz jest w promieniu 620, zdarzenie dostaje 2-4 zwykłe encje NPC z
zapisanym udziałem w desancie. Transportowce wiozą **wszystkich** żołnierzy i
zero dział, eskorty odwrotnie — i to jest cała taktyczna treść przechwycenia,
lustro wyboru „T czy G" z `CityDefenseScene`, tylko z drugiego końca plaży.
Eskorty to `navy` i wychodzą naprzeciw; transportowce to `trader` i prą do
brzegu. Zaczepiony kadłub mówi, dokąd płynie — niesie news o własnej wyprawie.

Ledger jest **przeliczany od nowa** co tick jako suma tego, co pływa, a nie
odejmowany. Odejmowanie musiałoby wiedzieć, *dlaczego* kadłuba nie ma (zatopiony
czy zdespawnowany, bo gracz odpłynął); suma liczona **przed** każdym celowym
usunięciem tego nie potrzebuje i nie może się rozjechać. Stąd też jedyna reguła
całości: zapis wyprzedza despawn, nigdy odwrotnie.

Gdy nie ma kogo wysadzić, wyprawa znika, a cel dostaje **ten sam okres karencji**
co po odparciu desantu na plaży. Bez tego następny dzienny rzut wystawiłby
kolejną eskadrę i rozbicie tej pierwszej nie dałoby graczowi nic.

**Pułapka, która to prawie zabiła:** `LANDMASSES` jest puste w testach (ładowane
z GeoJSON w runtime), więc kontrola wody w vitest zawsze przechodziła — a prosta
między dwoma portami tego archipelagu bardzo często idzie po lądzie. Santa Marta
→ Kartagena jest lądowa na większości długości, czyli eskadra na **najczęściej
atakowane miasto w grze** nie pojawiała się nigdy. Pozycja jest teraz dosuwana do
najbliższej wody (`nearestWater`, 140), a materializacja jest wszystko-albo-nic:
kadłub bez wody byłby dla `syncLedger` ludźmi wykreślonymi z inwazji bez wystrzału.

**Zlecenie obrony u gubernatora** (`DefenseContractSystem.ts`) — v0.16.0 zrobiło
cudzą kolonię obronną i nie dało żadnego sposobu, żeby gracz **został o to
poproszony**. Cała gałąź gry była osiągalna wyłącznie przypadkiem.

Łańcuch ma dwie spoiny **celowo różnej natury**: dotarcie to pozycja, więc
`reach_port`; utrzymanie to wynik, więc flaga świata stemplowana przez
`settleRelief` na **każdej** ścieżce rozstrzygnięcia. Dlatego zlecenie płaci
niezależnie od tego, czy gracz rozegrał bitwę, czy garnizon zrobił to bez niego.
Rozbicie eskadry na morzu desantu nie rozstrzyga, więc flaga nie powstaje i
zlecenie wygasa na zegarze — gubernator płaci za obronione miasto, nie za
zgubioną flotę.

Termin jest **wypiekany przy podpisaniu**: `QuestDef` instancji jest odbudowywany
z `questLog` przy każdym wczytaniu, więc okno liczone „względem dziś" po cichu
przedłużałoby się przy każdym otwarciu zapisu.

To pierwsze miejsce, które odpala `reach_port` (`PortScene.create()`, tylko przy
wejściu przez bramę) i `days_passed` (`WorldEngine`, zmiana dnia) — oba były w
`QuestSystem` i pokryte testami od v0.12.0, a żadna scena ich nie emitowała.
Doszła też zakładka **Dziennik** w menu SPACE: `activeQuests` też istniało od
v0.12.0 i było wołane znikąd, a zlecenie z terminem, którego gracz nie może
sprawdzić, to obietnica, której nie może dotrzymać.

**Załoga konsorty** — `FleetShip.crew?`, opcjonalne, czytane przez
`consortCrew()` z fallbackiem `crewMax × 0.8`; ten fallback jest powodem, dla
którego migracja nie była potrzebna. Do tej pory komplet konsorty przeliczał się
z klasy przy każdym pytaniu, więc statek, który stracił połowę ludzi pod murami,
miał ich wszystkich z powrotem przy następnym oblężeniu — **jedyne miejsce w
grze, gdzie ludzie wracali**. Rekrutacja w tawernie liczy teraz koje całej floty
(flagowy najpierw, reszta do najbardziej przetrzebionej konsorty), bo inaczej
byłaby to jednokierunkowa zapadka.

**Błąd znaleziony przy okazji, i to on jest największą rzeczą w tym wydaniu:**
każdy okresowy system bramkował się na `world.time.tick % INTERVAL === 0`.
`MainMapScene` podaje silnikowi **ułamkowy** `dtTicks` (delta klatki ÷ 50 × tempo
gry, ≈0.4 przy 60 fps), więc `tick` jest floatem i ta reszta **nigdy** nie jest
zerem. `updateNpcSpawns` nie postawił na mapie ani jednego statku, `updateNpcAi`
nie podjął ani jednej decyzji, wymiana newsów nie zadziałała ani razu. Świat
wyglądał na pusty, bo **był** pusty — a testy jednostkowe tych systemów, pisane
na całkowitych tickach, przechodziły. `tickBoundaryCrossed` porównuje kubełki i
odpala dokładnie raz na granicę, także gdy klatka przeskoczy cały interwał.

**Weryfikacja w grze:** `?intercept=cartagena` — eskadra materializuje się (2
transportowce po 100 ludzi, 2 fregaty po 25 dział, `AFLOAT`), zatopienie jednego
transportowca ścina ledger do 100 z linią `expedition.log_transport`, zatopienie
obu kasuje wyprawę (`expedition.log_scattered`, +10 sławy, `nextReliefDay` = 46).
`?commission=port_royal` — oferta gubernatora (180 żołnierzy, 1200 złota, 12
dni), przyjęcie zakłada `defense_bermuda` na etapie `sail`, Dziennik pokazuje
termin. `?siege=cartagena` — konsorta schodzi z plaży `hull:92 crew:67` zamiast
wracać do kompletu.

**Zostało z tego modułu:**
- **Wyprawa nie ma pozycji na minimapie ani w newsach** — gracz wie, że płynie,
  ale kurs musi wydedukować z tego, skąd i dokąd. Naturalne rozszerzenie:
  linia na mapie świata przy zdarzeniu, o którym gracz słyszał
- **Zlecenie jest jedno na raz i tylko od gubernatora** — informator w tawernie
  albo list gończy na tablicy dałyby drugie źródło
- **Konsorty nie mają morale ani wyszkolenia** — dzielą wartości flagowego

### ~~v0.18.0 — Kurs na mapie i port macierzysty~~ ✅ (v0.18.0.0)

Dwa zadania z listy kandydatów i jeden błąd, który wyszedł przy drugim z nich.

**Kurs wyprawy na mapie** (`ExpeditionCourseRenderer.ts`) — v0.17.0 dało
desantowi kadłuby i zostawiło gracza z zadaniem domowym. News mówi, że
czterystu Hiszpanów jest dwanaście dni od Kartageny; eskadra istnieje na mapie
dopiero w promieniu 620. Kurs trzeba było **wydedukować** z tego, która korona
wysyła, który z jej portów leży najbliżej celu i ile dni minęło. To nie problem
nawigacyjny, tylko rachunkowy, i żadna jego ilość nie czyni przechwycenia
ciekawszym.

Teraz mapa rysuje kreskowany kurs, pierścień na mieście docelowym, grot tam,
gdzie wypada zliczenie na dziś, i „200 ludzi · 10 dni" obok. **Tylko dla wypraw,
o których gracz słyszał** (`knownEventIds`) — wyprawa, o której nikt nie
wspomniał, nie jest na jego mapie, i to jest to, co dalej opłaca zawijanie do
portów.

Przy okazji ujednolicone: wyprawa jest oznaczana jako znana **w chwili
wypłynięcia**, bo wywołujący i tak pokazuje wtedy toast. Mapa udająca niewiedzę o
czymś, co ekran właśnie ogłosił, czytałaby się jak błąd, nie jak mgła.

**Rozmiary adnotacji są w pikselach ekranu, dzielone przez zoom.** Wszystko na
tej mapie rysuje się w jednostkach świata, więc pierwsza wersja przy z2 miała
grot zakrywający półwysep i etykietę wychodzącą poza ekran. Notatka ołówkiem na
mapie ma szerokość ołówka niezależnie od skali mapy.

**Port macierzysty** (`HomePortSystem.ts`) — do tej pory ślub płacił reputacją i
punktami na emeryturze, a **dzień po ślubie niczym się nie różnił od dnia przed
nim**. Trzy rzeczy, wszystkie przywiązane do jednego miasta: **posag** (raz, wg
zamożności miasta i rangi kapitana), **klarowanie** całej floty za darmo — kadłub
i takielunek, flagowy i konsorty — oraz **magazyn** na 300 ton na brzegu.

Darmowa stocznia wszędzie znaczyłaby po prostu „naprawy są darmowe". Darmowa w
jednym nazwanym porcie to powód, żeby wytyczyć kurs do domu, i o to w posiadaniu
domu chodzi. Magazyn to ten sam argument w ładunku: ładownia ma 40 ton, a dobry
rejs więcej.

**Wszystko to da się stracić.** `homePortActive` wymaga, żeby miasto wciąż
powiewało flagą jej ojca. Złupienie rodzinnego miasta żony jest dozwolone i
kosztuje magazyn — towary zostają w nim, nieosiągalne, dopóki ktoś nie wywiesi z
powrotem tamtej flagi. To **jedyne miejsce w grze, w którym gracz może zniszczyć
coś własnego, wygrywając bitwę**.

**Pułapka:** `daughterFor` wyprowadza koronę ojca z **dzisiejszego** właściciela
miasta, więc pierwsza wersja `homePortActive` porównywała liczbę z samą sobą i
zawsze zwracała `true` — zdobyta kolonia po cichu hodowała nową córkę
gubernatora. Korona, której służył ojciec, to fakt o ślubie: stempluje ją
`propose` w `player.homeCrown` (opcjonalne, fallback na koronę założycielską,
bez migracji).

**Błąd znaleziony przy okazji:** `repairShip` naprawiał kadłub okrętu flagowego i
**nic więcej** — nie takielunek, nie konsorty. Podarte żagle dało się łatać
wyłącznie prowizorką na morzu, która ma sufit świadomie daleki od pełnej
sprawności, więc statek mógł stać w stoczni trwale niedotakielowany. Naprawa
obejmuje teraz całą flotę i idzie **od najgorszego**, żeby kapitana bez pełnej
kwoty stać było na to, co najprędzej go zatopi. Bez tego darmowe klarowanie w
porcie żony byłoby korzyścią wyłącznie dlatego, że wersja płatna jest zepsuta —
a to nie korzyść, tylko błąd z kokardką.

**Weryfikacja w grze:** `?intercept=cartagena&zoom=z2` — kurs, pierścień, grot i
etykieta w skali. `?home=port_royal` — „Magazyn rodzinny" w menu portu, 20 ton
cukru na brzeg i z powrotem, stocznia klaruje flotę z 48 do 120 kadłuba bez
rachunku.

**Zostało z tego modułu:**
- **Magazyn jest jeden i tylko w porcie żony** — wynajęty skład w dowolnym
  mieście za czynsz byłby naturalnym rozszerzeniem, ale i realnym ryzykiem dla
  ekonomii (gracz mógłby magazynować pod każdą górkę cenową)
- **Kurs jest prostą** — pokazuje zliczenie, nie trasę omijającą ląd, więc bywa
  narysowany przez półwysep. Grot jest dosuwany do wody, linia nie
- **Konsorty nie mają morale ani wyszkolenia** — od v0.17.0 mają własną załogę,
  ale morale i drill dalej biorą z okrętu flagowego

### ~~v0.19.0 — Czyj to statek, i co zostaje z miasta~~ ✅ (v0.19.0.0)

Trzy pozycje z listy zadań równoległych, każda mała, wszystkie razem zmieniające
to, co gracz **widzi** i **czuje** na mapie.

**Bandery statków NPC** (`WorldRenderer.syncFlag`) — domknięcie jedynego `TODO`
zostawionego wprost w kodzie renderera. Czyj to statek było najużyteczniejszą
informacją na tym ekranie i najtrudniejszą do zdobycia: odpowiedź żyła w oknie
spotkania, czyli do obcego żagla trzeba było **podpłynąć**. Kiedyś był to tint
sprite'a i rysował niebieski prostokąt wokół każdego kadłuba — arkusz nie ma
kanału alfa, który dałoby się zabarwić.

Dwie reguły: bandera **idzie za alfą kadłuba** (statek gasnący na skraju
widoczności zabiera ją ze sobą, inaczej mgła zdradzałaby się flagą wiszącą nad
pustą wodą) i ma **stały rozmiar ekranowy**, bo proporcjonalna przy oddaleniu
jest dwoma pikselami błota.

**Miasto pod czarną banderą przestaje być kolonią**
(`heldEconomyCeiling`) — sufit miał do tej pory wyłącznie `defense`.
`population` i `wealth` dryfowały ku liczbom, które miasto miało jako **czyjaś
kolonia**, więc zdobycz po cichu odbudowywała się dokładnie w tę nagrodę, którą
była — dotowana żegluga, gubernator, koloniści — pod flagą, która nie gwarantuje
niczego z tych rzeczy.

**Pułapka, i to niebanalna: sufit to nie równowaga.** `wealth` jest codziennie
spychane w dół przez człon handlowy, a ta presja jest z grubsza stała, więc
ścięcie celu o ćwierć kosztuje równowagę znacznie więcej niż ćwierć. Pierwsza
wersja użyła udziału 0.42 i ustawiła zdobytą Port Royale na bogactwie **5** —
miasto nie podupadło, ono wyparowało. `population` nie ma takiej przeciwwagi i
osiada blisko celu. Dlatego udziały są tak różne (0.62 ludzi, **0.75** pieniędzy)
i nie wolno ich „ujednolicać". Zmierzone po 600 dniach: kolonia `w=353 p=2500`,
czarna bandera `w=203 p=1650`.

Oddane koronie — **dowolnej**, także tej, która je zdobyła — wraca w górę:
`playerHolds` wymaga piratów, a nie „zmieniło właściciela".

**Morale konsorty** (`FleetShip.morale?`) — konsorty wożą własnych ludzi od
v0.17.0, a morale brały z okrętu flagowego; `SeaBattleScene` wprost wpisywał
każdej `0.8`. Teraz morale jest ich własne: spada, gdy podział łupów się
przeterminuje, wraca do 1 przy podziale, i napędza ich działa w bitwie.
Oblężenie uśrednia morale **ważąc ludźmi** — zbuntowana pinasa nie ma prawa
ściągnąć stuosobowej fregaty do swojego nastroju.

**Weryfikacja w grze:** `?intercept=cartagena` — hiszpańskie krzyże burgundzkie
przy każdym kadłubie NPC, czytelne na domyślnym zoomie, znikające razem ze
statkiem pod mgłą.

**Zostało z tego modułu:**
- **Bandera nie mówi nic o zachowaniu** — kupiec i okręt wojenny tej samej
  korony wyglądają identycznie. Drugi znacznik (albo kształt banderoli) dałby
  „kto" **i** „co"
- **Równowaga bogactwa portu jest w ogóle niska** — nawet kolonia królewska
  osiada na 353 z 600 baseline'u. Nie jest to błąd wprowadzony teraz, ale wyszło
  przy pomiarach i warto to kiedyś przejrzeć razem z `EconomyTickSystem`

### ~~v0.20.0 — Każdy port w tej grze po cichu głodował~~ ✅ (v0.20.0.0)

**Import licencjonowany** (`EconomyTickSystem` krok 3.5) — to jest naprawa
dziury w modelu, a nie nowa mechanika, i wyszła wprost z pomiarów zrobionych do
v0.19.0.

Port konsumuje `def.demands` **z własnego magazynu**, a nic tych towarów tam nie
wkładało. Nie ma symulacji handlu między portami, więc każdy towar, którego
miasto potrzebuje i nie produkuje, był brakujący **codziennie, na zawsze**, i
kosztował płaski punkt bogactwa. Port Royale potrzebuje cukru, kakao i tytoniu i
nie produkuje żadnego z nich: krwawił −3 bogactwa dziennie **od dnia stworzenia
świata** i osiadał na 353 przy baseline 600. Każdy inny port tak samo, w swojej
proporcji. `getPortBaseline()` było fikcją, do której nic nie mogło dojść.

Stary człon bogactwa czynił w pełni zaopatrzone miasto **niemożliwym**: `+drained
× 0.3` plus płaskie `−1` za jakikolwiek niedobór, więc kara odpalała nawet przy
99% pokrycia. Nowy jest zerowy przy pełnym pokryciu i rośnie w miarę braku.
Kolonia w pokoju osiada dokładnie na swoim baseline — czyli na tym, co baseline
miał zawsze znaczyć.

| Kto | `IMPORT_SHARE` | Równowaga Port Royale |
|---|---|---|
| kolonia korony | `1.0` | **600** (baseline) |
| czarna bandera | `0.35` | **263** |

**Dlatego `HELD_WEALTH_SHARE` z v0.19.0 zniknęło.** Czarna bandera kosztuje
teraz miasto **import**, a nie modyfikator w księgach: jeden mechanizm zamiast
dwóch, i taki, który da się opowiedzieć zdaniem. Został `heldPopulationCeiling`,
bo ludzie to inna wielkość i nie mają przeciwwagi w dół.

**Skutek dla balansu, warto wiedzieć:** wartość łupu na dzień 1 **bez zmian**
(Kartagena dalej 3200 złota). Zmieniło się to, że miasta przestają z czasem
usychać — Kartagena, do której wracasz po pięciu latach, jest tą samą Kartageną,
a nie jej cieniem. Jeśli po dłuższej rozgrywce świat okaże się za bogaty,
strojenie zaczyna się od `IMPORT_SHARE_CROWN`, nie od baseline'ów.

**Proporzec wojenny** (`WorldRenderer.syncPennant`) — bandera z v0.19.0 mówi
**czyj** to statek, ale nie **jaki**. Wszystkie kadłuby rysują się z jednego
arkusza, więc kupiec i fregata tej samej korony byli nie do odróżnienia, dopóki
nie podpłynęło się na odległość zawołania — a wtedy fregata zdążyła już wyrobić
sobie zdanie. Czerwona wstęga nad banderą dla `navy`, `pirate` i
`pirate_hunter`; kupcy jej nie mają.

**Weryfikacja w grze:** `?intercept=cartagena` — 9 NPC, 5 okrętów wojennych, 5
proporczyków, kupcy bez. `?siege=cartagena` — łup dalej 3200.

**Zostało z tego modułu:**
- **Import jest abstrakcją, nie handlem** — nic nie płynie między portami, nie da
  się przerwać dostaw blokadą konkretnej trasy ani na tym zarobić jako
  przewoźnik. Prawdziwe szlaki handlowe to `Pathfinding.ts` i przebudowa
  `NpcAiSystem`
- **`IMPORT_SHARE` nie reaguje na wojnę** poza `productionMul`. Wojna dwóch koron
  powinna dusić żeglugę mocniej niż zbiory

### ~~v0.21.0 — Wojna na nabrzeżu, zielona załoga~~ ✅ (v0.21.0.0)

Dwa domknięcia, oba wyszły wprost z v0.20.0.

**Wojna dusi żeglugę** (`EventDailyEffects.importMul`) — dziesięć historycznych
wojen wisiało na tablicy newsów od v0.9.7: podwajały patrole, ruszały ceny i od
v0.16.0 przesuwały flagi. Czego nigdy nie robiły, to nie docierały **na
nabrzeże**. Teraz zdarzenia mają własny człon żeglugowy, osobny od tego, co robią
zbiorom, bo huragan, wojna i najazd robią zupełnie różne rzeczy polom i konwojom.

| Zdarzenie | `productionMul` | `importMul` |
|---|---|---|
| `war_start` | 0.85 | **0.70** |
| `pirate_raid` | 0.70 | **0.75** |
| `trade_boom` | 1.50 | **1.20** |
| `treaty_signed` | 1.15 | **1.15** |

Kolonia, która spędza lata na wojnie, jest o to mierzalnie biedniejsza i wraca do
siebie po pokoju. Testy pilnują obu połówek: „mniej niż w pokoju" **i** „więcej
niż połowa tego, co w pokoju" — wojna ma boleć, nie wyludniać.

**Zielona załoga konsorty** (`FleetShip.training?`) — domknięcie trójki, którą
zaczęły v0.17.0 (załoga) i v0.19.0 (morale). Kadłub dołączający do floty jest
obsadzony załogą pryzową albo dostawczą ze stoczni, nie ludźmi, których kapitan
szkolił latami: startuje 0.15 poniżej własnej załogi kapitana (podłoga 0.2) i
nadrabia, płynąc w zespole.

Konsorta przeładowuje teraz **własnym** drillem (`CombatEngine.setAllyTraining`),
a oblężenie uśrednia drill **ważąc ludźmi** — tak samo jak morale. Sens: drugi
statek staje się **decyzją, a nie darmowymi działami**. Kupno galeonu we wtorek
pogarsza szturm na fort w środę i poprawia go do wiosny.

Zakładka Kabina pokazuje dla każdej konsorty załogę, morale i wyszkolenie —
inaczej trzy pola, których gracz nie widzi, byłyby trzema polami, którym nie
ufa.

**Zostało z tego modułu:**
- **`importMul` nie zna geografii** — wojna obcina dostawy każdemu portowi
  wojującej korony jednakowo, niezależnie od tego, gdzie leży i czy ktoś
  faktycznie blokuje jego redę. To ta sama granica, co przy samym imporcie:
  bez szlaków nie ma czego przeciąć
- **Drill konsorty rośnie tylko na morzu** — tak samo jak kapitana, więc flota
  stojąca miesiącami w porcie nie nadrabia. Zgodne z resztą, ale warto wiedzieć

### ~~v0.22.0 — Szlaki, blokada, ładownia pryzu~~ ✅ (v0.22.0.0)

Trzy rzeczy naraz, bo każda następna była bez sensu bez poprzedniej.

**Prawdziwe szlaki handlowe** (`TradeRouteSystem` + `Pathfinding`) — import z
v0.20.0 był liczbą: kolonia dostawała, czego nie produkuje, znikąd i przez
nikogo. Teraz każdy towar, którego miasto żąda i nie uprawia, ma **nazwanego
dostawcę** (najbliższy producent liczony morzem, z rabatem 0.7 dla własnej
korony) i **realny kurs** wokół wysp. Na aktualnej mapie 81 szlaków, mediana
579 jednostek, 28 z zakrętami.

`Pathfinding.ts` — pusty hak od pierwszego commita — to teraz A\* po siatce
40 px z karą przybrzeżną i sznurkowaniem wyniku. Kupcy NPC dostają `ai.lane` i
płyną od narożnika do narożnika, zamiast celować w port i odbijać się od
półwyspu. Klawisz **T** rysuje szlaki na mapie.

Dwa towary celowo nie mają szlaku: **woda** (nikt jej nie produkuje — jest ze
studni) i wszystko, czego najbliższy producent leży dalej niż 1500 (to pakiet
z Sewilli). Oba dostają pełną dostawę — i to jest powód, dla którego blokada
głodzi miasto z jedzenia i rumu, a nie z pragnienia.

**Blokada portu** (`BlockadeSystem`) — `portClosed` istniał od v0.9.7,
`importMul` od v0.21.0, i nic w rękach gracza nie umiało odpalić żadnego.
Blokuje się przez **bycie tam**: leż w promieniu 320 od obcego portu z dość
dużą liczbą dział (4 + obrona/10), a po dwóch dniach kordon gryzie — szlaki
wpuszczają 15%, obrona spada 1/dzień i **przestaje się odbudowywać**,
reputacja −2/dzień, notoriety +1. Odpłynięcie rozluźnia kordon dzień po dniu,
nie kasuje go. Kontra: port zablokowany ma potrójną wagę spawnu i wystawia
okręty wojenne zamiast kupców.

Zmierzone w grze (30 dni pod Hawaną): obrona 60 → 30, jedzenie 15 → 0,
reputacja Hiszpanii 0 → −60. Zagłodzone miasto jest miastem do wzięcia — to
powolna połowa oblężenia z v0.13.0.

**Ładownia pryzu** (`PrizeSystem`) — pobicie statku dawało losowe 50-150 złota,
obojętnie czy to galeon, czy pinasa, a ładownia zawsze była pusta. Kupcy ładują
się teraz ze szlaku, który płyną (55-90% ładowni), towar przechodzi **od
najdroższego** do wyczerpania miejsca w twojej ładowni, a czego nie zmieścisz —
ekran mówi wprost, że zostało w wodzie. Kiesa to tonaż × 0.55 × udział ocalenia
(0.5 zatopiony / 0.85 poddany / 1.0 przejęty), bez kostki. Zdobycie kupca
dokłada zakłócenie **jego szlakowi**, więc miasto na drugim końcu czuje to w
ciągu tygodnia, a mapa rysuje ten szlak cieplejszym kolorem.

**Zostało z tego modułu:**
- **Kupiec nie handluje naprawdę** — ładownia jest generowana przy spawnie, a
  nie kupowana w porcie wyjścia i sprzedawana w docelowym. Zadokowanie kupca
  nie dokłada towaru do inwentarza portu. Następny krok, jeśli ekonomia ma
  domykać pętlę
- **Blokada jest tylko przeciwko miastom** — nie da się blokować szlaku w
  cieśninie ani wystawić kordonu z konsort na dwóch wyjściach
- **Szlak wybiera jednego dostawcę na zawsze** — sieć jest przeliczana z mapy,
  nie z tego, kto ma dziś zapas. Zablokowanie Hawany nie przekierowuje jej
  klientów do Santiago, tylko obcina im dostawy do 30%
- **Zakłócenie nie rozróżnia, kto zatopił** — pirat NPC topiący kupca nie robi
  nic; tylko gracz zostawia ślad w ledgerze

### ~~v0.23.0 — Fracht, wędrujący towar, przekierowanie~~ ✅ (v0.23.0.0)

v0.22.0 dała żeglugę i trzy sposoby, żeby ją **zaatakować**. Ta wersja daje
sposób, żeby na niej **zarobić**, i domyka dwie dziury, które sama v0.22.0
wypisała jako swoje.

**Kantor frachtowy** (`CargoContractSystem`) — każdy port ze szlakiem wychodzącym
ma teraz kupca z ładunkiem i bez kadłuba. Oferta jest **pochodną**, nie zapisem:
funkcja szlaków z tego miasta, zawartości jego magazynu i tego, co ostatnio
działo się na morzu. Stawka = towar × dystans × ryzyko × blokada, a wielkość
frachtu jest skrojona i do trasy, i do **wolnej ładowni** (bez tego startowy slup
z dziesięcioma tonami wolnego nie mógłby wziąć niczego przez pierwszą godzinę
gry).

Trzy rzeczy, które to zmienia w rozgrywce:
- **dodatek za ryzyko** — szlak, na którym ktoś ostatnio topił kupców, płaci
  premię, bo nikt inny go nie weźmie. Kapitan, który przez miesiąc polował na
  tej trasie, dostaje więcej za to, żeby popłynąć nią sam;
- **przełamanie blokady** — zablokowany port płaci najwięcej, bo wejście tam
  jest całą robotą;
- **ładunek nie jest twój** — można go sprzedać w złym porcie i nic tego nie
  blokuje. Fracht przepada, korona traci cierpliwość (−12), notoriety rośnie
  (+5), a towar zostaje w ładowni. Uczciwy przewoźnik i złodziej korzystają z
  tego samego ekranu.

**Towar naprawdę płynie** (`NpcSpawnSystem`) — do v0.22.0 ładownia kupca NPC
była wyczarowywana przy spawnie. Teraz wychodzący kupiec **ładuje się z magazynu
portu**, a dobijający **wysypuje ładownię do magazynu celu**. Ogranicznik
`EXPORT_TAKE_SHARE = 0.25` pilnuje, żeby pojedynczy kadłub uszczuplił magazyn, a
nie ogołocił: kadłuby w pobliżu gracza są próbką handlu, nie całym handlem.

**Przekierowanie dostaw** (`alternateSuppliers`) — zamknięcie dostawcy obcinało
klientów do 30% niezależnie od tego, czy ten sam towar rósł dzień drogi dalej.
Sieć pamięta teraz uszeregowaną listę pozostałych producentów: jest inne czynne
źródło → 0.65 (dłużej, drożej, ale dociera), nie ma żadnego → 0.30. Blokada
**jedynego** portu kakaowego jest niszcząca, blokada jednego z czterech cukrowych
— uciążliwa. Wybór portu do blokady wreszcie jest decyzją.

**Kurs wyprawy po realnej wodzie** — `expeditionCourse()` używa `findSeaPath`, a
pozycja na dziś to punkt `progress` drogi mierzonej **odległością**. Eskadra nie
przecina już półwyspu, a mapa rysuje kurs, którym naprawdę płynie.

**Zostało z tego modułu:**
- ~~**Kupiec NPC nadal nie handluje pieniędzmi**~~ ✅ v0.24.0.0 — `TradeLedgerSystem`.
  Ledger siedzi na **szlaku**, nie na kadłubie: kadłuby przy graczu to próbka, a
  płacenie także im liczyłoby ten sam rejs dwa razy i bogaciło port, przy którym
  gracz akurat stoi na kotwicy
- **Fracht nie zna eskorty** — nie da się wziąć zlecenia „doprowadź ten konwój",
  choć `ExpeditionFleetSystem` umie już materializować cudze kadłuby
- **Przekierowanie jest bezkosztowe dla portu-alternatywy** — Santiago nie
  ubożeje z tego, że nagle zaopatruje klientów Hawany
- ~~**Kantor jest w każdym porcie ze szlakiem**~~ ✅ v0.24.0.0 — `PortAccessSystem`
  zamyka książkę poniżej `neutral`, a ekran mówi wprost, że to nie brak roboty,
  tylko brak zaufania

### ~~v0.24.0 — Pieniądz idzie za towarem, a miasto ma o tobie zdanie~~ ✅ (v0.24.0.0)

Cztery rzeczy, i pierwsze dwie to były **kandydat 1 i kandydat 2** z tej listy.

**Ledger handlu** (`TradeLedgerSystem` + krok 8 w `EconomyTickSystem`) — v0.23.0
sprawiła, że towar naprawdę wędruje, i **nikt za nic nie płacił**. Miasto na
skrzyżowaniu sześciu szlaków było warte tyle, co identyczne miasto na końcu
żadnego. Teraz dostawa szlakiem płaci eksporterowi wartość ładunku po jego
cenie, a importerowi połowę marży (do sufitu równego tej wartości). **Oba końce
zyskują** — bo to jest cały powód, dla którego handel istnieje. Skutek: cięcie
szlaku kosztuje oba miasta pieniądze bez ani jednej dodatkowej linijki
księgowania. Ekran podejścia pokazuje „Obrót przez to nabrzeże: N złota
dziennie" — liczbę, która spada, gdy kampania działa.

Pomiar po 400 dniach: Port Royale kręci ~102 zł/dzień i siada **+46** nad
baseline'em, gran_granada +24, santiago +17, miasto bez szlaku — dokładnie tam,
gdzie było.

**Wycena wszędzie tam, gdzie rusza się towar** (`PricingSystem`) — cena była
liczona **raz na dobę**, więc 200 ton cukru sprzedane do wioski szło po cenie
pierwszej tony i cała gra handlowa była „znajdź największy spread i powtarzaj".
Wzór wyszedł do własnego modułu i woła go teraz każda ręka dotykająca magazynu:
lada kupca, kupiec NPC ładujący się, konwój wysypujący ładownię. Konwój
dobijający do portu rusza rynkiem **w chwili cumowania**, nie o północy.

**Reputacja przy ladzie** (`PortAccessSystem`) — jedenaście wydań zapisywało,
co korony sądzą o graczu, po czym mijał fort i żadna z tych liczb nie miała
znaczenia. Jedna tabela, pięć poziomów, pięć kolumn: `spread` u kupca, `crewMul`
w tawernie, `canCharter` w kantorze, `canRentStore` u właściciela magazynu,
`canBuyShips` + `serviceMul` w stoczni. Martwa od jedenastu wydań funkcja
`reputationPriceModifier` została usunięta — jej rola to teraz kolumna `spread`.

**Magazyn na wynajem w dowolnym mieście** (`StorehouseSystem`) — odkładany przez
dwa wydania z powodu ryzyka („gracz mógłby magazynować pod każdą górkę
cenową"). Ryzyko zniknęło razem z pierwszymi dwiema pozycjami tej listy:
wykupywanie magazynu samo podbija cenę pod ręką. 100/200/350/500 ton wg
wielkości miasta, czynsz za 30 dni, wygasły najem idzie pod młotek (kapitan
dostaje połowę wartości, towar ląduje na półkach miasta i notowania się
przeliczają).

**Dwie pułapki złapane w trakcie, obie warte zapamiętania:**

1. **Mnożnik ceny w obie strony to drukarka pieniędzy.** Pierwszy zrzut ekranu
   pokazał przyjazne Port Royale żądające **14** za cukier i dające **16** —
   dało się stać przy ladzie i kupować-sprzedawać tę samą beczkę bez końca.
   Naprawa: bid i ask wokół **jednej** ceny (`posted × (1 ± spread)`), czego z
   konstrukcji nie da się odwrócić. Test przechodzi ceny 1..400 × 5 poziomów.
2. **`wealth` musiało dostać miejsce dziesiętne.** Dzień uczciwego handlu przez
   ruchliwe nabrzeże jest wart ~pół punktu, a zaokrąglanie sumy bieżącej do
   pełnych punktów co północ ten ułamek wyrzucało: ledger równoważył się
   **4 punkty** nad baseline'em zamiast pięćdziesięciu, które wychodzą z
   arytmetyki. To jest ta sama rodzina błędu co „sufit to nie równowaga" — mierz
   wartość ustaloną, nie tę, ku której coś jest ciągnięte.

Cztery nowe pola stanu (`tradeBalance`, `tradeIncome`, `storehouses`) są
**opcjonalne i czytane przez fallback**, więc łańcuch migracji stoi dalej na
**v12**.

---

### v0.25.0 — co dalej

Nic nie jest jeszcze wybrane. Kandydaci, w kolejności wartości dla gracza:

1. **Bandera mówi kto, ale nie co** — kupiec i okręt wojenny tej samej korony
   wyglądają na mapie identycznie. Od v0.23.0 kupcy naprawdę wożą ładunek, więc
   „który z tych dwóch warto ścigać" jest wreszcie pytaniem z odpowiedzią —
   a gracz nie ma jak jej zobaczyć. Mała zmiana w `WorldRenderer`, duża w
   czytelności mapy
2. **Muzyka** — `MusicManager` ma 5 slotów, wypełniony jeden. To **nie jest
   zadanie programistyczne**: brakuje plików audio, nie kodu
3. **Sprite'y statków w pixel arcie** — 9 klas × 8 klatek = 72 klatki, sekcja 6.
   To odblokowuje retrening LoRA v3
4. **Ekonomia portów pirackich** — miasto pod czarną banderą ma sufit ludności i
   brak importu, ale `wealth` dalej jest ciągnięte ku baseline'owi kolonii
   królewskiej. Do przemyślenia razem z tym, co ledger handlu robi teraz z
   miastem odciętym od szlaków
5. **Informator w tawernie** — trzecie źródło zleceń obok gubernatora i kantoru
6. **Wioski Indian i misje jezuickie** (moduł G) — nowe lokacje nie-portowe

---

## 4. Zadania równoległe (można wpleść w każdy release)

- **Muzyka** — `MusicManager` ma 5 slotów, wypełniony **jeden** (`menu` → `pirate_theme.mp3`). `sailing` / `port` / `tavern` / `battle` = `null`. Ścieżki dla portu i bitwy dałyby najwięcej.
- ~~**Pathfinding A\***~~ ✅ v0.22.0.0 — A\* po siatce 40 px w `Pathfinding.ts`; kupcy płyną kursem szlaku, reszta NPC dalej steruje reaktywnie (i to jest w porządku dla patrolu bez rozkładu jazdy).
- **LoRA `amigapxl_pirates`** — v2 wytrenowana i oceniona (v0.12.1), zbiór v3 zbudowany i **czeka na trening**: `python ai-assets/scripts/build_lora_v3_dataset.py`, potem `C:/AI/kohya_ss/dataset/pirates_v3/train.bat` (~1 h na GTX 1060). **Nie trenuj v3, dopóki nie ma nowego materiału** — patrz sekcja 6. Ocena: [documentation/09-ASSETS.md](documentation/09-ASSETS.md)
- **Assety AI — kolejny krok wymaga materiału, nie GPU.** Kierunek artystyczny jest rozstrzygnięty (pixel art, sekcja 6) i to on wyznacza pracę: dziewięć klas statków po osiem klatek kierunkowych, nowe sprite'y miast, ~15 ikon towarów. Klatki uszkodzeń są **niepotrzebne** — zastąpiła je proceduralna nakładka `ShipDamageOverlay` (v0.12.1)
- ~~**`WorldRenderer.ts:239`** — TODO: flaga frakcji jako sprite obok statku NPC zamiast tintu.~~ ✅ v0.19.0.0 — `syncFlag`. **Bandera mówi kto, ale nie co**: kupiec i okręt wojenny tej samej korony wyglądają identycznie. Od v0.23.0 kupcy naprawdę wożą ładunek, a od v0.24.0 ten ładunek jest coś wart dla obu końców szlaku — więc „którego z tych dwóch warto ścigać" jest wreszcie pytaniem z odpowiedzią, której gracz nie widzi. **Pierwszy kandydat na v0.25.0.**
- ~~**Wyzwalacze `reach_port` i `days_passed` w `QuestSystem` nie są nigdzie odpalane.**~~ ✅ v0.17.0.0 — `PortScene.create()` (tylko przy wejściu przez bramę) i zmiana dnia w `WorldEngine`; pierwszym konsumentem obu jest zlecenie obrony. Zwłoka była celowa: martwy hak jest tym samym błędem co martwa scena, więc czekały na pierwszy quest, który naprawdę ich potrzebuje.
- ~~**Flagi na mapie to snapshot z `MainMapScene.create()`.**~~ ✅ v0.15.0.0 — `refreshPortFlags` podmienia teksturę przy zmianie właściciela. Podmieniana jest **wyłącznie** flaga; kolor frakcji w `drawCityIcon` obsługuje tylko proceduralny fallback, do którego wydana gra nie dochodzi.
- ~~**Toasty z `CrewConsumptionSystem` wyświetlają surowe klucze i18n.**~~ ✅ v0.16.0.0 — trzy komunikaty przechodzą teraz przez `t()` w miejscu tworzenia zdarzenia, a ten o śmierci załogi dostał brakujące `{{count}}`.
- ~~**Konsorty nie mają morale ani wyszkolenia.**~~ ✅ v0.19.0.0 (morale) i v0.21.0.0 (drill) — `FleetShip.morale?` / `.training?`, obie ważone ludźmi przez `fleetMorale()` / `fleetTraining()`. Drill konsorty rośnie **tylko na morzu**, tak jak kapitana.
- ~~**Import nie reaguje na wojnę.**~~ ✅ v0.21.0.0 — `EventDailyEffects.importMul`. Został brak geografii: wojna obcina dostawy każdemu portowi wojującej korony jednakowo, bo bez szlaków nie ma czego przeciąć.
- ~~**Gracz nie może zablokować portu.**~~ ✅ v0.22.0.0 — `BlockadeSystem`, dopracowana w v0.23.0.0 o przekierowanie dostaw. Blokada działa tylko przeciwko **miastu**; szlaku w cieśninie wciąż nie da się przeciąć.
- ~~**Import jest abstrakcją, nie handlem.**~~ ✅ v0.22.0.0 + v0.23.0.0 + v0.24.0.0 — `TradeRouteSystem` (81 szlaków), `CargoContractSystem` (fracht dla gracza), a od v0.24.0 `TradeLedgerSystem`: dostawa szlakiem płaci eksporterowi i importerowi, handel gracza rusza kiesą miasta, a `PricingSystem` przelicza notowanie przy **każdym** ruchu towaru, nie raz na dobę.
- ~~**Magazyn jest jeden, tylko w porcie żony.**~~ ✅ v0.24.0.0 — `StorehouseSystem`, wynajem za czynsz w dowolnym mieście od `neutral` w górę. Ryzyko „magazynowania pod każdą górkę cenową” zniknęło razem z `PricingSystem`: wykupywanie magazynu samo podbija cenę pod ręką, a czynsz biegnie, czy gracz tam jest, czy nie.
- ~~**Kurs wyprawy jest prostą**~~ ✅ v0.23.0.0 — `expeditionCourse()` liczy `findSeaPath`, a `pointAlong` stawia marker na drodze mierzonej odległością. Renderer rysuje ten sam łamany kurs.
- **Zlecenie obrony jest jedno na raz i tylko od gubernatora.** Od v0.23.0 drugim typem zlecenia jest fracht (kantor frachtowy), ale obrona nadal ma jedno źródło. Informator w tawernie dałby trzecie.
- ~~**Kantor frachtowy nie patrzy na reputację.**~~ ✅ v0.24.0.0 — i nie tylko on. `PortAccessSystem` to jedna tabela dla wszystkich pięciu lad: kupiec (spread), tawerna (kto się zaciągnie), kantor, stocznia (rachunek i czy w ogóle sprzeda kadłub), właściciel magazynu.
- ~~**`ExpeditionFleetSystem` nie rysuje niczego na mapie świata.**~~ ✅ v0.18.0.0 — `ExpeditionCourseRenderer` rysuje kreskowany kurs każdej wyprawy, o której gracz słyszał; sama eskadra dalej materializuje się dopiero w promieniu 620.
- ~~**Miasto pod flagą piratów odbudowuje `population` i `wealth` ku baseline'owi swojej dawnej korony.**~~ ✅ v0.19.0.0, przerobione w v0.20.0.0 — ludzie mają sufit (`heldPopulationCeiling`), pieniądze załatwia brak importu. Uwaga na przyszłość: **sufit to nie równowaga** — `wealth` ma stałą presję w dół, więc udział 0.42 dał bogactwo **5**, a nie „mniej zamożne miasto". Historycznie: `heldDefenseCeiling` obcina sufit obrony do 45% (od v0.16.0 **wyłącznie** pod czarną banderą — kolonia pod koroną, także zdobyta, ma budżet na garnizon), ale pozostałe dwie liczby wracają ku wartościom kolonii królewskiej (`EconomyTickSystem` + `getPortBaseline`). Do przemyślenia razem z ekonomią portów pirackich.
- ~~**Wyprawy koron nie mają kadłubów na mapie.**~~ ✅ v0.17.0.0 — `ExpeditionFleetSystem` materializuje eskadrę w promieniu 620 od gracza, a jej rozbicie kasuje zdarzenie i daje celowi karencję.

---

## 5. Zasady projektu (dla agenta przejmującego)

- Wersjonowanie **czteroczłonowe** `0.x.y.z`, nie semver. Release = bump w `package.json` **i** `src/version.ts` **i** wpis na górze `src/changelog.ts`.
- Dev server **wyłącznie na porcie 3000**; najpierw `taskkill //F //IM node.exe`, potem `npm run dev`. Nigdy dwie instancje.
- Font: zawsze `UI_FONT` / `txt()` z `src/game/ui/textStyle.ts` — nigdy hardkodowany.
- `pixelArt: true` wymusza `roundPixels: true` → w `MainMapScene.create()` musi zostać `camera.setRoundPixels(false)` (inaczej wraca jitter statku).
- Assety **zawsze kompresować przed commitem** (`sharp` dla PNG, ffmpeg dla JPEG).
- Zmiany w `WorldState` wymagają migracji w `src/persistence/Migrations.ts` (obecnie **v12**) — pętla rzuca wyjątkiem przy brakującym kroku i psuje wszystkie stare zapisy. Wyjątek: pole **opcjonalne**, czytane przez `?? domyślna`, migracji nie potrzebuje (tak dołożono `nextCampaignDay` w v0.16.0). Krok, który nic nie robi, to hałas w łańcuchu.
- Nowe teksty → `src/core/i18n/locales/en.ts` **i** `pl.ts`.
- Nie rejestruj scen „na zapas" — scena bez wejścia to martwy kod.
- `src/core/` nie importuje Phasera. Nigdy.
- Właściciela portu czytaj **wyłącznie** przez `portFaction(world, portKey)` z `SiegeSystem` — `CityDef.factionId` to mapa z 1680 i nie zmienia się nigdy.
- Do weryfikacji w grze jest `scripts/drive.mjs` (dowolna sekwencja klawiszy + zrzut stanu). Karta headless dławi `requestAnimationFrame`, więc pętlę Phasera trzeba pompować ręcznie — zamrożony zrzut to prawie zawsze to, a nie błąd gry.
- **`time.tick` jest ułamkowy.** Nigdy nie bramkuj niczego na `tick % N === 0` — używaj `tickBoundaryCrossed(tick - dtTicks, tick, N)` z `TimeSystem`. Ten jeden wzorzec zabił w v0.16.0 spawn NPC, AI NPC i wymianę newsów naraz, a testy jednostkowe na całkowitych tickach tego nie widziały.
- **`LANDMASSES` jest puste w testach** — ląd ładuje się z GeoJSON dopiero w runtime. Każda kontrola „czy to woda” przechodzi w vitest zawsze; weryfikuj ją w grze albo nie pisz na niej asercji.
- **Cena kupna i sprzedaży to widełki wokół jednej liczby, nie jeden mnożnik w obie strony.** Mnożnik „taniej dla przyjaciela” zastosowany do obu kierunków odwraca spread i robi drukarkę pieniędzy (v0.24.0: 14 za cukier, 16 za cukier, przy tej samej ladzie). `PortAccessSystem.buyPrice/sellPrice` to jedyne miejsce, gdzie wolno to liczyć.
- **Cokolwiek rusza `wealth` powoli, musi mieć gdzie trzymać ułamek.** `PortRuntimeState.wealth` jest trzymane z dokładnością do 0,1 właśnie dlatego: pół punktu dziennego obrotu zaokrąglane co północ do pełnych punktów znikało, a ledger równoważył się cztery punkty nad baseline'em zamiast pięćdziesięciu. To ten sam błąd co „sufit to nie równowaga”, tylko o piętro niżej.
- Deploy: pirates.k4.pl — najpierw czyszczenie starych bundli.
- Parametry debugowania: `?skip`, `?zoom=`, `?debug=`, `?battle=1|trader|navy|pirate|hunter`, `?siege=<port>`, `?relief=<port>`, `?defend=<port>`, `?intercept=<port>`, `?commission=<port>`, `?home=<port>`, `?blockade=<port>` (+ `&garrison=N`, `&soldiers=N`, `&ally=1`). Kantor frachtowy: `?skip` + wejście do dowolnego portu, czwarta pozycja w menu. Wynajem magazynu (v0.24.0): tam samo, pozycja „Wynajmij magazyn". Reputację najszybciej sprawdzić przez `?blockade=<port>` (spadnie sama) albo edytując `player.reputation` w konsoli.
- **`LANDMASSES` ładuje `loadLandmassesFromCache()`** (`src/game/world/GeoLoader.ts`). `MainMapScene.create()` robi to normalnie, ale każdy świat debugowy budowany w `PreloadScene`, który pyta o wodę, musi zawołać to sam — inaczej `getPortWaterPos` odpowiada pozycją nabrzeża i kapitan „stojący pod portem" stoi na kei.
- **W commitach i PR-ach nie wymieniamy Claude'a.** Żadnego `Co-Authored-By`, żadnej stopki „Generated with". Ustalone 2026-09-04.
- Skill `/task` i jego playbooki są częścią repozytorium (`.claude/skills/`). Jeśli któraś procedura się zdezaktualizuje — popraw ją w tym samym commicie, w którym to zauważyłeś.

---

## 6. Kierunek artystyczny — ROZSTRZYGNIĘTE (2026-09-04)

**Decyzja użytkownika: cała gra ma być pixel artem.** To rozstrzyga pytanie,
które blokowało plan assetowy z audytu ComfyUI.

### Co z tego wynika

- **`sailship.png` i sprite'y miast są tymczasowe.** Malowane (tusz + akwarela),
  wstawione na czas budowy silnika, do **podmiany**. Nie traktuj ich jako wzorca
  stylu — dotąd każda ocena assetów AI porównywała je z tym, co w grze jest, i
  właśnie dlatego wychodziło, że pixel art „odstaje".
- **Każda z dziewięciu klas statków dostaje własny art.** Dziś wszystkie
  renderują się z jednego arkusza `sailship`, i to jest prawdziwy powód, dla
  którego „dziewięć klas wychodzi identycznych" — nie wina LoRA, tylko brak
  materiału. Klasy: pinnace, sloop, barque, brigantine, fluyt, frigate,
  fast_galleon, galleon, merchantman.
- **Retrening LoRA v3 poczeka**, aż będzie z czego trenować. Dziewięć
  narysowanych kadłubów to materiał, którego brakowało; godzina GPU bez niego
  niczego nie naprawi.

### Wymagania techniczne dla nowych sprite'ów statków

Arkusz `sailship.png` to dziś **1024×512 RGBA, siatka 4×2 po 256×256**, osiem
kierunków. Mapowanie w `WorldRenderer.DIR8_TO_FRAME`:

```
rząd 0 = [SW, S, SE, E]      rząd 1 = [NE, N, NW, W]
```

Czyli **osiem klatek kierunkowych na klasę statku** — dziewięć klas to 72
klatki. To jest ta liczba, którą trzeba mieć w głowie przy planowaniu pracy.

**Dwie pułapki, które trzeba rozstrzygnąć zanim ktokolwiek narysuje 72 klatki:**

1. **Rozdzielczość.** Statek renderuje się na ekranie w okolicach **20-30 px**
   (`0.086 × zoomFactor 0.10-0.33 × zoom kamery`). Klatka 256×256 jest więc
   skalowana w dół dziesięciokrotnie — dla malowanego arta to nieszkodliwe, dla
   pixel artu **zabójcze**: piksele się rozmyją i cała robota pójdzie w gwizdek.
   Nowy arkusz powinien być rysowany blisko rozmiaru wyświetlania (rząd 32-64 px
   na klatkę), a skala w `WorldRenderer` odpowiednio przeliczona.
2. **`roundPixels` jest wyłączone i to jest napięcie z pixel artem.**
   `pixelArt: true` wymusza `roundPixels: true`, a `MainMapScene.create()`
   **musi** robić `camera.setRoundPixels(false)`, bo inaczej wraca jitter statku
   (project_ship_jitter). Ostry pixel art chce zaokrąglania, jitter go nie chce.
   Do przemyślenia: zaokrąglać **scroll kamery**, a nie pozycje sprite'ów —
   wtedy siatka pikseli stoi, a statek płynie płynnie.

### Co jest gotowe i czeka

- `ai-assets/scripts/postprocess_asset.py` — flood fill od krawędzi, trim, alfa,
  kwantyzacja palety, skalowanie nearest-neighbour, kryteria akceptacji z kodem
  wyjścia. Na 85 assetach v2: 69 przechodzi, 16 odpada.
- `ai-assets/workflows/sprite_isolated.json` — szablon bez `ImageScale` w grafie
  (skalowanie przed keyingiem uniemożliwiało czyste wycięcie tła).
- Uwaga na `sd-pipeline/workflows/pirate_lora.json`: ma **zaszytą** LoRA v1 na
  0.8 i nadpisuje ją tylko przy jawnym `--lora`. JSON-y obok wygenerowanych
  obrazów potrafią kłamać, że `"lora": null`.
