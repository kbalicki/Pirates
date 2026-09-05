# 05 — Modele danych

Wszystkie typy w `src/core/model/`. Czysty TypeScript, bez zależności od Phaser.

## WorldState — główny stan gry

```typescript
type WorldState = {
  version: number;                           // aktualna: 6
  time: GameTime;
  rng: RngState;                             // stan Mulberry32 PRNG
  player: PlayerState;
  entities: Record<EntityId, EntityState>;   // statki, floty, efekty
  ports: Record<PortId, PortRuntimeState>;   // 45 portów z dynamicznymi cenami
  weather: WeatherState;
  worldFlags: Record<string, boolean>;       // flagi fabularne
  eventLog: GameEventEntry[];                // historia (max 200)
  playerName: string;
  eraId: string;
  startYear: number;
  gameSpeed: number;                         // 0.6 | 1.2 | 2.4
  captain: CaptainProfile;
};
```

## GameTime

```typescript
type GameTime = {
  day: number;        // dzień w roku (1-365)
  hour: number;       // 0-23
  minute: number;     // 0-59
  tick: number;       // globalny tick counter
};
```

## PlayerState

```typescript
type PlayerState = {
  entityId: EntityId;                        // ID statku gracza
  gold: number;
  notoriety: number;                         // sława (0+)
  reputation: Record<FactionId, number>;     // -100 do +100 per frakcja
  questLog: Quest[];
  letterOfMarque?: FactionId;                // aktualny list kaperski
};
```

## EntityState — statki i obiekty

```typescript
type EntityState = {
  id: EntityId;
  kind: "ship" | "fleet" | "fx";
  mode: "sailing" | "landed";
  pos: Vec2;                    // { x, y } pozycja na mapie
  vel: Vec2;                    // wektor prędkości
  heading: number;              // radiany, 0=N
  sailLevel: number;            // 0.0 – 1.0
  depthOffset: number;          // Z-ordering
  anchorPos?: Vec2;             // pozycja kotwicy (gdy landed)
  ship?: ShipData;              // dane statku
  ai?: AiData;                  // zachowanie AI
};
```

### ShipData

```typescript
type ShipData = {
  classId: ShipClassId;
  hullHP: number;               // aktualne HP kadłuba
  sailsHP: number;              // aktualne HP żagli
  cannons: number;
  crew: number;                 // aktualna liczba załogi
  cargo: Record<ItemId, number>;// ładunek
};
```

### AiData

```typescript
type AiData = {
  behavior: "patrol" | "trade" | "pirate" | "escort";
  state: "idle" | "pursuing" | "fleeing" | "trading";
  aggression: number;           // 0.0 – 1.0
  homePort?: PortId;
  targetId?: EntityId;
};
```

## CaptainProfile

```typescript
type CaptainProfile = {
  nationality: FactionId;       // frakcja startowa
  skills: {
    fencing: number;            // 1–10, szermierka
    gunnery: number;            // 1–10, artyleria
    navigation: number;         // 1–10, nawigacja
    medicine: number;           // 1–10, medycyna
    charm: number;              // 1–10, urok
  };
  startAge: number;             // domyślnie 20
};
```

Start: wszystkie umiejętności = 5, gracz rozdziela 10 dodatkowych punktów.

## Commands — komendy gracza

```typescript
// Nawigacja
{ type: "SetSailLevel", level: number }        // 0.0 – 1.0
{ type: "Turn", direction: "left" | "right" }  // ciągły obrót
{ type: "SetHeading", heading: number }         // radiany

// Port
{ type: "EnterPort", portId: PortId }
{ type: "ExitPort" }

// Handel
{ type: "TradeBuy", portId: PortId, itemId: ItemId, qty: number }
{ type: "TradeSell", portId: PortId, itemId: ItemId, qty: number }

// Statek
{ type: "RepairShip", repairType: "hull" | "sails" }
{ type: "BuyShip", classId: ShipClassId }
{ type: "HireCrew", count: number }

// Walka
{ type: "StartSeaBattle", enemyId: EntityId }
{ type: "FireCannons", side: "left" | "right" }
{ type: "CeaseFire" }
{ type: "AttemptDisengage" }

// Ruch na lądzie
{ type: "Disembark" }
{ type: "Embark" }

// Gra
{ type: "SaveGame", slotId: number }
{ type: "LoadGame", slotId: number }
{ type: "NewGame" }

// Questy
{ type: "AcceptQuest", questId: string }
{ type: "AbandonQuest", questId: string }
```

## Events — zdarzenia silnikowe

```typescript
type WorldEvent =
  | { type: "Sound", soundId: string }
  | { type: "Toast", message: string, duration?: number }
  | { type: "Encounter", encounterType: string, data: any }
  | { type: "PortEntered", portId: PortId }
  | { type: "BattleStarted", enemyId: EntityId }
  | { type: "BattleEnded", result: "victory" | "defeat" | "flee" }
  | { type: "CrewDied", count: number }
  | { type: "ItemsLost", items: Record<ItemId, number> }
```

