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
| Reconquest | `ReconquestSystem.ts` | Korona odbija zdobyte miasto; jedyne miejsce rozliczenia desantu |
| CityDefense | `CityDefenseSystem.ts` | Rozgrywalna bitwa obronna z murów |
| CrownCampaign | `CrownCampaignSystem.ts` | Wojny koron przesuwające flagi |
| ExpeditionFleet | `ExpeditionFleetSystem.ts` | Wyprawa jako eskadra na mapie, do przechwycenia |
| DefenseContract | `DefenseContractSystem.ts` | Zlecenie obrony u gubernatora |

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

---

## SiegeSystem (v0.13.0)

Zdobywanie miast. Do v0.13.0 odpowiedź „ATAK" w `PortApproachScene` startowała
bitwę morską z `enemyId = portId`, czyli z przeciwnikiem, którego nie ma w
`entities` — bez kadłuba i bez dział. `PortRuntimeState.defense` istniało od v7,
było popychane przez wydarzenia świata i nikt go nie czytał.

Trzy etapy, z czego tylko środkowy nie jest decyzją:

1. **Ostrzał** — interaktywny, runda po rundzie
2. **Desant** — auto-resolve falami
3. **Łupy** — co zrobić z miastem bez garnizonu

### Garnizon

```
soldiers = SIZE_SOLDIERS[size] × (0.35 + defense/100 × 0.65) × popFactor
guns     = TYPE_GUNS[type]     × (0.30 + defense/100 × 0.70)
walls    = min(TYPE_WALL_CAP[type], defense)
```

| | outpost | city | fort |
|---|---|---|---|
| `TYPE_GUNS` | 4 | 12 | 26 |
| `TYPE_WALL_CAP` | 35 | 70 | 100 |

`SIZE_SOLDIERS`: small 25 · medium 55 · large 100 · capital 160.

`popFactor = clamp(port.population / baseline.population, 0.4, 1.3)` — miasto
wyludnione przez epidemię albo głód jest **mierzalnie** łatwiejsze do wzięcia.
To pierwsze miejsce, w którym numeryka żywego świata rozstrzyga coś, co gracz czuje.

### Ostrzał

Obie strony strzelają w tej samej rundzie, więc uciszenie ostatniego działa i tak
kosztuje jego ostatnią salwę.

```
bombardAccuracy(gunnery, training) = 0.35 + gunnery/10 × 0.35 + training × 0.15   // 0.35..0.85
fleetHits = cannons × accuracy × (0.75 + rng × 0.50)
walls -= fleetHits × 0.35     (HIT_TO_WALLS)
guns  -= fleetHits × 0.12     (HIT_TO_GUNS)

fortAccuracy(walls, wallsMax) = 0.30 + (walls/wallsMax) × 0.25                    // 0.30..0.55
fortHits = guns × fortAccuracy × (0.7 + rng × 0.6)
hull -= fortHits × 0.9        (FORT_SHOT_HULL)
crew -= round(fortHits × 0.2) (FORT_SHOT_CREW)
```

Nietknięte mury to nie tylko osłona — to stabilna platforma działowa i wdrożony
dalmierz. Zbicie murów pogarsza ogień odwetowy, co jest drugim powodem, żeby
strzelać w mur, a nie tylko w strzelnice.

Flota odpada przy `hullHp ≤ hullMax × 0.2` (`FLEET_BREAK_HULL`) albo `crew < 5`.
Fregata ucisza Kartagenę w 8-12 rundach kosztem ~80 kadłuba; slup zostaje odparty,
zanim działa umilkną. Działa i ludzie liczą się **z całej floty**.

### Desant

```
attack  = men × (0.6 + morale × 0.6) × (1 + fencing/14) × (0.85 + training × 0.3)
defence = soldiers × wallFactor × gunFactor × (1 + defense/250)
  wallFactor = 0.5 + (walls/wallsMax) × 0.8      // 0.5 .. 1.3
  gunFactor  = 1 + guns × 0.02
```

`men = landingParty(force)` = 85% załogi, minus 5 rąk zostających na pokładzie.

Mury są warte do **2.5×** siły garnizonu — to cała argumentacja za płaceniem
kadłubem, zanim zapłaci się ludźmi. Desant na nietknięty fort I klasy to 39%;
ten sam desant po porządnym ostrzale — 70%.

Rozstrzygnięcie: do `MAX_WAVES = 6` fal wzajemnego wykrwawiania. Każda strona
traci ułamek **własnej** liczebności (`WAVE_INTENSITY = 0.18`), ważony tym, kto
wygrywa falę. Wspólna pula (pierwsza wersja) była błędem: mniejsza siła
docierała do progu paniki pierwsza, nawet gdy była silniejsza, więc przewaga
liczebna liczyła się dwa razy.

