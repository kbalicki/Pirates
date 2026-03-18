# 03 — Dane statyczne

## Statki (`src/core/data/ships.ts`)

5 klas statków wzorowanych na oryginale Sid Meier's Pirates!:

| Klasa | speedBase | turnRate | hullHP | sailsHP | cannons | cargoMax | crewMax | price |
|-------|-----------|----------|--------|---------|---------|----------|---------|-------|
| Sloop | 2.5 | 0.06 | 60 | 50 | 8 | 40 | 30 | 500 |
| Brigantine | 2.2 | 0.05 | 80 | 70 | 16 | 60 | 50 | 800 |
| Merchantman | 1.8 | 0.04 | 100 | 90 | 12 | 100 | 60 | 1000 |
| Frigate | 2.3 | 0.06 | 110 | 100 | 24 | 70 | 80 | 1500 |
| Galleon | 1.5 | 0.03 | 150 | 120 | 32 | 120 | 120 | 2500 |

**Charakterystyka:**
- **Sloop** — szybki, zwinny, mało armat. Idealny na początek i ataki z zaskoczenia.
- **Brigantine** — balans prędkości i siły ognia. Dobry korsarz.
- **Merchantman** — duży ładunek, wolny. Statki handlowe AI.
- **Frigate** — najlepsza bojowa. Szybka, ciężko uzbrojona.
- **Galleon** — kolos. Dużo armat i ładunku, ale ociężały.

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
