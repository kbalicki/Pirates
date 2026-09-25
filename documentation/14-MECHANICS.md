# 14 — Mechaniki: jak gra działa naprawdę

**Ten dokument opisuje STAN, nie historię zmian.**

Reszta dokumentacji — a zwłaszcza [04-CORE-SYSTEMS.md](04-CORE-SYSTEMS.md), która
ma ponad pięć tysięcy linii — jest **archeologią wydań**: co było zepsute, jak
to znaleziono i dlaczego poprawka wygląda tak, a nie inaczej. To jest cenne przy
pisaniu kodu i bezużyteczne przy pisaniu instrukcji, bo opisuje **różnice**.

Tutaj jest jedno: **co gra robi dzisiaj**, ułożone według tego, co gracz robi,
z liczbami wziętymi z kodu. To jest materiał źródłowy na instrukcję dla gracza.

---

## 0. Kontrakt tego dokumentu

> **Każda liczba tutaj jest liczbą z kodu, a nie z pamięci.**

Wiersz w tabeli stałych ma postać:

```
| `Moduł.STAŁA` | wartość | co znaczy |
```

i jest **sprawdzany automatycznie**. `src/core/__tests__/mechanics_doc.test.ts`
czyta ten plik, wyłuskuje każdy taki wiersz, znajduje `const STAŁA = …`
w `Moduł.ts` i porównuje. Rozjazd = czerwony test.

Tabela klas statków jest sprawdzana osobno, wprost przeciwko `SHIP_CLASSES`.

**Po co ta maszyneria.** Ekran pomocy w grze obiecywał od v0.9.7.1 reset
reputacji przy nowym gubernatorze i **przez pięćdziesiąt jeden wydań** nic tego
nie robiło (naprawione w v0.61.0). W v0.64.0 wyszło, że głód podnosił cenę
tytoniu tak samo jak chleba, choć podręcznik mówił „żywność ×2, woda ×2" —
tam z kolei **podręcznik miał rację, a kod nie**. Dokument opisujący mechanikę
bez kontroli rozjeżdża się z nią cicho, a instrukcja zbudowana na takim
dokumencie kłamie graczowi. Stąd test.

Czego test **nie** złapie: zdań jakościowych („obrona spada", „statki zostają
uszkodzone"). Te trzeba czytać po kolei. Są tu oznaczone jako *(nieweryfikowane
maszynowo)*.

---

## 1. Czas i świat

Gra to Karaiby w latach 1560–1700, 45 portów pod pięcioma banderami.

- **1 tik = 1 minuta gry.** Silnik dostaje `dtTicks = delta_ms / 50`, czyli
  jeden tik na 50 ms realnego czasu, mnożone przez `gameSpeed` (domyślnie 1,2).
- **Doba gry = 60 sekund realnych** (1440 minut ÷ 24 minuty gry na sekundę).
- Minuta jest **ułamkowa** — do wyświetlania służy `clockHHMM`, bo surowy wydruk
  daje `08:5.9936800001`.
- Rok ma 12 miesięcy o prawdziwej długości (`DAYS_IN_MONTH`), bez lat przestępnych.
- **Czas płynie tylko na mapie** (reguła od v0.99.0, decyzja użytkownika). Jedyny
  zegar to `advanceTime`, wołany wyłącznie przez `WorldEngine`, a ten jest
  budowany wyłącznie przez `MainMapScene`. Port, bitwa, szturm, obrona i każde
  menu zatrzymują albo pauzują czartę, więc **każdy termin w dniach** — kontrakty,
  zlecenia, dzierżawa (30), dola załogi (60), wyprawy, gubernatorzy, dzienny tik
  gospodarki — liczy dni spędzone na mapie. Pilnuje tego `world_clock.test.ts`.

### Ery

Wybierane przy tworzeniu postaci; decydują o roku startu i o tym, jakie wojny
są już w toku.

| era | rok startu |
|---|---|
| `silver_empire` | 1560 |
| `merchants_smugglers` | 1600 |
| `new_colonists` | 1620 |
| `war_for_profit` | 1640 |
| `buccaneer_heroes` | 1660 |
| `pirates_sunset` (domyślna) | 1680 |

Trzy ery otwierają się **wewnątrz** trwającej wojny; domyślna 1680 otwiera się
w pokoju, więc to jedyna szybka droga do zobaczenia mechanik wojennych jest
`?era=merchants_smugglers`.

### Korony i ich wzajemne nastawienie

Macierz `FACTIONS[x].relations` — punkt wyjścia dyplomacji, symetryczna:

| | Hiszpania | Anglia | Francja | Holandia | Piraci |
|---|---|---|---|---|---|
| **Hiszpania** | — | −30 | −20 | −10 | −80 |
| **Anglia** | −30 | — | −10 | +10 | −60 |
| **Francja** | −20 | −10 | — | 0 | −50 |
| **Holandia** | −10 | +10 | 0 | — | −40 |

---

## 2. Kapitan

### Umiejętności

Pięć umiejętności, przy tworzeniu postaci rozdziela się punkty premiowe.

| stała | wartość | znaczenie |
|---|---|---|
| `CaptainState.SKILL_DEFAULT` | 5 | wartość wyjściowa każdej umiejętności |
| `CaptainState.SKILL_MIN` | 1 | dół skali |
| `CaptainState.SKILL_MAX` | 10 | góra skali |
| `CaptainState.SKILL_BONUS_POINTS` | 10 | ile punktów gracz rozdaje |

Co która umiejętność naprawdę robi:

| umiejętność | czytelnik | efekt |
|---|---|---|
| `fencing` | `DuelSystem` | przewaga w pojedynku |
| `gunnery` | `CombatSystem.gunneryAccuracy`, ostrzał murów | celność dział |
| `navigation` | `WeatherSystem.navigatedWindModifier` | prędkość **ostro na wiatr**; na baksztagu **zero** |
| `medicine` | `SurgeonSystem` | ilu rannych wraca do służby |
| `charm` | `RomanceSystem`, dialogi | zaloty, rozmowy |

Wszystkie trzy zaczepy z v0.47.0 są **wyśrodkowane na 5**, więc kapitan
z równo rozłożonymi punktami pływa dokładnie jak przed tamtym wydaniem.

### Wyszkolenie i starzenie

| stała | wartość | znaczenie |
|---|---|---|
| `CaptainState.TRAINING_DEFAULT` | 0.3 | wyszkolenie na starcie |
| `CaptainState.TRAINING_PER_DAY_AT_SEA` | 0.0005 | przyrost za dobę na morzu |
| `CaptainState.TRAINING_PER_WIN` | 0.02 | przyrost za wygraną walkę |
| `AgingSystem.AGE_SEASONED_FROM` | 35 | od tego wieku krzywa się zaczyna |
| `AgingSystem.AGE_DECLINING_FROM` | 50 | od tego wieku spadek przyspiesza |
| `AgingSystem.PHYSICAL_FLOOR` | 0.55 | podłoga dla szermierki i kanonierki |
| `AgingSystem.LEARNED_CEILING` | 1.3 | sufit dla nawigacji, uroku, medycyny |

**Zasięg praktyczny jest zerowy i to jest znane**: `startAge` to zawsze 20,
a doba gry trwa minutę realną, więc do pierwszego progu jest **45–91 godzin
samego żeglowania**. Zakładka Kapitan rysuje **surowe** `captain.skills[id]`,
nie `effectiveSkill` — arkusz przy 55 latach i szermierce 8 pokaże 8, a pojedynek
policzy 5,9. To jest **otwarta decyzja projektowa**, nie błąd do naprawienia
w biegu (TODO §4).

### Podział łupu

Załoga chce swojego udziału. Zaległość zjada morale.

| stała | wartość | znaczenie |
|---|---|---|
| `PlunderSystem.PLUNDER_INTERVAL_DAYS` | 60 | co ile dni załoga upomina się o udział |
| `PlunderSystem.PLUNDER_OVERDUE_MORALE_PER_DAY` | 0.004 | ile morale ubywa za dzień zwłoki |
| `PlunderSystem.PLUNDER_OVERDUE_MORALE_FLOOR` | 0.15 | poniżej tego morale nie spada |
| `PlunderSystem.CAPTAIN_SHARE_MIN` | 0.35 | najniższy udział kapitana |
| `PlunderSystem.CAPTAIN_SHARE_MAX` | 0.6 | najwyższy udział kapitana |
| `PlunderSystem.CREW_REMAINING_AFTER_SHARE` | 0.35 | jaka część załogi zostaje po wypłacie |

Podział odbywa się w tawernie i **kosztuje ludzi**: opłaceni marynarze schodzą
na ląd.

**Zaległość jest sufitem, nie upływem** (v0.71.0). `moraleCeiling(world)` mówi,
jak dobrze najlepiej może się czuć nieopłacona załoga — `1 − dni_zwłoki × 0,004`,
nie niżej niż 0,15 — i **wszystko, co podnosi morale, jest do tego przycinane**:
spiżarnia, kolejka w tawernie. Krzywa jest ta sama co wcześniej; różnica polega
na tym, że nie da się po niej wspiąć z powrotem.

Napisane jako upływ, nie robiło **nic**. `CrewConsumptionSystem` daje najedzonej
załodze 0,005 morale **na godzinę**, a zaległość zabierała 0,004 **na dzień** —
spiżarnia wygrywała trzydzieści do jednego i wystarczyło jej wystarczyć na
**czterdzieści osiem minut doby**. Zmierzone silnikiem: załoga 547 dni po
terminie podziału, z jedzeniem i wodą na pokładzie, ma **morale 1,000**.
Kolejka za 10 zł dokładała do tego 37 dni zaległości, czyli wyceniała cały
mechanizm na **ćwierć złotej monety dziennie**.

| stała | wartość | znaczenie |
|---|---|---|
| `PlunderSystem.moraleCeiling` | — | sufit morale nieopłaconej załogi |
| `PlunderSystem.raiseMorale` | — | jedyna droga, którą wolno podnieść morale |
| `CrewConsumptionSystem.MORALE_RECOVERY_FED` | 0.005 | **na godzinę**, gdy jest jedzenie i woda |
| `PortInteractionSystem.DRINKS_COST` | 10 | kolejka w tawernie |
| `PortInteractionSystem.MORALE_BOOST` | 0.15 | ile daje kolejka (do sufitu) |

Kolejka **odmawia**, gdy sufit jej nie przepuszcza, i nic nie kosztuje — płacenie
za liczbę, która się nie rusza, czyta się jak błąd. Stawia też **konsortom**:
grumrzą na tym samym zegarze od v0.19.0, a cieszył się dotąd tylko okręt
flagowy.

---

## 3. Statek i żegluga

### Dziewięć klas

Wszystkie liczby wprost z `SHIP_CLASSES` (`src/core/data/ships.ts`).
`speedBase` jest w jednostkach świata na tik.

| klasa | prędkość | skręt | kadłub | żagle | działa | ładownia | załoga min–max | cena | kąt martwy | maszt | takielunek | tonaż | zanurzenie | pancerz |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pinnace | 0.167 | 0.84 | 30 | 30 | 4 | 20 | 4–15 | 200 | 30° | 10 | Fore-and-aft | 30 | 1.0 | 0.10 |
| sloop | 0.208 | 0.72 | 60 | 50 | 8 | 40 | 8–30 | 500 | 35° | 15 | Fore-and-aft | 50 | 1.5 | 0.12 |
| barque | 0.188 | 0.54 | 70 | 60 | 12 | 80 | 12–40 | 800 | 45° | 20 | Mixed | 100 | 2.0 | 0.22 |
| brigantine | 0.229 | 0.60 | 80 | 70 | 16 | 60 | 15–50 | 1200 | 40° | 22 | Mixed | 120 | 2.5 | 0.28 |
| fluyt | 0.125 | 0.42 | 90 | 70 | 12 | 180 | 15–40 | 1500 | 55° | 22 | Square | 200 | 4.0 | 0.40 |
| frigate | 0.250 | 0.48 | 120 | 90 | 28 | 80 | 25–80 | 3000 | 50° | 30 | Square | 300 | 4.0 | 0.42 |
| fast_galleon | 0.188 | 0.36 | 150 | 100 | 24 | 100 | 30–100 | 4500 | 55° | 32 | Square | 400 | 4.5 | 0.50 |
| galleon | 0.167 | 0.30 | 180 | 120 | 36 | 150 | 40–120 | 6000 | 60° | 35 | Square | 500 | 5.5 | 0.60 |
| merchantman | 0.104 | 0.24 | 100 | 80 | 12 | 250 | 20–60 | 2000 | 60° | 25 | Square | 400 | 5.0 | 0.50 |

Czytelne wnioski dla gracza: fregata jest **najszybsza**, merchantman
**najwolniejszy i największa ładownia**, galeon **najcięższy**, pinasa i slup
**wchodzą wszędzie** (zanurzenie ≤ 1,5).

### Ożaglowanie

Cztery poziomy, `W`/`S` przechodzi między sąsiednimi.

| poziom | wartość płótna |
|---|---|
| Furled (zwinięte) | 0.00 |
| Reefed (refowane) | 0.33 |
| Half (połowa) | 0.50 |
| Full (pełne) | 1.00 |

Przejście między sąsiednimi poziomami trwa **2000 ms** przy pełnej obsadzie
(`SailSystem.TRANSITION_TIME_MS`, prywatna). Pozycja jest **ułamkowym indeksem**,
więc odwrócenie rozkazu w połowie kosztuje tylko to, co już postawiono —
spamowanie `W` nie daje darmowych żagli.

### Wiatr: diagram polarny

To jest serce żeglugi i **jedyna rzecz, którą gracz musi zrozumieć**.

- Każda klasa ma **kąt martwy** (`minWindAngle`, 30°–60° w tabeli wyżej). Dziobem
  w wiatr statek stoi, z resztką sterowności.
- Najszybszy punkt to **półwiatr**, około 90° od wiatru, **150%** prędkości bazowej.
- Z wiatrem (fordewind) **90–110%** — szybko, ale nie najszybciej.
- Halsowanie jest **opłacalne**: zysk nad dziobem w wiatr to 6,9× dla pinasy
  i 2,7× dla galeona.

| stała | wartość | znaczenie |
|---|---|---|
| `WeatherSystem.BEAT_CEIL` | 0.4 | pułap, powyżej którego krzywa jest identyczna jak przed v0.53.0 |
| `WeatherSystem.BEAT_RISE` | 12 | ile stopni od kąta martwego płótno się napełnia |
| `WeatherSystem.BEAT_SHAPE` | 0.5 | kształt tego napełniania |
| `WeatherSystem.IRONS_STEERAGE` | 0.05 | resztka sterowności dziobem w wiatr |
| `WeatherSystem.TRADE_WIND_REF` | 0.52 | siła pasatu, do której odnoszą się tabele |
| `WeatherSystem.NEUTRAL_NAVIGATION` | 5 | wartość nawigacji, przy której premia wynosi zero |
| `WeatherSystem.NAVIGATOR_GAIN` | 0.04 | ile jeden punkt nawigacji jest wart |

Kompas rysuje klin martwej strefy i **oba znaczniki najlepszego halsu**; HUD
pokazuje prędkość **nad dnem**, podpowiedź zwrotu i znos prądu. Wszystko jest
wyprowadzane z polary, nic nie jest zapisywane.

### Prądy

Sześć pasm (`CURRENTS`). Prąd **znosi statek** — nigdy nie rusza steru.
`C` rysuje je na czarcie.

| stała | wartość | znaczenie |
|---|---|---|
| `currents.CURRENT_FEATHER` | 120 | jak miękko pasmo wygasa na brzegu |

To dlatego szlak tam nie jest szlakiem z powrotem, a 30 z 78 tras nazwanych
statków ma nierówne połowy.