Obrońcy pierzchają przy `DEFENDER_ROUT = 0.35` stanu wyjściowego, atakujący
wracają do szalup przy `ATTACKER_ROUT = 0.45`.

### Łupy

```
loot = wealth × 3 + population × 0.05
```

| Wybór | Udział | Kto trzyma miasto | Skutki |
|---|---|---|---|
| `plunder` | 100% | stary właściciel | −30 rep, +10 piraci, +8 sławy |
| `brethren` | 70% | piraci | −30 rep, +20 piraci, +12 sławy |
| `sponsor` | 50% | frakcja z listem kaperskim | −35 rep, +25 sponsorowi, +1 ranga, −5 pozostałym |

Złupione miasto zostaje z 15% obrony, 35% zamożności (60% przy `sponsor`) i 85%
populacji. `EconomyTickSystem` podciąga je z powrotem do baseline'u przez kolejne
miesiące — zdobycie miasta ma znaczyć, ale nie na zawsze.

`portFaction(world, portKey)` jest **jedynym** poprawnym sposobem na odczytanie
właściciela portu: `CityDef.factionId` to mapa z 1680 i nigdy się nie zmienia.

`writeBackForce()` rozbija pulę z powrotem na kadłuby — obrażenia proporcjonalnie
do wniesionego kadłuba, straty w ludziach proporcjonalnie do wniesionej załogi.
`FleetShip` nie ma pola załogi, więc straty konsorty są odczuwalne dopiero w
kolejnym oblężeniu (liczy je od klasy) — to to samo uproszczenie, które
`FleetSystem` robi wszędzie indziej.

---

## ReconquestSystem (v0.15.0)

Druga połowa `SiegeSystem`. Do v0.15.0 zdobycz była wieczna — nikt nie próbował
odbić portu, więc największa mechanika gry miała tylko połowę pętli.

`src/core/systems/ReconquestSystem.ts`, czysty, deterministyczny z `RngState`.

### Pętla

1. Miasto zmienia właściciela. `capturePort` stempluje `PortRuntimeState.capturedDay`.
2. Po `RELIEF_GRACE_DAYS = 12` każdy dzień to rzut: czy wypływa eskadra odbijająca.
3. Gdy wypływa, staje się zwykłym `WorldEventState` typu `reconquest` — czyli
   jedzie istniejącą siecią newsów: tawerny wszystkich portów tej korony
   (`event.ports` wymienia je wszystkie) i NPC roznoszący plotki. Gracz dowiaduje
   się o niej **6-14 dni przed** desantem.
4. W dniu `endDay` desant rozstrzyga się poza ekranem, a flaga zostaje albo wraca.

### Szansa na wypłynięcie

```
p = RELIEF_DAILY_BASE (0.06)
  × SIZE_PRIORITY[rozmiar]          small 0.6 · medium 0.9 · large 1.2 · capital 1.5
  × clamp(0.3, 1.2, 0.3 + siła_korony × 0.9)
  × (korona w stanie wojny ? 0.5 : 1)
```

`siła_korony` = porty trzymane teraz / porty z mapy startowej. Korona bez ani
jednego portu nie wypływa w ogóle. Rzut jest zerowany, gdy trwa okres karencji,
gdy eskadra już płynie, albo gdy działa `nextReliefDay` (45 dni po odparciu).

Dla dużego miasta w spokojnych czasach daje to ok. 7%/dzień, czyli pierwszą
eskadrę zwykle ok. 25-40 dni po zdobyciu.

### Siła eskadry

```
eskalacja = 1 + min(1, dni_utraty / 180)        // podwaja się przez pół roku
żołnierze = SIZE_SOLDIERS[rozmiar] × rand(0.8..1.3) × eskalacja
          × clamp(0.5, 1.0, 0.4 + siła_korony × 0.6)
działa    = żołnierze / 4
rejs      = 6..14 dni
atak      = żołnierze × ROYAL_QUALITY (1.15) × (1 + działa × 0.01)
```

Sufit współczynnika siły korony to **1.0**, nie 1.2. Wyżej świeżo złupione duże
miasto było nie do utrzymania niezależnie od liczby pozostawionych ludzi, co
opróżniało z sensu zakończenie „zatrzymaj dla bractwa".

### Obrona

```
obrona = (milicja + załoga_miasta) × wallFactor × gunFactor  [+ flota, jeśli obecna]
wallFactor = 0.5 + (walls / TYPE_WALL_CAP[typ]) × 0.8
gunFactor  = 1 + działa_brzegowe × 0.02
```

Człon murów mierzy się względem tego, co **taki** typ osady może mieć, a nie
względem jego własnego stanu bieżącego — desant poza ekranem nie ma fazy
ostrzału, która obniżałaby stosunek, więc stosunek musi być bezwzględny.

