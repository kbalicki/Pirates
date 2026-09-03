# TODO — Pirates' Chronicles (handoff)

**Stan na:** 2026-09-03 · **Wersja:** v0.16.0.0 · **Branch:** `main`
**Kod:** 152 pliki `.ts` · `tsc --noEmit` czysty · `npm test` — **825 przechodzi, 0 failuje, 0 `todo`** w 19 plikach

Ten plik jest źródłem prawdy dla **kolejności prac**.
[documentation/11-ROADMAP.md](documentation/11-ROADMAP.md) opisuje **wizję i zakres** modułów.

> **Start sesji w jednym zdaniu:** v0.16.0.0 jest na `main` i **wdrożona** na pirates.k4.pl, testy 825/825 zielone; moduł I domknął bitwy lądowe z obu stron (rozgrywalna obrona miasta, wojny przesuwające flagi, obrona sojusznika), a następne w kolejce jest **muzyka**, **zlecenie obrony u gubernatora** albo zadania równoległe z sekcji 4.

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

### Nietknięte

Zlecenie obrony sojusznika u gubernatora (dziś gracz musi sam się nawinąć) · wyprawy koron jako eskadry do przechwycenia na morzu · posag i baza w porcie żony · mini-gra taneczna · ciotka i wujek jako czwarty i piąty krewny · wioski Indian · misje jezuickie · pathfinding A\* · muzyka poza menu

### Świadome placeholdery (zostawione celowo)

| Plik | Po co zostaje |
|---|---|
| `src/core/data/quests.ts` | Pusta mapa `QUESTS` — miejsce na questy pisane ręcznie. Skarby **i** wątek rodzinny są instancjami odbudowywanymi z `questLog` przez `buildQuestRegistry()`, więc tu ich nie ma |
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

### v0.17.0 — co dalej

Nic nie jest jeszcze wybrane. Trzy kandydaci, w kolejności wartości dla gracza:

1. **Muzyka** — `MusicManager` ma 5 slotów, wypełniony jeden. Najtańsza rzecz
   o największym wpływie na odbiór, a po v0.16.0 są dwa ekrany bitewne, które
   wołają o ścieżkę.
2. **Zlecenie obrony u gubernatora** — domknięcie v0.16.0. Dziś gracz broni cudzej
   kolonii tylko wtedy, gdy przypadkiem tam jest; gubernator korony, która liczy go
   za swojego, powinien móc o to poprosić. `QuestSystem` (wyzwalacz `reach_port`,
   dziś nigdzie nieodpalany) i `DialogueSystem` mają już wszystko, czego to wymaga
   — to pierwszy quest, który ma sens jako pisany ręcznie łańcuch.
3. **Wioski Indian i misje jezuickie** (moduł G) — nowe lokacje nie-portowe; duża
   praca, mały dług.

## 4. Zadania równoległe (można wpleść w każdy release)

- **Muzyka** — `MusicManager` ma 5 slotów, wypełniony **jeden** (`menu` → `pirate_theme.mp3`). `sailing` / `port` / `tavern` / `battle` = `null`. Ścieżki dla portu i bitwy dałyby najwięcej.
- **Pathfinding A\*** — `Pathfinding.ts` to pusty hak; NPC nawigują reaktywnie. Prawdziwe szlaki handlowe = wiarygodniejszy ruch morski, ale duża zmiana w `NpcAiSystem`.
- **LoRA `amigapxl_pirates`** — v2 wytrenowana i oceniona (v0.12.1). Problem „całe ekrany zamiast sprite'ów" **rozwiązany**: 51/51 assetów to pojedynczy obiekt. Nadaje się do użycia: ikony ekwipunku i budynki portu przy sile 0.6-0.75. **Nie** nadaje się: dziewięć klas statków wychodzi identycznych (w projekcie jest jeden sprite statku — retrening tego nie naprawi bez nowego materiału), towary są bezkształtne, portrety nie trzymają wspólnego stylu. Zbiór v3 zbudowany i **czeka na trening**: `python ai-assets/scripts/build_lora_v3_dataset.py`, potem `C:/AI/kohya_ss/dataset/pirates_v3/train.bat` (~1 h na GTX 1060). v3 poprawia ujęcie z góry (10% → 32% zbioru) i balans kategorii. Ocena i szczegóły: [documentation/09-ASSETS.md](documentation/09-ASSETS.md)
- **Assety AI — kolejny krok wymaga materiału, nie GPU.** Żeby statki się różniły, potrzeba narysowanych/pozyskanych kadłubów o różnej wielkości i liczbie masztów; żeby towary miały kształt — ~15 ikon towarów. Bez tego kolejny retrening niczego nie zmieni. Klatki uszkodzeń są już **niepotrzebne** — zastąpiła je proceduralna nakładka `ShipDamageOverlay` (v0.12.1)
- **`WorldRenderer.ts:239`** — TODO: flaga frakcji jako sprite obok statku NPC zamiast tintu.
- **Wyzwalacze `reach_port` i `days_passed` w `QuestSystem` nie są nigdzie odpalane.** Maszyna je obsługuje i pokrywają je testy, ale żadna scena ich nie emituje — wątek rodzinny chodzi na `flag_set`, skarby na `dig_at`. Naturalne miejsca: `PortApproachScene.executeAction("enter")` dla pierwszego i przejście dnia w `WorldEngine` dla drugiego. Nie dodano ich „na zapas" — martwy hak jest tym samym błędem co martwa scena.
- ~~**Flagi na mapie to snapshot z `MainMapScene.create()`.**~~ ✅ v0.15.0.0 — `refreshPortFlags` podmienia teksturę przy zmianie właściciela. Podmieniana jest **wyłącznie** flaga; kolor frakcji w `drawCityIcon` obsługuje tylko proceduralny fallback, do którego wydana gra nie dochodzi.
- ~~**Toasty z `CrewConsumptionSystem` wyświetlają surowe klucze i18n.**~~ ✅ v0.16.0.0 — trzy komunikaty przechodzą teraz przez `t()` w miejscu tworzenia zdarzenia, a ten o śmierci załogi dostał brakujące `{{count}}`.
- **Miasto pod flagą piratów odbudowuje `population` i `wealth` ku baseline'owi swojej dawnej korony.** `heldDefenseCeiling` obcina sufit obrony do 45% (od v0.16.0 **wyłącznie** pod czarną banderą — kolonia pod koroną, także zdobyta, ma budżet na garnizon), ale pozostałe dwie liczby wracają ku wartościom kolonii królewskiej (`EconomyTickSystem` + `getPortBaseline`). Do przemyślenia razem z ekonomią portów pirackich.
- **Wyprawy koron nie mają kadłubów na mapie.** `CrownCampaignSystem` wystawia news i wynik; między jednym a drugim nie ma niczego, co dałoby się przechwycić na morzu. Naturalne rozszerzenie: `NpcSpawnSystem` stawia eskadrę płynącą do celu, a jej rozbicie przez gracza kasuje zdarzenie.

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
- Deploy: pirates.k4.pl — najpierw czyszczenie starych bundli.
- Parametry debugowania: `?skip`, `?zoom=`, `?debug=`, `?battle=1|trader|navy|pirate|hunter`, `?siege=<port>`, `?relief=<port>`, `?defend=<port>` (+ `&garrison=N`, `&soldiers=N`, `&ally=1`).
- Skill `/task` i jego playbooki są częścią repozytorium (`.claude/skills/`). Jeśli któraś procedura się zdezaktualizuje — popraw ją w tym samym commicie, w którym to zauważyłeś.
