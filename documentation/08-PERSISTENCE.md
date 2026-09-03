# 08 — System zapisu (Persistence)

Wszystkie pliki w `src/persistence/`.

## Architektura

```
OptionsMenuScene / CharacterCreationScene (UI — 5 slotów)
    │
SaveRepository (API)
    │
SaveAdapter (interfejs)
    │
    ├── LocalSaveAdapter (IndexedDB)
    └── RemoteSaveAdapter (stub na przyszłość)
```

## SaveRepository

**API:**

```typescript
save(slotId: number, state: WorldState, combat?: CombatState): Promise<void>
load(slotId: number): Promise<SavePayload | null>
listSlots(): Promise<SaveMeta[]>
deleteSlot(slotId: number): Promise<void>
```

- 5 slotów zapisu (0–4)
- Operacje asynchroniczne (IndexedDB = async)
- Auto-migracja przy wczytywaniu starszych wersji

## SaveSchema

```typescript
type SaveMeta = {
  slotId: number;
  title: string;          // np. "Captain Jack - Day 42"
  createdAt: string;      // ISO date
  updatedAt: string;
  playtime: number;       // sekundy
  worldVersion: number;   // wersja stanu (do migracji)
};

type SavePayload = {
  meta: SaveMeta;
  world: WorldState;
  combat?: CombatState;   // jeśli zapis w trakcie bitwy
};
```

## LocalSaveAdapter (IndexedDB)

- Baza per użytkownik (UserIdentity)
- Nazwa bazy: `pc_saves_{userId}`
- Object store: `saves`
- Klucz: `slotId`
- Serializacja: JSON (WorldState → string → IndexedDB)

### UserIdentity

- UUID generowane przy pierwszym uruchomieniu
- Przechowywane w localStorage: `pc_user_id`
- Izoluje zapisy między użytkownikami na tym samym urządzeniu

## Migracje (`src/persistence/Migrations.ts`)

Aktualna wersja stanu: **10** (`CURRENT_WORLD_VERSION` w `Migrations.ts`)

| Wersja | Zmiany |
|--------|--------|
| v2 | Dodanie eventLog, migracja kluczy cargo, przebudowa inventarza portów |
| v3 | Dodanie playerName, eraId, startYear |
| v4 | Rozszerzenie z 27 do 45 miast |
| v5 | Dodanie profilu kapitana (defaults dla starych zapisów) |
| v6 | Dodanie pola `mode` ("sailing"/"landed") do wszystkich encji |
| v7 | Żywa ekonomia: `population`, `wealth`, `defense`, `bonusProduces` w każdym porcie — uzupełniane z baseline'ów |
| v8 | Dodanie `captain.training` (mechanika przeładowania), domyślnie 0.30 |
| v9 | Naprawa kształtu portów: `shipyardQueue` i `availableCrew` uzupełniane w portach przeniesionych z zapisów sprzed v2 |
| v10 | `player.lastPlunderDay` — zegar podziału łupów; w starych zapisach liczony od dnia wczytania, nie od dnia 1 |
| v11 | `player.citiesCaptured` i `player.courtship` — oba startują puste |
| v12 | `PortRuntimeState.garrison`, `capturedDay`, `nextReliefDay` — trzymanie zdobytego miasta |

### Mechanika migracji

```typescript
function migrate(state: any): WorldState {
  let version = state.version ?? 1;
  if (version < 2) state = migrateV2(state);
  if (version < 3) state = migrateV3(state);
  if (version < 4) state = migrateV4(state);
  if (version < 5) state = migrateV5(state);
  if (version < 6) state = migrateV6(state);
  if (version < 7) state = migrateV7(state);
  if (version < 8) state = migrateV8(state);
  if (version < 9) state = migrateV9(state);
  if (version < 10) state = migrateV10(state);
  return state;
}
```