### Głębokość wody

| stała | wartość | znaczenie |
|---|---|---|
| `SeaDepth.DEPTH_CELL` | 32 | rozdzielczość siatki głębokości |
| `SeaDepth.OPEN_SEA_DEPTH` | 99 | głębokość „pełne morze" |
| `SeaDepth.HARBOUR_RADIUS` | 90 | promień pogłębionego kotwicowiska portu |
| `SeaDepth.SHOAL_CLEARANCE` | 1.5 | zapas pod kilem, poniżej którego jest ostrzeżenie |
| `SeaDepth.SHOAL_SPEED_MUL` | 0.75 | prędkość na płyciźnie |
| `SeaDepth.AGROUND_SPEED_MUL` | 0.25 | prędkość na mieliźnie |
| `SeaDepth.AGROUND_HULL_PER_TICK` | 0.12 | ile kadłuba ściera mielizna na tik |

**Wszystkie 45 podejść do portów leży w płyciźnie**, dlatego kotwicowiska są
pogłębione — inaczej fluyt nie wszedłby do żadnego miasta. Turkusowa półka na
mapie jest rysowana z **tego samego pola**, z którego liczone są sondowania:
obrazek jest mechaniką, nie ozdobą.

### Uszkodzenia

Kadłub i takielunek mają po cztery progi.

| kadłub | od | prędkość | skręt |
|---|---|---|---|
| sound | 75% | 1.00 | 1.00 |
| leaking | 50% | 0.88 | 0.85 |
| crippled | 25% | 0.70 | 0.65 |
| foundering | 0% | 0.45 | 0.45 |

| takielunek | od | prędkość |
|---|---|---|
| full | 75% | 1.00 |
| torn | 40% | 0.75 |
| tattered | 10% | 0.45 |
| dismasted | 0% | 0.00 |

| stała | wartość | znaczenie |
|---|---|---|
| `DamageSystem.FOUNDERING_HULL_LOSS_PER_TICK` | 0.0005 | tonący kadłub ubywa sam (~23 s do dna) |
| `DamageSystem.MAP_DISMASTED_CRAWL` | 0.15 | na mapie bez masztów statek pełznie, nie stoi |
| `DamageSystem.MIN_AFLOAT_HULL` | 1 | kadłub na mapie **nigdy** nie stoi w zerze |

`MIN_AFLOAT_HULL` to cała różnica między statkiem, który dokuśtyka do portu,
a zapisem nie do kontynuowania: przy 0 kadłuba nie ma ciągu, nie ma naprawy
w morzu i nie ma jak dopłynąć do stoczni.

### Naprawa w morzu

| stała | wartość | znaczenie |
|---|---|---|
| `ShipRepairSystem.SEA_REPAIR_HULL_CAP` | 0.5 | dokąd cieśla doprowadzi kadłub |
| `ShipRepairSystem.SEA_REPAIR_SAILS_CAP` | 0.6 | dokąd doprowadzi takielunek |
| `ShipRepairSystem.SEA_REPAIR_HULL_PER_DAY` | 0.025 | tempo naprawy kadłuba |
| `ShipRepairSystem.SEA_REPAIR_SAILS_PER_DAY` | 0.035 | tempo naprawy takielunku |
| `ShipRepairSystem.SEA_REPAIR_MIN_CREW_FRAC` | 0.2 | poniżej tej obsady nikt nie naprawia |
| `ShipRepairSystem.RESCUE_FRACTION` | 0.4 | jaka część załogi zatopionego statku jest wyławiana |

---

## 4. Załoga

`crewMin` z tabeli klas **nie jest dekoracją** od v0.49.0. Niedobór rąk zabiera
**sterowność wcześniej niż prędkość**.

| obsada | od ilu × `crewMin` | prędkość | skręt | czas zmiany żagli |
|---|---|---|---|---|
| full | 1.00 | 1.00 | 1.00 | ×1.0 |
| short | 0.70 | 0.92 | 0.75 | ×1.6 |
| skeleton | 0.40 | 0.78 | 0.50 | ×2.4 |
| unworkable | 0.00 | 0.65 | 0.30 | ×3.5 |

| stała | wartość | znaczenie |
|---|---|---|
| `CrewSystem.PRESS_SHARE` | 0.5 | jaka część pokonanej załogi daje się przymusić |
| `CrewSystem.PRESSED_MORALE` | 0.2 | z jakim morale przychodzą przymuszeni |

Pryz obsadza się **z własnego pokładu i z przymuszonych**. Slup obsadzi
brygantynę, ale nie galeon — taki pryz pełznie i ciągnie za sobą całą eskadrę.

### Ranni

| stała | wartość | znaczenie |
|---|---|---|
| `SurgeonSystem.WOUNDED_SHARE` | 0.4 | jaka część poległych trafia pod pokład, nie do morza |
| `SurgeonSystem.TEND_SHARE` | 0.3 | ilu rannych medyk obchodzi dziennie |
| `SurgeonSystem.SURVIVAL_BASE` | 0.45 | szansa przeżycia przy medycynie 0 |
| `SurgeonSystem.SURVIVAL_PER_SKILL` | 0.046 | ile dodaje punkt medycyny |

Przy `medicine` 5 lazaret oddaje **68%** rannych — to jest powód, dla którego
misja jezuicka „lecząca wszystkich" została odłożona: warta jest około
**jednego człowieka na walkę**.

---

## 5. Flota

| stała | wartość | znaczenie |
|---|---|---|
| `FleetSystem.MAX_FLEET_SIZE` | 3 | flagowiec + dwie konsorty |
| `FleetSystem.FLEET_CREW_FRACTION` | 0.8 | ile ludzi dostaje nowa konsorta |
| `FleetSystem.FLEET_DEFAULT_MORALE` | 0.8 | morale świeżej konsorty |
| `FleetSystem.GREEN_CREW_PENALTY` | 0.15 | kara za zieloną załogę pryzową |
| `FleetSystem.GREEN_CREW_FLOOR` | 0.2 | podłoga tej kary |

- **Prędkość floty = najwolniejszy kadłub.**
- **Wzrok floty = najwyższy maszt.**
- Konsorty mają własną załogę, morale i wyszkolenie (`FleetShip.crew/morale/training`),
  ważone ludźmi przy oblężeniach.
- **Ładownia jest własnością eskadry, nie flagowca** (v0.77.0).

### Partie: tona, dziesięć, wszystko

Lada kupca (v0.76.0) i magazyn (v0.78.0) mówią tym samym słownictwem: **samo
naciśnięcie to tona, `Shift` dziesięć, `Ctrl` tyle, ile zniesie druga strona**.
Magazyn przesuwał przedtem płaskie dziesięć ton — trzydzieści naciśnięć na
opróżnienie trzystutonowej szopy rodzinnej i żadnego sposobu na jedną tonę.

Modyfikator jest bezpieczny dopiero od v0.78.0: przedtem naciśnięcie
z wciśniętym `Shift` docierało do handlera **trzy razy** (szczegóły i pomiar
w dokumencie 10).

### Jedna ładownia na eskadrę

`HoldSystem` jest jedynym miejscem, które wie, ile eskadra uniesie. Flagowiec
**napełnia się pierwszy i opróżnia pierwszy**, więc kapitan pływający sam widzi
dokładnie to, co widział zawsze.

| funkcja | co mówi |
|---|---|
| `squadronCap` | suma `cargoCap` flagowca i wszystkich konsort |
| `squadronStowed` | tony na wszystkich pokładach |
| `squadronRoom` | ile jeszcze wejdzie |
| `squadronHeld` | ile danego towaru wiezie eskadra, gdziekolwiek leży |
| `stowInSquadron` | ładuje flagowiec, potem konsorty; oddaje to, co się nie zmieściło |
| `drawFromSquadron` | zdejmuje z flagowca, potem z konsort |
| `detachConsort` | hull odchodzi — ładunek przechodzi do pozostałych, reszta idzie z nią |

Czytają to: nagłówek portu, manifest w kajucie, kolumna **Masz** na ladzie,
magazyn (rodzinny i wynajęty), kantor frachtowy, rozmiar zlecenia odsieczy
i pryz.

**`FleetShip.cargo` jest opcjonalne** i czytane przez `consortCargo()`, które
odpowiada `{}` — zapis sprzed v0.77.0 ma puste konsorty, bo nie było gdzie nic
włożyć, więc migracja nie ma czego wymyślać.

**Pryz jest twój z ładownią.** `SALVAGE_TAKEN = 1` nosi komentarz *„she is
yours, hold and all"* od v0.22.0, a kod wyrzucał do wody wszystko, co nie
mieściło się u flagowca. Zmierzone na pospolitym czterdziestotonowym slupie:
**54% ładunku każdego pryzu szło za burtę**, a przy pełnym statku handlowym
**185 z 225 ton (82%)**. Kadłub, który dołącza do floty, wiezie teraz to, co
by przepadło.

**A co wiezie konsorta, idzie tam, gdzie ona.** Sprzedana w stoczni sprzedaje
się z ładunkiem, porzucona na morzu idzie z nim na dno; do pozostałych kadłubów
przechodzi tyle, ile się w nich zmieści, a dziennik nazywa tony, które przepadły
(`event.escort_cargo_lost`).

---

## 6. Pogoda

### Szkwał

| stała | wartość | znaczenie |
|---|---|---|
| `WeatherSystem.SQUALL_WIND_BOOST` | 0.3 | tyle szkwał dokłada do wiatru, który wieje (raz, nie co tik — do v0.99.0 sumowało się do 1,0; dziś średnio 0,85) |
| `StormSystem.STORM_SAFE_SAIL` | 0.33 | powyżej tego płótna szkwał je drze |
| `StormSystem.STORM_RIG_SHARE_PER_TICK` | 0.0004 | ile takielunku ubywa na tik |
| `StormSystem.STORM_VISION_SHARE` | 0.55 | do ilu spada luneta |

**Czterostopniowa drabina, po raz pierwszy (v0.92.0).** Próg był do v0.91.0
równy **0,5** — a `SAIL_LEVELS` to Zwinięte 0,00, **Refowane 0,33**, Pół 0,50,
Pełne 1,00 — więc stał **dokładnie na jednej z czterech wartości, które miał
stopniować**, a `over <= 0` czyniło tę wartość darmową. Prędkość na mapie jest
liniowa w `sailLevel`, więc **Refowane były ściśle zdominowane przez Pół**:
wolniejsze i ani o włos bezpieczniejsze. Cztery nazwane stopnie dawały dwie
odpowiedzi, a komunikat *„Refuj albo zapłać stengami"* prosił o tę, która nic
nie dawała.

| stopień | płótno | prędkość | ubytek takielunku w medianowym szkwale (360 tików) |
|---|---|---|---|
| Zwinięte | 0,00 | 0% | 0% |
| Refowane | 0,33 | 33% | 0% |
| Pół | 0,50 | 50% | **3,7%** (przedtem 0%) |
| Pełne | 1,00 | 100% | 14,4% (najgorszy szkwał 24%) |

Szkwał trwa **120–600 tików**. HUD mówi teraz „za dużo płótna" także przy
Pół — bo to prawda.

### Huragan

Zdarzenie świata, które jest **prawdziwą pogodą**: jedno oko idące drogą przez
ostrzeżone miasta, z pierścieniem i trasą na czarcie.

| stała | wartość | znaczenie |
|---|---|---|
| `WeatherFieldSystem.HURRICANE_RADIUS` | 260 | promień oka |
| `WeatherFieldSystem.HURRICANE_WIND` | 1 | siła wiatru w oku |
| `WeatherFieldSystem.HURRICANE_RIG_SHARE_PER_TICK` | 0.0006 | darcie płótna |
| `WeatherFieldSystem.HURRICANE_HULL_SHARE_PER_TICK` | 0.0004 | ubytek kadłuba |
| `WeatherFieldSystem.HURRICANE_VISION_SHARE` | 0.3 | do ilu spada luneta |
| `WeatherFieldSystem.ZONE_WIND_PULL` | 0.45 | jak mocno strefy mapy ciągną pasat |

**Droga oka (v0.90.0).** Trzy ostrzeżone miasta to nie sąsiedztwo, tylko trasa.
Do v0.89.0 wybierał je `pickNeighbours` — sześć **najbliższych** miast w promieniu
700 — i wychodziła z tego droga o medianie **465 jednostek**, którą oko
przechodziło przez 3–7 dni z medianową prędkością **93 jednostek na dobę**.
To mniej niż robi w dobę **każdy** kadłub w grze (najwolniejszy, merchantman, ma
średnio 95 po wszystkich kursach i 190 na najlepszym), a **22% dróg było
krótszych niż własny promień burzy** — oko nie opuszczało koła, w którym
zaczynało. Od v0.90.0 trasę buduje `pickStormRoad`: **każdy odcinek co najmniej
jeden promień burzy** (`STORM_MIN_LEG` = 260), a kolejne miasto wybierane jest
spośród najbliższych **poprzedniemu**, nie pierwszemu — więc droga nie zawraca.
Zmierzone po zmianie: mediana drogi **916**, oko **188 jednostek na dobę**, ani
jednej burzy stojącej w miejscu.

Promień **260** jest przy tym **najmniejszym** z trzech zasięgów tej skali:
kordon blokady to 320, a odległość, z której kapitan rzuca ludzi na plażę, 400.
Koło ma 520 px średnicy — **osiem lunet** i 2,4 ekranu przy domyślnym
przybliżeniu — i stoi nad **2,8%** żeglownego morza. Mediana odległości portu do
najbliższego sąsiada to **101 px**, więc jedno koło nakrywa medianowo **3** inne
miasta, a na Małych Antylach **8**.

### Mgła

Pierwsza pogoda, która **nie jest zagrożeniem**: nie zabiera statkowi nic, za to
tnie wzrok **obu stronom**.

| stała | wartość | znaczenie |
|---|---|---|
| `FogSystem.FOG_MAX_WIND` | 0.75 | powyżej tej siły wiatru mgły nie ma |
| `FogSystem.FOG_VISION_SHARE` | 0.35 | do ilu spada luneta gracza |
| `FogSystem.FOG_AWARENESS_SHARE` | 0.45 | do ilu spada czujność NPC |
| `FogSystem.FOG_CELL` | 420 | rozdzielczość pola mgły |
| `FogSystem.FOG_PATCH_FLOOR` | 0.35 | próg, od którego łata mgły istnieje |
| `FogSystem.FOG_PATCH_CEIL` | 0.8 | i góra pola szumu: wyżej komórka jest zamglona całkowicie |

> **Poprawione w v0.89.0 — do tego wydania mgły nie było w ogóle.** Próg wiatru
> wynosił **0,35**, a `updateWeather` robi morze, którego `windStrength` ma
> średnią **0,543** i w 54 dobach symulacji **ani razu** nie zeszło poniżej
> **0,174**. Pierwszy z trzech warunków mgły spełniał się na **40 z 27 000**
> próbek (0,15 %), a mgła na tyle gęsta, żeby ją zgłosić, nie powstała
> **ani razu**.
> 
> Drugi ogranicznik: `fogDensity` to **iloczyn trzech czynników**, a oba udziały
> wyżej są pisane dla gęstości **1**. Pole szumu ma średnią **0,492** i
> najwyższą zmierzoną wartość **0,837**, więc normalizacja względem 1 przy progu
> 0,55 dawała w najlepszej komórce Karaibów **0,64** — a iloczyn trzech takich
> czynników nie mógł osiągnąć jedynki **z konstrukcji**. Najgrubsza ława w całym
> przemiataniu prógów: **0,32**.
> 
> Po zmianie: mgła zgłoszona na **14,3 %** próbek (było 0 %), najgrubsza ława
> **0,40**, luneta kapitana **48,8 → 43,0**.
| `FogSystem.FOG_VISIBLE` | 0.12 | gęstość, przy której gracz ją widzi |
| `FogSystem.FOG_LIFTED` | 0.05 | gęstość, przy której komunikat znika |

