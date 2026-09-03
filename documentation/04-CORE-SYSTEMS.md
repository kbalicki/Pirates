# 04 — Systemy gry

## Przegląd systemów

| System | Plik | Odpowiedzialność |
|--------|------|------------------|
| Navigation | `NavigationSystem.ts` | Ruch, kolizje, auto-desant, chodzenie po lądzie |
| Weather | `WeatherSystem.ts` | Wiatr (model polarny), sztormy, sezonowość |
| Sail | `SailSystem.ts` | 4 poziomy ożaglowania, płynne przejścia |
| Time | `TimeSystem.ts` | Kalendarz, cykl dnia/nocy |
| Economy | `EconomySystem.ts` | Handel, transakcje kupna/sprzedaży |
| EconomyTick | `EconomyTickSystem.ts` | Dzienny tick żywej ekonomii miast |
| EventEffects | `EventEffectsSystem.ts` | Przełożenie wydarzeń świata na dzienne delty |
| WorldEvent | `WorldEventSystem.ts` | Wojny historyczne + losowe wydarzenia |
| Reputation | `ReputationSystem.ts` | Relacje frakcji |
| Combat | `CombatSystem.ts` + `engine/CombatEngine.ts` | Stałe walki + symulacja bitwy |
| Damage | `DamageSystem.ts` | Stopnie uszkodzeń kadłuba i takielunku, tonięcie |
| Repair | `ShipRepairSystem.ts` | Naprawa prowizoryczna na morzu, ratowanie rozbitków |
| Duel | `DuelSystem.ts` | Pojedynki szermiercze kapitanów |
| Dialogue | `DialogueSystem.ts` + `data/dialogues.ts` | Rozmowy jako dane: węzły, warunki, efekty |
| Plunder | `PlunderSystem.ts` | Zegar podziału łupów, morale niezapłaconej załogi |
| Aging | `AgingSystem.ts` | Wpływ wieku kapitana na umiejętności |
| Retirement | `RetirementSystem.ts` | Punktacja końcowa i zakończenie kariery |
| Quest | `QuestSystem.ts` | Maszyna stanów zadań: etapy, wyzwalacze, nagrody |
| Treasure | `TreasureSystem.ts` | Mapy skarbów, kopanie, zasadzki |
| Boarding | `BoardingSystem.ts` | Rozstrzygnięcie abordażu |
| Fleet | `FleetSystem.ts` | Flota gracza (max 3 statki) |
| NpcSpawn | `NpcSpawnSystem.ts` | Pula statków NPC, spawn/despawn |
| NpcAi | `NpcAiSystem.ts` | Zachowania NPC, unikanie brzegu |
| NpcNews | `NpcNewsSystem.ts` | NPC roznoszą newsy między portami |
| CrewConsumption | `CrewConsumptionSystem.ts` | Jedzenie, woda, morale, śmiertelność |
| PortInteraction | `PortInteractionSystem.ts` | Gubernator, tawerna, kupiec, stocznia |
| PortWaterPositions | `PortWaterPositions.ts` | Punkty kotwiczenia na wodzie przy portach |
| Encounter | `EncounterSystem.ts` | Losowe spotkania |
| EventLog | `EventLogSystem.ts` | Historia zdarzeń |
| Quest | `QuestSystem.ts` | Log zadań (FSM jeszcze nie zbudowany) |

Wszystkie systemy znajdują się w `src/core/systems/`.

---

## NavigationSystem

**Główna funkcja:** `updateNavigation(entity, weather, terrainAt, dtTicks) → EntityState`

### Obliczanie prędkości

```
effectiveSpeed = shipClass.speedBase
               × sailLevel
               × windSpeedModifier(heading, windDir, windStrength, minWindAngle)
               × (currentSailsHP / maxSailsHP)
               × fleetSpeedMul
```

- `sailLevel` — 0..1 z `SailSystem` (Złożone / Refowane / Połowa / Pełne)
- `fleetSpeedMul` — < 1 gdy najwolniejszy statek floty ogranicza eskadrę
- Uszkodzone żagle proporcjonalnie spowalniają statek

Model wiatru opisany niżej, w sekcji WeatherSystem.

### Anti-tunneling

Ruch jest próbkowany co 2 px wzdłuż wektora przemieszczenia, żeby wąski pas lądu nie został „przeskoczony" w jednym ticku przy dużej prędkości.

### Typy terenu

| Teren | Modyfikator prędkości | Efekt dodatkowy |
|-------|----------------------|-----------------|
| sea | 100% | brak |
| shallow | 60% | brak |
| reef | 30% | 0.5 HP/tick damage kadłuba |
| land | 0% | auto-desant |

