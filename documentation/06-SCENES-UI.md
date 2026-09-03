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
    ├── [X na lądzie] ──→ kopanie skarbu ──→ DuelScene (jeśli zasadzka)
    │
    ├── [E w zasięgu portu] ──→ PortApproachScene
    │                              ├── Wejdź ──→ PortScene
    │                              │              └── Gubernator: emerytura ──→ RetirementScene
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

### RetirementScene (v0.11.0)

Księga na koniec kariery: po jednej linii na źródło punktów, suma, tytuł i propozycja nowej gry. Wynik liczy `core/systems/RetirementSystem.ts` i przekazuje w całości — scena nie robi żadnej arytmetyki poza układem.

Wejście: rozmowa z gubernatorem → „Napomknij o odejściu od morza" → potwierdzenie.

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
5. **Załoga miasta** — tylko w mieście, które zmieniło właściciela (v0.15.0)
6. **Wyjdź na ląd** — zwiedzanie pieszo (flaga `isOnFoot` propagowana z `MainMapScene`)

Nawigacja: klawisze lub klik na opcje. ESC = wyjście z portu.

#### Widok „garrison" (v0.15.0)

Pojawia się w menu tylko wtedy, gdy `portChangedHands(world, portKey)`. Cały
ekran to jedna liczba, którą gracz kontroluje — ludzie na murach — i dwie, które
ona porusza:

- ilu ludzi stoi na murach i ile miasto pomieści (`garrisonCapacity`)
- ilu jest razem z milicją (`garrisonFor(...).soldiers`) i ilu zostało na pokładzie
- czy eskadra już płynie i za ile dni (`activeExpeditionFor` / `daysUntilRelief`)
- szanse obrony **z flotą na redzie i bez niej** — dwa dostępne plany: zostawić
  dość ludzi albo być tu osobiście

Akcje: zostaw / zabierz 10, 25 albo 50 ludzi (plus resztę, gdy jest jej mniej niż
10). Trzy wielkości zamiast suwaka — decyzja brzmi „drużyna, kompania czy większość
załogi", a suwak dołożyłby do niej wyłącznie naciśnięcia klawiszy.

Cała arytmetyka siedzi w `ReconquestSystem`; scena tylko pyta i rysuje odpowiedź.

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
- **Flota** — lista statków, sprzedaż i porzucanie; od v0.17.0 także załoga każdej konsorty
- **Dziennik** (v0.17.0) — co kapitan komu obiecał: aktywne zadania i bieżący etap każdego. Pierwszy konsument `activeQuests`, które istniało od v0.12.0 i było wołane znikąd
- **Ustawienia** — asset pack, zoom, język, mgła wojny, tryb debug
- **Dźwięk** — 3 kanały (wiatr / mewy / muzyka), skala 0-10, aktualizacja na żywo
- **Zapis / Odczyt** — 5 slotów IndexedDB z auto-migracją

### PortScene — widok magazynu (v0.18.0)

Widok „Magazyn rodzinny" pojawia się w menu portu **wyłącznie** w mieście, w
które kapitan się ożenił, i tylko dopóki miasto trzyma korona jej ojca
(`isHomePort`). Osobny ekran, a nie kolumna w tabeli kupca, bo to inna
transakcja: kupiec zamienia ładunek na pieniądze po ruchomej cenie, a magazyn
zamienia ładunek na ładunek-który-jest-gdzie-indziej. Wspólny ekran zapraszałby
do czytania magazynu jako drugiego rynku.

Te same klawisze co u kupca — W/S wybór, Q na brzeg, E na statek, po 10 ton.

### HelpScene / BattleHelpScene

`HelpScene` (klawisz H na mapie) — 5 zakładek: Sterowanie, Statki, Żeglowanie, Świat, Ekonomia.
`BattleHelpScene` (H w bitwie) — sterowanie, wzory obrażeń i przeładowania, warunki abordażu i kapitulacji.

## CityAssaultScene (v0.13.0)