**Flota gracza** liczy się, gdy jest w promieniu `PRESENCE_RANGE = 400 px` od
miasta albo gdy gracz stoi w tym porcie. Jej wkład ma ten sam kształt, co człon
ataku w `assaultStrengths`, razy `PRESENCE_PENALTY = 0.7`.

### Rozstrzygnięcie

```
p_utrzymania = obrona^1.8 / (obrona^1.8 + atak^1.8)
```

Wykładnik `RESOLVE_SHARPNESS = 1.8` zamiast uczciwego stosunku: 1.0 wyrzucałoby
sezon pracy na jednym pechowym rzucie, 1.8 zostawia wyrównaną walkę rzutem
monetą, a nierówną każe zachowywać się tak, jak mówi arytmetyka.

Straty są udziałem **własnych** liczebności każdej strony, skalowanym bliskością
wyniku (`0.55..0.90` dla przegranego, `0.10..0.45` dla zwycięzcy) — ta sama
zasada, co w `resolveAssault`.

| Wynik | Co się dzieje |
|---|---|
| Miasto pada | `factionId` wraca do dawnej korony, `garrison = 0`, `capturedDay` skasowany, `defense = 50% baseline` |
| Miasto się broni | `garrison` pomniejszony o straty, `defense × 0.85`, `nextReliefDay = dziś + 45`, sława +4 (+8 przy obecności) |

Obecny gracz płaci za to załogą (połowa tempa strat desantu) i dostaje
`WRECK_GOLD_PER_SOLDIER = 3` złota za żołnierza rozbitej eskadry.

### Załoga miasta (garnizon)

| Funkcja | Co robi |
|---|---|
| `garrisonCapacity(portKey)` | `SIZE_SOLDIERS[rozmiar] × 2` |
| `maxStationable(world, portKey)` | ilu ludzi da się zostawić teraz (koje minus `SHIP_KEEPERS`) |
| `stationMen(world, portKey, ±n)` | przenosi ludzi między pokładem a murami |
| `garrisonAt(world, portKey)` | ilu stoi na murach |

`garrisonFor` (SiegeSystem) dolicza ich do `soldiers` **1:1**. `tickReconquest`
odejmuje `GARRISON_DECAY = 0.4%` dziennie (dezercja i febra).

### Sufit odbudowy obrony

`heldDefenseCeiling(world, portKey)` — `EconomyTickSystem` ciągnie `defense` ku
**45% baseline'u** (`HELD_DEFENSE_SHARE`) dla miasta pod **czarną banderą**, i ku
pełnemu baseline'owi dla wszystkich pozostałych. Bez tego dźwignia garnizonu nie
miałaby znaczenia: miasto odbudowałoby się samo w jeden sezon.

**Zmiana w v0.16.0:** kryterium to `playerHolds` (piracka flaga **i** zmiana
właściciela), a nie samo `portChangedHands`. Kolonia zdobyta przez koronę —
oddana sponsorowi albo wzięta przez inną koronę w `CrownCampaignSystem` —
dostaje gubernatora i budżet na garnizon jak każda inna, więc odbudowuje się do
pełnego baseline'u. Za czarną banderę nie płaci nikt.

### Kolejność w pętli dnia

`tickReconquest` w `WorldEngine` idzie **przed** `updateWorldEvents`. Tamtejszy
`expireEvents` kasuje zdarzenia z minionym `endDay`, więc eskadra docierająca w
przeskoczonym dniu zostałaby po cichu usunięta zamiast stoczyć desant — błąd
widoczny wyłącznie jako miasta, na które nikt nigdy nie napada.

### Jedno miejsce rozliczenia (v0.16.0)

`settleRelief(world, portKey, claimant, expedition, settlement)` zapisuje wynik
desantu: właściciel, garnizon, `defense`, `nextReliefDay`, `capturedDay`, złoto,
sława, wpis do logu, straty floty. Od v0.16.0 są **trzy** drogi do tego samego
zapisu — eskadra poza ekranem (`resolveRelief`), wyprawa korony przeciw koronie
(`CrownCampaignSystem`) i bitwa rozegrana ręcznie (`CityDefenseSystem`) — więc
arytmetyka może się różnić, a księgowość nie.

`capturedDay` przy utracie miasta: **skasowany**, gdy zdobywca jest koroną
założycielską (nic już przeciw temu miastu nie liczy), **ustawiony na dziś**, gdy
jest kimkolwiek innym. To ta druga gałąź otwiera rekonkwistę przeciw koloniom
zdobywanym przez korony między sobą.

`playerDefends` (nie samo `playerPresentAt`) decyduje, czy flota gracza wchodzi
do obrony rozstrzyganej poza ekranem: samo bycie w pobliżu cudzego miasta to nie
udział w jego obronie. Udział w cudzej obronie jest decyzją i zapada w
`CityDefenseScene`.

