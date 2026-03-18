# 08 — System zapisu (Persistence)

Wszystkie pliki w `src/persistence/`.

## Architektura

```
SaveLoadScene (UI)
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

Aktualna wersja stanu: **6**

| Wersja | Zmiany |
|--------|--------|
| v2 | Dodanie eventLog, migracja kluczy cargo, przebudowa inventarza portów |
| v3 | Dodanie playerName, eraId, startYear |
| v4 | Rozszerzenie z 27 do 45 miast |
| v5 | Dodanie profilu kapitana (defaults dla starych zapisów) |
| v6 | (pending) |

### Mechanika migracji

```typescript
function migrate(state: any): WorldState {
  let version = state.version ?? 1;
  if (version < 2) state = migrateV2(state);
  if (version < 3) state = migrateV3(state);
  if (version < 4) state = migrateV4(state);
  if (version < 5) state = migrateV5(state);
  if (version < 6) state = migrateV6(state);
  return state;
}
```

- Migracje sekwencyjne: v1 → v2 → v3 → ... → v6
- Każda migracja uzupełnia brakujące pola wartościami domyślnymi
- Bezpieczne: nie nadpisuje istniejących danych

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
    "worldVersion": 6
  },
  "world": {
    "version": 6,
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
| `pc_zoom_level` | string | "far", "normal", "close" | "normal" |
| `pc_lang` | string | "en", "pl" | "en" |
| `pc_user_id` | string | UUID | auto-generated |