## Transitions — zmiany scen

```typescript
type Transition =
  | { type: "GoToPort", portId: PortId }
  | { type: "GoToMap" }
  | { type: "GoToBattle", enemyId: EntityId }
  | { type: "GoToDialogue", dialogueId: string }
```

## CombatState — stan bitwy

```typescript
type CombatState = {
  player: CombatEntity;
  enemy: CombatEntity;
  projectiles: Projectile[];
  tick: number;
  result?: "victory" | "defeat" | "flee";
};

type CombatEntity = {
  pos: Vec2;
  heading: number;
  sailLevel: number;
  ship: ShipData;
  cannonCooldown: number;      // ticks do następnego strzału
};
```

## WeatherState

```typescript
type WeatherState = {
  windDirection: number;        // radiany
  windStrength: number;         // 0.0 – 1.0
  storm: boolean;
  stormDuration?: number;       // minuty
};
```

## Branded ID Types (`src/core/model/ids.ts`)

```typescript
type EntityId = string & { __brand: "EntityId" };
type PortId = string & { __brand: "PortId" };
type FactionId = string & { __brand: "FactionId" };
type ItemId = string & { __brand: "ItemId" };
type ShipClassId = string & { __brand: "ShipClassId" };
```

Branded types zapobiegają pomyłkowemu przekazywaniu ID różnych typów.

## Pola PlayerState dodane w v0.13-v0.14

```typescript
/** Zdobyte miasta, niezależnie od tego, co się z nimi potem stało. */
citiesCaptured: number;
/** Standing u córek gubernatorów, kluczowany portem (0..100). */
courtship: Record<string, number>;
```

Oba wchodzą migracją v11, oba startują puste. Stan oblężenia i łańcuch rodzinny
**nie** mają własnych pól: oblężenie żyje tylko w scenie, a łańcuch siedzi w
`data.chain` wpisu w `questLog` — tak samo, jak mapa skarbu siedzi w `data.map`.

Właściciel portu to `PortRuntimeState.factionId` — pole istniejące od v3, które
do v0.13.0 nigdy się nie zmieniało. `CityDef.factionId` to mapa startowa z 1680.
Odczyt zawsze przez `portFaction(world, portKey)`.

### Trzymanie zdobytego miasta (v12, v0.15.0)

```typescript
/** Dzień, w którym miasto ostatnio zmieniło właściciela. Brak = flaga jak na starcie. */
capturedDay?: number;
/** Ludzie zostawieni przez gracza na murach. To oni są prawdziwą obroną. */
garrison?: number;
/** Najwcześniejszy dzień, w którym może wypłynąć kolejna eskadra odbijająca. */
nextReliefDay?: number;
```

Wszystkie trzy są opcjonalne i wchodzą migracją v12. `capturedDay` stempluje
`capturePort` — **tylko** gdy flaga faktycznie się zmienia, więc złupienie bez
zdobycia nie uruchamia zegara korony. Stan samej eskadry nie ma własnego pola:
siedzi w `WorldEventState` typu `reconquest`, a jej siła w `event.vars`.

Nowy typ wydarzenia świata:

```typescript
| "reconquest"   // eskadra odbijająca w drodze do miasta (v0.15.0)
```

`EventEffectsSystem` daje mu **celowo zerowy** efekt na port: `event.ports`
wymienia wszystkie porty korony (żeby news dojechał do tawern), a jakikolwiek
efekt na port rozlałby się wtedy na całe imperium.

### Blokada i szlaki (v0.22.0, bez migracji)

```typescript
// PortRuntimeState
/** Dni, ile eskadra gracza stoi pod tym portem. Gryzie od BLOCKADE_ONSET_DAYS. */
blockadeDays?: number;

// WorldState
/** Ile oberwał każdy szlak, kluczowane TradeRoute.id (pochodne mapy, nie zapisu). */
routeDisruption?: Record<string, { severity: number; until: number }>;

// AiData
/** Szlak, którym płynie ten kupiec, i który narożnik kursu ma przed dziobem. */
lane?: { routeId: string; wp: number };
```

Wszystkie trzy są **opcjonalne i czytane przez funkcje z fallbackiem**
(`blockadeDays()`, `disruptions()`), więc migracja jest zbędna — stary zapis
znaczy „port otwarty, morze spokojne", co jest prawdą o nim. `TradeRoute.id`
nigdy nie trafia do zapisu jako klucz trwały: gdy sieć szlaków się zmieni,
nieaktualne wpisy po prostu wygasną z ledgera.

### Fracht (v0.23.0, bez migracji)