---

## CityDefenseSystem (v0.16.0)

`SiegeSystem` widziany z plaży. Do v0.15.0 desant korony rozstrzygał się poza
ekranem **także wtedy, gdy gracz stał na redzie** — jedyne miejsce w grze, gdzie
obecność gracza dawała mu komunikat zamiast sterów.

`src/core/systems/CityDefenseSystem.ts`, czysty, deterministyczny z `RngState`.

### Wejście

`tickReconquest` zwraca `playable?: PendingDefense` zamiast rozstrzygać desant,
gdy `pendingDefenseFor` mówi „tak". Zdarzenie jest **mimo to** usuwane ze świata:
zostawione, zostałoby skasowane przez `expireEvents` przy następnej zmianie dnia,
co dla jedynego desantu, po który gracz wracał, wyglądałoby jak zawrócenie
eskadry. Dane jadą w `Transition { scene: "CityDefense" }` → `MainMapScene` →
`CityDefenseScene`.

Warunki (`pendingDefenseFor`):

| Warunek | Skutek |
|---|---|
| gracz w `PRESENCE_RANGE` lub w tym porcie | konieczny |
| `playerHolds` (piracka flaga **i** miasto zmieniło właściciela) | własne miasto, `allied = false` |
| `alliedWith(holder)` — list kaperski albo reputacja „allied" (≥ 60) | cudza kolonia, `allied = true` |
| nic z powyższych | desant idzie poza ekranem, gracz nie bierze udziału |

Jeden desant dziennie jest rozgrywalny; drugi tego samego ranka rozstrzyga się
poza ekranem — kapitan może być tylko w jednym porcie. Port z rozgrywanym
desantem jest pomijany w kroku 3 `tickReconquest`, inaczej ten sam dzień
wysłałby po niego drugą eskadrę.

### Runda ostrzału

Obie strony strzelają jednocześnie. Gracz wybiera **cel**:

```
trafienia_brzegu = działa_fortu × fortAccuracy(walls, wallsMax)
                 + działa_floty × bombardAccuracy(gunnery, training)
                 razy swing 0.75..1.25

cel "transports":  utopieni = trafienia × SHOT_TO_SOLDIERS (1.6) × transportExposure
cel "escorts":     działa_eskadry −= trafienia × SHOT_TO_SQUADRON_GUNS (0.30)

transportExposure = 1 − ESCORT_COVER (0.65) × (działa_eskadry / max)
```

`ESCORT_COVER` jest tym, co czyni z tego decyzję. Bez niego ogień do szalup był
**zawsze** lepszy — szedł prosto w liczbę rozstrzygającą plażę — więc eskorta
była dekoracją. Teraz eskorta zasłania: przy nietkniętych działach przepuszcza
ok. 35% ognia, a jedynym sposobem na szalupy jest wcześniejsze jej uciszenie,
płacone murem.

Odpowiedź eskadry:

```
trafienia_eskadry = działa_eskadry × SQUADRON_ACCURACY (0.45) × swing 0.75..1.25
do floty  = trafienia × FLEET_FIRE_SHARE (0.30)   → kadłub × 0.9, ludzie × 0.2
do miasta = reszta                                 → mur × 0.40, działa × 0.12
```

Flota, która stoi na redzie, **strzela i chłonie**: bez niej całość ognia idzie
w mur. Poniżej `FLEET_BREAK_HULL` (20% kadłuba) albo 5 rąk wychodzi w morze.

### Ludzie na mury

`landMen` przenosi `landingParty(force)` z pokładów na mury — raz, w jedną
stronę. Ci sami ludzie obsługiwali działa, więc `fleetGuns` spada proporcjonalnie
(`cannons × załoga_teraz / załoga_na_starcie`). To druga oś decyzji: mur pełen
ludzi albo cicha reda.

### Kiedy schodzą na ląd

Eskadra decyduje sama — gracz nie może przeczekać:

| Wyzwalacz | Wartość |
|---|---|
| mur poniżej | `LANDING_TRIGGER_WALLS = 40%` `wallsMax` |
| eskorta ucisza się do zera | działa = 0 |
| cierpliwość | `SQUADRON_PATIENCE = 8` rund |

Wybicie wszystkich żołnierzy przed desantem (`squadronBroken`) kończy sprawę
**bez plaży** — miasto broni się automatycznie.

### Plaża

`resolveDefenseAssault` to `resolveAssault` z zamienionymi rolami: fale wzajemnej
attrycji, każda strona traci ułamek **własnej** liczebności ważony tym, kto
wygrywa falę, progi `DEFENDER_ROUT`/`ATTACKER_ROUT` i `MAX_WAVES` wzięte wprost
z oblężenia (opisują ludzi, nie stronę plaży).

