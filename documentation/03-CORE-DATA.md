# 03 — Dane statyczne

## Statki (`src/core/data/ships.ts`)

9 klas statków wzorowanych na oryginale Sid Meier's Pirates!. Pełny opis w [12-SHIP-CLASSES.md](12-SHIP-CLASSES.md).

`speedBase` to jednostki świata na tick przy pełnych żaglach i bez modyfikatora wiatru; komentarz w kodzie podaje odpowiadającą prędkość w węzłach. Fregata (12 kn) jest benchmarkiem, do którego wyskalowane są pozostałe klasy.

| Klasa | speedBase | kn | turnRate | hullMax | sailsMax | cannons | cargoCap | crewMax | buyPrice |
|-------|-----------|----|----------|---------|----------|---------|----------|---------|----------|
| Pinnace | 0.167 | 8 | 0.84 | 30 | 30 | 4 | 20 | 15 | 200 |
| Sloop | 0.208 | 10 | 0.72 | 60 | 50 | 8 | 40 | 30 | 500 |
| Barque | 0.188 | 9 | 0.54 | 70 | 60 | 12 | 80 | 40 | 800 |
| Brigantine | 0.229 | 11 | 0.60 | 80 | 70 | 16 | 60 | 50 | 1200 |
| Fluyt | 0.125 | 6 | 0.42 | 90 | 70 | 12 | 180 | 40 | 1500 |
| Frigate | 0.250 | 12 | 0.48 | 120 | 90 | 28 | 80 | 80 | 3000 |
| Fast Galleon | 0.188 | 9 | 0.36 | 150 | 100 | 24 | 100 | 100 | 4500 |
| Galleon | 0.167 | 8 | 0.30 | 180 | 120 | 36 | 150 | 120 | 6000 |
| Merchantman | 0.104 | 5 | 0.24 | 100 | 80 | 12 | 250 | 60 | 2000 |

### Parametry żeglarskie

Poza statystykami bojowymi każda klasa niesie parametry używane przez model wiatru i system lunety:

| Pole | Znaczenie |
|------|-----------|
| `minWindAngle` | Kąt martwej strefy w stopniach — poniżej niego statek nie robi drogi. Takielunek skośny (fore-and-aft) 30-35°, rejowy (square) do 60°. |
| `mastHeight` | Wysokość masztu — wyznacza zasięg obserwacji (luneta). Najwyższy maszt we flocie decyduje o zasięgu gracza. |
| `rigType` | "Fore-and-aft" / "Square" / "Mixed" — opisowe, pokazywane w UI. |
| `tonnage`, `draft` | Wyporność i zanurzenie — opisowe, planowane do mechaniki mielizn. |
| `armor` | Redukcja obrażeń od kul 0.10-0.50; galeon pochłania połowę. |

**Charakterystyka:**
- **Pinnace** — najtańszy, najzwrotniejszy, praktycznie bezbronny. Statek startowy.
- **Sloop** — szybki i zwinny, świetnie idzie pod wiatr. Klasyczny statek piracki.
- **Barque / Brigantine** — balans prędkości i siły ognia; brygantyna to najszybszy korsarz.
- **Fluyt / Merchantman** — ogromna ładownia, ślamazarne. Cel dla piratów, nie narzędzie.
- **Frigate** — najlepszy okręt bojowy: 12 kn i 28 dział.
- **Fast Galleon / Galleon** — ciężkie, wolno skręcają, ale pancerz i 24-36 dział wygrywają wymianę burtową.

## Porty (`src/core/data/cities.ts`)

45 portów karaibskich z rzeczywistymi współrzędnymi (projekcja Mercatora → 3200×2400 px):

### Porty hiszpańskie
Havana, Santiago de Cuba, Santo Domingo, San Juan, Cartagena, Portobelo, Panama City, Veracruz, Campeche, Trinidad, Maracaibo, Cumana, Margarita, Santa Marta, Rio de la Hacha, Puerto Cabello, Nombre de Dios, Trujillo, Granada, Villa Hermosa, Vera Cruz, Caracas

### Porty angielskie
Port Royal, Barbados, St. Kitts, Antigua, Belize, Bermuda, Grand Cayman

### Porty francuskie
Martinique, Guadeloupe, Port-de-Paix, Petit-Goâve, Cayenne, St. Martin

### Porty holenderskie
Curaçao, St. Eustatius, Bonaire, Aruba, Saba

### Porty pirackie
Nassau, Tortuga, Isle de la Vache

### Atrybuty portu

```typescript
{
  id: PortId,
  name: string,
  pos: Vec2,                    // pozycja na mapie (piksele)
  dockRadius: number,           // zasięg doku (do interakcji)
  faction: FactionId,           // właściciel
  marketLevel: 1-4,             // poziom rynku (asortyment)
  shipyardLevel: 1-4,           // poziom stoczni (dostępne statki)
  size: "small" | "medium" | "large" | "capital",
  wealth: "poor" | "modest" | "prosperous" | "wealthy",
  produces: ItemId[],           // produkowane towary (tańsze)
  demands: ItemId[],            // poszukiwane towary (droższe)
}
```