### Wzrok

`visionRangeForMast(maszt) = BASE_VISION + maszt × RANGE_PER_METER`
(`VisionSystem`). Czyli pinasa (maszt 10) widzi ~36, slup (15) ~42, galeon (35)
~65 jednostek — i **65 to najdalej, jak ktoś w tej grze widzi**. Mgła i sztorm
mnożą ten zasięg przez swoje udziały powyżej; `playerVisionRange(world)` składa
to razem: najwyższy maszt eskadry razy pogoda w miejscu, gdzie gracz stoi.

| stała | wartość | znaczenie |
|---|---|---|
| `VisionSystem.BASE_VISION` | 25 | wzrok bez masztu |
| `VisionSystem.RANGE_PER_METER` | 1.14 | jednostek horyzontu za każdy metr masztu |

> Do v0.87.0 ta funkcja mieszkała w `src/game/render/WorldRenderer.ts`, obok
> kodu ustawiającego przezroczystość sprite'a. `core/` nie może jej stamtąd
> zaimportować, więc każdy moduł reguł, który potrzebował wiedzieć, co kapitan
> widzi, **opisywał to prozą** — i jeden z nich opisał źle o rząd wielkości.

---

## 7. Port i lady

W porcie jest sześć lad plus garnizon, gdy gracz trzyma miasto:

| lada | co daje |
|---|---|
| **Gubernator** | list kaperski, zlecenie obrony, spichlerz, córka, ułaskawienie, emerytura |
| **Tawerna** | werbunek, plotki, kolejka, mapa skarbu, podział łupu, informator, wątek rodzinny |
| **Kupiec** | kupno i sprzedaż towaru |
| **Kantor frachtowy** | przewóz na zlecenie |
| **Stocznia** | kadłuby, naprawa, klarowanie |
| **Magazyn** | wynajem (100–500 ton wg miasta), czynsz na 30 dni |
| **Garnizon** | tylko w zdobytym mieście: siła obrony, szanse, co nadciąga |

Nagłówek portu niesie **linię notowań** (jeden fakt decydujący o pięciu ladach)
i **linię głodu**, gdy miastu zabrakło importu.

| stała | wartość | znaczenie |
|---|---|---|
| `StorehouseSystem.LEASE_DAYS` | 30 | na ile dni idzie czynsz |
| `HomePortSystem.WAREHOUSE_CAP` | 300 | pojemność magazynu w porcie macierzystym |
| `PortInteractionSystem.GRANARY_REPUTATION` | 8 | reputacja za sprzedaż zboża do spichlerza |
| `FamilyQuestSystem.INFORMER_PRICE` | 200 | ile bierze informator za wieść o rodzinie |
| `PortInteractionSystem.FLEET_RESALE_SHARE` | 0.4 | ile ceny katalogowej stocznia płaci za kadłub z Twojej floty |
| `PortAccessSystem.SNEAK_BASE` | 0.5 | podstawa szansy wślizgnięcia się do wrogiego portu pod obcą banderą |
| `PortAccessSystem.SNEAK_PER_MORALE` | 0.3 | ile dokłada morale załogi (0–1) |
| `PortAccessSystem.SNEAK_PER_NOTORIETY` | 0.005 | ile odbiera każdy punkt sławy |
| `PortAccessSystem.GATE_FIGHT_LOSS_SHARE` | 0.25 | ile sakiewki zabiera straż, gdy przegrasz z nią pojedynek przy bramie |
| `FamilyQuestSystem.FAMILY_GUARDS_MEN` | 30 | ludzie markiza w domu, gdzie trzymają krewnego… |
| `FamilyQuestSystem.FAMILY_GUARDS_OF` | 45 | …na tylu (szermierka z `enemyFencingFor`, plus sława) |

**Wślizgnięcie się do wrogiego portu** (v0.99.7): przy 80% morale i bez sławy trzy
razy na cztery, przy sławie 100 raz na cztery. Nieudane — straż rozpoznaje banderę
i wychodzi **straż**: pojedynek (v0.99.8, decyzja użytkownika), szermierka straży z obrony miasta
(`enemyFencingFor(obrona, 100, sława)`). Wygrana — wchodzisz; przegrana — straż zabiera ¼ sakiewki
i brama jest zamknięta; zostaje szturm albo odpłynięcie. Do v0.99.7 porażka
otwierała **bitwę morską z portem** — przeciwnikiem bez kadłuba, załogi i dział,
którego nie dało się ani trafić, ani pokonać.


---

## 7a. Czterdzieści pięć portów

Dwadzieścia cztery hiszpańskie, dziesięć angielskich, osiem francuskich, trzy
holenderskie. **Żaden nie zaczyna pod czarną banderą** — korsarze rodzą się
z osiemnastu przystań wskazanych osobno, nie z właściciela portu.

### Co znaczą dwa poziomy

**Poziom rynku (1–5)** decyduje o trzech rzeczach naraz:

| | wzór | zakres |
|---|---|---|
| cena bazowa | `× (0,9 + poziom × 0,05)` | ×0,95 … ×1,15 |
| produkcja dzienna | `(2 + poziom × 2) × (0,5 + bogactwo/1800)` | **2–12** jednostek |
| pojemność magazynu | `8 dni własnej produkcji` dla tego, co uprawia (`PRODUCER_COVER_DAYS`, podłoga 20 t; v0.75.0) | 20–96 t |
| … dla tego, co importuje | `20 dni własnej konsumpcji`, nie mniej niż 12 t | 12–90 t |

> **Poprawka do własnego wiersza z v0.65.0.** Było tu „4–12", bo `2 + poziom × 2`
> daje 4–12 przy poziomach 1–5. Ale `baselineProductionRate` mnoży jeszcze przez
> `0,5 + min(1, bogactwo/900) × 0,5`, więc biedny port robi **połowę** tego —
> osiadły zakres to **2–12**, i tak było napisane w podręczniku w grze, zanim
> v0.65.0 to „poprawiła". Liczba jest teraz sprawdzana z obu stron.
> (Przy pustej szopie dochodzi jeszcze `RESTOCK_SURGE`, czyli do ×2.)

Do tego towar **uprawiany** na miejscu jest tańszy o 30% (`PRODUCE_MODIFIER`
0,7), a **potrzebny** droższy o 40% (`DEMAND_MODIFIER` 1,4). To jest cały
handel w jednym zdaniu: kup tam, gdzie rośnie, sprzedaj tam, gdzie tego chcą.

**Poziom stoczni (1–4)** decyduje, jakie kadłuby stoją na sprzedaż:

| poziom | co sprzeda |
|---|---|
| 1 | pinasa, slup |
| 2 | + barka, brygantyna, fluyt |
| 3 | + merchantman, fregata |
| 4 | + szybki galeon, galeon |

Rozkład poziomów stoczni: **24** porty mają poziom 1, **12** poziom 2, **6**
poziom 3, a poziom 4 — czyli **galeona** — mają **trzy**: Hawana, Kartagena
i Port Royale. Fregatę albo merchantmana kupisz w dziewięciu miastach.

### Tabela

Nazwy towarów są identyfikatorami z kodu (`sugar_cane`, `tobacco`, `cocoa`,
`rum`, `food`, `water`); instrukcja dla gracza je tłumaczy.

**Jedno miasto jest nie do dopłynięcia (v0.91.0).** `panama` leży na 8°57'N
79°30'W, czyli po stronie **Pacyfiku** — tam stało miasto, które Morgan
złupił w 1671, przemaszerowawszy przez przesmyk. Jego karaibskie odpowiedniki,
Puerto Bello i Nombre de Dios, są osobnymi pozycjami tej tabeli. Zmierzone na
prawdziwym wybrzeżu: Panama jest osiągalna z **0 z pozostałych 44 portów**
i ma **0 szlaków handlowych**, mimo rynku poziomu 5. W danych nosi
`landlocked: true`, a `geography.test.ts` pilnuje, że **zbiór miast z tą flagą
jest dokładnie zbiorem miast bez drogi morskiej** — przesunięcie miasta bez
przesunięcia flagi zapala test.

Cokolwiek wymaga kilu, omija je: **łańcuch rodzinny** (losuje trzy z siedmnastu
hiszpańskich miast — do v0.90.0 stawiał etap w Panamie **17,6% kapitanom**),
**zlecenie dostawy** u informatora (13 tawern leży w `RELIEF_REACH`, Puerto
Bello o **119 px** i bez żadnej drogi morskiej, a miasto bez szlaków jest
trwale najbardziej potrzebujące w zasięgu) oraz **kampania korony**. Pogoda,
wiadomości i ceny kilu nie potrzebują i działają tam normalnie.

| klucz | nazwa | korona | typ | rynek | stocznia | produkuje | potrzebuje |
|---|---|---|---|---|---|---|---|
| `havana` | Hawana | Hiszpania | miasto | 5 | 4 | sugar_cane tobacco rum | food water cocoa |
| `santiago` | Santiago | Hiszpania | miasto | 3 | 2 | sugar_cane rum | food water tobacco |
| `santo_domingo` | Santo Domingo | Hiszpania | miasto | 4 | 3 | sugar_cane cocoa | food water rum |
| `san_juan` | San Juan | Hiszpania | forteca | 4 | 3 | sugar_cane rum | food water cocoa |
| `cartagena` | Kartagena | Hiszpania | forteca | 5 | 4 | cocoa sugar_cane | food water rum |
| `porto_bello` | Puerto Bello | Hiszpania | forteca | 4 | 3 | cocoa | food water rum tobacco |
| `panama` | Panama | Hiszpania | miasto | 5 | 3 | cocoa sugar_cane | food water rum tobacco |
| `vera_cruz` | Vera Cruz | Hiszpania | miasto | 4 | 3 | sugar_cane tobacco | food water cocoa rum |
| `campeche` | Campeche | Hiszpania | miasto | 3 | 2 | tobacco sugar_cane | food water rum |
| `maracaibo` | Maracaibo | Hiszpania | miasto | 3 | 2 | cocoa tobacco | food water rum |
| `cumana` | Cumaná | Hiszpania | miasto | 2 | 1 | cocoa | food water rum tobacco |
| `trinidad` | Trynidad | Hiszpania | miasto | 2 | 1 | sugar_cane cocoa | food water rum |
| `gran_granada` | Gran Granada | Hiszpania | miasto | 3 | 2 | sugar_cane cocoa | food water rum |
| `caracas` | Caracas | Hiszpania | miasto | 4 | 2 | cocoa tobacco | food water rum |
| `gibraltar` | Gibraltar | Hiszpania | przystań | 1 | 1 | sugar_cane | food water rum |
| `margarita` | Margarita | Hiszpania | przystań | 2 | 1 | cocoa tobacco | food water rum |
| `nombre_de_dios` | Nombre de Dios | Hiszpania | przystań | 1 | 1 | cocoa | food water |
| `puerto_cabello` | Puerto Cabello | Hiszpania | przystań | 2 | 1 | cocoa | food water rum |
| `puerto_principe` | Puerto Príncipe | Hiszpania | miasto | 3 | 2 | sugar_cane tobacco | food water rum |
| `rio_de_la_hacha` | Río de la Hacha | Hiszpania | przystań | 1 | 1 | tobacco | food water |
| `santa_catalina` | Santa Catalina | Hiszpania | przystań | 1 | 1 | sugar_cane | food water |
| `santa_marta` | Santa Marta | Hiszpania | przystań | 1 | 1 | tobacco | food water |
| `st_augustine` | St. Augustine | Hiszpania | forteca | 2 | 1 | food | water rum tobacco |
| `villa_hermosa` | Villa Hermosa | Hiszpania | miasto | 3 | 2 | tobacco sugar_cane | food water rum |
| `port_royal` | Port Royale | Anglia | miasto | 4 | 4 | rum food | sugar_cane cocoa tobacco |
| `nassau` | Nassau | Anglia | miasto | 2 | 2 | rum | food water |
| `barbados` | Barbados | Anglia | miasto | 4 | 3 | sugar_cane rum | food water tobacco |
| `antigua` | Antigua | Anglia | miasto | 2 | 1 | sugar_cane | food water rum |
| `st_kitts` | St. Kitts | Anglia | miasto | 2 | 1 | sugar_cane | food water rum tobacco |
| `belize` | Belize | Anglia | przystań | 2 | 1 | rum | food water tobacco |
| `bermuda` | Bermudy | Anglia | przystań | 2 | 1 | food | water rum tobacco |
| `eleuthera` | Eleuthera | Anglia | przystań | 1 | 1 | rum | food water |
| `gran_bahama` | Gran Bahama | Anglia | przystań | 1 | 1 | rum | food water |
| `nevis` | Nevis | Anglia | przystań | 2 | 1 | sugar_cane | food water rum |
| `tortuga` | Tortuga | Francja | przystań | 2 | 1 | rum | food water |
| `martinique` | Martynika | Francja | miasto | 3 | 2 | cocoa sugar_cane rum | food water tobacco |
| `guadeloupe` | Gwadelupa | Francja | miasto | 3 | 2 | sugar_cane cocoa | food water rum |
| `petit_goave` | Petit Goâve | Francja | przystań | 2 | 1 | sugar_cane rum | food water cocoa |
| `port_de_paix` | Port de Paix | Francja | przystań | 2 | 1 | rum | food water sugar_cane |
| `florida_keys` | Florida Keys | Francja | przystań | 1 | 1 | food | water rum |
| `leogane` | Léogane | Francja | przystań | 2 | 1 | sugar_cane rum | food water |
| `montserrat` | Montserrat | Francja | przystań | 1 | 1 | sugar_cane | food water |
| `curacao` | Curaçao | Holandia | miasto | 3 | 2 | tobacco cocoa | food water sugar_cane |
| `st_eustatius` | St. Eustatius | Holandia | miasto | 3 | 2 | tobacco | food water sugar_cane rum |
| `st_martin` | St. Martin | Holandia | miasto | 2 | 1 | tobacco | food water rum |

---

## 8. Reputacja, dyplomacja i papiery

### Pięć progów

Reputacja jest **osobna dla każdej korony** i decyduje o pięciu ladach naraz.

| próg | zakres | spread | werbunek | fracht | magazyn | kadłuby | usługi |
|---|---|---|---|---|---|---|---|
| hostile | −100 … −60 | 0.30 | ×0 | nie | nie | **nie** | ×2.0 |
| unfriendly | −59 … −20 | 0.20 | ×0.4 | nie | nie | tak | ×1.3 |
| neutral | −19 … 19 | 0.12 | ×1 | tak | tak | tak | ×1.0 |
| friendly | 20 … 59 | 0.08 | ×1.25 | tak | tak | tak | ×0.9 |
| allied | 60 … 100 | 0.05 | ×1.5 | tak | tak | tak | ×0.8 |

*Spread to połowa różnicy między ceną kupna a sprzedaży; round trip to jego
podwojenie — 24% u neutralnego, 10% u sojusznika.*

**Start** (v0.99.0): własna korona **25** (`OWN_CROWN_START_BONUS`), piraci **−25**,
reszta 0. Do v0.99.0 było 20 i −20 — dokładnie na progach, więc pierwszy punkt
kariery zmieniał pasmo: w 12 z 84 startów jeden wzięty kupiec sojusznika spychał
własną koronę do neutralnej i zamykał dom gubernatora. Pierwszy kupiec wzięty
piratom (+6) dalej otwiera przystań: −25 + 6 = −19, neutralny.