```
siła_miasta = obrońcy × wallFactor × gunFactor      (jak w defenceStrength)
siła_desantu = attackStrength(expedition)            (ROYAL_QUALITY 1.15)
```

`defenseOdds` **nie** podnosi stron do potęgi — inaczej niż rzut poza ekranem.
Tu walka toczy się falami i attrycja robi to, co `RESOLVE_SHARPNESS` zastępowało;
wyostrzanie na wierzchu liczyłoby tę samą przewagę dwa razy.

### Rozliczenie

`applyDefenseOutcome` oddaje księgowość do `settleRelief` (jedno miejsce dla
wszystkich trzech dróg rozstrzygnięcia desantu), dokładając to, co istnieje tylko
przy obecności gracza:

| Rzecz | Wartość |
|---|---|
| straty garnizonu i desantu | `splitTownLosses` — proporcjonalnie do strat całego fortu |
| ocalali z desantu wracają na pokład | `force.final.crew += ocalali` |
| miasto padło | garnizon 0, wraca `ROUTED_PARTY_SURVIVAL = 30%` desantu |
| reputacja korony atakującej | `DEFENCE_CLAIMANT_REP = −15`, zawsze |
| reputacja sojusznika | `ALLY_DEFENCE_REP = +25`, tylko przy `allied` **i** wygranej |
| złoto z transportowców | `WRECK_GOLD_PER_SOLDIER × żołnierze` (przez `settleRelief`) |

`abandonDefense` (ESC) rozstrzyga desant **bez** wkładu floty: bez złota, bez
wpisu „obroniono osobiście", garnizon przy wygranej ścięty o połowę.

---

## CrownCampaignSystem (v0.16.0)

Dziesięć wojen historycznych siedziało na tablicy newsów od v0.9.7 i nie
przesunęło ani jednej flagi. Tylko gracz mógł zdobyć miasto.

`src/core/systems/CrownCampaignSystem.ts`, czysty, deterministyczny z `RngState`.

### Pętla

1. Dwie korony są w stanie wojny (`war_start`). `warPairs` czyta każdą wojnę
   **w obie strony** — zdarzenie nie nazywa agresora, a dla desantu to ma
   znaczenie.
2. Codzienny rzut na wyprawę przeciw najsłabszej kolonii przeciwnika.
3. Wyprawa to `WorldEventState` typu `campaign`, więc jedzie tą samą siecią
   newsów: tawerny **obu** koron i NPC. 10-20 dni na morzu.
4. `tickReconquest` rozstrzyga ją tym samym kodem, co eskadrę odbijającą —
   `expeditionsInFlight` obejmuje oba typy.

### Wybór celu

```
kandydaci: porty defendera (wg portFaction), z pominięciem:
  – tych, po które coś już płynie (activeExpeditionFor, oba typy)
  – tych w okresie karencji (nextCampaignDay)
  – tych z defense > CAMPAIGN_DEFENSE_CEILING (70)

waga = (1.05 − defense/100)² × SIZE_PRIORITY[rozmiar]
```

Kwadrat jest tam po to, żeby „najpierw słabe" było prawdą, a nie deklaracją:
liniowo człon rozmiaru wygrywał i dobrze obwarowane średnie miasto biło
bezbronną przystań. Miasto, które gracz właśnie złupił, jest teraz na szczycie
listy — i to jest cała strategiczna treść tego modułu.

### Szansa i tempo

```
p = CAMPAIGN_DAILY_BASE (0.03)
  × clamp(0.3, 1.2, 0.3 + siła_atakującego × 0.9)
  × clamp(0.4, 1.6, 0.6 + (siła_atakującego − siła_defendera) × 1.2)
```

| Stała | Wartość | Po co |
|---|---|---|
| `CAMPAIGN_DAILY_BASE` | 0.03 | połowa tempa `RELIEF_DAILY_BASE` |
| `MAX_CAMPAIGNS_IN_FLIGHT` | 2 | ile wypraw naraz na morzu |
| `CAMPAIGN_COOLDOWN_DAYS` | 90 | stemplowane **przy wypłynięciu**, nie przy lądowaniu |
| `CAMPAIGN_SAIL_DAYS` | 10-20 | ostrzeżenie dla gracza |
| `CAMPAIGN_DEFENSE_CEILING` | 70 | powyżej ministerstwo znajduje fleecie inne zajęcie |

Korona zdobywa kolonie wyraźnie wolniej niż gracz. Gdyby tempa się zrównały,
mapa by się kotłowała, każda flaga byłaby tymczasowa i zdobycie miasta przestało
by cokolwiek znaczyć.

### Kolejność w pętli dnia

`tickCampaigns` idzie **po** `tickReconquest` — odwrotnie niż intuicja. Gdyby
szło przed, wyprawa mogłaby zostać wystawiona i stoczona tego samego ranka:
`tickReconquest` obsługuje każdą wyprawę z minionym `endDay`, a zerowy rejs
się kwalifikuje.

