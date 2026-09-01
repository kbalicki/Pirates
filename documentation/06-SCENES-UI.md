# 06 — Sceny i UI

Wszystkie sceny Phaser w `src/game/scenes/`.

## Diagram flow scen

```
BootScene
    │
PreloadScene (ładowanie assetów)
    │
CharacterCreationScene ── [Nowa gra] ──→ MainMapScene
    └──────────────────── [Wczytaj slot] ──→ MainMapScene

MainMapScene (główna pętla)  ── równolegle działa UIOverlayScene (kompas, data, zoom)
    │
    ├── [SPACE] ──→ OptionsMenuScene (kabina, flota, ustawienia, zapis/odczyt)
    ├── [ESC]   ──→ PauseMenuScene
    ├── [H]     ──→ HelpScene (Sterowanie / Statki / Żeglowanie / Świat / Ekonomia)
    ├── [I na mieście] ──→ CityInfoScene
    │
    ├── [E w zasięgu portu] ──→ PortApproachScene
    │                              ├── Wejdź ──→ PortScene
    │                              ├── Atakuj ──→ SeaBattleScene
    │                              └── Odpłyń ──→ MainMapScene
    │
    └── [Zbliżenie do NPC] ──→ ShipEncounterScene
                                  ├── Informacje + newsy
                                  ├── Atakuj ──→ SeaBattleScene ── [H] ──→ BattleHelpScene
                                  │                    └── [B] abordaż ──→ DuelScene
                                  └── Odpłyń ──→ MainMapScene
```

**Uwaga:** zapis i odczyt gry mieszkają w `OptionsMenuScene` i `CharacterCreationScene`, nie w osobnej scenie. Dawne `SaveLoadScene` i `DialogueScene` były atrapami i zostały usunięte w v0.9.8.1. System dialogów wciąż nie istnieje — `DuelScene` (v0.10.0) go nie potrzebowała, ale moduły fabularne będą (patrz [TODO.md](../TODO.md)).

### DuelScene (v0.10.0)

Pojedynek kapitanów, uruchamiany nad **zapauzowaną** `SeaBattleScene` po naciśnięciu **B**, gdy `canBoard()` przepuści abordaż. Cała mechanika siedzi w `core/systems/DuelSystem.ts` — scena tylko rysuje stan i zamienia klawisze na akcje.

- **Q / W / E** — cios wysoki / średni / niski
- **A / S / D** — zasłona wysoka / średnia / niska
- Pasek pośrodku to dystans na pokładzie; dopchnięcie do końca kończy pojedynek
- Po rozstrzygnięciu scena oddaje wynik przez `onFinish`, wznawia bitwę i kolejkuje abordaż z narzuconym rezultatem

## Sceny — szczegóły

### BootScene

- Inicjalizacja systemu
- Logo / splash screen
- Autostart muzyki (pirate_adventure.wav)
- Wczytanie ustawień z localStorage
- Przejście do PreloadScene

### PreloadScene

- Ładowanie sprite'ów, tilemapów, audio, fontów
- Progress bar
- Detekcja asset packa (classic / generated / stylized)
- Wczytywanie odpowiednich zasobów na podstawie wyboru

### CharacterCreationScene

**Krok 1:**
- Pole tekstowe: imię kapitana
- Lista wyboru: era historyczna (6 er)
- Przycisk: dalej

**Krok 2:**
- Wybór narodowości (5 frakcji z flagami)
- Rozdział 10 punktów umiejętności (fencing, gunnery, navigation, medicine, charm)
- Bazowe = 5 per umiejętność, max 10
- Podgląd statystyk w czasie rzeczywistym
- Przycisk: rozpocznij grę

### MainMapScene — główna pętla

**Game loop (60 FPS):**
```
update(delta):
  tickAccumulator += delta
  while tickAccumulator >= TICK_MS (50ms):
    1. InputMapper.update() → komendy
    2. WorldEngine.apply(state, commands, 1 tick)
    3. WorldRenderer.sync(state)
    4. Obsługa transitions
    5. HUD update
    tickAccumulator -= TICK_MS

  // Co klatkę (nie co tick):
  CameraController.update()
  CloudRenderer.update()
  SeagullRenderer.update()
  WaterRenderer.update()
```