**Rachunek zaokrągla się raz, na pieniądzach** (v0.76.0). Do tego wydania cena
jednostkowa była zaokrąglana **dwa razy** — w `spotPrice` i w `buyPrice` —
a rozpiętość jest ułamkiem małej liczby całkowitej. Zmierzone na 315
notowaniach osiadłego świata:

| |  |
|---|---|
| notowań, gdzie `ask === bid` u neutralnego | **47 (14,9%)** |
| notowań, gdzie **neutralny, przyjazny i sojusznik** dają te same dwie liczby | **90 (28,6%)** |
| mediana straty na tonę: wrogi / nieprzyjazny | 8 / 4 |
| …neutralny / przyjazny / sojusznik | **2 / 2 / 2** |

Połowa drabiny, która **karze**, działała; ta, która **nagradza**, nie — i im
lepszy standing, tym częściej lada nie umiała go wyrazić (zerowa rozpiętość na
47 notowaniach u neutralnego, 80 u przyjaznego, **126 u sojusznika**).

`askExact` / `bidExact` liczą cenę bez zaokrąglenia, a `tradeCost` /
`tradeProceeds` zaokrąglają **rachunek**. Dziesięć ton przy notowaniu 4 zł:

| standing | partia 10 t | tona po tonie |
|---|---|---|
| wrogi | **52** | 5 × 10 |
| neutralny | **45** | 4 × 10 |
| sojusznik | **42** | 4 × 10 |

**Lada handluje partiami** (v0.76.0): Enter to tona, **Shift** dziesięć,
**Ctrl** wszystko, co zniesie ładownia, kiesa i nabrzeże. Transakcja
przerysowuje ladę zamiast restartować miasto, więc kursor zostaje na wierszu,
a lada mówi, co zrobiła i za ile.

**Standing poniżej neutralnego jest ulicą jednokierunkową**: list kaperski
wymaga `friendly`, zlecenie obrony wymaga listu, córka wymaga `friendly`,
a kantor **nie ma pracy poniżej neutralnego w ogóle**. Zostaje jedno wejście:
miejski spichlerz, wart +8, i tylko gdy miasto przymiera głodem.

**Notowania są przycinane do −100…100 w jednym miejscu** — `changeReputation`.
Do v0.68.0 był jeden pisarz, który go omijał: sprzedaż zboża do spichlerza,
czyli **jedyna droga powrotna ze złych notowań**, a więc i ta, którą chodzi się
najczęściej. Kapitan stojący już na `sojuszniku` i ratujący kolejne głodujące
miasta szedł 99 → 105 → 111 → 117, a ekran gubernatora drukował
*„sojusznik (117)”* ze skali, która kończy się na stu. Pilnuje tego teraz test
czytający **źródło** całego `src`.

### Odprysk reputacji

Co zrobisz jednej koronie, czytają wszystkie pozostałe przez własne zatargi.

| stała | wartość | znaczenie |
|---|---|---|
| `DiplomacySystem.ACT_TRADER` | 1 | waga wzięcia kupca |
| `DiplomacySystem.ACT_NAVY` | 2 | waga wzięcia okrętu |
| `DiplomacySystem.ACT_CITY` | 5 | waga wzięcia miasta |
| `DiplomacySystem.ACT_SERVICE` | −2 | waga przysługi |

### Wojny i sojusze

| stała | wartość | znaczenie |
|---|---|---|
| `DiplomacySystem.WAR_RELATION` | −70 | relacja, poniżej której jest wojna |
| `DiplomacySystem.WAR_CHANCE_BASE` | 0.00035 | dzienna szansa wybuchu |
| `DiplomacySystem.HOSTILITY_FLOOR` | 0.25 | podłoga wrogości |
| `DiplomacySystem.WAR_MIN_YEARS` | 1 | najkrótsza wojna z kości |
| `DiplomacySystem.WAR_MAX_YEARS` | 4 | najdłuższa |
| `DiplomacySystem.PEACE_GRACE_DAYS` | 90 | karencja po traktacie |
| `DiplomacySystem.TREATY_DAYS` | 60 | ile trwa zdarzenie traktatu |
| `DiplomacySystem.HISTORICAL_LOOKAHEAD_DAYS` | 730 | jak daleko kalendarz blokuje kości |
| `DiplomacySystem.CO_BELLIGERENT` | 25 | ile daje wspólny wróg |
| `DiplomacySystem.CO_BELLIGERENT_MAX_WARS` | 2 | ile wojen naraz może to liczyć |
| `DiplomacySystem.ALLIANCE_HORIZON_DAYS` | 3650 | horyzont zdarzenia sojuszu |

**Sojusz to wspólny wróg i nic więcej** — stan jest wyliczany, stemplowany jest
tylko początek. Dwie korony mają wspólnego wroga przez **28,8% dni**, w epizodach
po średnio 16 miesięcy.

### List kaperski

| stała | wartość | znaczenie |
|---|---|---|
| `PrivateerSystem.PRIZE_PATRON_TRADER` | 5 | reputacja u patrona za pokryty pryz kupiecki |
| `PrivateerSystem.PRIZE_PATRON_NAVY` | 10 | za pokryty okręt |
| `PrivateerSystem.UNCOVERED_PATRON` | −8 | kara za pryz niepokryty |
| `PrivateerSystem.HOSTILE_REP_TRADER` | −10 | co traci się u ofiary |
| `PrivateerSystem.HOSTILE_REP_NAVY` | −20 | j.w. za okręt |
| `PrivateerSystem.BRETHREN_TRADER` | 6 | co zyskuje się u Bractwa |
| `PrivateerSystem.BRETHREN_NAVY` | 12 | j.w. |
| `PrivateerSystem.PRIVATEER_BRETHREN_SHARE` | 0.5 | ile z tego liczy się pod komisją |

Komisja jest **wyłączna** i egzekwowana przy ladzie. Papier patrona jest czytany
także **u jego sojusznika** — stopień wyżej, z powodem w nagłówku — ale tylko
od `neutral` w górę: sojusz ministrów nie jest amnestią.

### Ułaskawienie

| stała | wartość | znaczenie |
|---|---|---|
| `PardonSystem.GOVERNOR_NEW_DAYS` | 30 | jak długo nowy gubernator jest „nowy" |
| `PardonSystem.PARDON_FLOOR` | 0 | do jakiego poziomu podnosi (neutral, ani stopnia wyżej) |
| `PardonSystem.PARDON_PER_POINT` | 25 | cena za punkt drogi powrotnej |
| `PardonSystem.PARDON_NOTORIETY_MUL` | 1.0 | mnożnik ceny przy pełnej sławie |

Ułaskawienie jest **lokalne i kupowane**. Obejmuje to, co zrobiłeś przedtem,
i nic, co zrobisz potem. Nowy gubernator jest mianowany **około ośmiu razy
w roku** w całych Karaibach, więc zdarzenie **da się znaleźć** — stąd 30 dni
trwania: przy medianie przeprawy 5 dni wieść zdąży dojść.

---

## 9. Ekonomia

### Cena

```
cena = cena_bazowa × ratio × mnożniki_zdarzeń
ratio = clamp(popyt / podaż, 0.4, 3.0)
popyt = dzienna konsumpcja × 30 dni
podaż = stan magazynu + 1
```

| stała | wartość | znaczenie |
|---|---|---|
| `EventEffectsSystem.EVENT_WEALTH_CEILING` | 150 | ile punktów osiadłego bogactwa wolno zdarzeniu |
| `TradeLedgerSystem.GOLD_PER_WEALTH` | 200 | ile złota obrotu daje punkt bogactwa |
| `TradeLedgerSystem.MAX_TRADE_WEALTH_PER_DAY` | 6 | sufit dziennego przyrostu z handlu |
| `EconomyTickSystem.HUNGER_VISIBLE` | 0.08 | od jakiego niedoboru miasto mówi, że głoduje |

Ceny **przeliczają się przy każdym ruchu towaru**, nie raz na dobę: woła je
lada kupca, załadunek NPC i krok dokowania.

**Cena ×3 przy pustym magazynie i ×0,4 przy pełnym** — te dwie liczby są
w podręczniku w grze i są prawdziwe (`RATIO_MAX` / `RATIO_MIN`, prywatne
w `PricingSystem`).

**I da się go dosięgnąć od v0.67.0.** Do tego wydania magazyn na towar, którego
miasto nie uprawia, mieścił płaskie **30 ton**, podczas gdy „równowaga” to
**trzydzieści dni konsumpcji** (`DEMAND_HORIZON_DAYS`) — w stolicy do 135 ton.
Iloraz był więc przyklejony do sufitu niezależnie od stanu półki: **23 ze 130
notowań importowych nie mogły zejść z ×3 nigdy**. Skutek był gorszy niż sama
arytmetyka — **każde duże miasto płaciło to samo maksimum za wszystko, czego
chciało**, więc żadna lada nie była lepsza od innej, tablica newsów nie miała po
co istnieć, a miasto naprawdę głodujące wyglądało dokładnie jak najedzone.
Teraz sufit jest **stanem, nie warunkiem**: pusty magazyn → ×3, zaopatrzony →
w dół (Hawana: woda 15 → 8, jedzenie 24 → 12 złota za tonę).

### Magazyn i uzupełnianie

Producent odpowiada na pustą szopę od v0.26.0, importer od **v0.66.0**. Do tego
wydania zamówienie wynosiło dokładnie jedną dzienną konsumpcję, a czwarty przebieg
dnia zabierał dokładnie tyle samo — bilans zerowy, więc półka mogła iść tylko
w dół. Zmierzone: magazyn Hawany opróżniony z jedzenia i wody był pusty
**dwieście dni później**, podczas gdy rum, który miasto samo pędzi, wracał do
sufitu w trzydzieści.

| stała | wartość | znaczenie |
|---|---|---|
| `EconomyTickSystem.RESTOCK_SURGE` | 1.0 | ile razy mocniej pracuje plantacja przy pustej szopie |
| `EconomyTickSystem.IMPORT_RESTOCK_SURGE` | 1.0 | to samo po stronie importu (v0.66.0) |
| `EconomyTickSystem.EXPORT_RESERVE` | 0.15 | ile zapasu producent zostawia sobie, kto by nie prosił |
| `EconomyTickSystem.SHORTAGE_WEALTH_PER_ITEM` | 2 | ile bogactwa dziennie kosztuje brak **jednego** towaru |
| `EconomyTickSystem.IMPORT_SHARE_CROWN` | 1.0 | udział dostaw dla zwykłej kolonii |
| `EconomyTickSystem.IMPORT_SHARE_BLACK_FLAG` | 0.35 | udział dostaw dla miasta pod czarną banderą |
| `EconomyTickSystem.IMPORT_NOTORIETY_BONUS` | 0.4 | ile do tego dokłada pełna sława kapitana |
| `PricingSystem.DEMAND_HORIZON_DAYS` | 30 | ile dni konsumpcji znaczy „rynek w równowadze” |
| `PricingSystem.GOLD_WEALTH_PER_TON` | 450 | ile bogactwa na tonę złota dziennie, którą miasto spoza kopalni wchłania (v0.99.1) |
| `PricingSystem.GOLD_FLOAT_TONS` | 30 | złoto „już w rękach” miasta, doliczane do zapasu przy wycenie |
| `PricingSystem.PRODUCER_FULL_RATIO` | 0.5 | ile ceny bazowej bierze producent za własny towar przy pełnej szopie (v0.99.4) |
| `economyBaselines.IMPORT_COVER_DAYS` | 20 | ile dni własnego jedzenia trzyma miasto z importu |
| `economyBaselines.PRODUCER_COVER_DAYS` | 8 | ile dni **własnej produkcji** trzyma producent na nabrzeżu (v0.75.0) |

**Złoto poza kopalnią kupuje bogactwo miasta** (v0.99.1, decyzja użytkownika). Nikt
go nie je ani nie uprawia, więc do tego wydania dostawało zastępczy popyt 1 t/dzień
i przy pustej szopie **45 z 45** lad stało na suficie ×3 (biedne miasto 228, Hawana
276), a sprzedane zostawało na nabrzeżu na zawsze. Teraz popyt = bogactwo ÷ 450 t/dzień,
podaż = zapas + 30 t, a miasto co dzień wchłania swój apetyt. Zmierzone na osiadłym
świecie przy pustej ladzie: biedne **30**, skromne ~**55**, zamożne ~**115**, bogate
~**180**; 30 t sprzedane w Hawanie **3931** (było 5700), zapas znika w ok. 15 dni
(było: 30 t po 40 dniach). Kurs z kopalni (~77 za tonę) płaci się do bogatych portów.

**Towar producenta czyta szopę, a nie jej rozmiar** (v0.99.4, decyzja użytkownika).
Towar, który miasto uprawia i którego nie je, dostawał ten sam zastępczy popyt
30 t co złoto — przeciw szopie o rozmiarze 8 dni własnych zbiorów (20–96 t).
Cena była więc funkcją **wielkości** szopy i to odwrotnie: duzi producenci na
podłodze (cukier w Hawanie, Cartagenie, na Barbadosie po 3 przy bazowej 8;
**13 z 69** par na `RATIO_MIN`, gdzie pierwsze dwadzieścia ton kupionych nie
ruszało ceny), a mały **drożej od ceny bazowej** — kakao w Nombre de Dios 19
przy 13, tytoń w Rio de la Hacha 14 przy 10. Teraz cena = baza × 0,5 × szopa ÷
(zapas + 1): pełna szopa to połowa bazy, połowa szopy to baza, prawie pusta —
sufit. Żadna para na podłodze, żaden producent drożej od bazy przy pełnej szopie.
Koszt: suma bogactwa 45 miast −0,48%, cały z premii, którą zawyżona cena płaciła
małym plantatorom (Santa Marta 137 → 111, Florida Keys 115 → 102 — obie nad bazą 100).

**Dwadzieścia dni wybrane pomiarem**, nie z powietrza — przemiecione 10 / 15 /
20 / 30 / 45 / 90 na osiadłej dekadzie:

| dni | notowań przy ×3 | woda w Hawanie | kakao Caracas → Hawana |
|---|---|---|---|
| 10 | 23/130 | 41 t @ 15 | 6 → 96 (×16,0) |
| 15 | 0/130 | 63 t @ 11 | 6 → 68 (×11,3) |
| **20** | **0/130** | **86 t @ 8** | **6 → 50 (×8,3)** |
| 30 | 0/130 | 131 t @ 5 | 6 → 33 (×5,5) |
| 90 | 130/130 **przy podłodze** | 401 t @ 2 | import tańszy niż uprawa |

Dwadzieścia to pierwszy próg, przy którym nic nie jest przyklejone, a handel
kapitana dalej jest jawnie wart roboty. Dziewięćdziesiąt odwraca świat.

**Podłoga 12 ton** jest dla małego końca: placówka zjada 0,45 dziennie, więc
sama reguła pokrycia dałaby jej 9 ton. Dwanaście to u niej około miesiąca —
i świadomie **mniej niż dawne płaskie 30**, bo trzydzieści to było dla placówki
**sześćdziesiąt dni** pokrycia i sprzedawała importowane jedzenie po **3 złote**,
poniżej ceny bazowej towaru. Odległa kolonia płaci za to, co trzeba jej
przywieźć, **więcej**, nie mniej — i teraz tak jest (3 → 8).

**Świat startuje tam, gdzie żyje** (v0.67.0). `initPortInventory` dawał każdemu
portowi płaskie 30 ton tego, co uprawia, i 10 reszty, razy mnożnik zamożności —
więc każda nowa gra spędzała pierwsze miesiące na dochodzeniu magazynów do
poziomu, na którym i tak osiadają. Teraz start to **dziewięć dziesiątych sufitu**.

