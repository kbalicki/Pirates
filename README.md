# Pirates Chronicles

Przeglądarkowa gra 2D top-down w stylu klasycznych "Piratów" z lat 80. Stylizowana mapa Karaibów, handel, bitwy morskie, reputacja frakcji.

## Tech stack

- **TypeScript** + **Phaser 3.87** (silnik gry 2D)
- **Vite 7.3** (bundler + dev server)
- **IndexedDB** via `idb` (zapis/odczyt gry)
- Placeholder sprite'y generowane skryptem Node

## Uruchomienie

```bash
# 1. Instalacja zależności (jednorazowo)
npm install

# 2. Wygenerowanie placeholder sprite'ów (jednorazowo)
node scripts/generate-placeholders.js

# 3. Uruchomienie serwera deweloperskiego
npm run dev
```

Gra otworzy się automatycznie pod adresem **http://localhost:3000**.

### Build produkcyjny

```bash
npm run build     # buduje do katalogu dist/
npm run preview   # podgląd builda produkcyjnego
```

## Serwer deweloperski

- `npm run dev` uruchamia serwer Vite z hot-reload
- Działa dopóki terminal jest otwarty — **zamknięcie konsoli kończy serwer**
- Po restarcie konsoli trzeba ponownie uruchomić `npm run dev`
- Vite automatycznie przeładowuje przeglądarkę przy zmianach w kodzie

## Sterowanie

| Klawisz | Akcja |
|---------|-------|
| **W** | Podniesienie żagli (przyspieszenie) |
| **S** | Opuszczenie żagli (hamowanie) |
| **A / D** | Skręt lewo / prawo |
| **E** | Zbliżenie do portu (w zasięgu doku) |
| **ESC** | Pauza / anuluj |
| **Q / E** (bitwa) | Ogień z lewej / prawej burty |

## Porty i frakcje

Przy zbliżaniu do portu (klawisz **E**) pojawia się okno akcji:

- **Port przyjazny/neutralny**: Wejdź do portu / Odpłyń
- **Port wrogi**: Zakradnij się / Atakuj (forty) / Odpłyń

Sukces zakradania zależy od morale załogi i notoriety gracza.

### Frakcje

| Frakcja | Kolor | Porty |
|---------|-------|-------|
| Hiszpania | czerwony | Havana, Santo Domingo, Cartagena |
| Anglia | niebieski | Port Royal |
| Francja | granatowy | Martinique |
| Holandia | pomarańczowy | Curacao |
| Piraci | szary | Nassau, Tortuga |

## Struktura projektu

```
src/
  core/           # Czysta logika gry (bez Phasera)
    model/        # Typy: WorldState, EntityState, Commands, Events
    data/         # Dane statyczne: porty, statki, frakcje, towary
    engine/       # WorldEngine, CombatEngine, reducery
    systems/      # Nawigacja, ekonomia, pogoda, reputacja, czas
    services/     # RNG, geometria, walidacja, serializacja
  game/           # Warstwa Phaser
    scenes/       # Sceny: MainMap, Port, SeaBattle, PortApproach, ...
    render/       # Renderery: WorldRenderer, CameraController, Minimap, FX
    input/        # InputMapper, CommandQueue
  persistence/    # IndexedDB: SaveRepository, migracje
assets/
  sprites/        # Sprite'y statków (8 kierunków, 32x32)
  tiles/          # Kafelki morza/lądu
scripts/
  generate-placeholders.js  # Generator placeholder sprite'ów
```

## Architektura

- **WorldState** jest jedynym źródłem prawdy — czysty TypeScript, bez importów Phasera
- **Command pattern** — wszystkie akcje gracza to komendy (SetSailLevel, Turn, EnterPort, ...)
- **Stały tick 20/s** z akumulatorem delta, niezależny od FPS renderowania
- **Immutable state** — każdy tick produkuje nowy obiekt stanu (spread operators)
- **Deterministyczny RNG** (Mulberry32) — replay-ready

## Fazy implementacji

- [x] Faza 0-1: Scaffold + typy + mapa proceduralna
- [x] Faza 2: Sterowanie statkiem (WSAD), kamera, HUD
- [x] Faza 3: Porty z handlem, dialog zbliżania do portu
- [x] Faza 4: System reputacji i frakcji
- [x] Faza 5: Bitwy morskie (podstawowe)
- [ ] Faza 6: AI statków (patrole, handlarze, piraci)
- [ ] Faza 7: Zapis/odczyt (IndexedDB)
- [ ] Faza 8: Questy
- [ ] Faza 9: Tiled mapa + prawdziwe sprite'y