### Auto-desant (Landing)

Gdy statek dotyka lądu:
1. Załoga pojawia się na plaży (pozycja w głąb lądu)
2. Statek kotwicy w ostatniej bezpiecznej pozycji wodnej
3. Tryb zmienia się z `"sailing"` na `"landed"`
4. Na lądzie: sterowanie WSAD (4 kierunki), prędkość 0.25 j/tick
5. Powrót na wodę: podejście do krawędzi → auto-zaokrętowanie

---

## WeatherSystem

**Funkcja:** `updateWeather(weather, rng, dtTicks, month, dayOfMonth, daysInMonth)`

### Model mean-reversion

```
newDirection = currentDirection + (seasonalBase - currentDirection) × DIRECTION_REVERSION_RATE + noise
newStrength  = currentStrength  + (seasonalBase - currentStrength)  × STRENGTH_REVERSION_RATE  + noise
```

**Stałe:**
- `DIRECTION_REVERSION_RATE = 0.004`
- `STRENGTH_REVERSION_RATE = 0.006`
- Kierunek: radiany (0=N, π/2=E, π=S, 3π/2=W)
- Siła: 0.0 (cisza) do 1.0 (sztorm)

### Model polarny prędkości (v0.9.4, poprawiony w v0.9.8.2)

`windSpeedModifier(shipHeading, windDirRad, windStrength, minWindAngle)`

`windDirRad` to kierunek, **z którego** wieje wiatr. Kąt liczony jest jako `|heading − windDir|` złożony do 0-180°: 0° = dziób prosto w wiatr, 180° = z wiatrem (fordewind).

| Kąt do wiatru | Współczynnik przy pełnej sile | Nazwa |
|---------------|-------------------------------|-------|
| 0° – minWindAngle | 0 | martwa strefa — statek nie robi drogi |
| minWindAngle – +30° | 0 → 0.4 (liniowo) | ostro na wiatr (close hauled) |
| minWindAngle+30° – 120° | 0.4 → **1.5** → 1.1 (dwie ćwiartki sinusoidy) | półwiatr i baksztag, szczyt w połowie przedziału |
| 120° – 180° | 1.1 → 0.9 | baksztag i fordewind |

Wynik jest skalowany siłą wiatru: `1 + (factor − 1) × windStrength`, więc przy ciszy (`strength = 0`) każdy kurs daje dokładnie 1.0.

`minWindAngle` jest cechą klasy statku: takielunek skośny 30-35°, rejowy do 60° — slup wyostrzy tam, gdzie galeon stanie w miejscu.

**Konsekwencja dla gracza:** najszybszy kurs to półwiatr (1.5×), nie fordewind (0.9×), a płynięcie prosto pod wiatr jest niemożliwe — trzeba halsować.

Szczyt (1.5×) leży w **połowie** przedziału półwiatru, więc zależy od takielunku: slup (`minWindAngle` 30°) osiąga go przy 90°, galeon (60°) dopiero przy 105°. Za szczytem prędkość spada monotonicznie aż do fordewindu.

Krzywa dla martwej strefy 30°: `60°=0.40 · 90°=1.50 · 110°=1.30 · 120°=1.10 · 150°=1.00 · 180°=0.90`.

> **Naprawione w v0.9.8.2 (TODO P0-2):** wcześniej gałąź półwiatru była pełną sinusoidą schodzącą z powrotem do 0.4 na 120°, gdzie fordewind startował od 1.1 — statek na kursie 119° płynął 0.4×, a na 121° już 1.1×. Teraz gałąź kończy się dokładnie na 1.1 i przejście jest ciągłe.

### System dialogów (`DialogueSystem.ts`, v0.11.0)

Rozmowa to **dane**, nie gałęzie w kodzie sceny. `DialogueTree` to mapa węzłów; węzeł to jedna kwestia rozmówcy plus odpowiedzi gracza. Odpowiedź może być zablokowana warunkiem (`when`), może zmienić świat (`effects`) i wskazuje następny węzeł albo kończy rozmowę.

Warunki też są danymi: `flag`, `reputation` (po wartości albo po nazwanym poziomie), `gold`, `skill`, `day` oraz złożenia `not` / `all` / `any`. Efekty: `set_flag`, `gold`, `reputation`, `log` i furtka `custom`, którą rozwiązuje wywołujący — dzięki temu gubernator wręcza list kaperski, a moduł dialogów nie musi wiedzieć, czym jest list kaperski.