### Skutek uboczny na mapie

Kolonia zdobyta przez koronę dostaje `capturedDay` (bo `settleRelief` stempluje
go, gdy zdobywca **nie jest** założycielem), więc uruchamia zwykłą rekonkwistę:
korona założycielska będzie chciała ją odbić. Flagi na mapie odświeża
`refreshPortFlags`, ten sam mechanizm co przy zdobyczach gracza.

---

## RomanceSystem (v0.14.0)

`charm` istniał w `CaptainSkills` od tworzenia postaci i do v0.14.0 **nie był
czytany nigdzie w kodzie**. To jest to, do czego był.

### Kto istnieje

Każde miasto powyżej przystani (`type !== "outpost"` i `population !== "small"`)
ma dokładnie jedną córkę gubernatora, **wyprowadzoną** z klucza portu przez
hash FNV-1a, a nie losowaną: imię i uroda są takie same w każdym zapisie.
W `WorldState` ląduje jedna liczba: `player.courtship[portKey]` (0-100).

Imiona zależą od frakcji, która **dziś** trzyma miasto — po zdobyciu Hawany
przez Anglię gubernator ma córkę o angielskim imieniu.

### Zaloty

Dom otwiera się przy reputacji ≥ 20 (`REPUTATION_TO_BE_RECEIVED`).

```
approachChance = base − (level/100) × 0.55 × beautyDifficulty     clamp 0.05..0.95

  compliment   base = 0.45 + charm/10 × 0.35
  dance        base = 0.35 + charm/10 × 0.45
  gift         base = 0.55 + charm/10 × 0.20   (0 przy gold < 500)
  boast        base = 0.20 + min(1, notoriety/80) × 0.55 + charm/10 × 0.10

  beautyDifficulty: plain 1.0 · comely 1.2 · beautiful 1.6
```

| Podejście | Trafienie | Pudło |
|---|---|---|
| komplement | +6 | −3 |
| taniec | +14 | −9 |
| podarunek | +12 | −4 |
| przechwałka | +10 | −8 |

Pudło kosztuje grunt, więc właściwy ruch zależy od tego, kim kapitan naprawdę
jest. Podarunek jest opłacony niezależnie od wyniku.

### Progi

- `SHARES_A_LEAD = 30` — powtarza, co ojciec mówił przy kolacji: to darmowe
  wejście w wątek rodzinny (flaga `daughter_lead_<port>`)
- `MARRIAGE_THRESHOLD = 85` + `MARRIAGE_MIN_RANK = 2` u jej frakcji — oświadczyny
- Ślub jest **jeden**, na zawsze: `captain_married` + `married_to_<port>`,
  +20 reputacji i 500/900/1500 punktów na emeryturze wg urody

---

## FamilyQuestSystem (v0.14.0)

Pierwszy pisany ręcznie wątek. Markiz korony, która najbardziej nie znosi korony
kapitana (`villainFactionFor()` z tabeli `FACTIONS[...].relations`), rozproszył
rodzinę po trzech swoich miastach: siostra, brat, ojciec.

Łańcuch jest **instancją** jak mapa skarbu: trzy miasta losowane raz, zapisane w
`data.chain` questa, a `QuestDef` odbudowywany z nich przez `familyQuest()`.
Żadnych nowych pól w `WorldState`.

```
step0  on flag_set("family_step_0")  → step1   +800 gold
step1  on flag_set("family_step_1")  → step2   +1500 gold
step2  on flag_set("family_step_2")  → done    +3000 gold, +20 rep własnej korony
```

Flagi są spoiną między czystą maszyną questów a sceną, która odgrywa walkę:
`QuestSystem` nie wie nic o pojedynkach, `DuelScene` nie wie nic o questach.

Wejście: informator w tawernie za `INFORMER_PRICE = 200` albo darmowo od córki
gubernatora przy standingu 30. Przegrany pojedynek nie kosztuje nic poza drogą
powrotną — ślepy zaułek uwięziłby wątek.

---

## QuestRegistry (v0.14.0)

`advanceQuests` potrzebuje `QuestDef` dla każdego wpisu w logu. Do v0.14.0
jedyny wywołujący budował tę mapę w locie z map skarbów, które akurat trzymał
(`MainMapScene.digForTreasure`). Przy drugim źródle questów to przestaje działać:
kopanie dostawałoby rejestr bez wątku rodzinnego, a odbicie krewnego — rejestr
bez polowań na skarby.

`buildQuestRegistry(world)` odbudowuje wszystko z `questLog`: `treasure_*` z
`data.map`, `family_search` z `data.chain`, `defense_*` z `data.contract`
(v0.17.0), plus ręcznie pisane `QUESTS`.