To nie jest kosmetyka: dochodzenie szło **przez księgę**, więc wyglądało jak
wzbogacenie świata. Cztery miasta strażnicze pokazywały +0,5 po v0.66.0 i +9,8 po
zmianie sufitu — **obie liczby były stanem przejściowym, nie równowagą**. Po
poprawieniu startu wszystkie cztery wracają dokładnie tam, gdzie zostawiła je
v0.42.0: **649,1 / 907,6 / 619,6 / 920,6**. Dwa wydania pracy nad magazynami
zmieniły ladę, a nie Karaiby.

### Szopa producenta ma **osiem dni jego własnej produkcji** (v0.75.0)

`inventoryCap` ma dwie gałęzie i v0.67.0 przepisała tylko tę importową. Gałąź
producenta została taka, jaka była: `marketLevel * 50`, czyli **150–250 ton**
przy producencie robiącym jakieś sześć ton dziennie.

Co to kosztowało, zmierzone na osiadłych Karaibach:

| |  |
|---|---|
| par (port, towar) stojących **na suficie** | **69 z 69** |
| produkcja wyrzucana dziennie na całej mapie | **440 ton** |
| towarów, których **nie zabiera żaden szlak** | **44 z 69** |
| notowań przyklejonych do **podłogi** `RATIO_MIN` | **61 z 69** |
| ile musiałby spaść zapas, żeby cena drgnęła | poniżej **32,7%** sufitu |
| o ile bunt niewolników (produkcja ×0,3 przez 60 dni) ruszał cenę | **0,0%** |

Z producenta nie ubywa nic prócz tego, co zabiorą szlaki — a dwie trzecie tego,
co ta mapa uprawia, nie ma **żadnego** klienta szlakowego. Zapas był więc
ustalany wyłącznie przez sufit i `productionMul` **nie miał którędy wejść**.
Podręcznik wymienia „produkcja ×0,3” i „×1,5” jako rzeczy, które kapitan widzi.

**Dwie zmiany, obie konieczne** (sprawdzone cofnięciem każdej z osobna — po
cztery czerwone testy):

1. sufit to `PRODUCER_COVER_DAYS` × własna produkcja (podłoga 20 t), czyli
   mediana **43 t** zamiast 150–250;
2. **roboczy** sufit schodzi razem z produkcją (`cap × min(1, productionMul)`),
   a zapas dochodzi do niego po dniu własnej produkcji dziennie — czyli około
   tygodnia, nie z dnia na dzień.

Osiem dni wybrane przemiataniem na osiadłym świecie:

| dni | sufit (mediana) | notowań przy podłodze | głodnych miast | bunt rusza cenę o | Hawana cukier | rozpiętość szlaku |
|---|---|---|---|---|---|---|
| 4 | 21 t | 0/69 | 0 | +210% | 48 t @ 5 | ×2,67 |
| 6 | 32 t | 20/69 | 0 | +225% | 72 t @ 4 | ×4,00 |
| **8** | **43 t** | **32/69** | **0** | **+225%** | **96 t @ 3** | **×4,50** |
| 12 | 64 t | 42/69 | 0 | +100% | 144 t @ 3 | ×5,40 |
| 20 | 107 t | 63/69 | 0 | +25% | 240 t @ 3 | ×5,50 |
| 30 (≈ stan sprzed) | 160 t | **69/69** | 0 | **0,0%** | 360 t @ 3 | ×5,50 |

Osiem to ostatni próg, przy którym **surowiec u źródła dalej kosztuje 3 złote**
(czyli handel kapitana jest nietknięty), i pierwszy, przy którym świat da się
poczuć. Cztery dni już podnoszą cenę u producenta i ścinają rozpiętość szlaku
do ×2,67 — czyli płaci się za to samym handlem. Podłoga w podłodze: **żadne
miasto nie zaczyna głodować** przy żadnej z tych wartości.

**Sufit nie rośnie przy dobrym roku.** Magazyn jest budynkiem: żniwa i boom
handlowy niosą własny `priceMul` i tam są odczuwalne.

**Nabrzeże mówi teraz, jakie to miasto.** Hawana trzyma 86 ton trzciny,
Nevis 29 — wcześniej obie miały szopę, której nie dało się opróżnić.

Osiadły świat drgnął o **mniej niż 1,1% i tylko w górę**: 649,1 → 651,1,
907,6 → 913,1, 619,6 → 626,1, 920,6 → 925,1. Mniejsza szopa oznacza, że szlak
ciągnący z niej zostawia zapas bliżej kolana krzywej cenowej, więc eksporter
dostaje odrobinę więcej za tonę. Sprawdzone przeciwko lekcji z v0.67.0 —
liczby są **identyczne w dniu 400 i w dniu 900**, czyli to równowaga, a nie
stan przejściowy.

**Notowanie jest funkcją zapasu, który za nim stoi** (v0.67.0). Dzienny tick
liczył cenę, a zaokrąglał zapas **po** niej — więc lada podawała cenę policzoną
z 27,24 tony, mając na półce 27,2. Każda transakcja woła `repriceItem`, który
liczy z tego, co leży, więc cena potrafiła drgnąć o złotówkę **bez ruchu
towaru**. Zaokrąglenie idzie teraz przed wyceną.

**Czego pomiar **nie** kazał ruszać** (v0.66.0 — **nieaktualne od v0.75.0**, gdzie sufit producenta stał się ośmioma dniami własnej produkcji). Sufit producenta (`poziom × 50`)
przemieciony tak samo — ×50 / ×20 / ×10 — i został przy ×50: przy ×10 cena
u producenta rośnie tak, że **szlak się odwraca** (rum kupowany w Port Royale
za 7, sprzedawany w Hawanie za 5). Mnożnik głodu też został przy ×2 — bo to
nie on był zły: przy żywym ilorazie głód daje teraz **krzywą** 12 → 28 → 45
(×2,3 w pięć dni, ×3,75 po dwóch miesiącach), a nie natychmiastowe podwojenie
ceny, która i tak stała na suficie. Podręcznikowe *„dwa do czterech razy”* jest
dzięki temu prawdą pierwszy raz.

**Uzupełnianie jest zawieszone poniżej pełnej dostawy.** Dowóz ponad dzienną
potrzebę to właśnie ten handel, który kordon, czarna bandera i wojna wstrzymują —
i na tym polegało ich ukąszenie, bo działały przez zostawianie miastu dziennego
deficytu przy zerowym buforze. Miasto, któremu przerwano handel, **wydaje** swój
magazyn, nie napełnia go.

### Siedem towarów

| towar | cena bazowa | kategoria |
|---|---|---|
| sugar_cane | 10 | trade |
| tobacco | 15 | trade |
| cocoa | 20 | trade |
| rum | 12 | trade |
| food | 5 | supply |
| water | 3 | supply |
| **gold** | 80 | trade, `rare` |

**Towar nie ma wagi** (v0.77.0). `ItemDef.weight` istniał od pierwszej wersji,
miał **dwóch** czytelników i żaden nie był regułą pojemności: oba porównywały
`weight × ilość` z sumą **ton** już załadowanych. Wychodziła z tego nie
pojemność, tylko dławik na pojedynczą transakcję — pusty czterdziestotonowy slup
brał 20 ton trzciny, potem 10, 5, 2, 1 i 1, czyli **sześć naciśnięć „wszystko"
i 39 z 40**. Trzcina (`weight: 2`) jest uprawiana w **23 z 45** portów.
Odwrotna droga — żeby waga zaczęła znaczyć — została **odrzucona po pomiarze**:
zysk na jednostkę ładowni na osiadłej mapie wynosi wtedy 3 dla cukru przy 9 dla
tytoniu, 12 dla rumu i 13 dla kakao, a cukier jest już najsłabszy na tonę
(6 przy 13 kakao). Najczęściej uprawiany towar mapy stałby się towarem, którego
nikt nigdy nie wozi. **Ładownia liczy tony** — tę samą jednostkę, którą liczyły
już `Validation`, `PrizeSystem` i proporczyk ładunku.

Złota **nie trzyma żadna lada** — pojawia się wyłącznie po odkryciu złoża
(`gold_discovery` dopisuje je do `bonusProduces`).

**Wody nie produkuje żaden port.** Czterdzieści cztery miasta mają ją w popycie
i ani jedno w produkcji, więc nie ma dla niej żadnego szlaku: dociera ścieżką
dla przemytników (`from === undefined`), napisaną dla blokad. Skutek jest
mechaniczny i wart znajomości: **miasto można zagłodzić, ale nie wysuszyć** —
żaden kordon, żadna czarna bandera i żadna wojna nie odetną wody.

### Szlaki handlowe

81 szlaków (pod vitestem, bez lądu, wychodzi 85 — kursy są wtedy prostymi
i mieszczą się w limicie długości), nazwany dostawca na towar **z wyjątkiem
wody**, kurs liczony **czasem przejścia**, nie milami — dostawca dwieście mil dalej, ale z prądem, jest bliżej w jedynym
sensie, który obchodzi szypra. Szlak jest **jednokierunkowy**.

| stała | wartość | znaczenie |
|---|---|---|
| `TradeRouteSystem.LANE_FULL` | 1 | pełne pokrycie szlaku |
| `TradeRouteSystem.DISRUPTION_PER_PRIZE` | 0.3 | ile jeden wzięty pryz psuje szlak |
| `Pathfinding.SEA_CELL` | 40 | rozmiar komórki siatki A* |
| `Pathfinding.PASSAGE_SPEED` | 0.125 | prędkość odniesienia przy wycenie przeprawy |

### Blokada

| stała | wartość | znaczenie |
|---|---|---|
| `BlockadeSystem.BLOCKADE_RADIUS` | 320 | promień kordonu |
| `BlockadeSystem.BLOCKADE_ONSET_DAYS` | 2 | po ilu dniach blokada zaczyna działać |
| `BlockadeSystem.BLOCKADE_SUPPLY_SHARE` | 0.15 | ile dostaw przecieka mimo blokady |

Blokada działa przez **bycie tam**. Boli tylko tam, gdzie nie ma drugiego
źródła — przekierowanie dostaw jest prawdziwe i kosztuje port zastępczy.

---

## 10. Zdarzenia świata

Dwanaście typów losowych plus wojny historyczne. Świat otwiera się z pięcioma
(`WorldEventSystem.SEED_COUNT`), w każdej chwili żyje ich średnio **15,8**.

| typ | waga | czas trwania (dni) | severity | portów | sezon | filtr |
|---|---|---|---|---|---|---|
| `epidemic` | 3 | 30–90 | 2 | 1 | — | — |
| `pirate_raid` | 5 | 7–14 | 1 | 1 | — | — |
| `trade_boom` | 4 | 14–30 | 1 | 1 | — | — |
| `slave_revolt` | 1 | 7–30 | 2 | 1 | — | — |
| `hurricane` | 2 | 3–7 | 3 | 3 | VI–XI | — |
| `treasure_fleet` | 2 | 14–21 | 2 | cała korona | — | — |
| `new_governor` | 1 | 30 | 1 | 1 | — | — |
| `gold_discovery` | 1 | 180–365 | 2 | 1 | — | tak |
| `native_raid` | 2 | 30–60 | 2 | 1 | — | — |
| `famine` | 1 | 30–120 | 2 | 1 | — | — |
| `harvest` | 4 | 45–90 | 1 | 2 | IX–XI | tak |
| `royal_decree` | 2 | 180–365 | 1 | cała korona | — | — |

### Co które zdarzenie robi

Efekty dzienne (`EventEffectsSystem.effectsForType`) i jednorazowe
(`applyOneShotEffects`). **`priceMul` rusza cenę każdego towaru; `itemPriceMul`
tylko wymienionych** — to rozróżnienie weszło w v0.64.0 i jest istotne dla
gracza (patrz niżej).

| zdarzenie | dziennie | jednorazowo |
|---|---|---|
| `epidemic` | ludność −2×sev, bogactwo −0,5×sev, werbunek ×0.5, **żywność i woda** ×(1+0,15×sev) | ludność ×0.97 |
| `pirate_raid` | obrona −1, produkcja ×0.7, import ×0.75 | bogactwo −80, zapasy ×0.7 |
| `trade_boom` | produkcja ×1.5, import ×1.2, **wszystkie ceny** ×0.8, bogactwo +1,5 | — |
| `slave_revolt` | produkcja ×0.3, bogactwo −1,5, werbunek ×0.5 | bogactwo −50 |
| `hurricane` | **port zamknięty**, produkcja ×0 | bogactwo −30, zapasy ×0.85 |
| `treasure_fleet` | bogactwo +0,5 × udział srebra, które dotarło | — |
| `new_governor` | nic | bogactwo +50 (i ułaskawienie na ladzie) |
| `gold_discovery` | ludność +8, bogactwo +1,5, produkcja ×1.2 | bogactwo +100, złoto do `bonusProduces` |
| `native_raid` | produkcja ×0.5, bogactwo −1, obrona −0,5, odbudowa ×0.5 | ludność ×0.85, bogactwo −150, obrona −40 |
| `famine` | konsumpcja ×1.5, ludność −3, werbunek ×0.7, **żywność i woda ×2** | — |
| `harvest` | produkcja ×1.8, bogactwo +1, **żywność i cukier ×0.6** | — |
| `royal_decree` | **wszystkie ceny** ×1.2, bogactwo +0,3 | bogactwo +30 |
| `war_start` | produkcja ×0.85, import ×0.7, **wszystkie ceny** ×1.1 | — |
| `treaty_signed` | produkcja ×1.15, import ×1.15, bogactwo +0,5 | — |

**To jest rzecz, którą gracz musi wiedzieć**: głód i epidemia podnoszą cenę
**jedzenia i wody**, a nie całej lady. Do v0.64.0 podnosiły wszystkiego — czterdzieści
ton tytoniu w głodującym mieście dawało 3551 złota zamiast 1534. Teraz warto
przywieźć **to, czego im brakuje**.

Zdarzenie podwaja cenę, a resztę robi spiżarnia, którą ono opróżnia (konsumpcja ×1.5).
Zmierzone na osiadłym świecie, wszystkie 45 miast (v0.98.1): żywność kosztuje
**1,75–2,17×** pierwszego dnia i **1,75–3,83×** dziewięćdziesiątego. Dolny koniec to miasto,
które samo uprawia żywność (St. Augustine), górny — duże, które ją sprowadza (Hawana).
Podręcznik mówi „2–4×” i to zdanie pilnuje `producer_shed.test.ts`.

| stała | wartość | znaczenie |
|---|---|---|
| `WorldEventSystem.SEED_COUNT` | 5 | ile zdarzeń ma świat na dzień pierwszy |
| `WorldEventSystem.NEWS_ON_A_BOARD` | 5 | sufit tablicy ogłoszeń portu |
| `EventEffectsSystem.WAR_ADAPTATION_DAYS` | 730 | po ilu dniach handel obchodzi wojnę |

---

## 11. Wieści

Wieść dociera do kapitana **statkiem**: kupiec rodzi się z portu, niosąc tablicę
ogłoszeń tego miasta, i znika w porcie docelowym.

Dwa kanały, w tej kolejności:

1. **Zawołanie przez wodę** (`HAIL_RANGE` 30) — **jedna** pozycja, z czoła
   tablicy, z komunikatem na ekranie. Raz na statek (`AiData.hailed`).
2. **Podejście do niej** (ekran spotkania, `ENCOUNTER_RANGE` 18) — cała reszta.

| stała | wartość | znaczenie |
|---|---|---|
| `NpcNewsSystem.HAIL_RANGE` | 30 | zasięg zawołania |
| `NpcNewsSystem.HAIL_ITEMS` | 1 | ile pozycji niesie zawołanie |
| `NamedShipSystem.REPORT_LIFE_DAYS` | 21 | jak długo raport o nazwanym statku jest świeży |
| `MapEventSystem.MARK_MAX_PORTS` | 4 | powyżej ilu portów zdarzenie nie dostaje pinezki |