Dwie reguły warte pilnowania (obie w testach):
- odpowiedź niewidoczna w danym momencie **nie zadziała**, nawet jeśli wywołujący narysował nieaktualną listę,
- odpowiedź wskazująca nieistniejący węzeł **kończy rozmowę**, zamiast zostawiać gracza w oknie bez żadnego przycisku.

`validateTree()` sprawdza drzewo na etapie autorskim: istnienie węzła startowego, rozwiązywalność wszystkich `next`, unikalność identyfikatorów, brak węzłów bez odpowiedzi i brak węzłów, w których **każda** odpowiedź jest warunkowa.

Świadomie **nie jest sceną**: to samo drzewo rysuje się dziś w oknie portu, jutro w osobnej scenie, a w teście sprawdza się bez Phasera. Pierwszy konsument to gubernator (`renderGovernor` w `PortScene`).

### Podział łupów (`PlunderSystem.ts`, v0.11.0)

Co `PLUNDER_INTERVAL_DAYS` = 60 dni załoga oczekuje podziału. Po tym terminie morale spada o 0.4% dziennie do podłogi 15%. Morale steruje już przeładowaniem dział, siłą abordażu i tempem napraw, więc zaniedbana załoga jest **mierzalnie gorsza** we wszystkim, zanim dojdzie do buntu.

Podział odbywa się w tawernie: kapitan zatrzymuje 35-60% (zależnie od rang i sławy), reszta idzie do załogi, 65% ludzi schodzi na ląd wydać swoje, a ci co zostają mają morale 1.0. Zegar rusza od nowa.

### Wiek kapitana (`AgingSystem.ts`, v0.11.0)

| Wiek | Etap | Fizyczne (`fencing`, `gunnery`) | Nabyte (`navigation`, `charm`, `medicine`) |
|---|---|---|---|
| 20-35 | prime | ×1.00 | ×1.00 |
| 35-50 | seasoned | ×1.00 → ×0.85 | ×1.00 → ×1.20 |
| 50+ | declining | ×0.85 → ×0.55 (podłoga) | → ×1.30 (sufit) |

Krzywe są ciągłe na granicach — nic nie zmienia się z dnia na dzień w urodziny. Mnożniki działają na **efektywną** umiejętność w miejscu użycia (`effectiveSkill()`), a nie na zapisany profil: karta kapitana dalej pokazuje, czego się nauczył, świat stosuje to, co jeszcze potrafi.

### Emerytura i punktacja (`RetirementSystem.ts`, v0.11.0)

Gubernator proponuje ziemię i tytuł po roku na morzu. Punkty: złoto ÷10, wartość floty ÷20, rangi ×300, dodatnia reputacja ×4, sława ×12 oraz lata na morzu ×40 **minus** 70 za każdy rok po pięćdziesiątce. Dlatego wynik ma szczyt dokładnie tam, gdzie zaczyna się schyłek — za wczesne odejście oznacza brak kariery, za późne oddaje to, co się zbudowało.

### System questów (`QuestSystem.ts`, v0.12.0)

Zadanie to zbiór **etapów**. Etap mówi, co gracz ma teraz robić (`objectiveKey`), i wylicza, co go ruszy dalej: wyzwalacz plus etap docelowy, opcjonalnie z efektami. Wyzwalacze są danymi, tak jak warunki dialogów:

| Wyzwalacz | Znaczenie |
|---|---|
| `reach_port` | gracz wchodzi do konkretnego portu |
| `dig_at` | gracz kopie w promieniu `radius` od punktu |
| `flag_set` | flaga świata została ustawiona |
| `days_passed` | minęło N dni od wejścia w ten etap |

Nagrody używają `DialogueEffect` — złoto, reputacja, flagi i wpisy do logu to te same rzeczy, które rozdaje rozmowa, a `applyEffect` już wie, jak je zastosować. Żadnego drugiego słownika efektów.

Dwie reguły w testach: **jedno przejście na zdarzenie** (inaczej pojedyncze kopnięcie łopatą przeskoczyłoby dwa etapy) oraz **zakończone zadanie nie reaguje już na nic** (kopanie w tym samym miejscu nie zapłaci drugi raz). `validateQuest()` łapie ślepe zaułki, nieistniejące etapy i etapy końcowe, które wciąż mają przejścia.

Postęp siedzi w `player.questLog` (`QuestRuntimeState`, istniało od dawna), a `data` niesie to, co zadanie musi pamiętać — dla skarbu jest to sama mapa. Żadnych nowych pól w zapisie.

