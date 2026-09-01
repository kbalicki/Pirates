# Playbook — orientacja w kodzie

## Podział warstw

```
src/core/        Czysta logika gry. ZERO importów z Phasera. Testowalna bez silnika.
src/game/        Warstwa Phaser: sceny, renderery, input, UI. Importuje z core/ i persistence/.
src/persistence/ IndexedDB, migracje. Importuje tylko z core/model/.
```

**Reguła nadrzędna:** jeśli piszesz logikę gry i kusi cię `import Phaser`, jesteś w złym katalogu.
Logika idzie do `src/core/systems/` jako czysta funkcja `(state, ...) → state`, a scena tylko ją woła i rysuje wynik.

## Gdzie co mieszka

| Chcę zmienić | Idź do |
|---|---|
| Ruch statku, kolizje, desant | `core/systems/NavigationSystem.ts` |
| Wiatr, sztormy, krzywa prędkości | `core/systems/WeatherSystem.ts` |
| Bitwa — stałe i wzory | `core/systems/CombatSystem.ts` |
| Bitwa — symulacja | `core/engine/CombatEngine.ts` |
| Bitwa — warstwa wizualna | `game/scenes/SeaBattleScene.ts` |
| Abordaż | `core/systems/BoardingSystem.ts` |
| Ekonomia miast (dzienny tick) | `core/systems/EconomyTickSystem.ts` |
| Wydarzenia świata, wojny | `core/systems/WorldEventSystem.ts` |
| Skutki wydarzeń | `core/systems/EventEffectsSystem.ts` |
| Statki NPC | `core/systems/NpcSpawnSystem.ts`, `NpcAiSystem.ts`, `NpcNewsSystem.ts` |
| Flota gracza | `core/systems/FleetSystem.ts` |
| Port: gubernator/tawerna/kupiec/stocznia | `core/systems/PortInteractionSystem.ts` |
| Parametry statków | `core/data/ships.ts` |
| Miasta i porty | `core/data/cities.ts`, `ports.ts` |
| Główna mapa i pętla gry | `game/scenes/MainMapScene.ts` |
| Stałe UI (kompas, data, zoom) | `game/scenes/UIOverlayScene.ts` |
| Menu SPACE (kabina, flota, zapis) | `game/scenes/OptionsMenuScene.ts` |
| Woda, ląd, chmury, góry, palmy | `game/render/*Renderer.ts` |
| Teksty | `core/i18n/locales/en.ts` + `pl.ts` |

Pełny opis systemów: [`documentation/04-CORE-SYSTEMS.md`](../../../../documentation/04-CORE-SYSTEMS.md).

## Pułapki, które już raz kosztowały czas

### `pixelArt: true` wymusza `roundPixels: true`

Phaser ustawia `roundPixels` na kamerach niezależnie od configu. Bez `camera.setRoundPixels(false)` w `MainMapScene.create()` statek **drga** przy ruchu subpikselowym. To była prawdziwa przyczyna jittera, którego szukano wcześniej w tick rate — trzy warianty zmiany częstotliwości ticków nic nie dały.

### Zmiana `WorldState` bez migracji psuje zapisy

`migrateWorldState()` idzie pętlą `while (version < CURRENT_WORLD_VERSION)` po mapie `MIGRATIONS` i **rzuca wyjątkiem** przy brakującym kroku. Dodajesz pole → podnieś `CURRENT_WORLD_VERSION` i dopisz migrację uzupełniającą wartość domyślną. Nigdy nie nadpisuj istniejących danych gracza.

### Graphics vs Arc przy efektach na wodzie

Ślad torowy (wake) rysowany przez `Phaser.Graphics` daje niebieski prostokąt zamiast smugi. Używaj obiektów `Arc`. Podobnie maski: `GeometryMask` działa, `BitmapMask` przeciekała teksturą palm na wodę.

### Jednostki prędkości są małe

`speedBase` to ~0.1–0.25 jednostki świata **na tick** (12 kn fregaty = 0.250). Przy 20 tickach na sekundę statek pokonuje kilka pikseli na sekundę. Pisząc test albo debugując ruch, nie zakładaj, że statek przeskoczy 2 px w jednym ticku — nie przeskoczy.

### Konwencja kierunku wiatru

`windDirRad` to kierunek, **z którego** wieje. `heading` 0 = północ, rośnie zgodnie z ruchem wskazówek. Kąt do wiatru = `|heading − windDir|` złożony do 0–180°, gdzie 0° to dziób w wiatr (martwa strefa), a 180° to fordewind.

## Konwencje kodu

- Pliki i typy: `PascalCase`. Funkcje: `camelCase`. Stałe: `UPPER_SNAKE`. ID: `"camelCase"` stringi.
- Branded ID types (`EntityId`, `PortId`) — nie mieszaj z gołym `string`.
- Stan niemutowalny — spready, nie mutacje. Każdy tick produkuje nowy `WorldState`.
- RNG deterministyczny (Mulberry32), stan w `WorldState`. Nie używaj `Math.random()` w logice gry — psuje powtarzalność.
- Komentarze wyjaśniają **wzory i decyzje**, nie oczywistości. Wzór obrażeń, przeładowania czy krzywej wiatru opisz nad funkcją, z przykładami liczbowymi.