Kontrakt frachtowy **nie ma własnego pola w `WorldState`**. Leży w
`questLog[].data.contract`, tak jak mapa skarbu i zlecenie obrony, a
`buildQuestRegistry` odtwarza z niego `QuestDef` przy każdym wczytaniu. Ładunek
jest zwykłą zawartością `ShipData.cargo` — nie ma „zarezerwowanej" przegródki,
więc gracz może go sprzedać, i to jest zamierzone.

Doszedł jeden wariant efektu dialogowego:

```typescript
| { type: "notoriety"; amount: number }
```

### Ledger handlu i magazyny (v0.24.0, bez migracji)

```typescript
// PortRuntimeState
/** Złoto, które dziś przeszło przez to nabrzeże i nie zostało jeszcze zamienione
 *  na bogactwo. Tick dobowy przelicza sumę raz, po GOLD_PER_WEALTH. */
tradeBalance?: number;
/** Wczorajsza suma — ekran podejścia do portu ją pokazuje. */
tradeIncome?: number;

// PlayerState
/** Magazyny wynajęte w zwykłych miastach. Magazyn rodzinny dalej siedzi
 *  osobno, w `warehouse`, bo ma inne zasady. */
storehouses?: Record<string, { paidUntil: number; goods: Record<string, number> }>;
```

Wszystkie cztery **opcjonalne i czytane przez `?? 0` / `?? {}`**, więc migracja
jest zbędna: stary zapis znaczy „żadnego obrotu, żadnych najmów", co jest o nim
prawdą. Łańcuch migracji stoi dalej na **v12**.

Jedna zmiana, która **nie jest** nowym polem, a i tak dotyczy zapisu:
`PortRuntimeState.wealth` jest teraz trzymane z dokładnością **do 0,1** zamiast
do pełnych punktów. Powód w `04-CORE-SYSTEMS.md` — bez miejsca na ułamek ledger
handlu równoważył się cztery punkty nad baseline'em zamiast pięćdziesięciu.
Stary zapis z całkowitym `wealth` jest poprawnym przypadkiem tego samego pola.


## RNG Service (`src/core/services/RNG.ts`)

```typescript
rngNext(state: RngState): { value: number, state: RngState }
rngNextInt(state: RngState, min: number, max: number): { value: number, state: RngState }
rngNextFloat(state: RngState, min: number, max: number): { value: number, state: RngState }
```

Mulberry32 — deterministyczny PRNG. Stan jest częścią WorldState = replay-ready.

## Geometry Service (`src/core/services/Geometry.ts`)

```typescript
// Operacje Vec2
vec2Add(a: Vec2, b: Vec2): Vec2
vec2Sub(a: Vec2, b: Vec2): Vec2
vec2Scale(v: Vec2, s: number): Vec2
vec2Dist(a: Vec2, b: Vec2): number
vec2Normalize(v: Vec2): Vec2

// Konwersje heading
headingToVec(heading: number): Vec2
vecToHeading(v: Vec2): number
normalizeHeading(h: number): number
headingToDir8(heading: number): number    // 8 kierunków (0-7)

// Testy geometryczne
pointInPolygon(point: Vec2, polygon: Vec2[]): boolean
pointInLandmass(point: Vec2, landmasses: Landmass[]): boolean
```

## `WorldState.namedShips?` i `EntityState.ai.namedShipId?` (v0.32.0)

Dwa pola opcjonalne, oba czytane przez `?? domyślna`, oba **bez kroku migracji**
— zgodnie z regułą projektu.

```ts
type NamedShip = {
  id: string;            // "named_<n>", stabilne na całe życie świata
  name: string;          // "Vergulde Draeck"
  crown: string;         // rejestr, na którym stoi
  classId: string;
  routeId: string; from: string; to: string;
  progress: number;      // 0..2, gdzie 0..1 to from→to; zawija
  progressDay: number;   // dzień, w którym progress był prawdą
  passageDays: number;   // wyprowadzone z długości szlaku / PASSAGE_SPEED
  hullHp: number; sailsHp: number;   // niesione między spotkaniami
  fate?: "sunk" | "taken";           // ustawiane raz, nigdy nie kasowane
};
```

`ai.namedShipId` to nitka od kadłuba na wodzie do rekordu — po niej idzie zapis
zwrotny uszkodzeń i rozpoznanie, że to właśnie ona poszła na dno.

## `WorldState.namedShipReports?`, `NamedShip.escorts?`, `ai.namedEscortOf?` (v0.33.0)

Trzy pola opcjonalne, wszystkie czytane przez `?? domyślna`, **bez migracji**.

```ts
// co kapitanowi powiedziano — wspomnienie momentu, nie pozycja
namedShipReports?: Record<string, { day: number; progress: number }>;

// ile kadłubów płynie z nią; brak = samotna (zapis z v0.32.0)
escorts?: number;

// nitka od eskorty do niej: pozwala przeliczyć liczbę z tego, co pływa,
// i zabrać cały konwój z mapy razem z nią
ai.namedEscortOf?: string;
```