### Mapy skarbów (`TreasureSystem.ts`, v0.12.0)

| Jakość | Promień | Cena |
|---|---|---|
| koślawy szkic | 220 | 300 |
| przyzwoita mapa | 110 | 800 |
| mapa z pomiarami | 45 | 2000 |

Tawerna oferuje jedną mapę na port na dzień; zamożniejszy port częściej ma prawdziwą mapę. Skrzynia leży w promieniu 40-150 od wskazanego miasta — pozycja bierze się z `CityDef.pos`, a nie z siatki lądu (tę zna tylko `MainMapScene`), i promień wyszukiwania jest znacznie większy od tego przesunięcia, więc obszar zawsze pokrywa ląd, po którym da się chodzić.

Kopanie: klawisz **X** na lądzie. Wynik to `found` / `warm` (do 3× promienia) / `cold`, a przy chybieniu dochodzi kierunek — dzięki temu koślawa mapa nadal jest użyteczna, tylko wolniejsza.

**25% map to przynęta.** Kopanie takiej mapy odpala pojedynek w `DuelScene` — grę stać na to, bo mechanika już istnieje od v0.10.0. Wygrana daje skrzynię, przegrana kosztuje ćwiartkę złota.

### Sztormy

- Losowe zdarzenia (wyższe prawdopodobieństwo sierpień–październik)
- Czas trwania: 2–10 minut gry
- Efekt: zwiększona siła wiatru, zmienne kierunki
- Wpływ na prędkość i sterowność

---

## EconomySystem

**Funkcje:**
- `executeBuy(world, portId, itemId, qty) → TradeResult`
- `executeSell(world, portId, itemId, qty) → TradeResult`

### Warunki kupna

1. Złoto gracza ≥ cena × ilość
2. Zapas w porcie ≥ ilość
3. Wolne miejsce w ładowni ≥ waga × ilość

### Modyfikatory cen od reputacji

| Poziom reputacji | Zakres | Modyfikator |
|-----------------|--------|-------------|
| Wrogi | ≤ -60 | ×1.30 (+30%) |
| Nieprzyjazny | -60 do -20 | ×1.15 (+15%) |
| Neutralny | -20 do +20 | ×1.00 |
| Przyjazny | +20 do +60 | ×0.95 (-5%) |
| Sojusznik | ≥ +60 | ×0.85 (-15%) |

---

## TimeSystem

### Przepływ czasu

- 1 tick silnika = 1 minuta gry (przy `gameSpeed = 1.0`)
- Prędkości gry: wolna (0.6), normalna (1.2), szybka (2.4) minut/tick
- 20 ticków/s × 1.2 min/tick = 24 minuty gry na sekundę realną (tryb normalny)

### Kalendarz

- Tracking: rok / miesiąc / dzień / godzina / minuta
- Wsparcie lat przestępnych
- `isDaytime()`: godziny 6:00–20:00

---

## ReputationSystem

### Poziomy reputacji

| Poziom | Zakres | Efekty |
|--------|--------|--------|
| Wrogi (hostile) | ≤ -60 | Atak przy zbliżeniu, +30% ceny |
| Nieprzyjazny (unfriendly) | -60 do -20 | Podejrzliwość, +15% ceny |
| Neutralny (neutral) | -20 do +20 | Normalna interakcja |
| Przyjazny (friendly) | +20 do +60 | Listy kaperskie, -5% ceny |
| Sojusznik (allied) | ≥ +60 | Pełny dostęp, -15% ceny |

### Zmiana reputacji

- Atak na statek frakcji: duży spadek
- Wykonanie misji: wzrost
- List kaperski: wymaga poziomu "przyjazny"
- Atak na wrogą frakcję naszego sojusznika: bonus

---

## CombatEngine + CombatSystem

`CombatSystem.ts` trzyma stałe i wzory; `engine/CombatEngine.ts` prowadzi symulację. Warstwa wizualna to `SeaBattleScene`.

### Arena bitewna

- Arena 3× viewport; kamera zawsze wyśrodkowana na graczu (świat się przesuwa)
- Gracz vs 1 wróg
- Komendy: `SetSailLevel`, `Turn`, `FireCannons`, `SetAmmo`, `AttemptBoarding`, `AttemptDisengage`
- Testowanie bez rozgrywki: `?battle=1|trader|navy|pirate|hunter`

### Przeładowanie — funkcja stanu załogi (v0.9.8)

