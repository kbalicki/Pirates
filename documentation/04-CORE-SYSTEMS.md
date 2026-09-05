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
| WorldEvent | `WorldEventSystem.ts` | Wojny historyczne + losowe wydarzenia + traktaty pokojowe |
| MapEvent | `MapEventSystem.ts` | Wyprowadza znaki na mapie ze zdarzeń, o których gracz słyszał |
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
| HomePort | `HomePortSystem.ts` | Port macierzysty po ślubie: klarowanie i magazyn |
| TradeRoute | `TradeRouteSystem.ts` | Szlaki handlowe: kto kogo zaopatruje i jaką wodą |
| Blockade | `BlockadeSystem.ts` | Blokada portu przez gracza |
| Prize | `PrizeSystem.ts` | Ładownia i kiesa zdobytego statku |
| CargoContract | `CargoContractSystem.ts` | Fracht: gracz jako przewoźnik na szlakach |
| Pricing | `PricingSystem.ts` | Jedna wycena, wołana wszędzie tam, gdzie rusza się towar |
| TradeLedger | `TradeLedgerSystem.ts` | Pieniądz idący za towarem; bogactwo portu z handlu |
| PortAccess | `PortAccessSystem.ts` | Co miasto zrobi dla gracza: reputacja przy ladzie |
| Storehouse | `StorehouseSystem.ts` | Wynajęty magazyn w dowolnym mieście |

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


---

## HomePortSystem (v0.18.0)

`src/core/systems/HomePortSystem.ts`, czysty.

v0.14.0 pozwoliło zalecać się do córki gubernatora i ożenić. Ślub płacił
reputacją i punktami na emeryturze — obie to liczby, na które gracz patrzy dwa
razy w karierze. **Dzień po ślubie niczym się nie różnił od dnia przed nim.**
Małżeństwo powinno dawać miejsce, **z którego się jest**.

| Co | Gdzie żyje | Uwaga |
|---|---|---|
| **Posag** | `RomanceSystem.payDowry` | `DOWRY_BASE + wealth×3 + ranga×600`, raz, przy ślubie |
| **Klarowanie** | `careen()` | kadłub **i** takielunek, flagowy **i** konsorty, za darmo |
| **Magazyn** | `storeGoods` / `withdrawGoods` | `WAREHOUSE_CAP = 300` ton na brzegu |

**Posag siedzi w `RomanceSystem`, nie tutaj**, i to nie jest przypadek: ten moduł
potrzebuje `marriedTo` stamtąd, więc zależność biegnie w jedną stronę, a płacenie
z `propose()` zamknęłoby cykl. Posag jest zresztą wydarzeniem ślubu; miasto
dziedziczy tylko to, co potem.

**Dlaczego darmowa stocznia jest w jednym porcie.** Darmowa wszędzie znaczyłaby
po prostu „naprawy są darmowe". Darmowa w jednym nazwanym porcie to powód, żeby
wytyczyć kurs do domu — i o to w posiadaniu domu chodzi. Magazyn to ten sam
argument w ładunku.

**`homeCrown`, nie `daughterFor().factionKey`.** `daughterFor` wyprowadza koronę
ojca z **dzisiejszego** właściciela miasta, więc porównanie byłoby tautologią, a
zdobyta kolonia po cichu wyhodowałaby nową córkę gubernatora. Korona, której
służył ojciec, to fakt o ślubie — stempluje ją `propose`. Pole jest opcjonalne,
z fallbackiem na koronę założycielską, więc migracji nie potrzebuje.

**I da się to stracić.** `homePortActive` wymaga, żeby miasto wciąż powiewało
flagą jej ojca. Kolonia, która zmieniła ręce — na inną koronę, na bractwo albo na
samego kapitana — ma innego gubernatora w rezydencji i innego właściciela
stoczni. Złupienie rodzinnego miasta żony jest dozwolone i kosztuje magazyn;
towary zostają w nim, nieosiągalne, dopóki ktoś nie wywiesi z powrotem flagi jej
ojca. To jedyne miejsce w grze, w którym gracz może zniszczyć coś własnego,
**wygrywając** bitwę.

### Naprawa w stoczni była wąska (naprawione przy okazji)

`repairShip` naprawiał kadłub okrętu flagowego i **nic więcej** — nie takielunek,
nie konsorty. Podarte żagle dało się łatać wyłącznie prowizorką na morzu
(`ShipRepairSystem`), która ma sufit świadomie daleki od pełnej sprawności. Statek
mógł więc stać w stoczni trwale niedotakielowany. Teraz `repairableDamage` liczy
całą flotę, a naprawa idzie **od najgorszego**, żeby kapitana bez pełnej kwoty
stać było na to, co najprędzej go zatopi.

---

## ExpeditionCourseRenderer (v0.18.0)

`src/game/render/ExpeditionCourseRenderer.ts` — warstwa gry, nie `core/`.

v0.17.0 dało desantowi kadłuby i zostawiło gracza z zadaniem domowym: news mówi,
że czterystu Hiszpanów jest dwanaście dni od Kartageny, a eskadra istnieje na
mapie dopiero w promieniu 620. Kurs trzeba było **wydedukować** — z tego, która
korona wysyła, który z jej portów jest najbliżej celu i ile dni minęło. To nie
jest problem nawigacyjny, tylko rachunkowy, i żadna jego ilość nie czyni
przechwycenia ciekawszym.

Rysowane jest: kreskowany kurs port → cel, pierścień na mieście docelowym,
grot w miejscu, gdzie wypada zliczenie na dziś, oraz siła i dni obok.

**Tylko to, co gracz usłyszał** (`world.knownEventIds`). Dlatego wyprawa jest
teraz oznaczana jako znana **w chwili wypłynięcia** (`launchExpedition` /
`launchCampaign`): wywołujący i tak pokazuje wtedy toast, a mapa udająca
niewiedzę o tym, co ekran właśnie ogłosił, czytałaby się jak błąd, nie jak mgła.
Sieć newsów dalej zarabia na siebie wszystkim innym, co niesie.

**Nie podlega mgle wojny.** Mgła dotyczy tego, co widzi bocianie gniazdo; to
dotyczy tego, co kapitanowi powiedziano.

**Rozmiary są w pikselach ekranu, dzielone przez zoom.** Wszystko na tej mapie
rysuje się w jednostkach świata, więc adnotacja o stałych wymiarach świata rośnie
z przybliżeniem — przy z2 grot zakrywał półwysep. Notatka ołówkiem na mapie ma
szerokość ołówka niezależnie od skali mapy. Przerysowanie następuje przy zmianie
dnia, zmianie zestawu znanych wypraw albo zmianie zoomu.


---

## Miasto pod czarną banderą (v0.19.0)

`ReconquestSystem.heldPopulationCeiling` / `heldDefenseCeiling` + `EconomyTickSystem`
krok 7. **Uwaga:** sufit bogactwa (`0.75`, opisany niżej) **nie istnieje w kodzie od
v0.20.0** — został wycofany i zastąpiony brakiem importu. Powód i pomiary: sekcja
„Przemyt płynie na nazwisko" (v0.25.0).

Do v0.19.0 sufit miał wyłącznie `defense`. `population` i `wealth` dryfowały ku
liczbom, które miasto miało jako **czyjaś kolonia** — więc zdobyte miasto po
cichu odbudowywało się dokładnie w tę nagrodę, którą było: dotowana żegluga,
gubernator na miejscu, koloniści z pakietboty — pod flagą, która nie gwarantuje
niczego z tych rzeczy.

**Sufit to nie równowaga, i przy bogactwie to jest cała historia.** `wealth` jest
codziennie spychane w dół przez człon handlowy (towar bez nabywcy, popyt bez
pokrycia), a ta presja jest z grubsza stała. Ścięcie celu o ćwierć kosztuje
równowagę **znacznie więcej** niż ćwierć. Pierwsza wersja użyła 0.42 i ustawiła
zdobytą Port Royale na bogactwie **5** — miasto nie podupadło, ono wyparowało.
`population` nie ma takiej przeciwwagi i osiada blisko celu; dlatego oba udziały
są tak różne (`0.62` ludzi, `0.75` pieniędzy) i **nie wolno ich „ujednolicać"**.

Zmierzone po 600 dniach dla Port Royale: kolonia `w=353 p=2500`, pod czarną
banderą `w=203 p=1650`. Oddana koronie — dowolnej, także tej, która ją zdobyła —
wraca w górę: `playerHolds` wymaga **piratów**, a nie „zmieniła właściciela".

---

## Morale konsorty (v0.19.0)

`FleetShip.morale?` + `consortMorale()` / `fleetMorale()` w `FleetSystem`.

Konsorty wożą własnych ludzi od v0.17.0, a morale brały z okrętu flagowego —
`SeaBattleScene` wprost wpisywał każdej `0.8`. Widać to było jako statek z
dziesięcioma ludźmi przeładowujący tak żwawo jak pełny pokład.

| Gdzie | Co się zmieniło |
|---|---|
| `PlunderSystem.applyOverdueMorale` | konsorty spadają tym samym tempem co flagowy |
| `PlunderSystem.dividePlunder` | podział wraca morale **całej** flocie do 1 |
| `SeaBattleScene` | ally czyta `consortMorale(fs)` i zapisuje wynik z powrotem |
| `SiegeSystem.attackForceFor` | `morale` to teraz `fleetMorale(...)` — średnia **ważona ludźmi** |

Ważona, nie zwykła: zbuntowana pinasa nie ma prawa ściągnąć stuosobowej fregaty
do swojego nastroju, a szczęśliwa pinasa nie ma prawa jej uratować. Dla floty
jednostatkowej `fleetMorale` zwraca morale flagowego, czyli dokładnie to, co
każdy wywołujący dostawał wcześniej.

Pole jest opcjonalne, z fallbackiem `FLEET_DEFAULT_MORALE = 0.8` — czyli tą samą
liczbą, którą bitwa morska wpisywała z palca. Stary zapis walczy identycznie jak
przedtem. Bez migracji.

---

## Bandery statków NPC (v0.19.0)

`WorldRenderer.syncFlag` — domknięcie jedynego `TODO` zostawionego wprost w
kodzie renderera (`WorldRenderer.ts:239`).

Czyj to statek było najużyteczniejszą informacją na tym ekranie i
najtrudniejszą do zdobycia: odpowiedź żyła w oknie spotkania, czyli trzeba było
do obcego żagla **podpłynąć**. Kiedyś był to tint sprite'a i rysował niebieski
prostokąt wokół każdego kadłuba — arkusz nie ma kanału alfa, który dałoby się
zabarwić. Osobna bandera 16×12 tego problemu nie ma i jest tą samą teksturą,
którą wywieszają porty.