---

## ExpeditionFleetSystem (v0.17.0)

`src/core/systems/ExpeditionFleetSystem.ts`, czysty, deterministyczny z `RngState`.

Od v0.15.0 wyprawa korony była nagłówkiem w tawernie i datą przybycia — a między
jednym a drugim **niczym**. Gracz mógł usłyszeć, że czterystu Hiszpanów jest
dwanaście dni od Kartageny, i nie mógł z tym zrobić absolutnie nic poza staniem
na murze, kiedy dopłyną. To dziwny kształt dla gry pirackiej: jedyną rzeczą, jaką
kapitan na tych wodach mógł z inwazją zrobić, było spotkać ją na morzu.

### Ledger w zdarzeniu, kadłuby na mapie

Źródłem prawdy zostaje `WorldEventState`. Nowe jest to, że **dopóki gracz jest
blisko pozycji wyprawy**, zdarzenie dostaje 2-4 zwykłe encje NPC oznaczone
`ai.expedition`, z zapisanym udziałem w desancie:

| Rola | Wiezie | Zachowanie |
|---|---|---|
| transportowiec | żołnierzy, zero dział | `trader` — prze do plaży |
| eskorta | działa, zero żołnierzy | `navy` — zbliża się do każdego, kto się zbliży |

Co tick `vars.soldiers` i `vars.guns` są **przeliczane od nowa** jako suma tego,
co jeszcze pływa. Zatopiony transportowiec to ludzie wykreśleni z desantu na
zawsze; zatopione eskorty to desant bez osłony ogniowej.

**Dlaczego przeliczanie, a nie odejmowanie.** Odejmowanie musiałoby wiedzieć,
*dlaczego* kadłuba nie ma — gracz go zatopił, czy moduł go zdespawnował, bo gracz
odpłynął. Suma tego, co pływa, liczona **przed** każdym celowym usunięciem, nie
musi tych dwóch przypadków rozróżniać i nie może się rozjechać. To jedyna reguła,
na której całość stoi.

### Rozbicie wyprawy

Gdy nie ma już kogo wysadzić na brzeg (`soldiers <= 0`), zdarzenie znika z
`worldEvents`, a cel dostaje **ten sam okres karencji**, jaki dostałby po
odparciu desantu na plaży (`RELIEF_COOLDOWN_DAYS` albo `CAMPAIGN_COOLDOWN_DAYS`).
Bez tego następny dzienny rzut po prostu wystawiłby kolejną eskadrę i rozbicie
tej pierwszej nic by graczowi nie dało.

### Trasa i woda

Trasa to prosta od najbliższego portu wysyłającej korony do celu, przechodzona
po dniu. `LANDMASSES` jest ładowane z GeoJSON w runtime, a prosta między dwoma
portami tego archipelagu **bardzo często idzie po lądzie** — Santa Marta →
Kartagena jest lądowa na większości długości. Dlatego pozycja jest dosuwana do
najbliższej wody (`nearestWater`, promień 140), a materializacja jest
**wszystko-albo-nic**: kadłub, który nie znalazł wody, byłby dla `syncLedger`
ludźmi wykreślonymi z inwazji bez jednego wystrzału.

### Stałe

| Stała | Wartość | Po co |
|---|---|---|
| `MATERIALIZE_RANGE` | 620 | wygodnie wewnątrz 900 despawnu `NpcSpawnSystem` |
| `EXPEDITION_INTERVAL_TICKS` | 40 | ~2 razy na sekundę |
| `SOLDIERS_PER_TRANSPORT` | 90 | próg drugiego transportowca |
| `GUNS_PER_ESCORT` | 26 | próg drugiej eskorty |
| `MAX_EXPEDITION_HULLS` | 4 | sufit kadłubów na wyprawę |
| `WATER_SEARCH_RADIUS` | 140 | jak daleko wolno dosunąć kadłub |

---

## DefenseContractSystem (v0.17.0)

`src/core/systems/DefenseContractSystem.ts`, czysty.

v0.16.0 zrobiło cudzą kolonię obronną, ale nie dało żadnego sposobu, żeby gracz
**został o to poproszony**. Musiał akurat tam być: przeczytać news, zgadnąć datę
i krążyć. Cała gałąź gry była osiągalna wyłącznie przypadkiem.

### Łańcuch

```
sail   — dotrzyj do miasta    reach_port        → stand
                              days_passed(n)    → late   (porażka)
stand  — utrzymaj je          defense_held_X    → paid   (złoto, reputacja)
                              defense_lost_X    → fell   (porażka)
                              days_passed(25)   → late   (porażka)
```