```
crewFrac    = clamp((crew/max − 0.2) / 0.8, 0, 1)
crewMul     = 0.70 + 0.30 × crewFrac
moraleMul   = 0.80 + 0.20 × morale
trainingMul = 0.75 + 0.25 × training
ticks       = CANNON_COOLDOWN_TICKS / (crewMul × moraleMul × trainingMul)
```

`CANNON_COOLDOWN_TICKS = 180` (9 s przy 20 tickach/s). Każda burta przeładowuje się niezależnie; zmiana amunicji resetuje obie. Najlepszy przypadek to 9 s, najgorszy ok. 26 s.

**Wyszkolenie załogi** (`captain.training`, 0..1) rośnie o 0.0005 dziennie na morzu i 0.02 za wygraną bitwę, a rozcieńcza się średnią ważoną przy zaciągu świeżych rekrutów.

### Obrażenia

```
shots      = floor(shooter.cannons / 2)          // jedna burta
distFactor = (1 − dRatio)^1.5                     // spadek z dystansem
             × 1.6 gdy dRatio < 0.15              // premia z bliska
accuracy   = max(0.15, 1 − 0.7 × dRatio)          // szansa chybienia

hullDelta  = −3.5 × shots × ammo.hullMul  × distFactor × (1 − target.armor)
sailsDelta = −3.0 × shots × ammo.sailsMul × distFactor × (1 − target.armor)
crewDelta  = −4.5 × shots × ammo.crewMul  × distFactor × (1 − target.armor × 0.3)
```

Zasięg = `arena.width / 2` (fallback `CANNON_RANGE = 480`). Łuki ostrzału: ±60° od trawersu obu burt — dziób i rufa to martwe pole.

### Stopnie uszkodzeń (`DamageSystem.ts`, v0.9.9)

Kadłub i ożaglowanie to nazwane stany, nie jedna liczba. Progi są ułamkami maksimum, więc pinasa (30 HP) i galeon (180 HP) przechodzą przez te same etapy przy tym samym względnym uszkodzeniu.

| Kadłub | Stan | Prędkość | Skręt |
|---|---|---|---|
| ≥ 75% | sprawny | ×1.00 | ×1.00 |
| ≥ 50% | przeciek | ×0.88 | ×0.85 |
| ≥ 25% | ciężko uszkodzony | ×0.70 | ×0.65 |
| > 0% | tonie | ×0.45 | ×0.45 |

| Ożaglowanie | Stan | Prędkość |
|---|---|---|
| ≥ 75% | sprawne | ×1.00 |
| ≥ 40% | podarte żagle | ×0.75 |
| ≥ 10% | żagle w strzępach | ×0.45 |
| > 0% | zerwany maszt | ×0.00 (dryf) |

Mnożniki **mnożą się**: ciężko uszkodzony kadłub pod podartymi żaglami jest wolniejszy niż każdy z osobna.

**Tonięcie.** Poniżej 25% kadłuba statek nabiera wody `0.0005 × hullMax` na tick i idzie na dno w ~23 s bez ani jednego strzału. Dotyczy obu stron — pobity przeciwnik może zatonąć po tym, jak gracz zerwie kontakt.

**Wyjątek dla mapy świata.** `mapDamageSpeedMultiplier()` nigdy nie zwraca zera, dopóki statek jest na wodzie: statek z zerwanym masztem pełznie na prowizorycznym omasztowaniu (×0.15). W bitwie dryf jest w porządku, bo bitwa się kończy — na otwartej mapie zero uwięziłoby gracza na zawsze, bo naprawy istnieją wyłącznie w porcie.

**Utrata ładunku.** Zatonięcie zabiera ładownię: `cargoSurvivingSinking()` zostawia 10-30% w zależności od tego, ile załogi jeszcze żyje.

**Warstwa wizualna (v0.12.1):** `game/render/ShipDamageOverlay.ts` dorysowuje uszkodzenia na sprite'cie zamiast osobnych klatek — przestrzeliny na kadłubie, wyrwy w płótnie, plamę na linii wodnej przy tonięciu i zwisającą reję przy zerwanym maszcie. Znaki są losowane z hasha identyfikatora statku, więc stoją w miejscu między klatkami i różnią się między jednostkami. Rysowane **w przestrzeni ekranu, bez obrotu o kurs** — `sailship.png` to ujęcie 3/4, w którym kadłub zawsze siedzi w dolnej części kadru, więc obracanie znaków wraz z kursem wsadzało przestrzeliny w takielunek albo w pustą ramkę.

### AI wroga