W kodzie realizuje to pętla `while (version < CURRENT_WORLD_VERSION)` na mapie `MIGRATIONS`, która rzuca wyjątkiem przy brakującym kroku — dlatego **każda zmiana `WorldState` wymaga dopisania migracji**.

- Migracje sekwencyjne: v1 → v2 → v3 → ... → v12
- Każda migracja uzupełnia brakujące pola wartościami domyślnymi
- Bezpieczne: nie nadpisuje istniejących danych

> **v11 niczego nie zgaduje.** Stara kariera nie ma zapisu tego, że zdobyła miasto albo się do kogoś zalecała, a wymyślenie takiego zapisu pojawiłoby się w punktacji emerytalnej jako punkty, których nikt nie zarobił. Własność portów nie wymaga uzupełniania: `PortRuntimeState.factionId` istnieje od v3 i po prostu nigdy się nie zmieniało — do v0.13.0.

> **v12 nie zgaduje dnia, w którym miasto padło.** `garrison` i `nextReliefDay` startują puste — nikt nie obsadzał miasta, zanim był po temu powód. `capturedDay` dostaje wyłącznie port, który w zapisie v11 ma innego właściciela niż na mapie z 1680, i ustawiany jest na **dzień wczytania zapisu**, nie na to, kiedy miasto naprawdę padło. Zapis nie ma o tym zapisu, a pomyłka w drugą stronę — potraktowanie miasta zdobytego rok temu jako rok zaległego — otwierałaby zapis eskadrą królewską już na redzie. Ta sama zasada, co przy zegarze podziału łupów w v10.

> **v9 to migracja naprawcza, nie rozszerzenie modelu.** Migracje portów aż do v8 wyłącznie *dopisywały* pola do tego, co zastały, więc port przeniesiony z zapisu sprzed v2 nigdy nie dostał `shipyardQueue` ani `availableCrew` i docierał do v8 niekompletny. v9 normalizuje każdy port do pełnego kształtu `PortRuntimeState`; porty, które już go mają, przechodzą bez zmian. Pokryte testami w `src/persistence/__tests__/Migrations.test.ts`.

### Legacy migration

- Jednorazowa migracja ze starej, globalnej bazy IndexedDB do nowej, per-user bazy
- Wykrywanie: sprawdzenie czy istnieje stara baza + brak nowej
- Automatycznie przy pierwszym wczytaniu

## Format zapisu

```json
{
  "meta": {
    "slotId": 0,
    "title": "Captain Hook - Day 127",
    "createdAt": "2026-02-20T15:30:00Z",
    "updatedAt": "2026-02-20T16:45:00Z",
    "playtime": 4500,
    "worldVersion": 8
  },
  "world": {
    "version": 8,
    "time": { "day": 127, "hour": 14, "minute": 30, "tick": 183600 },
    "player": { "gold": 2500, "reputation": { ... } },
    "entities": { ... },
    "ports": { ... },
    "weather": { ... },
    "...": "..."
  }
}
```

## Ustawienia (localStorage)

Nie są częścią zapisów gry — przechowywane osobno:

| Klucz | Typ | Wartości | Default |
|-------|-----|----------|---------|
| `pc_asset_pack` | string | "basic", "buccaneer", "corsair" | "basic" |
| `pc_zoom_level` | string | "z1".."z14" (1.5x–12x) | "z8" |
| `pc_lang` | string | "en", "pl" | "en" |
| `pc_debug` | string | "1" / "0" (null = włączone) | włączone |
| `pc_fog` | string | "1" / "0" — mgła wojny / zasięg lunety | włączone |
| `pc_vol_wind` | number | 0-10 | 5 |
| `pc_vol_seagulls` | number | 0-10 | 5 |
| `pc_vol_music` | number | 0-10 | 5 |
| `pc_user_id` | string | UUID | auto-generated |
| `pc_legacy_saves_migrated` | string | flaga jednorazowej migracji starej bazy | — |
