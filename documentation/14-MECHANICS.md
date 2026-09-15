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

---

## 6. Pogoda

### Szkwał

| stała | wartość | znaczenie |
|---|---|---|
| `StormSystem.STORM_SAFE_SAIL` | 0.5 | powyżej tego płótna szkwał je drze |
| `StormSystem.STORM_RIG_SHARE_PER_TICK` | 0.0004 | ile takielunku ubywa na tik |
| `StormSystem.STORM_VISION_SHARE` | 0.55 | do ilu spada luneta |

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

### Mgła

Pierwsza pogoda, która **nie jest zagrożeniem**: nie zabiera statkowi nic, za to
tnie wzrok **obu stronom**.

| stała | wartość | znaczenie |
|---|---|---|
| `FogSystem.FOG_MAX_WIND` | 0.35 | powyżej tej siły wiatru mgły nie ma |
| `FogSystem.FOG_VISION_SHARE` | 0.35 | do ilu spada luneta gracza |
| `FogSystem.FOG_AWARENESS_SHARE` | 0.45 | do ilu spada czujność NPC |
| `FogSystem.FOG_CELL` | 420 | rozdzielczość pola mgły |
| `FogSystem.FOG_PATCH_FLOOR` | 0.55 | próg, od którego łata mgły istnieje |
| `FogSystem.FOG_VISIBLE` | 0.12 | gęstość, przy której gracz ją widzi |
| `FogSystem.FOG_LIFTED` | 0.05 | gęstość, przy której komunikat znika |

### Wzrok

`visionRangeForMast(maszt) = 25 + maszt × 1.14` (`WorldRenderer`, warstwa gry).
Czyli pinasa (maszt 10) widzi ~36, galeon (35) ~65 jednostek. Mgła i sztorm
mnożą ten zasięg przez swoje udziały powyżej.

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
| produkcja dzienna | `2 + poziom × 2` | **4–12** jednostek |
| pojemność magazynu | `poziom × 50` dla tego, co uprawia | 50–250, a **30** dla reszty |

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

**Standing poniżej neutralnego jest ulicą jednokierunkową**: list kaperski
wymaga `friendly`, zlecenie obrony wymaga listu, córka wymaga `friendly`,
a kantor **nie ma pracy poniżej neutralnego w ogóle**. Zostaje jedno wejście:
miejski spichlerz, wart +8, i tylko gdy miasto przymiera głodem.

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

**Ale dolnego końca nie da się dosięgnąć dla towaru importowanego.** „Równowaga”
to **trzydzieści dni konsumpcji** (`DEMAND_HORIZON_DAYS`), czyli w dużym mieście
do 135 ton, a magazyn na towar, którego miasto nie uprawia, mieści **30**. Iloraz
jest więc przyklejony do sufitu niezależnie od stanu półki. Zmierzone na 45
portach: **23 ze 130 notowań importowych nie może zejść z ×3 nigdy** (przed
v0.66.0 było ich 51). To jest **decyzja do podjęcia**, nie błąd — wpisana
w TODO §4.

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

**Uzupełnianie jest zawieszone poniżej pełnej dostawy.** Dowóz ponad dzienną
potrzebę to właśnie ten handel, który kordon, czarna bandera i wojna wstrzymują —
i na tym polegało ich ukąszenie, bo działały przez zostawianie miastu dziennego
deficytu przy zerowym buforze. Miasto, któremu przerwano handel, **wydaje** swój
magazyn, nie napełnia go.

### Siedem towarów

| towar | cena bazowa | waga | kategoria |
|---|---|---|---|
| sugar_cane | 10 | 2 | trade |
| tobacco | 15 | 1 | trade |
| cocoa | 20 | 1 | trade |
| rum | 12 | 1 | trade |
| food | 5 | 1 | supply |
| water | 3 | 1 | supply |
| **gold** | 80 | 1 | trade, `rare` |

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

Tawerna mówi o tym, co się dzieje w promieniu 1300 (`RumorSystem`): głód,
blokada, przecięty szlak, czarna bandera, najruchliwsze nabrzeże, sojusz.
Jedna plotka dziennie, rotuje po dniu i po mieście.

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
| `PredationSystem.WITNESS_RANGE` | 700 | z jakiej odległości gracz to zobaczy |

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

Arena, trzy typy amunicji, łuki ostrzału ±60°.

| stała | wartość | znaczenie |
|---|---|---|
| `CombatSystem.CANNON_RANGE` | 480 | **wartość zapasowa**, nie zasięg: prawdziwy liczy się per bitwa jako **połowa szerokości areny** |
| `CombatSystem.CANNON_COOLDOWN_TICKS` | 180 | najlepsza możliwa kadencja burty (9 s) |
| `CombatSystem.CANNON_DAMAGE_HULL` | 3.5 | obrażenia w kadłub na trafienie |
| `CombatSystem.CANNON_DAMAGE_SAILS` | 3.0 | obrażenia w takielunek |
| `CombatSystem.CANNON_DAMAGE_CREW` | 4.5 | straty w ludziach |
| `CombatSystem.NEUTRAL_GUNNERY` | 5 | kanonierka, przy której celność jest nominalna |

### Amunicja

| typ | kadłub | żagle | załoga | zasięg |
|---|---|---|---|---|
| round (kule) | ×1.0 | ×0.55 | ×0.40 | ×1.0 |
| chain (łańcuchowa) | ×0.15 | **×4.5** | ×0.10 | ×0.9 |
| grape (kartacz) | ×0.10 | ×0.0 | **×1.30** | ×0.5 |

Kadencja przeładowania = f(załoga × morale × wyszkolenie).

### Abordaż

| stała | wartość | znaczenie |
|---|---|---|
| `BoardingSystem.BOARDING_RANGE` | 30 | z jakiej odległości można wejść |
| `BoardingSystem.BOARDING_MAX_ENEMY_HULL` | 0.35 | kadłub wroga musi być poniżej tego |
| `BoardingSystem.BOARDING_MAX_ENEMY_CREW` | 0.5 | albo załoga poniżej tego |

`B` w bitwie → pojedynek → wynik decyduje o przejęciu.

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

**Sześć ton rumu kupuje złoto** — jedyne dobro `rare`, którego żaden port nie
trzyma na ladzie — i kupuje zaufanie. Zaufanie przy 60 kupuje **najazd na
sąsiednią kolonię** (`native_raid`: −40 obrony, −15% ludzi, −150 bogactwa).
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
| `DuelScene` | abordaż, zasadzka przy skarbie, wątek rodzinny | pojedynek na tor przewagi |
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

**Menu (`Spacja`)** — `1`–`6` i strzałki po zakładkach, `Esc` zamyka.
Zakładki: Kajuta · Kapitan · Dziennik · Kalendarz · Ustawienia · Zapis · Mapa.

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
| `?pardon=<port>` | ułaskawienie na ladzie |
| `?battle=1\|trader\|navy\|pirate\|hunter` | bitwa morska wprost |
| `?defeat=alone\|consort` | ostatnia minuta przegranej bitwy |
| `?siege=<port>` · `?defend=<port>` · `?relief=<port>` | trzy tryby bitwy lądowej |
| `?village=<...>` | wioska Indian |
| `?crew=16` | kapitan z niedoborem rąk |