- Pościg gdy ma przewagę, ucieczka przy niskim kadłubie
- Przy ≥1.5× przewadze liczebnej załogi zbliża się na kartacz i prze do abordażu
- Kapitulacja gdy kadłub ≤ 10%, żagle ≤ 10% lub załoga < 10 ludzi

### Naprawa na morzu i rozbitkowie (`ShipRepairSystem.ts`, v0.10.0)

Raz na dobę gry, tylko na morzu, `repairAtSea()` łata to, co da się załatać bez stoczni:

| Ogranicznik | Wartość |
|---|---|
| Sufit kadłuba | 50% `hullMax` |
| Sufit ożaglowania | 60% `sailsMax` |
| Tempo (najlepszy przypadek) | 2.5% kadłuba i 3.5% takielunku dziennie |
| Próg załogi | poniżej 20% obsady nikt nie pracuje |

Tempo = `ręce × morale` — połowa załogi przy połowie morale robi ćwiartkę dniówki, nie trzy czwarte. Sufit jest po to, żeby stocznia dalej miała sens: naprawa na morzu pozwala zejść ze stanu „tonie" i dopłynąć do portu, nigdy odbudować się do walki. W porcie funkcja nic nie robi — tam jest `repairShip()` za złoto.

`rescueSurvivors()` wyławia 40% żywej załogi zatopionego przeciwnika, ale tylko tylu, ile jest wolnych koi. Wcieleni rozbitkowie rozcieńczają wyszkolenie tak samo jak rekruci z tawerny.

### Pojedynki (`DuelSystem.ts`, v0.10.0)

Do v0.10.0 `fencing` wpływało na dokładnie jeden mnożnik w `resolveBoarding()`. Teraz kapitanowie biją się na pokładzie, a walka jest grywalna.

Pojedynek to **jedna liczba** — `advantage`, dystans na pokładzie między kapitanami. Dodatnia = spychasz go do relingu, ujemna = ciebie spychają. `±DUEL_WIN_ADVANTAGE` (6) kończy sprawę.

W każdym starciu obie strony wybierają akcję na jednej z trzech linii (wysoka / średnia / niska):

| Ty | Przeciwnik | Wynik |
|---|---|---|
| atak | zasłona **tej samej** linii | sparowane, riposta — **on** zyskuje |
| atak | zasłona **innej** linii | cios trafia — **ty** zyskujesz |
| zasłona | atak w **tę samą** linię | chwytasz klingę i odpowiadasz — **ty** zyskujesz |
| zasłona | atak w **inną** linię | trafia cię — **on** zyskuje |
| atak | atak | obie klingi trafiają, lepsza ręka wychodzi na swoje |
| zasłona | zasłona | nic, obaj łapią oddech |

Wartość ciosu = `(1 + fencing/10)`, przy kondycji poniżej 3 mnożone przez 0.5. Atak kosztuje 2 kondycji, zasłona zwraca 3 (max 10). Stąd cała taktyka: atakujesz, żeby zyskać dystans, zasłaniasz się, żeby wywołać ripostę i złapać oddech.

**AI przeciwnika** nie losuje na oślep: przy kondycji poniżej kosztu ataku zawsze się zasłania, z szansą `fencing/20` zasłania linię, której właśnie użyłeś (dobry szermierz cię czyta), i atakuje częściej, gdy prowadzi. Wszystko jest deterministyczne z ziarna `RngState`.

**Wejście:** `SeaBattleScene` przechwytuje klawisz B, sprawdza `canBoard()`, pauzuje bitwę i uruchamia `DuelScene`. Wynik pojedynku trafia do `CombatEngine.setDuelResult()`, a `resolveBoarding(..., forcedCapture)` rozstrzyga abordaż z tym wynikiem — straty załóg liczone są jak dotąd, z siły obu stron.

### Abordaż (`BoardingSystem.ts`)

Warunek: dystans ≤ 30 px **oraz** wróg osłabiony (kadłub < 35% lub załoga < 50%).

```
playerStrength = crew × morale × (1 + szermierka/10)
enemyStrength  = crew × morale
```

Wygrany traci 10-30% ludzi, przegrany 50-90%. Przejęcie daje statek do floty (jeśli jest wolny slot) i 80% łupu.

Od v0.10.0 o tym, **kto** wygrywa, decyduje pojedynek kapitanów (`forcedCapture`); porównanie sił zostało wyłącznie do liczenia strat i do abordaży bez udziału gracza.

### Zakończenie bitwy