Tablica portu niesie średnio **2,36** pozycji (sufit 5, ale trzyma tylko to, co
dotyczy tego miasta albo jego korony). Jedna tablica to **15%** zdarzeń żywych
w świecie, trzy tablice **26%** — wieści są **rzadkie** i dlatego warto je
dzielić między kanały.

Tawerna mówi o tym, co się dzieje w promieniu 1300 (`RumorSystem`): huragan,
flota skarbowa, głód, blokada, przecięty szlak, czarna bandera, najruchliwsze
nabrzeże, sojusz. Jedna plotka dziennie, rotuje po dniu i po mieście.

Osiem starych opowieści (skarb, sztorm, cukier, piraci, wojna, gubernator,
statek widmo) dochodzi do głosu, gdy miasto ma mniej niż **2** prawdziwe fakty
w zasięgu — a na świeżym świecie to **wszystkie 45 portów**, więc są one
pierwszym, co gracz w ogóle słyszy. Od v0.70.0 każda z nich, która coś twierdzi
o świecie, jest **oferowana tylko wtedy, gdy świat to potwierdza**.

### Nagłówek mówi, co jest dziś, nie co było

Zdarzenie ma **ostemplowany** nagłówek i zmienne — zapisane w dniu, w którym
powstało, i nietykane potem. Dla większości tabeli to jest dokładnie poprawne
(reguła z v0.43.0: fakt o zdarzeniu stempluje się przy zdarzeniu). Ale
**faza nie jest faktem o zdarzeniu — jest faktem o dzisiaj**, i od v0.72.0
`NewsPhaseSystem.liveNews` wybiera zdanie **w chwili czytania tablicy**:

| zdarzenie | dopóki | potem |
|---|---|---|
| `campaign` / `reconquest` | dopóki się uzbraja: `news.*_fitting` z portem, w którym stoi (v0.73.0) | po wyjściu `{{days}}` liczone od `endDay`, potem `news.landing_tomorrow`, a w dniu desantu `news.landing_today` |
| `treasure_fleet` | `news.treasure_fleet` (ładuje się) | `news.treasure_fleet_sailed` (wyszła, kurs na Hawanę) |
| `hurricane` | `news.hurricane` (uderzył w X) | `news.hurricane_bound` (minął X, idzie na Y) |

Przeliczenie dzieje się **tylko przy odczycie**. Zapisanie go z powrotem do
`vars` byłoby błędem gorszym od naprawianego: `expeditionFromEvent` czyta
`vars.days` jako `sailDays` wyprawy, więc licznik wpisany do zdarzenia
skracałby rejs za każdym razem, gdy ktoś spojrzy na tablicę.

**Dziennik zostaje nietknięty** — wpis z dnia zdarzenia jest datowanym zapisem
tego, co wtedy powiedziano, i ma to mówić dalej. Tak samo kopia, którą zabiera
ze sobą statek: zamraża się w dniu, w którym ją usłyszał (`dayHeard`).

Ile to było warte, zmierzone przed poprawką: licznik dni **mylił się na 93,1%**
dni-tablicowych (1143 wyprawy, 16 481 dni-tablic), o trzy dni i więcej na
79,2%, mediana zawyżenia **7 dni**, najgorszy przypadek **20** — tablica
mówiąca „dwadzieścia dni drogi” w dniu desantu. Flota skarbowa „szykuje się”
przez **72,3%** swoich dni-tablicowych, będąc wtedy medianowo **1158 jednostek**
od nazwanego portu (cała trasa Kartagena–Hawana). Oko huraganu jest za nazwanym
miastem na **56%** jego dni-tablicowych.

---

## 12. Statki NPC

| stała | wartość | znaczenie |
|---|---|---|
| `NpcSpawnSystem.MAX_NPC_SHIPS` | 30 | sufit kadłubów na mapie |
| `NpcSpawnSystem.SPAWN_INTERVAL_TICKS` | 60 | co ile tików sprawdzany jest spawn |
| `NpcSpawnSystem.DESPAWN_DISTANCE` | 900 | od jakiej odległości NPC znika |
| `NpcSpawnSystem.DOCK_RADIUS` | 55 | od jakiej odległości NPC „dokuje" |
| `NpcSpawnSystem.ROVER_SHARE_OUTPOST` | 0.22 | udział korsarzy z przystani |

### Podział zachowań

`pickBehavior` wydziela najpierw korsarzy, potem **10% łowców piratów**, potem
kupców do progu, reszta to marynarka:

| stan świata | korsarz | łowca | kupiec | marynarka |
|---|---|---|---|---|
| pokój (kolonia) | 0% | 10% | 55% | 35% |
| wojna (kolonia) | 0% | 10% | 30% | 60% |
| pokój (przystań piracka) | 22% | 10% | 55% | 13% |

*Uwaga dla piszącego instrukcję: wycinek łowców jest brany **przed** progiem
kupca, nie dodawany do niego. Podręcznik w grze mówi „udział okrętów rośnie
z 45% do 70%" i to jest prawda dla kolonii — sprawdzone dwa razy, bo raz
policzyłem to źle.*

### Drapieżnictwo

Kupca bierze korsarz, korsarza bierze okręt — **bez udziału gracza**.
Ginie mniej więcej **jeden kadłub na trzy dni**.

| stała | wartość | znaczenie |
|---|---|---|
| `PredationSystem.PREDATION_INTERVAL` | 60 | co ile tików chodzi kontrola |
| `PredationSystem.PREY_REACH` | 1.0 | mnożnik zasięgu wypatrywania ofiary |
| `PredationSystem.PREY_STRIKE_RANGE` | 34 | z jakiej odległości następuje atak |
| `PredationSystem.PREY_ODDS` | 0.7 | szansa napastnika |
| `PredationSystem.PREY_AGGRESSION_FLOOR` | 0.35 | poniżej tej agresji NPC nie atakuje |
| `PredationSystem.DEFENCE_FLOOR` | 0.35 | podłoga obrony ofiary |