## Frakcje (`src/core/data/factions.ts`)

| Frakcja | ID | Kolor | Stolica |
|---------|-----|-------|---------|
| Hiszpania | spain | #CC3333 (czerwony) | Havana |
| Anglia | england | #3366CC (niebieski) | Port Royal |
| Francja | france | #003399 (granatowy) | Martinique |
| Holandia | netherlands | #FF8C00 (pomarańczowy) | Curaçao |
| Piraci | pirates | #666666 (szary) | Nassau |

Każda frakcja posiada:
- Nazwę i kolor identyfikacyjny
- Sieć portów
- System rang (od matrosa do admirała)
- Relacje z innymi frakcjami

## Towary (`src/core/data/items.ts`)

| Towar | ID | Cena bazowa | Waga | Typ |
|-------|----|-------------|------|-----|
| Cukier trzcinowy | sugar | 10 | 2 | handlowy |
| Tytoń | tobacco | 15 | 1 | handlowy |
| Kakao | cocoa | 20 | 1 | handlowy |
| Rum | rum | 12 | 1 | handlowy |
| Jedzenie | food | 5 | 1 | konsumpcyjny |
| Woda | water | 3 | 1 | konsumpcyjny |

**Mechanika cen:**
- Cena = bazowa × modyfikator podaży/popytu × modyfikator reputacji
- Port producenta: cena niższa (kupuj tanio)
- Port z popytem: cena wyższa (sprzedaj drogo)
- Reputacja wroga: +30% do cen; sojusznik: -15%

## Ery historyczne (`src/core/data/eras.ts`)

| Era | Rok start | Opis |
|-----|-----------|------|
| Silver Empire | 1560 | Dominacja Hiszpanii, floty srebrne |
| Merchants & Smugglers | 1600 | Rozkwit handlu, przemyt |
| New Colonists | 1620 | Nowe kolonie angielskie i francuskie |
| War for Profit | 1640 | Wojny korsarskie między mocarstwami |
| Buccaneer Heroes | 1660 | Złoty wiek bukanierów |
| Pirates' Sunset | 1680 | Zmierzch piractwa, polowania na piratów |

Wybór ery wpływa na:
- Rok startowy
- Układ frakcji na mapie (planowane)
- Dostępność misji i wydarzeń (planowane)

## Rangi (`src/core/data/ranks.ts`)

System rang per frakcja — awansuje się za zasługi u gubernatora:

**Przykład (Anglia):** Sailor → Officer → Captain → Major → Colonel → Admiral → Governor

## Strefy map (`src/core/data/mapZones.ts`)

9+ stref z różnym poziomem ryzyka spotkań:
- `risk: 0.0–1.0` — prawdopodobieństwo spotkania
- Typy spotkań per strefa: pirat, patrol marynarki, sztorm
- Strefy blisko szlaków handlowych mają wyższe ryzyko

## Wiatr (`src/core/data/wind.ts`)

Sezonowe parametry wiatru (Caribbean trade winds):

```typescript
MONTHLY_WIND[0-11] = {
  direction: number,   // radiany, bazowy kierunek
  strength: number     // 0-1, bazowa siła
}
```

- Zima: silne wiatry wschodnie (trade winds)
- Lato: słabsze, bardziej zmienne
- Sierpień-październik: sezon huraganowy

## Geografia (`src/core/data/geography.ts`)

- Źródło: Natural Earth Data + OpenStreetMap (Overpass API)
- Format: `caribbean_geo.json` (140 KB)
- 100+ poligonów lądowych
- Projekcja: Mercator → 3200×2400 px
- Klasyfikacja terenu per kafelek: morze, płycizna, rafa, ląd

## Amunicja (`src/core/data/ammo.ts`)

Trzy typy pocisków przełączane w bitwie klawiszami 1/2/3. Każdy ma własne mnożniki obrażeń i zasięgu; zmiana typu resetuje przeładowanie obu burt.

| Typ | Kadłub | Żagle | Załoga | Zasięg | Zastosowanie |
|-----|--------|-------|--------|--------|--------------|
| Kula (round) | pełne | niskie | niskie | pełny | zatapianie |
| Łańcuchówka (chain) | niskie | pełne | niskie | skrócony | unieruchomienie |
| Kartacz (grape) | minimalne | niskie | pełne | najkrótszy | zmiękczenie przed abordażem |

## Ekonomia bazowa (`src/core/data/economyBaselines.ts`)

Punkty odniesienia dla żywej ekonomii: docelowa populacja, zamożność (0-1000) i siła garnizonu (0-100) każdego portu. `EconomyTickSystem` codziennie ściąga bieżące wartości w stronę tych baseline'ów, a `EventEffectsSystem` je od nich odpycha.

## Pozostałe pliki danych

| Plik | Zawartość |
|------|-----------|
| `geography.ts` | Wielokąty lądów (`LANDMASSES`) wczytywane z `caribbean_geo.json` + fallback |
| `prices.ts` | Inicjalizacja cen i zapasów portowych |
| `quests.ts` | Definicje zadań — obecnie puste, patrz [TODO.md](../TODO.md) |