- Kadłub ≤ 0: zatopienie (łupy: złoto + losowy cargo)
- Kapitulacja: natychmiastowe zwycięstwo + łup
- Abordaż wygrany: przejęcie statku
- `AttemptDisengage`: ucieczka (wymaga dystansu)
- Atak na handlarza lub marynarkę psuje reputację u tej frakcji i podnosi ją u piratów

---

## CrewConsumptionSystem

### Konsumpcja per członek załogi

| Zasób | Na godzinę |
|-------|-----------|
| Jedzenie | 0.00417 |
| Woda | 0.00625 |

### Wpływ na morale

| Stan | Zmiana morale/godz |
|------|-------------------|
| Głód (brak jedzenia) | -0.02 |
| Pragnienie (brak wody) | -0.03 |
| Dobrze zaopatrzeni | +0.005 |

### Śmiertelność

- Próg: morale < 0.2
- Wskaźnik: 2% załogi na godzinę poniżej progu
- Załoga może wymrzeć całkowicie jeśli brak zaopatrzenia

---

## PortInteractionSystem

### NPC w portach

| NPC | Funkcja | Dostępność |
|-----|---------|-----------|
| Gubernator | Listy kaperskie, rangi, misje | capital, large |
| Tawerna | Rekrutacja, drink (+morale), plotki | wszystkie |
| Kupiec | Kupno/sprzedaż towarów | zależy od marketLevel |
| Stocznia | Naprawa, kupno statków | zależy od shipyardLevel |

### Rekrutacja załogi

Pula zależy od rozmiaru portu:
- small: 2–10 rekrutów
- medium: 5–15
- large: 10–25
- capital: 10–30

### Stocznia — dostępne statki

- Tier 1: tylko Sloop
- Tier 2: Sloop, Brigantine
- Tier 3: + Merchantman
- Tier 4: wszystkie klasy

---

## EncounterSystem

### Mechanika spotkań

```
probability = zone.risk × 0.001 × dtTicks
```

- Max 1 spotkanie na tick
- Typy: `"pirate"`, `"navy_patrol"`, `"storm"`
- Strefa determinuje typ i siłę wroga

---

## EventLogSystem

- Rejestruje zdarzenia: bitwy, transakcje, zmiany reputacji, odkrycia
- Max 200 wpisów (FIFO)
- Każdy wpis: `{ type, message, timestamp, data? }`
- Wyświetlane w HUD i dostępne z poziomu menu

---

## SailSystem

Cztery nazwane poziomy ożaglowania zamiast płynnego suwaka. Przejście między sąsiednimi poziomami trwa 2 s (interpolacja `currentValue`), więc rozkładanie pełnych żagli ze zwiniętych zajmuje 6 s.

| Index | value | PL | EN |
|-------|-------|----|----|
| 0 | 0.00 | Zwinięte | Furled |
| 1 | 0.33 | Zrefowane | Reefed |
| 2 | 0.50 | Połowa żagli | Half Sail |
| 3 | 1.00 | Pełne żagle | Full Sail |

Mniej żagli = wolniej, ale zwrotniej — dotyczy zarówno gracza, jak i NPC.

---

## FleetSystem

Gracz prowadzi do `MAX_FLEET_SIZE = 3` statków: okręt flagowy (`entity.ship`) plus 0-2 dodatkowe w `player.fleet`. To są **własne statki gracza**, nie eskorta NPC.

| Funkcja | Efekt |
|---------|-------|
| `fleetSpeedMultiplier()` | Eskadra płynie z prędkością najwolniejszej jednostki |
| `fleetMaxMastHeight()` | Zasięg obserwacji wyznacza najwyższy maszt we flocie |
| `fleetMinCrew()` | Minimalna załoga potrzebna do obsadzenia wszystkich statków |
| `fleetTotalCannons()` | Łączna siła ognia eskadry |
| `addToFleet()` / `removeFromFleet()` | Kupno/przejęcie i sprzedaż/porzucenie |

Statki dokupuje się i sprzedaje w stoczni; można też porzucić jednostkę na morzu.

---

## Systemy NPC

### NpcSpawnSystem

Statki **wypływają z portów** i **znikają w portach** — nie pojawiają się w losowych punktach morza.

| Stała | Wartość | Znaczenie |
|-------|---------|-----------|
| `MAX_NPC_SHIPS` | 30 | Limit jednocześnie żyjących NPC |
| `SPAWN_INTERVAL_TICKS` | 60 | Próba spawnu co 3 s |
| `DESPAWN_DISTANCE` | 900 | Usunięcie NPC oddalonego od gracza |
| `DOCK_RADIUS` | 55 | Dystans, na którym NPC „dobija" do portu i znika |