`camera.setRoundPixels(false)` w `create()` jest **obowiązkowe** — `pixelArt: true` wymusza `roundPixels: true`, co powoduje drgania statku przy ruchu subpikselowym.

**Stałe UI (`UIOverlayScene` — osobna scena, niezależna od zoomu):**
- Kompas wiatru (`WindCompassWidget`, proceduralny canvas)
- Data i czas gry
- Poziom ożaglowania (pod kompasem)
- Wersja gry
- Wskaźnik zoomu (lewy dolny róg, skala 0→10)

**Statystyki kapitana** (złoto, załoga, morale, wyszkolenie, ładownia) są w menu SPACE, zakładka Kabina — nie na stałym HUD-zie. Minimapa została usunięta w v0.9.2.

### PortScene

Menu port:
1. **Gubernator** — listy kaperskie, rangi, misje
2. **Tawerna** — rekrutacja, drink (+morale), plotki i lokalne newsy ze świata
3. **Kupiec** — kupno/sprzedaż 6 towarów
4. **Stocznia** — naprawa (kadłub/żagle), kupno statku, dokupienie jednostki do floty
5. **Wyjdź na ląd** — zwiedzanie pieszo (flaga `isOnFoot` propagowana z `MainMapScene`)

Nawigacja: klawisze lub klik na opcje. ESC = wyjście z portu.

### SeaBattleScene

- Arena 3× viewport, kamera wyśrodkowana na graczu
- W/S — cykl żagli (Złożone / Bojowe / Pełne), A/D — ster
- Q / E — burta lewa / prawa; łuki ±60° od trawersu
- 1 / 2 / 3 — kula / łańcuchówka / kartacz (zmiana resetuje przeładowanie)
- B — abordaż, ESC — próba ucieczki, H — `BattleHelpScene`
- HUD prawy górny: amunicja, żagle, prędkość, działa, wyszkolenie; morale przy obu statkach

### ShipEncounterScene

Menu spotkania z NPC w stylu Sid Meier's Pirates!:
- Informacje o statku (klasa, frakcja, załoga, działa) + newsy, które niesie
- Atakuj → `SeaBattleScene`
- Odpłyń → powrót na mapę

### PortApproachScene

Dialog zbliżania do portu:
- **Port przyjazny/neutralny:** Wejdź / Odpłyń
- **Port wrogi:** Zakradnij się / Atakuj / Odpłyń
- Sukces zakradania = f(morale, notoriety)

### CityInfoScene

Podgląd miasta bez wchodzenia do portu: populacja, zamożność i obrona z trendem (↑/↓ względem baseline'u) oraz lista aktywnych wydarzeń dotykających ten port.

### PauseMenuScene

- Overlay na MainMapScene
- ESC = resume

### OptionsMenuScene

Główne menu gry pod klawiszem SPACE — zakładki:
- **Kabina** — statystyki kapitana, wiek, umiejętności, wyszkolenie załogi
- **Flota** — lista statków, sprzedaż i porzucanie
- **Ustawienia** — asset pack, zoom, język, mgła wojny, tryb debug
- **Dźwięk** — 3 kanały (wiatr / mewy / muzyka), skala 0-10, aktualizacja na żywo
- **Zapis / Odczyt** — 5 slotów IndexedDB z auto-migracją

### HelpScene / BattleHelpScene

`HelpScene` (klawisz H na mapie) — 5 zakładek: Sterowanie, Statki, Żeglowanie, Świat, Ekonomia.
`BattleHelpScene` (H w bitwie) — sterowanie, wzory obrażeń i przeładowania, warunki abordażu i kapitulacji.

## System UI

### Fonty (`src/game/ui/textStyle.ts`)

| Stała | Font | Użycie |
|-------|------|--------|
| `UI_FONT` | "Dancing Script" | Główny font UI |
| `PIRATE_ICONS_FONT` | "Pirates" | Ikony pirackie |

**Helper `txt(size, options?)`:**
- Auto-skalowanie: size × 1.3
- Zwraca obiekt stylu Phaser Text
- Opcje: color, align, wordWrap

### Zasady UI

- Nigdy nie hardkodować fontu — zawsze `UI_FONT` lub `txt()`
- Font "Dancing Script" ładowany z `<link>` w index.html
- Pełne wsparcie polskich znaków: ą ć ę ł ń ó ś ź ż