**Ile z którego pasma przechodzi próg (zmierzone, v0.92.0).** Agresję losuje
`NpcSpawnSystem` **równomiernie** z pasma szablonu, więc to arytmetyka, nie
opinia: kupiec [0; 0,1] — **nigdy**; marynarka [0,3; 0,7] — **siedem razy na
osiem** (komentarz w kodzie mówił do v0.91.0 „mniej więcej połowę razy");
łowca piratów [0,5; 0,9] i korsarz [0,6; 1,0] — **zawsze**. Liczba została,
zdanie poszło: marynarka poluje wyłącznie na kadłuby pod **czarną banderą**
(`preyKind` zwraca dla niej tylko `police`), a okręt królewski, który widzi
pirata i w połowie przypadków odpuszcza, to nie subtelniejsza reguła, tylko
gorsza.

Czy gracz **zobaczył** cudzą walkę, rozstrzyga `sawItHappen` — czyli
`playerVisionRange` z sekcji *Wzrok*, a nie osobna liczba. Do v0.86.0 stało tu
`WITNESS_RANGE = 700` pod komentarzem „z jakiej odległości gracz to zobaczy".
**Nikt nie widzi 700.** Najlepsza luneta w grze — trzydzieści pięć metrów masztu
galeona — sięga **65**, a dalej `WorldRenderer` rysuje kadłub z przezroczystością
**zero**. Zmierzone na 50 dobach świata i 447 kadłubach dopadniętych przez kogoś
innego: dziennik dał kapitanowi wpis o **243** z nich, a mógł zobaczyć **15**.
Mediana „obserwowanej" walki działa się **684** jednostki stąd — poza ekranem na
**wszystkich czternastu** poziomach przybliżenia.

Pozostałe 94 % nie przepada: kadłub wzięty na szlaku to szlak napadnięty
(`disruptRoute`), a to mówi mu karczma (`tavern.rumor_lane`, *„kurs, którego
nikt nie ubezpieczy"*). Dziennik jest od tego, co widział sam.

### Ucieczka

`FLEE_NOTORIETY` = 50 (prywatna w `NpcAiSystem`). **Każdy** kupiec ucieka przed
czarną banderą, znienawidzonym nazwiskiem albo sławą powyżej tego progu —
a przed uczciwym kapitanem **żaden**. Ucieka kursem o najlepszej prędkości
uzyskanej, do jednego z własnych dwóch końców trasy; pod działami portu jest po
wszystkim.

### Co widać na maszcie

Trzy pytania, trzy obrazki, wszystkie o stałym rozmiarze ekranowym:

- **bandera** — czyja to jednostka,
- **czerwony proporzec** — że się bije,
- **złoty proporczyk** — jak głęboko siedzi (dwie długości), widoczny dopiero
  z 55% zasięgu lunety.

### Nazwane statki

| stała | wartość | znaczenie |
|---|---|---|
| `NamedShipSystem.NAMED_SHIP_COUNT` | 6 | ile ich pływa |
| `NamedShipSystem.ESCORT_MAX` | 2 | ile eskort może wziąć |
| `NamedShipSystem.LAYOVER_PER_SCARE` | 2 | ile dni postoju po strachu |
| `NamedShipSystem.LAYOVER_MAX` | 6 | sufit postoju |
| `NamedShipSystem.REROUTE_AFTER_SCARES` | 2 | po ilu strachach zmienia szlak |
| `NamedShipSystem.SHELTER_RANGE` | 90 | z jakiej odległości szuka schronienia |
| `NamedShipSystem.PASSAGE_SPEED` | 120 | prędkość odniesienia jej obiegu |

Walka, którą przeżyła, jest **pamiętana i odpowiadana w porcie**: postój,
konsorta, a po drugim strachu inny szlak.

---

## 13. Bitwa morska

Arena trzy razy większa od ekranu, trzy typy amunicji, łuki ostrzału **±30° od
trawersu** (martwa strefa ±60° od dziobu i od rufy; `BROADSIDE_HALF_ARC` =
`asin(BROADSIDE_ARC_COS)`, z którego od v0.98.3 rysuje też arena — wcześniej
rysowała ±60° od trawersu, dwa razy za szeroko, a strzał spoza łuku był
odrzucany bez słowa; dziś odpowiada `FireRejected`)
— **te same dla obu burt i dla obu stron walki** (`CombatSystem.bearingSide`,
v0.85.0; wcześniej działa przeciwnika miały własną kopię tej reguły, która nie
miała ani łuku, ani burty).

| stała | wartość | znaczenie |
|---|---|---|
| `CombatSystem.CANNON_RANGE_ARENA_DIVISOR` | 12 | zasięg burty to **jedna dwunasta areny**: `cannonRangeFor(3840)` = **320**, czyli ćwierć ekranu |
| `CombatSystem.CANNON_COOLDOWN_TICKS` | 180 | najlepsza możliwa kadencja burty (9 s) |
| `CombatSystem.CANNON_DAMAGE_HULL` | 3.5 | obrażenia w kadłub na trafienie |
| `CombatSystem.CANNON_DAMAGE_SAILS` | 3.0 | obrażenia w takielunek |
| `CombatSystem.CANNON_DAMAGE_CREW` | 4.5 | straty w ludziach |
| `CombatSystem.NEUTRAL_GUNNERY` | 5 | kanonierka, przy której celność jest nominalna |
| `CombatSystem.BROADSIDE_ARC_COS` | 0.5 | martwa strefa dziobu i rufy: ±60° |
| `CombatEngine.DISENGAGE_RANGE_MUL` | 0.9 | ułamek zasięgu dział, od którego wolno zerwać kontakt — i od którego liczy zegar |
| `CombatSystem.HULL_WIDTH` | 77 | szerokość rysowanego kadłuba (sprite 256 px w skali 0,3): najbliższe stanowisko sternika **i** zasięg bosaka |
| `CombatEngine.BOARDER_CREW_RATIO` | 1.5 | od jakiej przewagi w ludziach przeciwnik idzie na abordaż |
| `CombatEngine.FLEEING_CREW_RATIO` | 0.5 | przy jakiej słabości ucieka poza strzał |
| `CombatEngine.BOARDING_COOLDOWN_TICKS` | 200 | ile czeka po odparciu, zanim rzuci bosaki znowu (10 s) |

### Amunicja

| typ | kadłub | żagle | załoga | zasięg |
|---|---|---|---|---|
| round (kule) | ×1.0 | ×0.55 | ×0.40 | ×1.0 |
| chain (łańcuchowa) | ×0.15 | **×4.5** | ×0.10 | ×0.9 |
| grape (kartacz) | ×0.10 | ×0.0 | **×1.30** | ×0.5 |

Kadencja przeładowania = f(załoga × morale × wyszkolenie).

### Sternik przeciwnika

Trzy archetypy i dwa nadpisania od stosunku załóg wyznaczają **stanowisko**,
na którym przeciwnik chce się trzymać:

| kto | stanowisko |
|---|---|
| napastniczy (pirat) | 0.45 × zasięg |
| taktyczny (marynarka, łowca) | 0.40 × zasięg |
| ostrożny (kupiec) | 0.70 × zasięg |
| załoga ≥ 1,5× twojej | do zwarcia — ale nie bliżej niż `HULL_CLEARANCE` |
| załoga ≤ 0,5× twojej | 1.1 × zasięg, czyli poza strzałem |

Kurs jest **liniową mieszanką** namiaru na ciebie i namiaru ±90°: na swoim
stanowisku płynie burtą, poza nim dziób schodzi ku tobie (albo od ciebie) tym
bardziej, im dalej jest od stanowiska. Jedna trzecia poza stanowiskiem — i jest
dziobem do ciebie, czyli **żadne jej działo nie ma kąta**. To cena zbliżania i
płaci ją tak samo jak ty.

> Do v0.85.0 kurs był **na sztywno** namiarem ±90°, czyli styczną do okręgu wokół
> gracza. Stanowisko liczyło się pięcioma gałęziami i czytał je **wyłącznie**
> przepustnica żagli. Zmierzone przez dwie minuty, z sześciu odległości
> początkowych i we wszystkich trzech archetypach: dystans zmieniał się **o
> najwyżej 16 px, i to na zewnątrz**.

### Abordaż

| stała | wartość | znaczenie |
|---|---|---|
| `BoardingSystem.BOARDING_RANGE` | 77 | z jakiej odległości można wejść: **burta w burtę**, czyli wprost `HULL_WIDTH`. Było 30 — liczba, do której nie dochodził nikt |
| `BoardingSystem.BOARDING_MAX_ENEMY_HULL` | 0.35 | kadłub wroga musi być poniżej tego |
| `BoardingSystem.BOARDING_MAX_ENEMY_CREW` | 0.5 | albo załoga poniżej tego |

Zasięg bosaka to **szerokość kadłuba**, bo rzuca się go burta w burtę. Było 30 px
— odległość, na którą nie schodził nikt. Zmierzone na 144 bitwach (trzy archetypy,
trzy układy załóg, kapitan strzelający z dział i kapitan bezczynny): statki były
bliżej niż 30 px przez **0 ticków z 518 400**, a warunek abordażu nie przeszedł
**ani razu**. Jedyna droga do abordażu prowadziła przez celowe wpłynięcie w nią.

`B` w bitwie → pojedynek → wynik decyduje o przejęciu.

**Przeciwnik też wchodzi na pokład** (v0.86.0). Warunki są lustrzane: musi mieć
**półtora raza** więcej ludzi (`BOARDER_CREW_RATIO`), być w zasięgu bosaka i mieć
przed sobą osłabiony pokład — kadłub poniżej 35 % **albo** załoga poniżej połowy.
Wtedy bitwa staje i otwiera się **ten sam** `DuelScene`, tyle że szermierka
kapitana liczy się po stronie **broniącej**. Wygrana — zrzuceni z burty; przegrana
— pokład stracony. Po odparciu czeka **dziesięć sekund**.

> Do v0.86.0 nie robiła tego nigdy. `runEnemyAI` nie wystawiało komendy w żadnym
> stanie, a funkcja, która rozstrzyga abordaż, brała **jeden** identyfikator i
> czytała cel wprost z `state.enemyShipId` — gdyby komendę wystawiła, weszłaby
> na własny pokład.

### Zakończenia

wygrana · przegrana · zerwanie kontaktu · kapitulacja · **przejęcie**
(pryz dołącza do floty i daje łup).

### Ładownia pryzu

| stała | wartość | znaczenie |
|---|---|---|
| `PrizeSystem.LADEN_SHARE` | 0.1 | od jakiego zapełnienia widać, że coś wiezie |
| `PrizeSystem.DEEP_LADEN_SHARE` | 0.5 | od jakiego siedzi głęboko |

Ekran spotkania pokazuje manifest w kolejności, w jakiej pryz by go zabrał.

---

## 14. Pojedynek

Tor przewagi ±6, trzy linie ataku. Blokuj linię, w którą uderza — dostaniesz
ripostę.

| stała | wartość | znaczenie |
|---|---|---|
| `DuelSystem.DUEL_WIN_ADVANTAGE` | 6 | przewaga kończąca pojedynek |
| `DuelSystem.DUEL_MAX_STAMINA` | 10 | pula wytrzymałości |
| `DuelSystem.DUEL_ATTACK_COST` | 2 | koszt ataku |
| `DuelSystem.DUEL_PARRY_RECOVERY` | 3 | ile odzyskuje parada |
| `DuelSystem.DUEL_TIRED_THRESHOLD` | 3 | poniżej tego jesteś zmęczony |
| `DuelSystem.DUEL_TIRED_PENALTY` | 0.5 | kara za zmęczenie |

---

## 15. Bitwy lądowe

Trzy tryby: **atak na miasto**, **obrona miasta**, **odbicie przez koronę**.

### Oblężenie (gracz atakuje)

Ostrzał rundowy → desant falami → trzy zakończenia; port zmienia właściciela.

| stała | wartość | znaczenie |
|---|---|---|
| `SiegeSystem.HIT_TO_WALLS` | 0.35 | ile trafienia idzie w mury |
| `SiegeSystem.HIT_TO_GUNS` | 0.12 | ile w działa fortu |
| `SiegeSystem.FORT_SHOT_HULL` | 0.9 | co strzał fortu robi kadłubowi |
| `SiegeSystem.FORT_SHOT_CREW` | 0.2 | co robi załodze |
| `SiegeSystem.FLEET_BREAK_HULL` | 0.2 | poniżej tego kadłuba konsorta wychodzi z linii |
| `SiegeSystem.LANDING_FRACTION` | 0.85 | jaka część załogi schodzi na brzeg |
| `SiegeSystem.SHIP_KEEPERS` | 5 | ilu zostaje na pokładzie |
| `SiegeSystem.DEFENDER_ROUT` | 0.35 | próg rozsypki obrońcy |
| `SiegeSystem.ATTACKER_ROUT` | 0.45 | próg rozsypki napastnika |
| `SiegeSystem.MAX_WAVES` | 6 | ile fal desantu |
| `SiegeSystem.WAVE_INTENSITY` | 0.18 | siła jednej fali |
| `cities.PANAMA_TREASURY` | 2.5 | ile razy więcej niż bogactwo trzyma skarbiec Panamy przy łupie |

**Panamá, lądem** (v0.99.2, decyzja użytkownika). Jedyne miasto bez dostępu od
morza (`landlocked`) bierze się pieszo, jak Morgan w 1671: z Nombre de Dios na
południe przez przesmyk, ok. godziny gry marszu (`geography.test.ts` mierzy
drogę po prawdziwym wybrzeżu). Pieszo przy mieście `landlocked` ekran podejścia
oferuje szturm; oblężenie idzie z `overland` — **zero dział, zero ostrzału**,
fort nie ma w co strzelać, kadłuby zostają nietknięte, ryzykuje tylko desant.
Łup = bogactwo × 3 × `treasury` + ludność × 0,05: Panamá na starcie **7 250**
(każde inne miasto najwyżej ok. 3 200). Wojenna drużyna z wioski Darién
(−40 obrony) dalej działa i dalej obniża łup. Po zdobyciu **tylko łupienie**
(`spoilsOffered`, v0.99.3): miasta bez kila nie da się bronić odsieczą. Bez szlaku
żywności Panamá **nie głoduje** — import bez szlaku idzie „przemytem”; dwa lata
osiadłego świata: głód 0 (`geography.test.ts`).

### Obrona (gracz broni)

| stała | wartość | znaczenie |
|---|---|---|
| `CityDefenseSystem.SQUADRON_ACCURACY` | 0.45 | celność eskadry napastnika |
| `CityDefenseSystem.SQ_HIT_TO_WALLS` | 0.4 | ile jej trafienia idzie w mury |
| `CityDefenseSystem.SQ_HIT_TO_GUNS` | 0.12 | ile w działa |
| `CityDefenseSystem.SHOT_TO_SOLDIERS` | 1.6 | ilu żołnierzy zabiera strzał |
| `CityDefenseSystem.ESCORT_COVER` | 0.65 | ile zasłania eskorta szalup |
| `CityDefenseSystem.SHOT_TO_SQUADRON_GUNS` | 0.3 | ile dział eskadry niszczy strzał |
| `CityDefenseSystem.FLEET_FIRE_SHARE` | 0.3 | udział floty gracza w ogniu |
| `CityDefenseSystem.LANDING_TRIGGER_WALLS` | 0.4 | przy jakim stanie murów rusza desant |
| `CityDefenseSystem.SQUADRON_PATIENCE` | 8 | ile rund eskadra wytrzyma |
| `CityDefenseSystem.ROUTED_PARTY_SURVIVAL` | 0.3 | ilu rozbitych przeżywa |
| `CityDefenseSystem.DEFENCE_CLAIMANT_REP` | −15 | reputacja u napastnika za obronę |
| `CityDefenseSystem.ALLY_DEFENCE_REP` | 25 | reputacja u sojusznika za obronę |

### Korona wraca po swoje

| stała | wartość | znaczenie |
|---|---|---|
| `ReconquestSystem.RELIEF_GRACE_DAYS` | 12 | karencja po zdobyciu miasta |
| `ReconquestSystem.RELIEF_COOLDOWN_DAYS` | 45 | odstęp między próbami |
| `ReconquestSystem.RELIEF_DAILY_BASE` | 0.06 | dzienna szansa wyprawy |
| `ReconquestSystem.RELIEF_FIT_DAYS` | 7 | ile trwa uzbrajanie |
| `ReconquestSystem.ROYAL_QUALITY` | 1.15 | jakość wojska koronnego |
| `ReconquestSystem.AT_WAR_PENALTY` | 0.5 | ile korona traci, bijąc się gdzie indziej |
| `ReconquestSystem.ESCALATION_DAYS` | 180 | po ilu dniach nacisk rośnie |
| `ReconquestSystem.GARRISON_DECAY` | 0.004 | jak topnieje garnizon gracza |
| `ReconquestSystem.PRESENCE_RANGE` | 400 | z jakiej odległości obecność gracza się liczy |
| `ReconquestSystem.PRESENCE_PENALTY` | 0.7 | ile ta obecność odbiera napastnikowi |
| `ReconquestSystem.WRECK_GOLD_PER_SOLDIER` | 3 | złoto za rozbicie wyprawy |
| `ReconquestSystem.HELD_DEFENSE_SHARE` | 0.45 | sufit obrony pod czarną banderą |
| `ReconquestSystem.HELD_POPULATION_SHARE` | 0.62 | sufit ludności pod czarną banderą |

**Obecność ma teraz linię na HUD-zie (v0.93.0).** 400 jednostek świata przy
lunecie sięgającej **65** i ekranie **213 × 120** jednostek przy domyślnym
przybliżeniu: miasto oddalone o tyle jest w kadrze przy **jednym z czternastu**
stopni zoomu na wschód/zachód i **przy żadnym** na północ/południe. Na całej
czarcie kapitan jest „obecny" średnio przy **2,83** miastach, przy co najmniej
jednym na **65,7%** morza, a w najgęstszym miejscu przy **16** — i **94,6%** par
(miejsce, miasto) w zasięgu tej reguły dotyczy miasta, którego nie ma na ekranie.

To jest w porządku dla tego, czym ta liczba jest: obecność to nie wzrok.
Nie było w porządku to, że **nic mu o tym nie mówiło** — kordon blokady, ta sama
klasa liczby, ma linię na HUD-zie od v0.22.0. `reliefWatch` znajduje najbliższy
termin desantu na miasto, które gracz trzyma albo którego broni z listu
kaperskiego, a HUD pisze miasto, liczbę dni i czy jest dość blisko; **na
czerwono, gdy nie jest**.

Do v0.92.0 `playerPresentAt` miało drugą gałąź, odpowiadającą **tożsamością**,
gdy gracz był w porcie. **Nigdy się nie wykonała**: `WorldEngine.apply` wraca
przed przesunięciem zegara, gdy gracz jest w porcie, a `tickReconquest` jest po
drugiej stronie tego `return`. Gdyby się wykonywała, mówiłaby rzecz dziwną —
zakotwiczony w Antigui, **12 px** od własnego Montserratu, kapitan był
*nieobecny*, a na morzu 399 px dalej *obecny*.

### Wyprawa jako eskadra na mapie

| stała | wartość | znaczenie |
|---|---|---|
| `ExpeditionFleetSystem.MATERIALIZE_RANGE` | 620 | w jakim promieniu od gracza kadłuby się pojawiają |
| `ExpeditionFleetSystem.SOLDIERS_PER_TRANSPORT` | 90 | ilu ludzi wiezie transportowiec |
| `ExpeditionFleetSystem.GUNS_PER_ESCORT` | 26 | ile dział niesie eskorta |
| `ExpeditionFleetSystem.MAX_EXPEDITION_HULLS` | 4 | sufit kadłubów wyprawy |
| `ExpeditionFleetSystem.SQUADRON_SPEED` | 120 | prędkość eskadry na kursie |
| `CrownCampaignSystem.MAX_CAMPAIGNS_IN_FLIGHT` | 2 | ile wypraw koronnych naraz |
| `CrownCampaignSystem.CAMPAIGN_FIT_DAYS` | 10 | ile trwa uzbrajanie |
| `CrownCampaignSystem.CAMPAIGN_COOLDOWN_DAYS` | 90 | odstęp |
| `CrownCampaignSystem.CAMPAIGN_DEFENSE_CEILING` | 70 | powyżej tej obrony korona nie atakuje |
| `CrownCampaignSystem.ALLY_PRESSURE` | 1.5 | ile dokłada sojusznik |

Rozbicie eskadry **kasuje zdarzenie** i daje celowi karencję.

#### Najpierw uzbrojenie, dopiero potem rejs (v0.73.0)

`sailDays` to **uzbrajanie + przeprawa + rzut**, a potem widełki przycinają sumę
(`RELIEF_SAIL_DAYS` 6–14, `CAMPAIGN_SAIL_DAYS` 10–20). Przeprawa jest liczona
`expeditionDeparture` — prawdziwym kursem, **z prądem** — i od v0.73.0 jest
**stemplowana osobno** (`vars.passage`). Dzień wyjścia liczy się **wstecz od
desantu**: `sailingDay = endDay − passage`. Rzut i przycięcie lądują
w uzbrajaniu, bo przeprawa jest faktem o mapie.

| | odsiecz | kampania |
|---|---|---|
| uzbrajanie (`*_FIT_DAYS`) | 7 dni | 10 dni |
| przeprawa (mediana) | **2 dni** | **4 dni** |
| całe zdarzenie (mediana) | 9 dni | 14 dni |
| udział dni w porcie | **78%** | **67%** |

Dopóki się uzbraja, **eskadry nie ma na czarcie**: `expeditionPos` nie zwraca nic,
tak jak `platePos` dla floty skarbowej. To nie jest kosmetyka — `materialize`
wręcza każdemu kadłubowi port docelowy jako rozkaz, więc kadłuby postawione na
wodzie za wcześnie nie stoją na kotwicy, tylko ruszają na miasto.

Przed v0.73.0 cała rozpiętość zdarzenia była rysowana jako rejs, więc eskadra
wychodziła z portu pierwszego ranka i **pełzła medianowo 22 (odsiecz) i 35
(kampania) jednostek na dobę** przy `SQUADRON_SPEED = 120`. Po poprawce
mediana to **95** i **112**; reszta rozrzutu to prąd, bo kurs pod prąd kosztuje
więcej dni niż wynosi jego długość. **Cena zapłacona świadomie:** okno, w którym
kapitan może ją spotkać na morzu, spada z 9 dni do 2 (odsiecz) i z 14 do 4
(kampania) — prawie każdy kurs w tym morzu jest krótszy niż średnica zasięgu
620, więc okno **jest** jej czasem na morzu. W zamian tablica mówi teraz, że
jeszcze nie wyszła i z którego portu wyjdzie.

Zapis sprzed v0.73.0 nie ma `vars.passage` i chodzi po staremu (cała rozpiętość
jako jeden rejs). Wyprawy żyją 6–20 dni, więc stary kształt znika z gry sam.

---

## 16. Zlecenia i wątki

### Kantor frachtowy

| stała | wartość | znaczenie |
|---|---|---|
| `CargoContractSystem.MAX_ACTIVE_CHARTERS` | 2 | ile frachtów naraz |
| `CargoContractSystem.OFFERS_PER_PORT` | 3 | ile ofert na ladzie |
| `CargoContractSystem.CHARTER_REPUTATION` | 6 | reputacja za dostarczony fracht |
| `CargoContractSystem.CHARTER_BETRAYAL_REPUTATION` | −12 | kara za sprzeniewierzenie |
| `CargoContractSystem.CHARTER_BETRAYAL_NOTORIETY` | 5 | sława za to samo |

### Informator w tawernie

Trzy typy zleceń, po jednym naraz:

| stała | wartość | znaczenie |
|---|---|---|
| `InformantSystem.MAX_ACTIVE_RAIDS` | 1 | przecięcie szlaku |
| `InformantSystem.RAID_REPUTATION` | −14 | co to kosztuje u ofiary |
| `InformantSystem.RAID_NOTORIETY` | 8 | ile dokłada do sławy |
| `InformantSystem.RAID_SEVERITY` | 0.6 | jak mocno psuje szlak |
| `InformantSystem.MAX_ACTIVE_RELIEF` | 1 | zamówienie na dostawę |
| `InformantSystem.RELIEF_REPUTATION` | 6 | reputacja za dowiezienie |
| `InformantSystem.RELIEF_LAPSE_REPUTATION` | −5 | kara za niedowiezienie |
| `InformantSystem.MAX_ACTIVE_HUNTS` | 1 | polowanie na nazwany kadłub |
| `InformantSystem.HUNT_REPUTATION` | −18 | co kosztuje |
| `InformantSystem.HUNT_NOTORIETY` | 10 | ile dokłada |

### Zlecenie obrony u gubernatora

| stała | wartość | znaczenie |
|---|---|---|
| `DefenseContractSystem.MIN_NOTICE_DAYS` | 2 | najkrótsze wyprzedzenie |
| `DefenseContractSystem.ARRIVAL_GRACE_DAYS` | 3 | ile spóźnienia wolno |
| `DefenseContractSystem.STATION_LIMIT_DAYS` | 25 | jak długo trzeba stać |
| `DefenseContractSystem.REWARD_BASE` | 300 | podstawa zapłaty |
| `DefenseContractSystem.REWARD_PER_SOLDIER` | 5 | dodatek za każdego napastnika |
| `DefenseContractSystem.CONTRACT_REPUTATION` | 15 | reputacja za wykonane zlecenie |

### Mapy skarbów

| stała | wartość | znaczenie |
|---|---|---|
| `TreasureSystem.AMBUSH_CHANCE` | 0.25 | ile wykopalisk to zasadzka |
| `TreasureSystem.AMBUSH_LOSS_SHARE` | 0.25 | ile sakiewki zabierają, gdy przegrasz pojedynek przy dole (v0.99.6; wcześniej zapisane tylko w kodzie ekranu mapy) |
| `TreasureSystem.AMBUSH_BAND_MEN` | 20 | „załoga” zasadzki, z której `enemyFencingFor` liczy jej szermierkę… |
| `TreasureSystem.AMBUSH_BAND_OF` | 30 | …na tylu (plus sława kapitana) |
| `TreasureSystem.WARM_MULTIPLIER` | 3 | jak bardzo „ciepło" zawęża szukanie |
| `TreasureSystem.BURIAL_MAX_OFFSET` | 150 | jak daleko od miasta może być skrzynia |

Trzy jakości mapy: crude (promień 220, 300 zł), fair (110, 800), exact (45, 2000).
Kopie się klawiszem `X` na lądzie.

### Romans i port macierzysty

| stała | wartość | znaczenie |
|---|---|---|
| `RomanceSystem.REPUTATION_TO_BE_RECEIVED` | 20 | ile trzeba, żeby w ogóle przyjął |
| `RomanceSystem.SHARES_A_LEAD` | 30 | od jakiej sympatii coś powie |
| `RomanceSystem.MARRIAGE_THRESHOLD` | 85 | próg oświadczyn |
| `RomanceSystem.MARRIAGE_MIN_RANK` | 2 | minimalna ranga |
| `RomanceSystem.GIFT_COST` | 500 | cena podarunku |
| `RomanceSystem.DOWRY_BASE` | 400 | podstawa posagu |
| `RomanceSystem.DOWRY_PER_WEALTH` | 3 | dodatek za bogactwo miasta |
| `RomanceSystem.DOWRY_PER_RANK` | 600 | dodatek za rangę |

Ślub **raz na karierę**. Daje port macierzysty: posag, darmowe klarowanie całej
floty, magazyn 300 ton. **Wygasa**, gdy miasto opuści koronę teścia.

---

## 17. Wioski Indian

Osiem wiosek na czarcie, **żadna nie nosi bandery**.

| stała | wartość | znaczenie |
|---|---|---|
| `VillageSystem.VILLAGE_RANGE` | 50 | z jakiej odległości widać wioskę |
| `VillageSystem.TRADE_RUM` | 6 | ile ton rumu za transakcję |
| `VillageSystem.TRADE_COOLDOWN_DAYS` | 10 | odstęp między transakcjami |
| `VillageSystem.STANDING_PER_TRADE` | 15 | ile zaufania daje handel |
| `VillageSystem.WAR_PARTY_STANDING` | 60 | od jakiego zaufania kupisz wyprawę wojenną |
| `VillageSystem.WAR_PARTY_RUM` | 6 | ile rumu kosztuje wyprawa |
| `VillageSystem.WAR_PARTY_STANDING_COST` | 30 | ile zaufania kosztuje |
| `VillageSystem.WAR_PARTY_DAYS` | 40 | ile trwa zdarzenie najazdu |
| `SeaDepth.VILLAGE_ANCHORAGE_DEPTH` | 4 | głębokość przy wiosce |
| `SeaDepth.VILLAGE_ANCHORAGE_RADIUS` | 60 | promień tego kotwicowiska |

**Dwa zawołania nigdy naraz (v0.90.0).** Zasięg wioski (50) plus promień doku
miasta (`dockRadius` = 15, **taki sam dla wszystkich 45 miast**) daje 65, a
najbliższa para na czarcie — Champotón i Campeche — dzieli **65,7 jednostki**.
Margines to **siedem dziesiątych jednostki** i do v0.90.0 nie pilnował go żaden
test; przesunięcie któregokolwiek o piksel w głąb lądu postawiłoby kapitana
w obu naraz. Teraz pilnuje `claims.test.ts`. (Komentarz nad `VILLAGE_RANGE`
mówił przy tym „ośmiokrotność promienia doku” i „miejskie sześć” — jest to
3⅓ i piętnaście.)

**Sześć ton rumu kupuje złoto** — jedyne dobro `rare`, którego żaden port nie
trzyma na ladzie — i kupuje zaufanie. Zaufanie przy 60 kupuje **najazd na
sąsiednią kolonię** (`native_raid`: −40 obrony, −15% ludzi, −150 bogactwa).

Wyprawy nie kupisz, dopóki na tym mieście **trwa jakikolwiek** `native_raid` —
także wylosowany przez świat, nie tylko twój. Strażnik dotyczy **miasta**: dwa
najazdy naraz zdjęłyby osiemdziesiąt punktów obrony z placówki, która ma
piętnaście. Do v0.79.0 zablokowana pozycja przypisywała wiosce cudzy najazd
(*„ich wojownicy są już w drodze"*); mówi teraz to, co jest prawdą — najazd
trwa, drugiego nie wyślą.
**Nikt się nigdy nie dowiaduje, że to byłeś ty.**

Cztery metry wody nad lądowiskiem: pinasa, slup, barka i brygantyna wchodzą;
fluyt, fregata i trzy galeony zostają na mieliźnie.

---

## 18. Przegrana

Zatopiony flagowiec **przepada**.

| stała | wartość | znaczenie |
|---|---|---|
| `DefeatSystem.DEFEAT_SURVIVOR_SHARE` | 0.5 | jaka część załogi ocalała |
| `DefeatSystem.RANSOM_SHARE` | 0.5 | jaka część kiesy idzie na okup |
| `DefeatSystem.MORALE_BLOW` | 0.25 | ile morale zabiera przegrana |

Dwie drogi: **bandera przechodzi na największą konsortę** jeszcze na wodzie —
pierwszy raz, kiedy pływanie w zespole jest coś warte w momencie, w którym to
naprawdę boli — albo kapitan **ląduje na brzegu**: królewski okręt wiezie go do
najbliższej kolonii swojej korony jako jeńca, każdy inny zostawia łodziom
znalezienie plaży. Połowa kiesy na okup, a z reszty stocznia bierze cenę pinasy.

**Niczego nie ma znikąd**: ludzie to ocalali z jego załogi, pinasa jest kupiona
za jego złoto, a ładunek to udział, który i tak przeżył zatonięcie.

---

## 19. Sterowanie

| klawisz | co robi |
|---|---|
| `W` / `S` | więcej / mniej żagli |
| `A` / `D` | ster |
| `Space` | menu (Kajuta · Kapitan · Dziennik · Kalendarz · Ustawienia · Zapis · Mapa) |
| `H` | podręcznik |
| `N` | znaki zdarzeń na czarcie |
| `T` | szlaki handlowe |
| `C` | prądy |
| `L` | tryb lądowy |
| `X` | kop (na lądzie) |
| `B` | abordaż (w bitwie) |
| `R` | naprawa (w stoczni) |

Zoom **1,5×–12×** w czternastu krokach (`z1`–`z14`, domyślnie `z8` = 6×).
Do v0.97.0 to zdanie było prawdziwe **tylko tutaj**: ekran ustawień szturchał kamerę,
a kontroler ściągał ją z powrotem, więc trzynaście z czternastu stopni wracało do 6×
w ciągu sekundy gry; kółko myszy chodziło po liczbach całkowitych od 1 do 12,
a wskaźnik zaokrąglał powiększenie i dawał jedenaście odczytów. Jedna drabina,
czytana przez kamerę w każdej klatce (`cameraZoom.test.ts`).


---

## 19a. Ekrany

Dokument wyżej opisuje **mechaniki**. Ta sekcja opisuje **gdzie one są**, bo
instrukcja dla gracza potrzebuje obu.

| scena | kiedy się pojawia | co robi |
|---|---|---|
| `BootScene` → `PreloadScene` | start | ładowanie, parametry debugowania |
| `CharacterCreationScene` | nowa gra | nazwisko, korona, era, rozdanie 10 punktów |
| `MainMapScene` | rdzeń gry | żegluga po Karaibach |
| `UIOverlayScene` | zawsze nad mapą | kompas, wiatr, data, zoom, żagle — **nie przewija się z mapą** |
| `PortApproachScene` | wejście do portu | krótka scena bramy; **napełnia ławę w tawernie** |
| `PortScene` | w porcie | sześć lad plus garnizon, przełączane widokami |
| `CityInfoScene` | klik na miasto z mapy | czyje, co produkuje, co się tam dzieje |
| `ShipEncounterScene` | spotkanie na morzu | manifest, wieści, atak, odejście |
| `SeaBattleScene` | atak albo napaść | arena, działa, abordaż |
| `BattleHelpScene` | `H` w bitwie | podręcznik bitwy |
| `DuelScene` | abordaż, zasadzka przy skarbie, wątek rodzinny, straż przy bramie (v0.99.8) | pojedynek na tor przewagi; tytuł i linia wygranej od miejsca walki (`DuelSetting`, v0.99.9) |
| `CityAssaultScene` | atak na miasto | ostrzał i desant falami |
| `CityDefenseScene` | obrona miasta | ostrzał cudzej eskadry i szalupy |
| `VillageScene` | wejście do wioski | barter rumem, wyprawa wojenna |
| `OptionsMenuScene` | `Spacja` | siedem zakładek |
| `HelpScene` | `H` na mapie | podręcznik świata, cztery zakładki |
| `RetirementScene` | po propozycji gubernatora | podsumowanie kariery |

### Klawisze per ekran

**Mapa** — `W`/`S` żagle, `A`/`D` ster, `E` wejście do portu / powrót na statek,
`L` ląd, `X` kopanie, `Spacja` menu, `H` podręcznik, `N` znaki zdarzeń,
`T` szlaki, `C` prądy, `G` siatka, `V` strefa widzenia.

**Bitwa morska** — `W`/`S` żagle (**trzy** poziomy, nie cztery: złożone, bojowe,
pełne), `A`/`D` ster, `Q` lewa burta, `E` prawa burta, `1`/`2`/`3` amunicja,
`B` abordaż, `Esc` zerwanie kontaktu, `H` podręcznik bitwy.

**Pojedynek** — `W`/`S` wybór linii, `A`/`D` atak i parada, `Q`/`E` warianty.

**Lada w porcie** — `W`/`S` wybór, `Enter` potwierdzenie, `Esc` powrót.
W magazynie dodatkowo `Q` na brzeg, `E` na statek.
W **stoczni** dodatkowo `F` — kup wybrany kadłub **do floty**, nie jako flagowca
(v0.79.0; przedtem tylko myszą, przyciskiem rysowanym poza panelem), `R` naprawa.
Kursor obejmuje też **własne kadłuby** pod listą: na takim wierszu `Enter` znaczy
*sprzedaj* (v0.80.0). W **kajucie** `↑↓` wybiera konsortę, `X` ją porzuca.

**Sprzedaż i porzucenie konsorty pytają o potwierdzenie**, jeśli coś z nią odejdzie
— wiersz mówi, ile ton, i trzeba nacisnąć drugi raz. Kadłub, którego ładunek
w całości mieści się w pozostałych, odchodzi za pierwszym naciśnięciem.

**Menu (`Spacja`)** — `1`–`6` i strzałki po zakładkach, `Esc` zamyka.
Zakładki: Kajuta · Kapitan · Dziennik · Kalendarz · Ustawienia · Zapis · Mapa.
Na **Ustawieniach**, gdy kursor stoi na wierszu głośności, `←` i `→` zmieniają ją
zamiast przewracać zakładkę (v0.81.0 — podpowiedź obiecywała to od początku,
a związane były `A` i `D`).

**Oblegańsko-obronne** — `W`/`S` albo strzałki wybierają cel ostrzału,
`Enter` potwierdza, `L` rozpoczyna desant, `Spacja` przyśpiesza rundę.

### Dwie rzeczy, które mylą

- **Żagle w bitwie to trzy poziomy, na mapie cztery.** Bitwa ma złożone (0%),
  bojowe (50%) i pełne (100%); mapa ma dodatkowo refowane (33%).
- **HUD nie jest częścią mapy.** `UIOverlayScene` jest osobną sceną o stałej
  pozycji ekranowej — dlatego kompas nie ucieka przy przewijaniu.

---

## 20. Czego tu świadomie nie ma

Rzeczy zadeklarowane w kodzie, których gra **nie robi** — żeby instrukcja ich
przypadkiem nie obiecała:

- **`PortRuntimeState.shipyardQueue`** — pole martwe od v1. Stocznia sprzedaje
  dowolny kadłub swojego poziomu, zawsze i bez ograniczeń. Nie ma kolejki, nie
  ma czasu budowy, nie ma kadłuba, którego „to miasto akurat nie ma".
- **`ItemDef.legal` / `.category` / `.isConsumable`** — bez czytelnika. **Nie ma
  monopolu koronnego ani przemytu jako mechaniki** (projekt odrzucony po
  pomiarze w v0.50.0).
- **`WorldEventType.war_end`** — wariant, którego nic nie konstruuje; wojny
  kończy `treaty_signed`.
- **`player.retirementScore`** — zapisywane i nieczytane; ekran emerytury liczy
  wynik od nowa.
- **Dźwięk działa, sztormu, portu** — `MusicManager` ma pięć slotów, wypełniony
  jest **jeden** (menu). W `public/assets/audio` są cztery pliki i nie ma wśród
  nich żadnego dźwięku walki.
- **Deszcz i pioruny** — wymienione w roadmapie, nie istnieją.
- **Misje jezuickie** — zaczep żywy, mechanika nieistniejąca.
- **Sprite'y per klasa statku** — wszystkie dziewięć klas dzieli jeden sprite.

---

## 21. Parametry debugowania

Pełna lista w [10-DEVELOPMENT.md](10-DEVELOPMENT.md). Najużyteczniejsze przy
sprawdzaniu mechanik opisanych wyżej:

| parametr | co pokazuje |
|---|---|
| `?skip` | pominięcie tworzenia postaci |
| `?lang=en\|pl` | język, ustawiony przed pierwszym napisem |
| `?era=merchants_smugglers` | era otwierająca się **wewnątrz wojny** |
| `?famine=<port>` | miasto pod żywym zdarzeniem głodu, z przeliczonymi cenami |
| `?hail=<port>` | przyjazny kupiec w zasięgu zawołania |
| `?encounter=<port>` | ten sam kupiec w zasięgu spotkania — ekran otwiera się sam |
| `?approach=<port>` | statek na redzie, dialog zbliżania otwiera się sam |
| `?duel=7&foe=4` | pojedynek kapitanów wprost |

> `?battle=` stawia przeciwnika **425 px** od gracza, a działa sięgają 320. Do
> v0.85.0 znaczyło to bitwę, w której **nikt nie mógł strzelić i nikt nie
> zamierzał się zbliżyć**: zero salw w 120 sekundach, koniec z zegara.
| `?pardon=<port>` | ułaskawienie na ladzie |
| `?battle=1\|trader\|navy\|pirate\|hunter` | bitwa morska wprost |
| `?defeat=alone\|consort` | ostatnia minuta przegranej bitwy |
| `?siege=<port>` · `?defend=<port>` · `?relief=<port>` | trzy tryby bitwy lądowej |
| `?village=<...>` | wioska Indian |
| `?crew=16` | kapitan z niedoborem rąk |
