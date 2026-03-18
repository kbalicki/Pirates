# 01 — Game Design Document

## Wizja gry

**Pirates Chronicles** to przeglądarkowa gra 2D top-down osadzona na Karaibach w epoce Złotego Wieku Piractwa (1560–1700). Gra czerpie bezpośrednio z mechanik klasyka **Sid Meier's Pirates!** (Amiga, 1987) — łącząc eksplorację otwartego morza, handel, dyplomację frakcji, bitwy morskie i lądowe, pojedynki szermierskie oraz fabułę osobistą kapitana.

### Kluczowe założenia

- **Retro pixel art** — estetyka inspirowana wersją Amiga/C64, kafelki 32×32, sprite'y w palecie retro
- **Open world** — swobodna żegluga po mapie Karaibów (3200×2400 px), 45 realnych portów
- **Sandbox + story** — gracz sam wybiera drogę (pirat, korsarz, kupiec), ale wplecione są wątki fabularne
- **Systemy emergentne** — pogoda, ekonomia, reputacja frakcji, wydarzenia historyczne tworzą żywy świat
- **Deterministyczny silnik** — replay-ready, stały tick 20/s, immutable state, RNG Mulberry32

## Inspiracja: Sid Meier's Pirates! (1987)

Mechaniki bazowe przeniesione z oryginału:

| Mechanika oryginału | Status w Pirates Chronicles |
|---------------------|----------------------------|
| Żegluga po Karaibach | ✅ Zaimplementowane |
| System wiatru wpływający na prędkość | ✅ Zaimplementowane |
| Handel towarami w portach | ✅ Zaimplementowane |
| 4 nacje europejskie + piraci | ✅ Zaimplementowane (5 frakcji) |
| Reputacja u frakcji | ✅ Zaimplementowane |
| Bitwy morskie | ✅ Podstawowa wersja |
| Listy kaperskie (Letter of Marque) | ✅ Zaimplementowane |
| Rangi i tytuły | ✅ Zaimplementowane |
| Ery historyczne | ✅ 6 er (1560-1680) |
| Starzenie się kapitana | ⬜ Planowane |
| Podział łupów z załogą | ⬜ Planowane |
| Córki gubernatorów | ⬜ Planowane |
| Poszukiwanie rodziny | ⬜ Planowane |
| Mapy skarbów | ⬜ Planowane |
| Pojedynki szermierskie | ⬜ Planowane |
| Atakowanie miast z morza/lądu | ⬜ Planowane |
| Floty AI na mapie | ⬜ Planowane |
| Uszkodzenia statku (kadłub + żagle) | 🔶 Częściowo (HP) |
| Kupowanie/zmienianie statków | ✅ Zaimplementowane |
| Rekrutacja załogi | ✅ Zaimplementowane |
| Plotki w tawernach | ✅ Podstawowa wersja |

## Główne pętle gameplay

### 1. Pętla eksploracji (Exploration Loop)
```
Żegluga po mapie → Odkrywanie portów → Handel → Zarabianie złota
     ↓                                              ↓
Spotkania na morzu ←── Bitwy/Ucieczka ←── Ulepszanie statku
```

### 2. Pętla reputacji (Reputation Loop)
```
Wybór frakcji → Misje/Listy kaperskie → Wzrost rangi
     ↓                                       ↓
Wrogość innych frakcji ←── Korzyści dyplomatyczne
```

### 3. Pętla fabularna (Story Loop)
```
Plotki w tawernach → Tropy → Poszukiwanie rodziny / skarbów
     ↓                              ↓
Córki gubernatorów → Punkty doświadczenia → Awans
```

### 4. Pętla bitewna (Combat Loop)
```
Spotkanie wroga → Bitwa morska → Abordaż / Zatopienie
     ↓                                   ↓
Bitwa lądowa ←── Atak na miasto ←── Łupy + reputacja
```

## Systemy gry — przegląd