Dwie reguły: bandera **idzie za alfą kadłuba** (statek gasnący na skraju
widoczności zabiera ją ze sobą — inaczej mgła zdradzałaby się flagą wiszącą nad
pustą wodą) i ma **stały rozmiar ekranowy**, bo proporcjonalna przy oddaleniu
jest dwoma pikselami błota, a cały jej sens to czytelność jednym rzutem oka.


---

## Import licencjonowany (v0.20.0)

`EconomyTickSystem` krok 3.5 — i to jest **naprawa dziury w modelu**, nie nowa
mechanika.

Port konsumuje `def.demands` **z własnego magazynu**, a nic tam tych towarów nie
wkładało. Nie ma symulacji handlu między portami, więc każdy towar, którego
miasto potrzebuje, a nie produkuje, był brakujący **codziennie, na zawsze**, i
kosztował płaski punkt bogactwa za to niepowodzenie.

Port Royale potrzebuje cukru, kakao i tytoniu, a nie produkuje żadnego z nich.
Krwawił **-3 bogactwa dziennie od dnia stworzenia świata** i osiadał na 353 przy
baseline 600. Każdy inny port tak samo, w swojej proporcji. `getPortBaseline()`
było fikcją, do której nic nie mogło dojść.

### Co się zmieniło

```
3.5 Import   towary, których miasto nie produkuje, dowozi handel:
             need × IMPORT_SHARE, przycięte do inventoryCap
4.  Konsumpcja   wealth -= (1 − pokrycie) × SHORTAGE_WEALTH_PER_ITEM
```

Stary człon bogactwa (`+drained × 0.3` oraz płaskie `−1` za **jakikolwiek**
niedobór) czynił w pełni zaopatrzone miasto niemożliwym: kara odpalała nawet
przy 99% pokrycia. Nowy jest **zerowy przy pełnym pokryciu** i rośnie w miarę
braku. Kolonia w pokoju osiada dokładnie na swoim baseline.

| Kto | `IMPORT_SHARE` | Skutek |
|---|---|---|
| kolonia korony | `1.0` | dostaje, czego potrzebuje; równowaga = baseline |
| czarna bandera | `0.35` | tylko przemytnicy; Port Royale osiada na ~263 z 600 |

Import siedzi **wewnątrz** gałęzi `!tradingPaused`: port zablokowany albo
zamknięty to dokładnie ten, do którego nikt nie dowozi. Skaluje się też
`effects.productionMul`, bo huragan czy wojna psują żeglugę tak samo jak zbiory.

**Dlatego `HELD_WEALTH_SHARE` zniknęło.** Czarna bandera kosztuje teraz miasto
**import**, a nie modyfikator w księgach — jeden mechanizm zamiast dwóch, i taki,
który da się opowiedzieć. Został `heldPopulationCeiling`, bo ludzie to inna
wielkość i nie mają przeciwwagi.

**Skutek dla łupów:** wartość na dzień 1 bez zmian (Kartagena dalej 3200). To, co
się zmieniło, to że miasta **przestają z czasem usychać** — Kartagena, do której
wracasz po pięciu latach, jest tą samą Kartageną, a nie jej cieniem.

---

## Proporzec wojenny (v0.20.0)

`WorldRenderer.syncPennant` + tekstura `pennant_war` (10×3).

Bandera z v0.19.0 mówi **czyj** to statek. Nie mówi **jaki**: wszystkie kadłuby
na mapie rysują się z jednego arkusza, więc kupiec i fregata tej samej korony
byli nie do odróżnienia, dopóki nie podpłynęło się na odległość zawołania — a
wtedy fregata zdążyła już wyrobić sobie zdanie.

Czerwona wstęga nad banderą dla `navy`, `pirate` i `pirate_hunter`; kupcy jej nie
mają. Idzie za alfą i skalą bandery, więc pod mgłą znika razem ze statkiem.


---

## Wojna dusi żeglugę (v0.21.0)

`EventDailyEffects.importMul`.

Dziesięć historycznych wojen wisiało na tablicy newsów od v0.9.7. Podwajały
patrole, ruszały ceny i — od v0.16.0 — przesuwały flagi. Czego nigdy nie robiły,
to nie docierały **na nabrzeże**.

`importMul` jest osobny od `productionMul`, bo huragan, wojna i najazd robią
zupełnie różne rzeczy zbiorom i konwojom. Wojna ledwo tyka to, co rosną pola, i
zabiera **jedną trzecią** tego, co dopływa do portu; najazd Indian pali pola i
zostawia szlaki w spokoju.

| Zdarzenie | `productionMul` | `importMul` |
|---|---|---|
| `war_start` | 0.85 | **0.70** |
| `pirate_raid` | 0.70 | **0.75** |
| `trade_boom` | 1.50 | **1.20** |
| `treaty_signed` | 1.15 | **1.15** |
| `hurricane` | 0 | (port zamknięty) |

Kolonia, która spędza lata na wojnie, jest o to mierzalnie biedniejsza i wraca do
siebie, kiedy wojna się kończy. Odczuwalne, nie zabójcze — testy pilnują obu
stron tego zdania.

---

## Zielona załoga konsorty (v0.21.0)

`FleetShip.training?` + `consortTraining()` / `fleetTraining()` /
`greenCrewTraining()`.

Domknięcie trójki, którą v0.17.0 i v0.19.0 zaczęły: konsorta ma własnych ludzi,
własne morale i teraz własny **drill**. Kadłub, który dołącza do floty, jest
obsadzony załogą pryzową albo dostawczą ze stoczni — nie ludźmi, których kapitan
szkolił latami. Startuje `GREEN_CREW_PENALTY = 0.15` poniżej własnej załogi
kapitana (podłoga `0.2`) i nadrabia, płynąc w zespole (+0.0005/dzień na morzu,
to samo tempo co flagowy).

| Gdzie | Skutek |
|---|---|
| `CombatEngine.setAllyTraining` | konsorta przeładowuje **własnym** drillem, nie kapitana |
| `SiegeSystem.attackForceFor` | `training` to `fleetTraining(...)` — średnia ważona ludźmi |
| Zakładka Kabina | każda konsorta pokazuje załogę, morale i wyszkolenie |

Sens: **drugi statek staje się decyzją, nie darmowymi działami.** Kupno galeonu
we wtorek pogarsza szturm na fort w środę i poprawia go do wiosny.

Pole jest opcjonalne z fallbackiem na drill flagowego — czyli dokładnie tym, co
konsorty miały wcześniej. Bez migracji. Stary dwuargumentowy `addToFleet(fleet,
classId)` nadal znaczy to, co znaczył, i **nie** zapisuje pola.


---

## Szlaki handlowe (v0.22.0)

`src/core/systems/TradeRouteSystem.ts` (czysty) + `src/core/services/Pathfinding.ts`.

Do v0.21.0 handel między portami był **liczbą**: krok 3.5 `EconomyTickSystem`
dosypywał koloniom to, czego nie produkują, znikąd i przez nikogo. To załatało
głód z v0.20.0, ale zostawiło dziurę, którą sama dokumentacja przyznawała:
**nie było czego przeciąć**. Wojna zabierała 30% każdemu portowi wojującej
korony, niezależnie od tego, czy leży na cieśninie, czy w zatoce.

### Skąd się bierze szlak

Dla każdego portu i każdego towaru, którego **żąda i nie produkuje**:

1. kandydaci = wszystkie porty produkujące ten towar,
2. koszt = długość kursu **morzem** (`findSeaPath`), z rabatem
   `SAME_CROWN_DISCOUNT = 0.7` dla portu tej samej korony,
3. najtańszy wygrywa; powyżej `MAX_LANE_LENGTH = 1500` **szlaku nie ma** — to
   już nie kabotaż, tylko import zza oceanu,
4. szlaki do tego samego portu z tego samego portu **scalają się** w jeden bieg
   z kilkoma towarami.

Sieć jest czystą funkcją `CITIES` + linii brzegowej, memoizowaną na
`landmassGeneration()`. Na aktualnej mapie: **81 szlaków**, mediana długości
579, 28 z nich ma zakręty.

**Dwa towary celowo nie mają szlaku i mieć nie będą:**

| Przypadek | Dlaczego |
|---|---|
| `water` | nikt jej nie produkuje — jest ze studni, nie z ładowni |
| najbliższy producent > 1500 | to pakiet z Sewilli, nie kabotaż |

Oba dostają pełną dostawę. To **nie** jest fudge dla utrzymania liczb: to powód,
dla którego blokada Port Royale głodzi go z jedzenia i rumu, a nie z pragnienia.

### Przepustowość i zakłócenia

`world.routeDisruption?: Record<routeId, {severity, until}>` — opcjonalne, więc
bez migracji. Zdobyty kupiec dokłada `DISRUPTION_PER_PRIZE = 0.3` do sufitu
`0.85`, ubytek schodzi `0.12/dzień` i wpis znika. `laneSupplyShare()` mnoży:

```
share = laneThroughput(szlak) × (dostawca zamknięty ? 0.3 : 1)
```

a `EconomyTickSystem` mnoży to jeszcze przez banderę (1.0 korona / 0.35 czarna),
kordon blokady (0.15) i `effects.importMul` (wojna 0.7).

### Pathfinding

`Pathfinding.ts` był pustym hakiem od pierwszego commita. Teraz to A\* po siatce
`SEA_CELL = 40` (80×60 komórek), z karą `COAST_PENALTY = 1.6` w promieniu dwóch
komórek od brzegu (bez niej kurs przykleja się do każdej plaży), sznurkowaniem
wyniku do kilku narożników i binarnym kopcem na kolejkę.

**Pułapka:** przy pustym `LANDMASSES` — czyli **zawsze w vitest** — każde
zapytanie to otwarta woda, a każdy kurs prostą. Test „jest kurs" nie mówi więc
nic o geografii. Kurs wokół Kuby weryfikuje się na `getFallbackLandmasses()`.

NPC-kupiec dostaje `ai.lane = { routeId, wp }` i płynie **od narożnika do
narożnika** zamiast celować w port i odbijać się od półwyspu. W zapisie leży
tylko id szlaku — kurs jest pochodną mapy.

Klawisz **T** rysuje szlaki na mapie (`TradeLaneRenderer`, `pc_lanes`, domyślnie
włączone). Szlak zakłócony albo wychodzący z zamkniętego portu jest cieplejszy
i grubszy.

---

## Blokada portu (v0.22.0)

`src/core/systems/BlockadeSystem.ts` (czysty), tick w `WorldEngine` **przed**
`economyDailyTick`.

`portClosed` istniał od v0.9.7, `importMul` od v0.21.0 — i nic w rękach gracza
nie umiało odpalić żadnego z nich. Blokada to ten czasownik i celowo **nie jest
poleceniem z menu**: blokuje się przez *bycie tam*, dzień po dniu.

