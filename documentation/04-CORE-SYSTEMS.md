# 04 — Systemy gry

## Przegląd systemów

| System | Plik | Odpowiedzialność |
|--------|------|------------------|
| Navigation | `NavigationSystem.ts` | Ruch, kolizje, auto-desant |
| Weather | `WeatherSystem.ts` | Wiatr, sztormy, sezonowość |
| Economy | `EconomySystem.ts` | Handel, ceny, transakcje |
| Time | `TimeSystem.ts` | Kalendarz, cykl dnia/nocy |
| Reputation | `ReputationSystem.ts` | Relacje frakcji |
| Combat | `CombatSystem.ts` + `CombatEngine.ts` | Bitwy morskie |
| CrewConsumption | `CrewConsumptionSystem.ts` | Jedzenie, woda, morale |
| PortInteraction | `PortInteractionSystem.ts` | NPC w portach |
| Encounter | `EncounterSystem.ts` | Losowe spotkania |
| EventLog | `EventLogSystem.ts` | Historia zdarzeń |
| Quest | `QuestSystem.ts` | Zadania (placeholder) |

Wszystkie systemy znajdują się w `src/core/systems/`.

---

## NavigationSystem

**Główna funkcja:** `updateNavigation(entity, weather, terrainAt, dtTicks) → EntityState`

### Obliczanie prędkości

```
effectiveSpeed = shipClass.speedBase × sailLevel × windSpeedModifier × sailDamageRatio

windSpeedModifier = 0.7 + 0.8 × cos(heading - windDirection)
  → pod wiatr:  min ~0.3 (kara)
  → z wiatrem:  max ~1.5 (bonus)

sailDamageRatio = currentSailsHP / maxSailsHP
  → uszkodzone żagle = wolniejszy statek
```

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

## CombatEngine

### Arena bitewna

- Osobna scena 800×600 px
- Gracz vs 1 wróg (rozszerzenie na wielu wrogów planowane)
- Komendy: `SetSailLevel`, `Turn`, `FireCannons`, `AttemptDisengage`

### Parametry walki

| Parametr | Wartość |
|----------|---------|
| Cannon cooldown | 60 ticków (3s) |
| Cannon range | 160 jednostek |
| Hull damage | 8 HP / trafienie |
| Sail damage | 5 HP / trafienie |

### AI wroga

- Pościg gdy ma przewagę
- Ucieczka gdy kadłub < 30%
- Strzelanie w zasięgu
- Prosta logika (do rozbudowy)

### Zakończenie bitwy

- Kadłub ≤ 0: zatopienie (łupy: złoto + losowy cargo)
- Gracz ucieka: `AttemptDisengage` (wymaga dystansu)
- Abordaż: planowany (porównanie załóg)

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
