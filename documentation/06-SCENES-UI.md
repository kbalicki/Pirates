# 06 — Sceny i UI

Wszystkie sceny Phaser w `src/game/scenes/`.

## Diagram flow scen

```
BootScene
    │
PreloadScene (ładowanie assetów)
    │
    ├── [Nowa gra] ──→ CharacterCreationScene
    │                       │
    │                       └──→ MainMapScene
    │
    └── [Wczytaj] ──→ SaveLoadScene
                         │
                         └──→ MainMapScene

MainMapScene (główna pętla)
    │
    ├── [ESC] ──→ PauseMenuScene
    │               ├── Resume ──→ MainMapScene
    │               ├── Options ──→ OptionsMenuScene
    │               ├── Save ──→ SaveLoadScene
    │               └── Quit ──→ BootScene
    │
    ├── [E w zasięgu portu] ──→ PortApproachScene
    │                              ├── Wejdź ──→ PortScene
    │                              ├── Atakuj ──→ SeaBattleScene
    │                              └── Odpłyń ──→ MainMapScene
    │
    ├── [Spotkanie] ──→ SeaBattleScene
    │                      ├── Wygrana ──→ MainMapScene (łupy)
    │                      ├── Przegrana ──→ MainMapScene (kary)
    │                      └── Ucieczka ──→ MainMapScene
    │
    └── [Wydarzenie fabularne] ──→ DialogueScene ──→ MainMapScene
```

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
  WindCompassRenderer.update()
  SeagullRenderer.update()
  MinimapRenderer.update()
```

**Elementy HUD:**
- Złoto (lewy górny)
- Data/czas (kalendarz)
- Załoga: current/max + pasek morale
- Kompas wiatru (prawy górny): róża wiatrów + igła
- Minimapa (lewy dolny)
- Wersja gry (prawy dolny, 12px)

### PortScene

Menu port:
1. **Gubernator** — listy kaperskie, rangi, misje
2. **Tawerna** — rekrutacja, drink (+morale), plotki
3. **Kupiec** — kupno/sprzedaż 6 towarów
4. **Stocznia** — naprawa (kadłub/żagle), kupno statku

Nawigacja: klawisze lub klik na opcje. ESC = wyjście z portu.

### SeaBattleScene

- Arena 800×600 px, oddzielna od mapy
- Statek gracza vs 1 wróg
- Sterowanie: WSAD (żagle + obrót), Q/E (armaty lewa/prawa burta)
- ESC = próba ucieczki
- HUD bitwy: HP kadłuba, HP żagli, cooldown armat

### PortApproachScene

Dialog zbliżania do portu:
- **Port przyjazny/neutralny:** Wejdź / Odpłyń
- **Port wrogi:** Zakradnij się / Atakuj / Odpłyń
- Sukces zakradania = f(morale, notoriety)

### DialogueScene

- Generyczny framework dialogowy
- Tekst narracyjny + opcje odpowiedzi
- Używany do: plotek, questów, wydarzeń fabularnych

### PauseMenuScene

- Overlay na MainMapScene
- Opcje: Resume, Options, Save, Load, Quit
- ESC = resume

### OptionsMenuScene

- Asset pack: basic / buccaneer / corsair
- Zoom: far / normal / close
- Język: English / Polski
- Podgląd statystyk kapitana
- Zmiany zapisywane do localStorage

### SaveLoadScene

- 5 slotów zapisu
- Każdy slot: tytuł, data, czas gry, wersja świata
- Quick save / Quick load
- Auto-migracja starych zapisów

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