| Stała | Wartość | Znaczenie |
|---|---|---|
| `BLOCKADE_RADIUS` | 320 | jak blisko trzeba leżeć |
| `BLOCKADE_ONSET_DAYS` | 2 | po ilu dniach kordon gryzie |
| `BLOCKADE_SUPPLY_SHARE` | 0.15 | ile ze szlaków wciąż się przeciska |
| `BASE_GUNS_REQUIRED` | 4 (+1 na 10 obrony) | próg dział |
| drain obrony | −1/dzień | garnizon bez żołdu topnieje |
| reputacja / notoriety | −2 / +1 na dzień | korona pamięta |

`PortRuntimeState.blockadeDays?` liczy w górę na stanowisku i **w dół** po
odpłynięciu — kordon się rozluźnia, a nie pęka, więc wypad po wodę nie kasuje
dwóch tygodni pracy. Komunikaty wiszą na progu *gryzienia*, nie na zerze:
„blokada zdjęta" pada, gdy przestaje działać, a nie tydzień później.

Pod blokadą `EconomyTickSystem` ustawia `rmul = 0` — miasto **nic** nie
odbudowuje. To druga połowa mechaniki: zagłodzone miasto jest miastem do wzięcia,
czyli powolna połowa oblężenia z v0.13.0.

Kontra: `NpcSpawnSystem` mnoży wagę zablokowanego portu przez
`BLOCKADE_SPAWN_WEIGHT = 3` i traktuje jego koronę jak wojującą (spawn okrętów
wojennych zamiast kupców).

Zmierzone w grze (30 dni pod Hawaną, fregata + fregata): obrona 60 → 30, zapas
jedzenia 15 → 0, reputacja Hiszpanii 0 → −60, notoriety 0 → 30.

---

## Ładownia pryzu (v0.22.0)

`src/core/systems/PrizeSystem.ts` (czysty), wywoływany z `SeaBattleScene`.

Pobicie statku dawało losowe 50-150 złota — obojętnie, czy to galeon flot
srebrnych, czy pinasa rybacka — a jego ładownia zawsze była pusta, mimo że pole
`ShipData.cargo` istniało od zawsze.

| Wynik | `salvageShare` |
|---|---|
| `win` (zatonął) | 0.5 |
| `surrender` (opuścił banderę) | 0.85 |
| `captured` (przejęty) | 1.0 |

Towary przechodzą **od najdroższego**, do wyczerpania wolnego miejsca liczonego
w sztukach (tak jak w `Validation`); reszta jest wypisana graczowi jako
zostawiona w wodzie. Kiesa to `tonnage × 0.55 × salvageShare`, clamp 40-900 —
duży pryz płaci jak duży pryz nawet z pustą ładownią, i nic tu nie losuje.

Kupcy ładują się ze szlaku, który płyną (`NpcSpawnSystem.loadHold`, 55-90%
ładowni), więc merchantman na biegu z Hawany wiezie cukier i rum. Zdobycie
kupca dokłada zakłócenie **jego szlakowi** — miasto na drugim końcu czuje to w
ciągu tygodnia.


---

## Fracht — gracz jako przewoźnik (v0.23.0)

`src/core/systems/CargoContractSystem.ts` (czysty) + widok `charter` w `PortScene`.

v0.22.0 dała Karaibom prawdziwą żeglugę i **trzy sposoby, żeby ją zaatakować**
(blokada, pryz, zakłócenie szlaku), po czym zostawiła gracza na nabrzeżu.
Jedynym sposobem zarobku na handlu było dalej kupno taniej i sprzedaż drożej —
na własny rachunek.

Fracht to druga połowa. Kupiec z ładunkiem i bez kadłuba płaci za przewóz.

### Skąd bierze się oferta

`cargoOffers(world, portKey)` jest **pochodną, nigdy zapisem**: książka kupca to
funkcja szlaków wychodzących z jego miasta, zawartości jego magazynu i tego, co
ostatnio działo się na morzu. Stabilna w obrębie doby, zmienia się sama, gdy
zmienia się świat — szlak, który dziś w nocy stracił kadłub, jutro rano płaci
lepiej.

| Człon | Wzór |
|---|---|
| towar | `basePrice(item) × qty` |
| dystans | `0.55 + 0.75 × min(1, długość/1500)` |
| ryzyko | `1 + 1.2 × severity` z ledgera zakłóceń |
| blokada celu | `× 1.6` |

Wielkość frachtu jest skrojona **i do trasy, i do statku**:
`min(charterSize(długość), zapas w magazynie, max(10, wolna ładownia))`. Bez
ostatniego członu startowy slup (10 ton wolnego) dostawałby wyłącznie
czterdziestotonowe zlecenia, których nigdy nie udźwignie — czyli funkcja nie
istniałaby przez pierwszą godzinę gry.

### Cykl życia

```
podpisanie   towar wychodzi z magazynu portu i wchodzi do ładowni
             (od tej chwili zajmuje miejsce i można go stracić na morzu)
wydanie      towar wychodzi z ładowni do magazynu celu + flaga cargo_delivered_<id>
zapłata      przez advanceQuests, NIE przez deliverCharter — inaczej płaciłoby dwa razy
przeterminowanie  days_passed → reputacja −12 z koroną celu, notoriety +5,
             ładunek ZOSTAJE u gracza (to jest cała pokusa)
```

Nowy efekt `DialogueEffect`: `{ type: "notoriety", amount }` — kradzież frachtu
to nie tylko sprawa jednej korony, a sama reputacja nie umiała tego powiedzieć.

Quest odbudowuje się z `contract` w `runtime.data` przez `buildQuestRegistry`,
tak samo jak mapa skarbu i zlecenie obrony. Termin jest **zapieczony przy
podpisaniu** — z dokładnie tego samego powodu co w `DefenseContractSystem`.

---

## Towar naprawdę płynie (v0.23.0)

`NpcSpawnSystem.loadHold` + krok DOCK.

Do v0.22.0 ładownia kupca NPC była **wyczarowywana przy spawnie**: nie ubywało
jej z magazynu portu wyjścia, a zadokowanie nie dosypywało niczego portowi
docelowemu. Teraz:

- kupiec wychodzący z portu **ładuje się z jego magazynu** (i o tyle ten magazyn
  ubożeje),
- kupiec dobijający do celu **wysypuje ładownię do magazynu** celu (do sufitu
  `inventoryCap`, nigdy poniżej stanu, który tam już był).

Ogranicznik `EXPORT_TAKE_SHARE = 0.25`: pojedynczy kadłub może uszczuplić
magazyn, ale nigdy go nie ogołoci. Uzasadnienie jest wprost w kodzie — kadłuby
w pobliżu gracza są **próbką** handlu, nie całym handlem, bo poza zasięgiem
gracza nic się nie symuluje; masę dalej niesie abstrakcja z kroku 3.5
`EconomyTickSystem`.

Konsekwencja dla rozgrywki: zdobyty konwój to dostawa, która **nie dotarła** —
w towarze, nie tylko w abstrakcyjnym ledgerze.

---

## Przekierowanie dostaw (v0.23.0)

`alternateSuppliers(portKey, item)` + `REROUTE_SHARE = 0.65`.

Do v0.22.0 zamknięcie portu-dostawcy obcinało jego klientów do 30% —
**niezależnie od tego, czy ten sam towar rósł dzień drogi dalej**. Model nie
odróżniał blokady jedynego portu kakaowego w zasięgu od blokady jednego z
czterech portów cukrowych.

Teraz sieć zapamiętuje przy budowie **uszeregowaną listę pozostałych
producentów** (do `1.5 × MAX_LANE_LENGTH`, bo drugie źródło dwa razy dalej to
wciąż źródło, a po drugiej stronie morza — już nie). Gdy zwykły dostawca jest
zamknięty:

| Sytuacja | Dostawa |
|---|---|
| jest inne czynne źródło | 0.65 (dłużej, drożej, ale dociera) |
| wszystkie źródła zamknięte | 0.30 (przemytnicy i to, co wypłynęło przed kordonem) |

Skutek dla gracza: **wybór portu do blokady wreszcie jest decyzją.**

---

## Kurs wyprawy po realnej wodzie (v0.23.0)

`expeditionCourse()` + `pointAlong()` w `ExpeditionFleetSystem`.