Ekran oblężenia: dwa panele odczytu (fort / flota), sylwetka fortu tracąca blanki
w miarę burzenia murów, panel narracji i klawiatura. Świadomie **nie** jest drugą
symulacją bitwy — decyzja gracza („jeszcze jedna salwa czy desant teraz")
jest decyzją liczbową, a przebranie jej za walkę w czasie rzeczywistym ukryłoby
liczbę, nie dodając wyboru.

| Faza | Sterowanie |
|---|---|
| `bombard` | SPACJA — salwa · L — desant · ESC — odstąp |
| `assault` | odgrywa się sama, jedna fala na 0.7 s |
| `spoils` | W/S — wybór · Enter — potwierdzenie · 1-4 — skrót |

Wejście: `PortApproachScene` → „SZTURM NA MIASTO" (dostępne przy każdym mieście,
o ile gracz nie jest pieszo). Wyjście: `MainMapScene` z zaktualizowanym światem.

Cała arytmetyka siedzi w `core/systems/SiegeSystem.ts`.

## CityDefenseScene (v0.16.0)

`CityAssaultScene` odbite w lustrze: ten sam układ — trzy panele pasków,
sylwetka muru, panel narracji, klawiatura — tylko gracz stoi za działami, a to,
co leży na redzie, należy do kogoś innego. Symetria jest celowa: kto raz zdobył
miasto, umie czytać ten ekran.

| Faza | Sterowanie |
|---|---|
| `bombard` | T — ognia do szalup · G — ognia do eskorty · SPACJA — powtórz cel · L — ludzi na mury · ESC — ciąć liny |
| `assault` | odgrywa się sama, jedna fala na 0.7 s |
| `done` | Enter — powrót na mapę |

Wejście: `WorldEngine` → `Transition { scene: "CityDefense" }` →
`MainMapScene.handleTransition`. Bezpośrednio: `?defend=<port>` (`&ally=1`,
`&garrison=N`, `&soldiers=N`). Wyjście: `MainMapScene`.

Cała arytmetyka siedzi w `core/systems/CityDefenseSystem.ts`. Scena odpowiada za
tempo (runda na klawisz, potem fala na sekundę) i za dwie rzeczy, które łatwo
zrobić źle:

- **`soldiersAtLanding`** — pętla fal wpisuje straty prosto w `this.state`, żeby
  paski nie kłamały w trakcie; `splitTownLosses` potrzebuje stanu **sprzed**
  desantu, więc jest trzymany osobno.
- **Blokada klawiatury po `squadronBroken`** — wynik idzie z opóźnieniem, żeby
  dało się przeczytać ostatnią linię; bez `busy = true` gracz zdążyłby ostrzelać
  wyprawę, której już nie ma.

**`Guns bearing`** pokazuje `fleetGuns`, nie `force.cannons` — po wysłaniu ludzi
na mury działa na pokładach nie mają obsady, a odczyt ignorujący to ukrywałby
cały koszt decyzji.

Scena zatrzymuje `UIOverlayScene` w `create()`. `scene.start` wywołany z wnętrza
`MainMapScene.update` nie zabiera ze sobą stałej nakładki mapy, więc bez tego róża
wiatrów i data rysowały się nad bitwą lądową. To samo dołożono do
`CityAssaultScene` — miała ten sam błąd od v0.13.0.

## PortScene — widok „daughter" (v0.14.0)

Salon gubernatora jest widokiem `PortScene`, nie drzewem dialogowym. Powód jest
konkretny: każda odpowiedź to rzut kością przeciw urokowi, złotu albo sławie, a
`DialogueEffect` to celowo zamknięty słownik deterministycznych zmian — zakodowanie
testu umiejętności w nim oznaczałoby wymyślenie drugiego języka wewnątrz danych
dialogowych.

Drzewo gubernatora robi więc jedną rzecz: otwiera drzwi efektem
`EFFECT_VISIT_DAUGHTER`, a scena przejmuje stamtąd. Szanse każdego podejścia są
pokazane przy opcji — ciekawa decyzja to *którą* przewagę kapitana wydać, a
ukrycie liczb zamieniłoby ją w zgadywankę.

Wątek rodzinny mieszka w tawernie: informator sprzedaje pierwsze nazwisko, a
miasto, na które wskazuje trop, oferuje samą walkę (`DuelScene` nad wstrzymaną
`PortScene`).

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