### Nawigacja i żegluga
- Statek sterowany klawiaturą WSAD, ciągły obrót + poziom żagli (0–100%)
- Wiatr wpływa na prędkość: nawietrzna = bonus, pod wiatr = kara
- Tereny: morze pełne, płycizny (60% prędkości), rafy (30% + damage), ląd (auto-desant)
- System desantowania: załoga schodzi na ląd, statek kotwicy

### Pogoda
- Sezonowy model wiatru (trade winds karaibskie)
- Mean-reversion: kierunek i siła wracają do bazowych wartości
- Sztormy: losowe, częstsze w sezonie huraganowym (sierpień–październik)

### Ekonomia
- 6 towarów: cukier, tytoń, kakao, rum, jedzenie, woda
- Ceny dynamiczne per port (podaż/popyt)
- Modyfikatory cen zależne od reputacji frakcji
- Jedzenie i woda konsumowane przez załogę (morale)

### Frakcje i reputacja
- 5 frakcji: Hiszpania, Anglia, Francja, Holandia, Piraci
- Reputacja -100 do +100 per frakcja
- Poziomy: wrogi → nieprzyjazny → neutralny → przyjazny → sojusznik
- Wpływ na ceny, dostęp do portów, misje

### Walka morska
- Osobna arena 800×600
- Sterowanie: żagle + obrót + strzał z burt
- Armaty: zasięg 160j, cooldown 3s, obrażenia kadłub/żagle
- AI wroga: pościg/ucieczka
- Zakończenie: zatopienie, abordaż lub ucieczka

### Czas i kalendarz
- 1 tick = 1 minuta gry (przy prędkości ×1)
- Trzy prędkości: wolna (0.6), normalna (1.2), szybka (2.4)
- Kalendarz: rok/miesiąc/dzień, cykl dnia/nocy

### Załoga
- Konsumpcja jedzenia i wody per członek załogi/godzinę
- Morale: wpływa głód, pragnienie, sukcesy bojowe
- Śmiertelność przy morale < 20%

## Klasy statków

| Klasa | Prędkość | Zwrot | Kadłub | Żagle | Armaty | Ładunek | Załoga | Cena |
|-------|----------|-------|--------|-------|--------|---------|--------|------|
| Sloop | 2.5 | 0.06 | 60 | 50 | 8 | 40 | 30 | 500 |
| Brigantine | 2.2 | 0.05 | 80 | 70 | 16 | 60 | 50 | 800 |
| Merchantman | 1.8 | 0.04 | 100 | 90 | 12 | 100 | 60 | 1000 |
| Frigate | 2.3 | 0.06 | 110 | 100 | 24 | 70 | 80 | 1500 |
| Galleon | 1.5 | 0.03 | 150 | 120 | 32 | 120 | 120 | 2500 |

## Mapa i geografia

- Realne Karaiby zmapowane Mercatorem na 3200×2400 px
- 45 portów z prawdziwymi lokalizacjami (Havana, Port Royal, Nassau, Tortuga...)
- 100+ poligonów lądowych z Natural Earth Data
- 9+ stref spotkań z różnym poziomem ryzyka

## Postać gracza

### Tworzenie kapitana
1. **Krok 1:** Imię + wybór ery historycznej (1560–1680)
2. **Krok 2:** Narodowość + rozdział 10 punktów umiejętności

### Umiejętności (1–10, bazowo 5)
- **Szermierka** — pojedynki, abordaż
- **Artyleria** — celność armat, damage
- **Nawigacja** — prędkość, unikanie raf
- **Medycyna** — leczenie załogi, odporność na choroby
- **Urok** — dyplomacja, córki gubernatorów, plotki

## Sterowanie

| Klawisz | Żegluga | Na lądzie | W bitwie |
|---------|---------|-----------|----------|
| W/↑ | Podnieś żagle | Idź w górę | Podnieś żagle |
| S/↓ | Opuść żagle | Idź w dół | Opuść żagle |
| A/← | Skręt lewo | Idź w lewo | Skręt lewo |
| D/→ | Skręt prawo | Idź w prawo | Skręt prawo |
| E | Interakcja z portem | — | Ogień prawa burta |
| Q | — | — | Ogień lewa burta |
| ESC | Pauza | Pauza | Próba ucieczki |