Wyprawa korony szła prostą od portu wyjścia do celu — linia potrafiła przeciąć
półwysep, a zliczenie stawiało eskadrę na lądzie (stąd stary komentarz „nic nie
trafia na mapę, jeśli punkt nie jest wodą"). Teraz kurs to `findSeaPath`, a
pozycja na dziś to punkt `progress` drogi **mierzonej odległością**, nie numerem
odcinka — inaczej eskadra sprintowałaby po krótkim odcinku i pełzła po długim.

`ExpeditionCourseRenderer` rysuje ten sam łamany kurs, a grot celuje wzdłuż
odcinka, na którym stoi marker.

Pod vitestem `LANDMASSES` jest puste, więc `findSeaPath` zwraca prostą i całe
zachowanie jest identyczne jak przed zmianą — dlatego żaden istniejący test
`ExpeditionFleetSystem` nie drgnął.

---

## Wycena — jedna, wszędzie tam, gdzie rusza się towar (v0.24.0)

`src/core/systems/PricingSystem.ts` (czysty).

Do v0.23.0 cena towaru była przeliczana **w jednym miejscu, raz na dobę**, na
dole `EconomyTickSystem`. Wszystko inne, co ruszało towarem — kupiec w porcie,
kupiec NPC ładujący się z magazynu, konwój wysypujący ładownię — ruszało
**zapasem** i zostawiało notowanie w spokoju do północy. Dwa widoczne skutki:

- **ładownia nie miała dna rynku** — 200 ton cukru sprzedane do rybackiej wioski
  szło po cenie pierwszej tony, a cała gra handlowa sprowadzała się do „znajdź
  największy spread i powtarzaj";
- **żegluga nie było widać w notowaniach** — konwój z osiemdziesięcioma tonami
  kakao nie ruszał ceny kakao do następnego poranka.

Teraz wzór mieszka tutaj i woła go **każda ręka dotykająca magazynu**:

```
spotPrice(portKey, item, stock, population, priceMul)
  supply = stock + 1
  demand = baselineConsumptionRate(...) × 30
  ratio  = clamp(demand / supply, 0.4, 3.0)
  → max(1, round(getBasePrice(port, item) × ratio × priceMul))
```

To **ekstrakcja, nie przeprojektowanie** — arytmetyka jest ta sama, którą tick
miał od zawsze (test `„is the same arithmetic the daily tick uses"` to pilnuje).
Zmieniło się tylko to, że liczba nie może się już zestarzeć między północami.

`repriceItem` / `repricePort` czytają `getAggregatedEffects().priceMul`, bo
miasto pod ostrzeżeniem huraganowym liczy żywność podwójnie, a przecena bez
tego mnożnika po cichu kasowałaby zdarzenie do północy.

---

## Ledger handlu — pieniądz idzie za towarem (v0.24.0)

`src/core/systems/TradeLedgerSystem.ts` (czysty) + krok 8 w `EconomyTickSystem`.

v0.23.0 sprawiła, że towar naprawdę wędruje. **Nikt za nic nie płacił.** Bogactwo
portu było funkcją produkcji, niedoborów i dryfu do baseline'u, więc miasto na
skrzyżowaniu sześciu szlaków było warte dokładnie tyle, co identyczne miasto na
końcu żadnego.

Zasada modułu jest jedna: **gdziekolwiek rusza się towar, w drugą stronę rusza
się pieniądz.** Stąd dokładnie dwa rozliczenia:

| Rozliczenie | Kto płaci | Kto dostaje |
|---|---|---|
| dostawa szlakiem (raz dziennie, `EconomyTickSystem`) | — | eksporter dostaje `paid` (wartość ładunku po swojej cenie), importer połowę marży (`soldFor − paid`, do sufitu `paid`) |
| handel gracza (przy ladzie, `EconomySystem`) | gracz albo miasto | drugie z nich, bez marży — gracz zatrzymuje ją sam |

Oba końce szlaku **zyskują**, i to nie jest fudge: to cały powód, dla którego
handel istnieje — beczka kakao jest warta więcej tam, gdzie nikt go nie uprawia.
Konsekwencja: przecięcie szlaku kosztuje oba miasta pieniądze **bez ani jednej
dodatkowej linijki księgowania**.

### Gdzie ledger celowo NIE stoi

**Na kadłubach.** Kupiec dobijający na oczach gracza wysypuje ładunek i rusza
lokalnym rynkiem (to prawda i to widać), ale **nie rozlicza pieniędzy** — szlak,
do którego należy, został już opłacony w całości przez tick dobowy. Statki na
mapie to *próbka* handlu; płacenie także im liczyłoby każdy rejs dwa razy i, co
gorsza, po cichu bogaciłoby miasto, przy którym gracz akurat stoi na kotwicy.

### Dlaczego ledger, a nie zapis wprost

`wealth` to mała liczba na skali 0..1000, a dzień uczciwego handlu jest wart jej
ułamek. Zapisywany wprost zaokrągliłby się do zera. Dlatego rozliczenia
narastają w złocie na `PortRuntimeState.tradeBalance`, a tick dobowy przelicza
sumę **raz**, po kursie `GOLD_PER_WEALTH = 200`, i odkłada ją do `tradeIncome`
(ekran podejścia do portu ją pokazuje).

**`wealth` jest teraz trzymane z dokładnością do 0,1.** To nie kosmetyka:
zaokrąglanie sumy bieżącej do pełnych punktów co północ wyrzucało dzienny
przyrost i ledger równoważył się **4 punkty** nad baseline'em zamiast
pięćdziesięciu, które wychodzą z arytmetyki. Cokolwiek rusza bogactwem powoli,
musi mieć gdzie trzymać ułamek.

Bezpiecznik: `MAX_TRADE_WEALTH_PER_DAY = 6` — barierka, nie mechanika. Ceny i tak
zjeżdżają w trakcie sprzedaży, więc zrzucenie ładowni samo się ogranicza dużo
wcześniej.

Kalibracja (pomiar, nie zgadywanie): po 400 dniach bez ingerencji Port Royale
kręci ~102 złota dziennie i siada **+46** nad baseline'em, gran_granada +24,
santiago +17, a miasto na końcu żadnego szlaku — dokładnie tam, gdzie było.

---

## Reputacja wreszcie dociera do nabrzeża (v0.24.0)

`src/core/systems/PortAccessSystem.ts` (czysty).

Jedenaście wydań zapisywało, co każda korona sądzi o graczu, po czym gracz
mijał fort i **żadna z tych liczb nie miała już znaczenia**. Cartagena, którą
palił od roku, sprzedawała mu proch po cenie Port Royale, podpisywała fracht i
puszczała z nim swoich synów.

Wszystko siedzi w **jednej tabeli**, żeby pytanie „co znaczy hostile" miało
dokładnie jedną odpowiedź, a czytelnik mógł jednym spojrzeniem sprawdzić, że
`unfriendly` leży między `hostile` a `neutral` w każdej kolumnie:

| poziom | spread | crewMul | canCharter | canRentStore | canBuyShips | serviceMul |
|---|---|---|---|---|---|---|
| hostile | 0.30 | 0 | ✗ | ✗ | ✗ | 2.0 |
| unfriendly | 0.20 | 0.4 | ✗ | ✗ | ✓ | 1.3 |
| neutral | 0.12 | 1.0 | ✓ | ✓ | ✓ | 1.0 |
| friendly | 0.08 | 1.25 | ✓ | ✓ | ✓ | 0.9 |
| allied | 0.05 | 1.5 | ✓ | ✓ | ✓ | 0.8 |

Czytane **zawsze** przez `portFaction(world, portKey)` — flaga z dziś, nie mapa
z 1680.

### Dlaczego widełki, a nie mnożnik

Oczywisty kształt — podbić cenę wrogowi, obniżyć przyjacielowi, tym samym
mnożnikiem w obie strony — jest **drukarką pieniędzy**, i pierwszy zrzut ekranu
to udowodnił: przyjazne Port Royale żądało 14 za cukier i dawało 16, więc dało
się stać przy ladzie i kupować-sprzedawać tę samą beczkę do skutku. Bid i ask
wokół **jednej** ceny nie potrafią tego z konstrukcji:

```
ask = max(1, round(posted × (1 + spread)))
bid = min(ask, max(1, round(posted × (1 − spread))))
```

Test przechodzi wszystkie ceny 1..400 na wszystkich pięciu poziomach.

### Gdzie to działa

| Lada | Co się dzieje |
|---|---|
| kupiec (`EconomySystem`) | `playerBuyPrice` / `playerSellPrice` — spread |
| tawerna (`generateAvailableCrew`, `recruitCrew`) | pula ×`crewMul`; hostile = nikt. **Rzut RNG dzieje się i tak** — reputacja nie może po cichu przetasować całej reszty losowości w grze |
| kantor frachtowy (`cargoOffers`) | poniżej `neutral` książka jest zamknięta |
| stocznia (`repairRate`, `buyShip`, `buyShipToFleet`) | rachunek ×`serviceMul`; hostile nie kupi kadłuba |
| magazyn (`StorehouseSystem.canRent`, `rentFor`) | poniżej `neutral` nikt nie wynajmie, czynsz ×`serviceMul` |

`reputationPriceModifier` — martwy od jedenastu wydań — został usunięty; jego
rola jest teraz kolumną `spread` w tej tabeli.

---

## Wynajęty magazyn w dowolnym mieście (v0.24.0)

`src/core/systems/StorehouseSystem.ts` (czysty) + widok `warehouse` w `PortScene`,
tick w `WorldEngine` **przed** `economyDailyTick`.

Do tej pory kapitan miał dokładnie jedno miejsce, gdzie mógł odłożyć towar:
magazyn rodzinny z małżeństwa, w jednym mieście (`HomePortSystem`). Wszędzie
indziej jego ładownia była całym majątkiem — 40 ton na startowym slupie — więc
cała warstwa rynkowa z trzech ostatnich wydań dawała się grać wyłącznie po
jednej ładowni naraz.

| Wielkość miasta | Pojemność |
|---|---|
| small | 100 t |
| medium | 200 t |
| large | 350 t |
| capital | 500 t |

Czynsz: `cap × 1.5 × (0.8 + wealth/1000 × 0.6) × serviceMul` za **30 dni**;
trafia na `tradeBalance` miasta, bo to pieniądz przechodzący przez to nabrzeże.

### Dlaczego to nie psuje ekonomii

Notatka, która odkładała tę funkcję przez dwa wydania, miała rację co do ryzyka:
kapitan, który może magazynować wszędzie, wykupi każdą tanią beczkę na Karaibach
i na niej usiądzie. Zatrzymują to trzy rzeczy, z czego **nowa jest tylko trzecia**:

1. **Ceny jadą w trakcie handlu** (`PricingSystem`) — wykupywanie magazynu samo
   podbija notowanie pod ręką. To jest ta ważna: to się zmieniło i dlatego
   funkcję można było wreszcie zbudować.
2. **Złożony towar jest jego, nie miasta** — leży poza `port.inventory`, więc
   nie podpiera po cichu podaży, a wypuszczenie zapasu to zwykła sprzedaż.
3. **Czynsz biegnie, czy gracz tam jest, czy nie**, a wygasły najem idzie pod
   młotek. Magazynowanie ma koszt nośny — i to robi z niego decyzję.

### Wygaśnięcie

`tickStorehouses` (dzień > `paidUntil`): właściciel sprzedaje zawartość po cenie
lokalnej, towar **ląduje na półkach miasta** i notowania się przeliczają
(licytacja to dostawa jak każda inna), kapitan dostaje `AUCTION_SHARE = 0.5`
wartości, a ta kwota schodzi z `tradeBalance` miasta. Wpis do logu zawsze —
zniknięty po cichu zapas czytałby się jak zepsuty save, nie jak przegrany zakład.

Pola stanu: `player.storehouses?: Record<portKey, { paidUntil, goods }>` —
**opcjonalne**, więc bez kroku migracji. Magazyn rodzinny dalej siedzi w
`player.warehouse` i ma swoje zasady (za darmo, większy, przepada przy zmianie
korony); `goodsAshore` / `storageCap` / `storeAt` / `withdrawAt` czytają to,
co akurat obowiązuje w danym mieście, więc `PortScene` nie musi wiedzieć,
w którym z dwóch rodzajów magazynu stoi.

---

## Jak głęboko siedzi kupiec (v0.25.0)

`PrizeSystem.holdFill` / `ladenTier` / `manifest` + `WorldRenderer.syncCargoBurgee`.

Od v0.23.0 kupiec ładuje się z prawdziwego magazynu i **bywa pusty**, bo nabrzeże
było wymiecione. Na mapie nie było tego jak zobaczyć: dwa hiszpańskie
merchantmany na tym samym szlaku wyglądały identycznie, a pogoń za niewłaściwym
kosztowała dzień dobrego wiatru.

```
holdFill(ship) = suma jednostek w ładowni / cargoCap      (0..1)

ladenTier:  fill >= 0.5  → 2   pełny ładunek     pennant_cargo_rich (12x3, jasne złoto)
            fill >= 0.1  → 1   część ładunku     pennant_cargo      (6x2, przygaszone)
            inaczej      → 0   pod balastem      brak proporczyka
```

Progi stoją po obu stronach tego, co szlak faktycznie ładuje (`LANE_LOAD_MIN`
0.55 – `LANE_LOAD_MAX` 0.9, potem przycięte tym, co magazyn mógł oddać), więc
pełna partia czyta się jako „pełna", zeskrobana resztka jako „część", a kadłub,
który niczego nie znalazł, jako to, czym jest.

**Proporczyk widać dopiero z `CARGO_READ_SHARE = 0.55` zasięgu lunety.** Na
krawędzi widoczności kadłub to żagiel i nic więcej. Podejście, żeby ją odczytać,
jest decyzją — i to jest drugi raz, kiedy najwyższy maszt we flocie ma wartość,
bo połowa długiego zasięgu jest dalej niż połowa krótkiego.

Proporczyk wisi **pod** banderą (`CARGO_GAP = 5` jednostek flagi), czerwony
proporzec wojenny nad nią (`PENNANT_GAP = 13`), więc uzbrojony transportowiec
może nieść oba naraz. Skala jest ekranowa, jak u bandery: `FLAG_SCREEN_SCALE /
zoom`, żeby przy małym zoomie nie zostały z tego dwa piksele błota.

Na ekranie spotkania (`ShipEncounterScene`) doszła linia manifestu:
`Laden: 80 tons — Sugar Cane` albo `In ballast`. Towary są wymienione w tej
samej kolejności, w jakiej `computePrize` przenosiłby je na pokład (wartość
łączna malejąco), więc pierwsza nazwa to pierwsza rzecz, która przejdzie.

---

## Informator w tawernie (v0.25.0)

`InformantSystem` — trzecie źródło zleceń, obok gubernatora (obrona, v0.17.0)
i kantoru frachtowego (przewóz, v0.23.0). Pierwsze, które **nie jest robotą
korony**: kompania kupiecka płaci za to, żeby szlak konkurencji przestał się
opłacać.

### Dlaczego zlecenie mierzy się `routeDisruption`, a nie liczbą kadłubów

Bo `TradeRouteSystem` już to liczy od v0.22.0: `severity` rośnie o
`DISRUPTION_PER_PRIZE = 0.3` z każdym wziętym kupcem na danym szlaku i opada
`DISRUPTION_DECAY = 0.12` dziennie, z sufitem 0.85. Zlecenie prosi więc o
**liczbę, którą świat i tak prowadzi** — gracz wykonuje je robiąc rzecz, a nie
odhaczając licznik. Nie trzeba było ani nowego pola w zapisie, ani haka w
`applyPrize`.

```
RAID_SEVERITY = 0.6      trzy kadłuby w dwa tygodnie; dwa nie wystarczą
RAID_DAYS     = 30
reward        = 250 + 900 * min(1, długość szlaku / 1200)     → 250..1150
RAID_REPUTATION = -14 (poszkodowana korona)   RAID_NOTORIETY = +8
MAX_ACTIVE_RAIDS = 1
```

Zwłoka jest częścią mechaniki: kto się ociąga, patrzy jak jego własna robota
się rozchodzi. To termin z powodem, a nie zegar.

### Oferta

`raidOffer(world, portKey)` — **wyliczana, nigdy nie zapisywana**, jedna na
miasto (informator ma jedną rzecz wartą usłyszenia, lista czytałaby się jak
tablica ogłoszeń). Bierze szlaki przechodzące w promieniu `RAID_REACH = 700` od
portu, odrzuca te należące do **własnej korony miasta**, te, których miasto jest
końcem, i te już rozbite. Z reszty wybiera najlepiej płacący.

### Wypłata

`tickRaidCommissions(world)` w `WorldEngine`, **przed** `tickRouteDisruption`,
żeby informator oceniał szlak takim, jaki był o zachodzie słońca, a nie po
dziennym opadzie strachu. Zwraca flagi, nie płaci sam — płaci maszyna questów,
gdy silnik poda jej `flag_set` (ten sam kształt co `settleRelief` przy obronie
rozstrzygniętej poza ekranem). Quest odbudowuje `buildQuestRegistry` z
`runtime.data.commission`, więc przeładowanie zapisu nie przedłuża terminu.

---

## Przemyt płynie na nazwisko (v0.25.0)

`EconomyTickSystem.blackFlagImportShare` + `supplierShutIn`,
`TradeRouteSystem.effectiveSupplier`.

### Czego celowo NIE zrobiono, i dlaczego

TODO od v0.19.0 nosiło zarzut: „`wealth` miasta pod czarną banderą jest dalej
ciągnięte ku baseline'owi kolonii królewskiej". Zarzut jest prawdziwy co do
**celu**, i mimo to obniżenie celu jest błędem. Arytmetyka:

```
osiadła wartość = cel - stała presja / RECOVERY_WEALTH        (RECOVERY_WEALTH = 0.01)

Port Royale pod czarną banderą: presja z niedoborów ≈ 3.8 pkt/dzień
                                → luka = 380
cel 600 (królewski)  → osiada na 223
cel 372 (0.62)       → osiada na 0
cel 600 + upkeep 2.4 → osiada na 0
```

Obie alternatywy zmierzono w tej sesji na 400-500 dniach i obie **opróżniły
miasto do zera w rok** — dokładnie tak, jak udział 0.42 w v0.19.0 dał bogactwo
5. Cel nie jest dźwignią. Dźwignią jest to, co dociera na nabrzeże.

### Co się zmieniło

**1. Czarna bandera zamyka port jako dostawcę.**

```ts
supplierShutIn(world, port) = portShutIn(world, port) || playerHolds(world, port)
```

`portShutIn` odpowiada na pytanie fizyczne (kordon, `portClosed`). Czarna
bandera to drugi rodzaj zamknięcia: woda jest otwarta, nabrzeże pracuje, i żaden
licencjonowany kupiec nie załaduje towaru na kadłub wychodzący z pirackiej
przystani. Oba zatrzymują szlak u źródła, więc oba należą do odpowiedzi, którą
dostaje `laneSupplyShare`. **To pierwszy strategiczny skutek zdobycia miasta,
który gracz czuje z drugiego końca mapy**: Havana zaopatruje cztery kolonie w
cukier — zdobądź Havanę, a tamte cztery szukają innego plantatora albo głodują
(zmierzone: Tortuga 300 → 236 po zajęciu Port Royale).

**2. Ledger płaci temu, kto naprawdę wysłał.**

```ts
effectiveSupplier(portKey, item, shutIn)
  = nazwany dostawca, jeśli otwarty
  | najbliższy alternatywny producent, który jest otwarty
  | undefined  → przemytnicy, nikt tego nie księguje
```

v0.24.0 kredytowała nazwanego dostawcę zawsze, więc zablokowana Havana wciąż
dostawała pieniądze za cukier, który przyszedł z Santiago.

**3. Przemyt reaguje na sławę kapitana.**

```
share = 0.35 + min(1, notoriety / 100) * 0.4          → 0.35 .. 0.75
```

Zmierzone bogactwo osiadłe zdobytej Port Royale (baseline 600):

| notoriety | 0 | 25 | 50 | 100+ |
|---|---|---|---|---|
| `wealth` | 223 | 283 | 344 | 465 |

Przystań nieznanego kapitana przymiera głodem; przystań kogoś, o kim słyszały
całe Karaiby, trzyma się powyżej czterystu, bo ludzie, którzy nie sprzedadzą
kolonialnemu faktorowi, sprzedadzą **jemu**. To pierwsza rzecz, na którą
notoriety kiedykolwiek się przydało, zamiast tylko kosztować.


---

## Ładunek wychodzi z czyjegoś magazynu (v0.26.0)

`EconomyTickSystem` (cztery przebiegi), `TradeRouteSystem.laneClients`,
`EconomyTickSystem.reroutedOnto`.

### Dziura, którą to zatyka

Szlaki dowoziły towar od v0.22.0 i płaciły za niego od v0.24.0, ale **nigdzie
nic nie ubywało**: ładunek materializował się na końcu szlaku. Skutek widać było
w jednym zdaniu z TODO — „przekierowanie jest bezkosztowe dla portu-alternatywy":
Santiago ani się nie bogaciło, ani nie męczyło z tego, że nagle zaopatruje
klientów zablokowanej Hawany. `effectiveSupplier` (v0.25.0) wskazywał już
właściwy port **do zapłaty**; brakowało obciążenia go **dostawą**.

### Dlaczego dzień ma teraz cztery przebiegi

Bo czy Havana wypełni zamówienie Tortugi, zależy od tego, o co poprosiły jej
tego samego ranka Santiago i Bridgetown — a połowa z nich wypada w
`Object.keys(ports)` **później** niż ona. Jeden przebieg dałby wynik zależny od
kolejności kluczy.

```
1. produkcja + zamówienia       każdy port sieje i wypisuje, czego mu trzeba
2. racjonowanie                 dostawca krótszy niż suma zamówień dzieli pro rata
3. wyładunek + ledger           towar ląduje, oba końce szlaku dostają pieniądze
4. wysyłka, konsumpcja, ceny    co odpłynęło, znika z szop; miasto je; kwotowanie
```

### Dlaczego osiadły świat się nie ruszył

Produkcja portu eksportowego dostała człon `laneCommitment` — sumę dziennego
zapotrzebowania miast, dla których ten port jest **nazwanym** dostawcą. W spokoju
`produkcja = baza + zobowiązania`, a `wysyłka = zobowiązania`, więc magazyn stoi
na suficie tak samo jak przed zmianą. Zmierzone bogactwo osiadłe po 400 dniach
jest **co do dziesiętnej** takie samo jak w v0.25.0 (Port Royale 646,1 · Havana
907,6 · Santiago 617,1 · Santo Domingo 920,6) i jest teraz pilnowane testem
regresji. Zmiana dotyczy **wyłącznie** świata zaburzonego.

Uwaga na kolejność: produkcja **nie** jest przycinana do sufitu magazynu przed
wysyłką, tylko po niej. Przycięcie najpierw sprawiało, że zapas dużego
eksportera piłował o ćwiartkę dziennie, a ceny razem z nim.

### Co się dzieje przy przekierowaniu

`laneClients` to odpowiedź **mapy**, nie dzisiejszego dnia: port zamknięty
(kordon, czarna bandera) dalej figuruje jako dostawca swoich klientów, bo
plantacja nie przestaje rosnąć od tego, że zamknięto przystań. Port, który
przejmuje kurs, **nie** ma tych klientów w swoim `laneCommitment` — pokrywa je
z zapasu, którego nigdy dla nich nie zasiał. Ta różnica jest całym kosztem
przekierowania.

Zmierzone, po zajęciu Port Royale (85 szlaków, 33 pary towar-klient z tego portu):

| dzień | zapas stand-ina (Florida Keys) | cena żywności | obrót dzienny | `wealth` |
|---|---|---|---|---|
| 0 | 50/50 | 2 | 17 | 103,6 |
| 7 | 19,4/50 | 6 | 73 | 105,2 |
| 30 | 2,2/50 | 12 | 150 | 119,5 |
| 400 | 2,2/50 | 12 | 151 | 170,5 |

Bermuda, dotknięta jednym kursem zamiast kilkunastu, schodzi w tym czasie ze
100 na 91,7 — obciążenie jest proporcjonalne do tego, ile ktoś wziął na siebie.
**Napięcie i zysk to ta sama rzecz**: stand-in sprzedaje sześć razy drożej i
jednocześnie nie ma czym handlować u siebie.

### Drugie źródło jest źródłem skończonym

Kiedy szopy stand-ina wysychają, zamówienia są **skracane pro rata** i miasta,
którym pokrywał kursy, też zaczynają głodować (Santiago 617 → 537 przez 200 dni).
To jest właściwy skutek zdobycia miasta: region absorbuje je przez tydzień czy
dwa — dokładnie tyle, ile starcza magazynów sąsiada — a potem czuje.

```
available = zapas * (1 - EXPORT_RESERVE 0.15) - własne dzienne spożycie
ratio     = min(1, available / suma zamówień)
```

`EXPORT_RESERVE` nie wiąże w spokojnym świecie (zobowiązania to kilka dni
produkcji z magazynu na miesiąc) — wiąże wyłącznie przy przekierowaniu, i o to
chodzi: miasto zostawia sobie coś na własne półki, zanim odmówi obcemu.

### Producent odpowiada na pustą szopę

```
produkcja = (baza * (1 + RESTOCK_SURGE * pustka) + zobowiązania) * productionMul
pustka    = (sufit - zapas) / sufit          RESTOCK_SURGE = 1.0
```

**Magazyn jest pamięcią całego mechanizmu** — żadnego nowego pola w zapisie,
żadnej „zdolności produkcyjnej" do migrowania. Port, który od dwóch tygodni wozi
cudzy handel, tak właśnie *wygląda*: puste szopy i wysokie ceny, a wraca do
siebie tą samą arytmetyką, która go wydrenowała. Efekt uboczny, zamierzony: port
wykupiony przez gracza odbudowuje zapas w kilka dni zamiast w miesiąc.

### Co widzi gracz

Lada kupca, gdy `reroutedOnto(world, port)` nie jest puste:

```
Covering another port's runs: Food 23.7 t/d — the shelves here are bare.
```

`reroutedOnto` jest **wyliczane**, nigdy zapisywane, i czyta dokładnie te same
dwie funkcje co dzienny tick (`routeSupplying` + `effectiveSupplier`), więc nie
może się z nim rozjechać.

Parametr debugowania: `?famine=<port>` — czarna bandera nad wszystkimi dostawcami
tego miasta, kapitan stoi w jego menu portowym; `&stand=cover` stawia go zamiast
tego w mieście, które przejęło kursy.

---

## Zlecenie na dostawę — druga robota informatora (v0.26.0)

`InformantSystem.reliefOffer` / `acceptRelief` / `landRelief` / `supplyShortfall`.

### Dlaczego to zamówienie, a nie fracht

Oczywistym drugim zleceniem było „przewieź to za kordon" — i oczywiste drugie
zlecenie **już jest w grze**: kantor frachtowy płaci za to `FREIGHT_BLOCKADE`
(półtora raza) od v0.23.0. Zbudowanie tego drugi raz pod inną nazwą byłoby tym
samym ekranem gorzej nazwanym.

Czego kantor **nie** umie, to kupić. Kompania z głodującym klientem i bez
dostawcy nie ma czego wręczyć kapitanowi, więc przy podpisie nie dostaje on nic
poza ceną:

```
dostarcz <qty> <towaru> do <miasta> w <days> dni — <gold>, skądkolwiek go weźmiesz
```

To jest inna gra niż fracht: nic nie może zostać ukradzione, bo nic nie zostało
powierzone; ryzyko jest **handlowe**, nie powiernicze. Towar trzeba **znaleźć** —
kupić tam, gdzie rośnie, albo wyjąć z ładowni pryzu — a zarabia się na różnicy,
nie na przewozie.

### Wycena: stawka od ceny bazowej, ale zawsze pod ceną lokalną

```
rate   = 1.6 + 1.4 * shortfall                       → 1.6 .. 3.0 × cena bazowa
perTon = min(basePrice * rate, cena w mieście * 0.9)
reward = round(perTon * qty)
```

Oba człony są nośne, i drugi wyszedł **z testu, nie z rozumowania**. Głodujące
miasto kwotuje potrójnie, więc premia ponad cenę lokalną byłaby zaproszeniem do
kupienia towaru przy tej samej ladzie i odsprzedania go przez ten sam stół. Ale
sama stawka od ceny bazowej to to samo zaproszenie zawsze wtedy, gdy głód nie
doszedł jeszcze do ceny — pierwsza wersja płaciła 1084 tam, gdzie lada liczyła
864. **Kompania, która płaci więcej niż rynek obok niej, nie jest kompanią,
tylko błędem.**

Za co więc kapitan dostaje pieniądze: nie za lepszą cenę za tonę, tylko za cenę
**stałą** dla całej ładowni. Sprzedaż czterdziestu ton przez ladę miasta z
trzydziestotonową szopą zjeżdża po własnym ogonie (`PricingSystem` od v0.24.0);
zlecenie nie.

### Miara niedoboru

```ts
supplyShortfall(world, port, item)
  = 1 - laneSupplyShare(...) * (kordon ? 0.15 : 1) * (czarna bandera ? blackFlagImportShare : 1)
```

Te same trzy liczby, które `EconomyTickSystem` mnoży przy wyliczaniu, co
naprawdę ląduje — czytane z zewnątrz, więc liczba, którą podaje informator, jest
liczbą, którą miasto żyje. Zlecenie pojawia się od `shortfall ≥ 0.25`, co jest
osiągalne trzema drogami: zajęciem dostawcy, blokadą i **własnym rajdem gracza na
szlaku** (jeden wzięty kadłub to `severity` 0.3).

### Wypłata i symetria

```
RELIEF_DAYS = 24      MAX_ACTIVE_RELIEF = 1      RELIEF_REACH = 900
qty  = min(40, ładowność * 0.6), nie mniej niż 8 ton
landRelief  → towar do magazynu miasta + requote + flaga
flaga       → advanceQuests: gold, +3 notoriety, +6 reputacji z koroną miasta
przeterminowanie → -5 reputacji (nic nie było powierzone, więc kara jest mała)
```

`landRelief` **nie płaci** — stempluje flagę, a płaci maszyna questów, ten sam
podział pracy co przy frachcie i przy zleceniu obrony. Płacenie w obu miejscach
płaciłoby dwa razy.

Dwa zlecenia informatora ciągną w **przeciwne strony na tej samej osi**: rajd
kosztuje 14 punktów reputacji i daje 8 notoriety, dostawa oddaje 6 punktów
reputacji i daje 3 notoriety. Po to się ma oba.


---

## Głód ma twarz (v0.27.0)

`PortRuntimeState.hunger` + `EconomyTickSystem` (stempel i eksodus),
`townHunger` / `townIsHungry`, `PortInteractionSystem.generateAvailableCrew`,
linia w menu portu i na ladzie kupca.

### Dziura, którą to zatyka

Niedobór kosztował miasto **pieniądze** od v0.20.0 i nic poza tym. Nikt nie
wyjeżdżał, żaden ekran o tym nie mówił, a tawerna była w czasie głodu tak samo
pełna jak w dobry rok. Rzecz, którą gracz od v0.22.0 potrafi wywołać celowo
(blokada), od v0.25.0 zdobyciem miasta, a od v0.26.0 wysuszeniem drugiego
źródła, była **niewidoczna od środka miasta, którego dotyczyła**.

### Fakt stemplowany, nie wyliczany

```ts
PortRuntimeState.hunger?: number   // udział wczorajszych potrzeb, których nie pokryto
```

Dzienny tick i tak liczy `met` per towar, kiedy opróżnia magazyn, i **to jest
jedyny moment, w którym odpowiedź jest prawdziwa** — godzinę później ceny się
ruszyły, przypłynął konwój, a liczba przeliczona z dzisiejszych półek
opowiadałaby o innym dniu. To ta sama zasada co `capturedDay`
([derived vs recorded facts](../TODO.md)). Pole jest opcjonalne i czytane przez
`townHunger()`, więc zapis sprzed tej wersji odpowiada „nikt nie głodował", co
jest prawdą o nim.

`HUNGER_VISIBLE = 0.08` — niżej to konwój spóźniony o dzień, i żaden ekran nie
powinien na to reagować.

### Ludzie wyjeżdżają

```
population -= population * hunger * HUNGER_EXODUS        HUNGER_EXODUS = 0.002
```

Czytane naprzeciw `RECOVERY_POPULATION = 0.005` (dziennego ciągnięcia ku
sufitowi), z którym walczy. Osiadła wartość:

```
p = P * 0.005 / (0.005 + 0.002 * hunger)

hunger 1.0  → 71% mieszkańców
hunger 0.5  → 83%
hunger 0.23 → 92%     (Tortuga po zajęciu Port Royale: 500 → 468)
```

Zmierzone: w spokojnym świecie **żaden port nie ma głodu** i wszystkie stoją
dokładnie na baseline'ie populacji, więc eksodus nie odpala się nigdy bez
przyczyny. Port Royale pod czarną banderą: `hunger` 0.65, populacja 2500 → 1336
(razem z `heldPopulationCeiling`).

### Pułapka: populacja też potrzebuje miejsca na ułamek

To **druga instancja** tego samego błędu co `wealth` w v0.24.0, piętro niżej.
Wioska pięciuset ludzi przy `hunger` 0.23 traci **jedną piątą człowieka
dziennie**; zaokrąglanie sumy do pełnych ludzi co północ wyrzucało to w całości,
więc małe miasta były na głód **odporne**, a duże nie — i nic w liczbach tego nie
mówiło, populacja po prostu nigdy nie drgnęła. `PortRuntimeState.population` jest
teraz trzymana z dokładnością do 0,1, a `CityInfoScene` zaokrągla przy
wyświetlaniu.

### Ludzie zaciągają się za chleb

```
willing = floor(rzut × crewMul × (1 + hunger × HUNGER_CREW_BONUS))   HUNGER_CREW_BONUS = 1.0
```

Głodne miasto to miasto pełne ludzi, którzy wezmą koję i posiłek — więc niedobór,
który gracz potrafi **wywołać**, jest niedoborem, z którego potrafi **zwerbować**.
Ta sama dźwignia od drugiej strony, i właściwy powód, żeby głód w ogóle
modelować, a nie tylko wyświetlać.

Mnożniki mnożą się celowo: głodujące miasto, które go nienawidzi, dalej nie
wysyła nikogo. Chleb nie jest aż tak przekonujący. Rzut kością odbywa się tak czy
inaczej — zasada z v0.24.0: **to, co miasto zjadło, skaluje wynik, nigdy rzut.**

---

## Miejski spichlerz (v0.27.0)

`PortInteractionSystem.grainOffer` / `sellGrain`, `EFFECT_SELL_GRAIN` w drzewie
gubernatora.

### Dlaczego to transakcja, a nie kolejny kontrakt

Zlecenie informatora (v0.26.0) to papier podpisany w **jednym** mieście o
**innym**, z góry, za złoto. To jest człowiek stojący przed kapitanem w mieście,
któremu brakuje, i patrzący na ładownię, w której odpowiedź już jest:

> wyładuj teraz, a zapłacę cenę korony i zapomnę, czyja to była robota

Rozlicza się **na miejscu**: żadnego questa, terminu, wpisu w rejestrze, niczego
w zapisie. Połowa zapłaty to **reputacja**, czyli jedyna waluta, której gubernator
ma pod dostatkiem, a kupiec nie ma wcale. Kapitan, który zagłodził kolonię
zabierając jej dostawcę, może wkupić się z powrotem ładunkiem — i ta pętla jest
całym sensem rzeczy: niedobór, który wywołał, sprzedaje mu się **dwa razy**.

Oferta **nie** jest bramkowana reputacją. Gubernator kupujący zboże od
człowieka, którego nie znosi, to jedyna droga wyjścia z wrogości, jaką gra daje.

### Liczby

```
GRANARY_DAYS = 30            luka = min(potrzeba × 30 − zapas, sufit magazynu − zapas)
GRANARY_RATE = 1.2           cena od BAZOWEJ, nigdy od głodowego kwotowania
GRANARY_REPUTATION = 8       skalowane przez qty / luka
GRANARY_MIN_TONS = 4
```

W praktyce wiąże **sufit magazynu**, nie kalendarz: towar importowany mieści się
w każdym mieście Karaibów po 30 ton, więc gubernator prosi o ładunek slupa, nigdy
o konwój. To właściwa skala dla czegoś płaconego głównie życzliwością.

Cena od bazowej, a nie od lokalnego kwotowania, z tego samego powodu co przy
zleceniu informatora: **korona ratująca własną kolonię nie licytuje sama ze
sobą**, a gubernator płacący potrójnie byłby lepszym klientem niż kupiec obok —
co czyniłoby ladę bezużyteczną dokładnie w tych miastach, do których warto
płynąć.

### Dlaczego się tego nie da farmić

Wyładunek **zamyka lukę**, o którą oferta pyta: zapas rośnie, `grainOffer`
zwraca `null` i wraca dopiero, gdy miasto zje się z powrotem do niedoboru.
Żadnego licznika, żadnego cooldownu — to ten sam wzorzec co „zlecenie mierzy się
liczbą, którą świat już prowadzi".

### Pułapka wyłapana okiem, nie testem

Potwierdzenie sprzedaży jest budowane z kontekstu drzewa dialogowego, a ten jest
**przeliczany zaraz po wyładunku** — więc opisywało *następną* półkę do
uzupełnienia, nie tę właśnie zapełnioną („13 ton wody" po sprzedaniu 10 ton
żywności). Stąd osobne `ctx.grainSold`, trzymane przez `PortScene` do końca
rozmowy. Drugi z tej samej pary: nagłówek portu rysuje się raz w `create()`,
więc kiesa w nim kłamała po transakcji zawartej **wewnątrz** widoku — pierwszej
takiej w grze. `goldText` jest teraz trzymany i odświeżany.


---

## Zdarzenia świata nigdy się nie działy (v0.28.0)

`WorldEventSystem.seedInitialEvents` / `spawnRandomEvent`, `EventEffectsSystem`.

### Jedna linijka, zła od początku modułu

```ts
const port = allPorts[portR.value % allPorts.length];   // rngNext zwraca [0,1)
```

`rngNext` zwraca **ułamek**, więc modulo oddaje ten ułamek z powrotem i
odczytem jest `allPorts[0.37]` → `undefined`. Skutki, przez cały czas życia
modułu:

- nagłówek brzmiał „Spanish treasure fleet preparing to sail from **undefined**";
- `portDef?.factionId ?? "pirates"` → **każde** zdarzenie należało do piratów;
- `ports: [undefined]`, więc `getPortNews` nie pokazywał go w żadnej tawernie…
- …i `getAggregatedEffects` nigdy nie trafiał, czyli **żaden z piętnastu typów
  zdarzeń nigdy nie tknął miasta, którego dotyczył**. Epidemie, huragany,
  odkrycia złota, dekrety królewskie — wszystko dekoracja.

Znalezione przez **przeczytanie tablicy ogłoszeń na zrzucie ekranu** podczas
weryfikacji plotek. Testy tego nie widziały, bo `WorldEventSystem` nie miał
własnego pliku testowego (TODO odnotowywało to od P0-3).

Poprawka to `Math.floor(value * length)` w obu miejscach — plus pierwszy plik
testowy tego modułu, z asercjami nudnymi do czasu, aż się na nich przejedzie:
że wylosowany port **istnieje**.

### Druga połowa: tabela efektów nigdy nie była mierzona

Skoro nic nie lądowało w porcie, liczby z v0.9.7 nikt nigdy nie zobaczył w
działaniu. A czytać je trzeba naprzeciw `RECOVERY_WEALTH = 0.01`:

```
osiadłe przesunięcie = wealthDelta / 0.01 = wealthDelta × 100

+10/dzień przez rok   → +1000, czyli CAŁA skala 0..1000
 +3/dzień przez 90 dni → ok. +190 zanim minie
 +1/dzień przez 30 dni → ok. +26
```

Włączone bez kalibracji podniosły łączne bogactwo Karaibów o **39%** i
przybiły Havanę, Santo Domingo, San Juan i Cartagenę do sufitu 1000.

Reguła, do której przeskalowano tabelę: **zdarzenie jest zaburzeniem, nie nowym
baseline'em.** `EVENT_WEALTH_CEILING = 150` punktów osiadłego przesunięcia na
zdarzenie (`MAX_WEALTH_DELTA = 1.5/dzień`) — najmocniejsze z nich jest warte
jedną szóstą zamożnej kolonii. Dramat zdarzenia ma pochodzić z jednorazowego
uderzenia, z mnożników produkcji i cen oraz z tego, co robi ludziom; nie ze
stałej dotacji.

### Jedno zdarzenie danego typu na miasto

Strażnik `sameTypeCount >= 3` liczył **zdarzenia**, nie pokrycie — a dekret
królewski obejmuje dwadzieścia cztery porty. Trzy naraz na tych samych
dwudziestu czterech to było właśnie to, co przybijało hiszpańskie stolice do
sufitu. Teraz nowe zdarzenie nie startuje, jeśli aktywne zdarzenie tego samego
typu obejmuje choć jeden z tych portów: korona nie wydaje trzech taryf naraz, a
przystań nie ma dwóch huraganów.

Zmierzone po poprawce (5 ziaren, rok gry): łączne bogactwo **+1% do +5%** wobec
świata bez zdarzeń, 8–16 żywych zdarzeń naraz, 0–3 głodujące porty, sufit 1000
osiągany sporadycznie i zwykle przez miasto z odkrytym złotem. Świat żywszy, nie
bogatszy — i to jest pilnowane testem.

---

## Co mówią w tawernie (v0.28.0)

`RumorSystem.tavernRumor` / `rumorsAt`.

Plotka była listą ośmiu napisów rotowaną po dniu miesiąca: ten sam statek widmo
koło Bermudów, niezależnie od tego, czy kapitan spędził miesiąc na blokadzie
Hawany, czy przespał go w Port Royale. Tymczasem świat miał sporo do powiedzenia
— sześć wydań zbudowało warstwę handlową z konsekwencjami, które gracz potrafi
**wywołać**, a każda z nich była niewidoczna, dopóki tam nie dopłynął.

### Co tawerna wie, w kolejności przydatności

| plotka | źródło w świecie |
|---|---|
| „nie ma {{item}} w {{port}}" | `townIsHungry` + najkrótsza półka (v0.27.0) |
| „pod {{port}} stoi eskadra" | `blockadeEffective` (v0.22.0) |
| „{{port}} karmi pół wybrzeża" | `reroutedOnto` (v0.26.0) |
| „nikt nie ubezpieczy szlaku {{from}}–{{to}}" | `routeDisruption` (v0.22.0) |
| „{{port}} nie nosi barw żadnej korony" | `playerHolds` (v0.19.0) |
| „pół handlu idzie przez {{port}}" | `tradeIncome` (v0.24.0) |

Kolejność jest projektem: na czele fakt, na którym da się zarobić **tego
popołudnia**, na końcu ten, na którym da się zarobić w tym roku.

### Plotka jest lokalna

Tylko fakty w promieniu `RUMOR_REACH = 1300` od tego miasta. Ta sama zasada, na
której stoi `NpcNewsSystem` — wieść płynie kadłubem, nie telegrafem — i ma
konsekwencję wartą posiadania: **w ruchliwym węźle warto się napić, w zatoczce
nie ma czego słuchać.** Kapitan szukający, gdzie sprzedać ładownię żywności,
robi coś sensownego, stawiając kolejkę.

### Jedna rzecz dziennie, i się zmienia

`(dzień + nazwa miasta) % kandydaci` — deterministyczne, wyliczane, nigdzie nie
zapisywane. Ten sam zapis opowiada tego samego ranka to samo, a kto poczeka
dzień, usłyszy następny fakt zamiast tego samego. Osiem starych opowieści dalej
jest w puli, ale tylko gdy dzieje się mniej niż `QUIET_WORLD = 2` rzeczy:
spokojne Karaiby plotkują o statkach widmach, ruchliwe o cenie chleba.

Nowe klucze i18n mają test pokrycia w obu językach — plotka złożona z faktów
świata podstawia zmienne, a brakujący klucz albo nieużyta zmienna wyglądają jak
błąd w świecie, nie w tabeli napisów.


---

## Zdarzenie, które gracz spotyka (v0.29.0)

`EventEffectsSystem.isPortClosed` → `PortApproachScene`,
`EventDailyEffects.crewMul` → `generateAvailableCrew`,
`ITEMS.gold` (`rare`) → lada kupca.

v0.28.0 odkryła, że żadne losowe zdarzenie nigdy nie przyczepiło się do portu.
Kiedy wreszcie zaczęły lądować, wyszło, że **trzy z rzeczy, które deklarują,
były deklaracjami** — nic w grze ich nie czytało. To jest ta sama kategoria co
martwa scena albo martwy hak: pole w kontrakcie, którego nie konsumuje żaden
odbiorca.

### 1. Zamknięty port jest zamknięty

`isPortClosed` był wołany w `EconomyTickSystem` (pauza handlu w symulacji) i w
`BlockadeSystem.portShutIn` (szlak zatrzymany u źródła) — i **nigdzie w
`src/game`**. Kapitan wpływał więc do miasta, którego oficjalnie nie było, i
handlował przy ladzie, za którą nikt nie stał.

Ekran zbliżania czyta to teraz przed zaproponowaniem drzwi: „Port jest
zamknięty. Żadna łódź nie wypłynie ci naprzeciw…". Zostaje **szturm** — port
zamknięty to port słaby, i to jest decyzja, a nie błąd. Wejście przez klawisz
jest dodatkowo zabezpieczone w `executeAction`.

### 2. Zaraza opróżnia tawernę

`EventDailyEffects.crewMul` istniał od napisania systemu zdarzeń (epidemia 0.5,
klęska głodu 0.7) i **nie był czytany przez nic**. Teraz wchodzi do tego samego
iloczynu co reputacja (v0.24.0) i głód (v0.27.0):

```
willing = floor(rzut × crewMul(reputacja) × (1 + głód) × crewMul(zdarzenia))
```

Mnożniki mnożą się celowo — a rzut kością odbywa się tak czy inaczej, zgodnie z
zasadą z v0.24.0.

### 3. Odkrycie złota jest czymś, po co się płynie

`gold_discovery` dokładał „gold" do `bonusProduces` od v0.9.7, a dzienny tick
liczył mu cenę — ale **`gold` nie było pozycją w `ITEMS`**, więc lada kupca
listowała wyłącznie `Object.keys(ITEMS)` i nigdy go nie pokazała, a `executeBuy`
odrzucał je jako nieznany towar. Jedyne zdarzenie w tabeli, którego sensem jest
to, co po sobie zostawia, zostawiało coś, czego nikt w grze nie mógł tknąć.

Złoto jest teraz towarem — i pierwszym **rzadkim** (`ItemDef.rare`):

- `initPortInventory` **nie daje go nikomu** przy tworzeniu świata (zwykłe towary
  dostaje każdy port, po to lada jest rynkiem, a nie półką);
- lada listuje towar rzadki tylko tam, gdzie coś go położyło: `bonusProduces`,
  zapas w magazynie **albo ładownia kapitana** — bez tego ostatniego dałoby się
  przewieźć złoto przez całe Karaiby i nie znaleźć lady, która by je odkupiła.

Ekonomia wychodzi sama z `PricingSystem`: w mieście z kopalnią magazyn jest
pełny, więc kwotowanie jest niskie; gdziekolwiek indziej zapas to zero, więc
`spotPrice` bije w sufit `RATIO_MAX`. Zmierzone po jednym ticku: kupno ~108 w
mieście z odkryciem, sprzedaż ~206 gdzie indziej.

**Uwaga na pomiar:** `initPortPrices` daje wszystkim tę samą statyczną cenę
bazową, dopóki nie minie doba — pierwsza wersja testu porównywała właśnie ją i
wychodziło, że złoto jest **droższe** w kopalni. Kwotowanie zależne od zapasu
powstaje dopiero przy dziennym przeliczeniu.

### 4. I plotka o zamkniętym porcie

Newsy zdarzenia trafiają na tablicę **w miastach, których dotyczy** — a tablica
zamkniętego portu jest za drzwiami, których gracz nie otworzy. Dlatego
`RumorSystem` dostał siódmy fakt: sąsiednia tawerna mówi, że port jest zamknięty,
zanim zmarnuje się na to przeprawę.

### Parametr debugowania

`?event=<typ>&port=<klucz>` — stempluje zdarzenie na mieście i stawia statek
dokładnie na nim, na tyle blisko, że dialog zbliżania otwiera się sam
(`findNearPort` ma promień **6 px** wokół pozycji przyciągniętej do brzegu, więc
najbliższy kafel wody to za daleko). Dla `gold_discovery` dosypuje tygodniowy
urobek do magazynu, bo `applyOneShotEffects` odpala się tylko w dniu wystąpienia.

---

# v0.30.0 — mapa mówi, i pokój wreszcie następuje

## MapEventSystem — znaki na mapie świata

`knownPortEvents(world): PortEventMark[]` — czysta funkcja, jedyna warstwa
rdzenia tej zmiany. Wyprowadza z `worldEvents` krótką listę znaków, jakie
kapitan naniósłby sam na swoją mapę. Rysuje je `MapEventMarkerRenderer`
(zob. [07-RENDERING.md](07-RENDERING.md)).

Reguły są w całości o tym, co **odpada** — mapa oznaczająca wszystko przestaje
być mapą:

| Warunek | Dlaczego |
|---|---|
| `endDay >= time.day` | wygasłe zdarzenie to nie news |
| `id ∈ knownEventIds` | ta sama zasada co kursy wypraw: rysuje się to, co **powiedziano** kapitanowi (tablica w tawernie, zagadany kapitan), a nie to, co widzi bocianie gniazdo. To nie jest mgła wojny |
| `ports.length ≤ MARK_MAX_PORTS` (**4**) | dekret królewski obejmuje 24 porty, flota skarbów wszystkie hiszpańskie. Dwadzieścia cztery identyczne szpilki nie mówią nic ponad to, co mówią flagi, i zasłaniają jeden huragan, który jest naprawdę ważny. Huragan obejmuje 3 miasta, zbiory 2, reszta 1 |
| typ ∉ `NOT_A_TOWN_MARK` | `reconquest` / `campaign` rysuje już `ExpeditionCourseRenderer` (kurs + pierścień na celu) — ten sam fakt dwa razy. `war_start` / `war_end` / `treaty_signed` mają puste `ports`, bo dotyczą koron |
| port istnieje w `world.ports` | odporność na klucz spoza mapy |

**Jeden znak na miasto.** Dwa zdarzenia mogą pokrywać ten sam port, a sprite
miasta ma 10–22 jednostek świata szerokości. Wygrywa to, co najbardziej zmienia
decyzję kapitana, reszta idzie w licznik `extra`:

```
zamknięty port  >  wyższa severity  >  krótszy pozostały czas  >  id (stabilność)
```

Krótszy przed dłuższym celowo: huragan, który minie za trzy dni, jest newsem;
kopalnia złota pracująca od roku jest stałym faktem mapy.

`markValence(type)` odpowiada na **jedno** pytanie — płynąć tam czy stamtąd:
`bad` (zaraza, głód, huragan, bunt, napad, najazd), `good` (złoto, koniunktura,
zbiory, flota skarbów), `neutral` (nowy gubernator, dekret).

`closed` czytane jest **z portu** (`isPortClosed`), nie ze zdarzenia: miasto może
być zamknięte przez którekolwiek z kilku naraz, a kapitan potrzebuje wiedzieć,
czy drzwi są otwarte, nie która pogoda je zamknęła.

## Pokój — czternaście wydań bez ani jednego traktatu

Dwie usterki, z których każda zasłaniała drugą.

**1. Wojna znikała przed własną datą końca.** `checkHistoricalWars` zapisywał
koniec jako `startDay + lata × 365 + miesiące × 30`, a kalendarz gry ma lata
przestępne. Błąd rośnie o dzień na cztery lata: wojna dziewięcioletnia wychodziła
**4 dni** za krótka, wojna osiemdziesięcioletnia **20**. `expireEvents` kasuje
zdarzenie dzień po `endDay`, a gałąź kończąca wojnę wymaga, żeby wojnę **dało się
jeszcze zobaczyć** — więc nigdy się nie wykonała.

Koniec liczy teraz `calendarToDay(rok, miesiąc, 1, world.startYear)`
(`TimeSystem.ts`, odwrotność `dayToCalendar`, przetestowana na 80 latach dni).

**2. `treaty_signed` nie było produkowane przez nic.** Typ istniał, nagłówek
`news.treaty_signed` istniał w dwóch językach, wiersz w tabeli `EventEffectsSystem`
(produkcja i import ×1.15, `wealthDelta` +0.5) istniał od v0.9.7 — i nie było
producenta. To lustrzane odbicie martwych pól z v0.29.0.

Koniec wojny tworzy teraz zdarzenie `treaty_signed` na **`TREATY_DAYS = 60`**,
obejmujące porty obu koron. Wcześniej pokój był linijką w dzienniku kapitana i
niczym więcej: `getPortNews` czyta wyłącznie `worldEvents`, więc żadna tawerna
nigdy nie wydrukowała wiadomości o pokoju i żaden NPC jej nie rozniósł. Wojna
była czymś, co czuła cała mapa; pokój nie działał się nigdzie.

**Pomiar** (świat od 1667, wojna dewolucyjna V 1667 – V 1668, 700 dni z pełnym
`economyDailyTick`): wojna zaczyna się dnia 121, traktat podpisany dnia 487.
Suma bogactwa Karaibów 20 905 wobec 21 269 w świecie bez osiągalnej wojny
(−1,7%) — wojna zabiera trochę przez rok `importMul` 0.7, traktat oddaje część.
Traktat jest **zaburzeniem, nie nowym baseline'em**: 60 dni × 0,5 punktu to około
+20 punktów osiadłego bogactwa na miasto, mniej niż wojna zabrała.

### Parametry debugowania

`?event=<typ>&port=<klucz>` dokłada teraz do `knownEventIds` **zarówno**
stemplowane zdarzenie, **jak i** wszystkie zasiane przy tworzeniu świata — bez
tego znaki na mapie są niewidoczne dokładnie w świecie zbudowanym po to, żeby na
nie popatrzeć. `vars` niesie też `faction1` / `faction2`, bo nagłówki wojny i
traktatu interpolują dwie korony, a brakujący klucz drukuje na tablicy w tawernie
surowe `{{faction1}}` (znalezione na zrzucie ekranu).

`?zoom=` działa od tej wersji **za pierwszym razem**: `initZoomSetting()` czyta
klucz w `BootScene`, która startuje przed `PreloadScene`, więc zapis prosto do
`localStorage` odnosił skutek dopiero przy następnym załadowaniu strony. Idzie
teraz przez `setZoomLevel()`.