Ruch skaluje się wielkością miasta (`capital` 5 statków, `large` 3, `medium` 2, `small` 1). Zachowania: `trader`, `pirate`, `navy`, `escort`, `pirate_hunter` — każde z własną pulą klas statków, poziomem żagli, agresją i promieniem czujności.

**Wpływ wojny:** frakcje w stanie wojny spawnują 2× więcej statków, a udział marynarki rośnie z 45% do 70% kosztem handlarzy (`warSpawnMultipliers()` z `EventEffectsSystem`).

### NpcAiSystem

Sterowanie reaktywne — bez pathfindingu. NPC obiera kurs na port docelowy, a po kontakcie z linią brzegową wchodzi w cooldown (`coastAvoidTick`), w którym AI nie nadpisuje kursu, żeby statek zdążył odbić od lądu. Wrogie frakcje nie kursują między portami przeciwnika.

### NpcNewsSystem

Czterowarstwowy obieg informacji: **wydarzenie → news w porcie → NPC jako kurier → gracz**.

- NPC zbiera newsy przy porcie (w `DOCK_RADIUS`), max 5 pozycji
- Gracz odbiera je automatycznie w promieniu `NEWS_RANGE = 30` albo w `ShipEncounterScene`
- Dzielą się tylko `trader`, `navy`, `escort` — pirat nie powie nic
- Ten sam NPC nie powtórzy newsa, dopóki nie odwiedzi kolejnego portu

---

## WorldEventSystem

Odpalany raz na dobę gry. Dwa źródła zdarzeń:

**Wojny historyczne** — 10 konfliktów z lat 1568-1697 (wojna osiemdziesięcioletnia, wojny angielsko-hiszpańskie, wojna dziewięcioletnia...), wybuchają na konkretne daty kalendarzowe.

**Wydarzenia losowe** — 15 typów z wagami prawdopodobieństwa:

`epidemic` · `pirate_raid` · `trade_boom` · `slave_revolt` · `hurricane` · `treasure_fleet` · `new_governor` · `gold_discovery` · `native_raid` · `famine` · `harvest` · `royal_decree` · `treaty_signed` (+ `war_start` / `war_end`)

Każde zdarzenie ma `severity` 1-3, listę dotkniętych portów i frakcji, okno `startDay`-`endDay` oraz nagłówek jako klucz i18n.

`seedInitialEvents()` odpala się raz przy tworzeniu świata, żeby NPC już pierwszego dnia mieli 1-5 newsów do przekazania.

---

## EconomyTickSystem

Jeden dzień symulacji ekonomicznej dla wszystkich portów, w stałej kolejności:

1. Jednorazowe efekty zdarzeń (najazd piratów, odkrycie złota, huragan)
2. Agregacja dziennych mnożników z aktywnych zdarzeń
3. **Produkcja** — produkowane towary trafiają do inventarza (z limitem)
4. **Konsumpcja** — poszukiwane towary drenują inventarz
5. **Przeliczenie cen** ze stosunku podaży do popytu × modyfikator rynku × mnożnik zdarzeń
6. Płaskie dzienne delty populacji / zamożności / obrony
7. **Powrót do baseline'u** — powolny dryf: zamożność 1%/dzień, populacja 0.5%/dzień, obrona 2%/dzień

Funkcja czysta: `economyDailyTick(world) → WorldState`.

---

## EventEffectsSystem

Tabela przekładająca `WorldEventType` na konkretne dzienne delty i mnożniki.

| Zdarzenie | Efekt |
|-----------|-------|
| Epidemia | spadek populacji, rekrutacja o połowę słabsza, ceny w górę |
| Najazd piratów (jednorazowy) | zamożność −80, inventarz −30%, obrona się sypie |
| Huragan | port zamknięty, straty w towarze, uszkodzenia statków |
| Boom handlowy | produkcja ×1.5, ceny −20% |
| Bunt niewolników | produkcja ×0.3, zamożność drenowana |
| Nowy gubernator | jednorazowy zastrzyk zamożności +50 |
| Odkrycie złota | miasto zaczyna produkować złoto, populacja +0.5%/dzień przez rok |
| Głód | ceny jedzenia i wody ×2-4, populacja spada |
| Żniwa (jesień) | ceny jedzenia i cukru ×0.6, zastrzyk do inventarza |
| Dekret królewski | zmiana ceł w całej frakcji, do roku |
| Wojna | produkcja −15%, ceny +10% w walczących nacjach |