Dwie spoiny są **celowo różnej natury**. Dotarcie to pozycja, więc `reach_port`.
Utrzymanie to wynik, więc flaga świata — a `settleRelief` stempluje ją na
**każdej** ścieżce rozstrzygnięcia desantu, i to dlatego zlecenie płaci
niezależnie od tego, czy gracz rozegrał bitwę w `CityDefenseScene`, czy odpłynął
i garnizon zrobił to bez niego.

Rozbicie eskadry na morzu **nie** rozstrzyga desantu, więc żadna flaga nie
powstaje i zlecenie wygasa na zegarze. Poprawne i lekko okrutne: gubernator płaci
za obronione miasto, nie za zgubioną flotę.

**Termin jest wypiekany przy podpisaniu.** `days_passed` liczy od dnia wejścia w
etap, a `QuestDef` instancji jest odbudowywany z `questLog` przy każdym wczytaniu
(`buildQuestRegistry`). Okno musi więc być liczbą, która się nie rusza —
`arrivalDay - acceptedDay + ARRIVAL_GRACE_DAYS`, policzone raz i zapisane.
Liczenie „względem dziś" po cichu przedłużałoby termin przy każdym wczytaniu.

### Bramki oferty

| Bramka | Dlaczego |
|---|---|
| `alliedWith(holder)` | gubernator nie oddaje kolonii obcemu |
| brak innego zlecenia | kapitan nie może być w dwóch portach; dwie wypłaty za jedną bitwę to oczywisty exploit |
| cel nie jest miastem gracza | zdobył je tej koronie — nie płacą mu za trzymanie |
| `endDay - dziś >= 2` | oferta, której nie da się przyjąć na czas, jest gorsza niż jej brak |

### Wyzwalacze, które wreszcie ktoś odpala

`reach_port` i `days_passed` były w `QuestSystem` i pokryte testami od v0.12.0, a
**żadna scena ich nie emitowała**. Teraz: `PortScene.create()` przy wejściu przez
bramę (nie przy powrocie ze stoczni) i `WorldEngine` przy zmianie dnia.

Doszła też zakładka **Dziennik** w menu SPACE — `activeQuests` istniało od
v0.12.0 i było wołane znikąd. Zlecenie z terminem, którego gracz nie może
sprawdzić, to obietnica, której nie może dotrzymać.

---

## Załoga konsorty (v0.17.0)

`FleetShip.crew?` — pole opcjonalne, czytane wyłącznie przez `consortCrew()` z
`FleetSystem`, z fallbackiem `crewMax × FLEET_CREW_FRACTION`. Ten fallback jest
powodem, dla którego **nie było potrzebne żadne krok migracji**: stary zapis
odpowiada dokładnie tą liczbą co zawsze, dopóki statek nie poniesie pierwszych
strat.

Do v0.17.0 komplet konsorty był przeliczany z klasy przy każdym pytaniu, więc
statek, który stracił połowę ludzi pod murami, miał ich wszystkich z powrotem
przy następnym oblężeniu — jedyne miejsce w grze, gdzie ludzie wracali.
`writeBackForce` dzieli teraz straty w ludziach tym samym mianownikiem co straty
w kadłubie: siłą, którą oblężenie było prowadzone, a nie tym, co zostało.

Rekrutacja w tawernie liczy koje **całej floty**: najpierw okręt flagowy, reszta
przez `manConsorts` do najbardziej przetrzebionej konsorty. Bez tego przetrzebiona
konsorta zostałaby przetrzebiona na zawsze — ta sama jednokierunkowa zapadka, co
statek bez masztu z prędkością zero.

---

## Ułamkowy zegar a bramki okresowe (v0.17.0)

`TimeSystem.tickBoundaryCrossed(prevTick, nowTick, interval, offset?)`.

Każdy okresowy system bramkował się na `world.time.tick % INTERVAL === 0`. Czyta
się to jako „co N ticków" i jest **dokładnie poprawne dla całkowitego zegara** —
ale `MainMapScene` podaje silnikowi **ułamkowy** `dtTicks` proporcjonalny do
delty klatki (≈0.4 przy 60 fps i normalnej prędkości), więc `tick` jest floatem i
ta reszta nigdy nie jest dokładnie zerem.

Efekt: `updateNpcSpawns` **nie postawił na mapie ani jednego statku**,
`updateNpcAi` nie podjął ani jednej decyzji, wymiana newsów nie zadziałała ani
razu. Świat wyglądał na pusty, bo **był** pusty — a testy jednostkowe tych
systemów, operujące na całkowitych tickach, przechodziły.

Porównanie, w którym kubełku o rozmiarze interwału leży każdy koniec klatki, jest
na to odporne, odpala dokładnie raz na granicę niezależnie od długości klatki
(także gdy klatka przeskoczy cały interwał) i zachowuje się po staremu dla zegara
całkowitego. `offset` rozsuwa fazę per encja, nie zmieniając okresu.
