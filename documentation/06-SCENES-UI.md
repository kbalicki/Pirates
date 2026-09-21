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
2. **Tawerna** — rekrutacja, drink (+morale), plotki i lokalne newsy ze świata,
   mapa skarbów, podział łupów, wątek rodzinny oraz **zlecenie informatora**
   (v0.25.0): jedna oferta na miasto na dzień, `raidOffer`. Kiedy zlecenie jest
   w ręku, ta sama pozycja pokazuje postęp — „Zlecenie: A–B — przecięte w 40%,
   zostało 18 dni". Naciśnięcie nic nie kosztuje: pieniądze idą dopiero, gdy
   szlak ucichnie
3. **Kupiec** — kupno/sprzedaż 6 towarów
4. **Stocznia** — naprawa (kadłub/żagle), kupno statku, dokupienie jednostki do
   floty, **sprzedaż konsorty**. Jeden kursor obejmuje dwie listy: kadłuby na
   sprzedaż i własne. Klawisze: `Enter`/`B` — kup jako flagowiec albo **sprzedaj
   wybraną konsortę** (zależnie od wiersza), **`F` — dokup do floty** (v0.79.0),
   `R` — napraw, `Esc` — wróć. Linia podpowiedzi mówi, co znaczy `Enter` na tym
   wierszu
5. **Załoga miasta** — tylko w mieście, które zmieniło właściciela (v0.15.0)
6. **Wyjdź na ląd** — zwiedzanie pieszo (flaga `isOnFoot` propagowana z `MainMapScene`)

Nawigacja: klawisze lub klik na opcje. ESC = wyjście z portu.

#### Ekran spotkania — manifest (v0.25.0)

`ShipEncounterScene` drukuje pod linią dział/załogi/kadłuba jedną linijkę o
ładowni: `Laden: 80 tons — Sugar Cane` albo `In ballast — nothing in her hold`.
Towary w kolejności, w jakiej `computePrize` przeniósłby je na pokład. Okno
urosło z `DLG_H = 300` do `320`, żeby ta linia miała gdzie stanąć.

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

### PortScene — magazyn na wynajem (v0.24.0)

Od v0.24.0 ta sama pozycja menu prowadzi także do **wynajętego** magazynu w
dowolnym mieście, które zechce go wydzierżawić (`neutral` w górę). Gdy kapitan
nie ma tu jeszcze nic, ekran jest ofertą właściciela — pojemność, czynsz za 30
dni, i wprost napisane, co się stanie, gdy najem wygaśnie. Gdy ma, jest to ta
sama tabela transferu co w magazynie rodzinnym, plus linijka z pozostałymi
dniami najmu (na czerwono od pięciu dni w dół), klikalna, żeby przedłużyć.

Celowo **jeden widok**, nie dwa: „wynajmij szopę" i „użyj szopy" to jedno
miejsce w mieście, a pozycja menu prowadząca gdzie indziej zależnie od stanu
byłaby gorsza niż ta sama izba z innym człowiekiem w środku.

### PortScene — co reputacja zmienia na ekranie (v0.24.0)

Nagłówek portu ma trzecią linijkę: **„Twoje notowania tutaj: <poziom> (<liczba>)"**,
czerwoną przy `hostile`. Jest w nagłówku, a nie przy każdej ladzie, bo to jeden
fakt rozstrzygający pięć różnych rzeczy — gracz ma go przeczytać raz, wchodząc.

| Ekran | Co widać |
|---|---|
| kupiec | kolumna **Kup/Sprzedaj** zamiast jednej ceny + linijka ze spreadem w procentach |
| tawerna | „— nikt tu z tobą nie popłynie" zamiast liczby chętnych |
| kantor frachtowy | pozycja menu z dopiskiem „— zamknięty dla ciebie"; w środku „Żaden tutejszy kupiec nie powierzy ci ładunku" (inny komunikat niż „dziś nic nie ma") |
| stocznia | nagłówek „TA STOCZNIA NIC CI NIE SPRZEDA", rachunek za naprawę wg `serviceMul` |
| podejście do portu | „Obrót przez to nabrzeże: N złota dziennie" — liczba, która spada, gdy blokada działa |

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

## Tawerna ma dziesięć pozycji (v0.32.0)

Menu tawerny rosło z każdym źródłem zleceń i doszło do granicy okna. Przy trzech
liniach informatora naraz (przecięcie szlaku, zamówienie, pościg) lista to
**dziesięć** pozycji i `[ WRÓĆ DO PORTU ]` ląduje na podpowiedzi klawiszy.

Ustępuje **podpowiedź**: mówi te same trzy klawisze co każdy inny ekran w tej
grze, a wiersza, którego gracz nie może odczytać, równie dobrze mogłoby nie być.
Warunek jest liczony, nie zgadnięty — `listBottom < hintTop` — więc lista o
dziewięciu pozycjach dalej ją pokazuje.

Komunikat odpowiedzi chowa podpowiedź od v0.26.0 z tego samego powodu. Miejsca
starcza na jedno z dwojga i to się nie zmieniło; zmieniło się to, że teraz o
zabraniu podpowiedzi decyduje też **sama długość listy**.

## Ilości: tona, dziesięć, wszystko (v0.76.0, v0.78.0)

Dwa ekrany przesuwają towar i mówią tym samym słownictwem:

| ekran | klawisz | samo | `Shift` | `Ctrl` |
|---|---|---|---|---|
| lada kupca | `Enter` / `Backspace` | 1 tona | 10 | tyle, ile zniesie ładownia, kiesa i nabrzeże |
| magazyn | `Q` (na brzeg) / `E` (na statek) | 1 tona | 10 | tyle, ile zniesie druga strona |

Kliknięcie myszą czyta te same modyfikatory (`lotSize(p.event)`).

**Lada przerysowuje siebie, nie restartuje miasta.** `scene.restart` na każdą
tonę było wolniejsze, niż trzeba, i odrzucało kursor na pierwszy wiersz;
nagłówek jest rysowany raz w `create()`, więc kiesa i ładunek są **trzymane**
(`goldText`, `cargoText`) i odświeżane w `afterTrade()`. Ta sama sztuczka, co
spichlerz gubernatora w v0.27.0.

**Transakcja mówi, co zrobiła** — „Kupiono 7 ton cukru za 24 zł" — z biernikiem
z `plurals.ts` i dopełniaczem towaru z `names.ts`.

## Jedno naciśnięcie, jedna akcja (v0.78.0)

Naciśnięcie z wciśniętym modyfikatorem docierało do handlera **trzy razy**
(samo `Enter` — raz). Bramka pamiętająca obiekt zdarzenia jest zakładana **raz,
w `GameApp`, na wszystkie sceny**: owinięty jest `emit` wtyczki klawiatury, nie
słuchacz, więc scena dalej wiąże klawisze tak, jak wiązała.

Dla piszącego scenę znaczy to tyle: **nie buduj własnej bramki**. `PortScene`
miała taką (`tradePending`, v0.76.0) i została skasowana. Pomiar i mechanizm
w [10-DEVELOPMENT.md](10-DEVELOPMENT.md), narzędzie w `scripts/keycount.mjs`.

## Ekran wyniku bitwy opisuje, a nie przelicza (v0.78.0)

`showBattleResult` wołało `computePrize` **drugi raz**, żeby narysować swoje
linijki. Uchodziło mu to, dopóki ładownia była flagowca; po v0.77.0 drugie
wywołanie nic nie wiedziałoby o konsortach i wypisałoby **jako utopiony ładunek,
który jest na pokładzie**. Wynik rozliczenia jest trzymany (`lastPrize`,
`prizeKept`) — tak samo jak `defeatFate` z v0.59.0 i z tego samego powodu.

## Wiersz, który nie mieści dwóch przycisków (v0.79.0)

Lista statków w stoczni niosła `[Dodaj do floty]` na stałym odstępie
`colPrice + 100`. Panel ma w środku **438 pikseli**, a ten przycisk zaczynał się
na 445 — **siedem pikseli za krawędzią**, całą etykietą na mapie za oknem. Był
przy tym **jedyną transakcją w grze bez drogi z klawiatury**.

Wiersz nie pomieści obu: kolumna nazwy, pięć liczb, cena i dwa przyciski nie
mieszczą się w 438 pikselach, gdy słowa są polskie (policzone: 462). Dlatego
zakup konsorty jest **klawiszem `F`**, wpisanym w linię podpowiedzi obok `Enter`
i `R` — tak jak działa każda inna akcja na tym ekranie — a `[Kup]` stoi za ceną
**na jej zmierzonej szerokości**, nie na stałej dobranej pod jeden język.

Reguła ogólna: **odstęp policzony od tekstu, który przed nim stoi**. Cena jest
tłumaczeniem, a „6000 Gold" i „6000 złota" to nie ta sama liczba pikseli.

## Kursor przeżywa przerysowanie ekranu (v0.80.0)

**Trzy listy w tej grze nie dawały się przewijać w ogóle.** Lada kupca, lista
kadłubów w stoczni i ustawienia kwatermistrza — każda drukuje w podpowiedzi
`↑↓ — Wybór` i żadna nigdy niczego nie wybrała.

Lista przesuwa kursor tak: zwiększa indeks i **przerysowuje ekran**. Obie metody
przerysowujące — `PortScene.switchView` i `OptionsMenuScene.switchTab` — ustawiały
kursor z powrotem na pierwszym wierszu, więc każde naciśnięcie odkładało go tam,
skąd wyszedł. `selectedIndex = 0` siedzi w `switchView` **od pierwszego commita**.

Znalezione na **działającej grze**, nie przez czytanie: trzy naciśnięcia strzałki
w dół na ladzie w Hawanie zostawiają kursor na cukrze trzcinowym, a menu portu
jeden ekran wcześniej — które przerysowuje się przez `updateActionSelection`, nie
przez `switchView` — przesuwa się o dwa wiersze na te same dwa naciśnięcia.
To dlatego menu portu zawsze działało dobrze, a **każdy ekran z listą skończył
na przyciskach myszy**.

Reguła: **przerysowanie widoku, na którym stoisz, nie rusza kursora.** Wyjście
gdzie indziej dalej zaczyna od góry. Pilnowane przez
`cursor_survives_redraw.test.ts`, który czyta źródło (sceny nie da się zbudować
bez Phasera) i przewraca się na bezwarunkowe zerowanie.

## Lista, która przerosła panel (v0.80.0)

Dziewięć klas w stoczni pierwszej klasy to **180 pikseli** przy **269**, jakie ten
widok ma między nagłówkiem a przyciskiem powrotu. Ostatni wiersz był rysowany pod
`[ WRÓĆ DO PORTU ]` **przed** tym wydaniem, a sekcja floty dołożyła do tego.

Dwie reguły:

1. **Okno liczone z miejsca, które naprawdę zostało** — nie ze stałej dobranej,
   gdy lista była krótsza. Znacznik `wyżej/niżej jeszcze N` kosztuje wiersz, więc
   ile ich jest, ustala się iteracyjnie (zakładanie dwóch na górze listy marnuje
   wiersz, którego drugi nigdy nie użył).
2. **Własne kadłuby kapitana nie są nigdy chowane w oknie** — niosą akcję
   niszczącą, a przycisk, który wyjeżdża poza widok, to ten sam defekt co
   przycisk rysowany poza krawędzią (v0.79.0).

Kajuta miała to samo z drugiej strony: v0.77.0 dopisało ładownię na koniec
wiersza konsorty, który już był szerokości panelu, i po polsku ostatni odczyt
lądował na mapie za oknem. Teraz dwa wiersze, manifest w dwóch kolumnach,
a podpowiedź klawiszy dzieli linię z odczytem eskadry.

## Podpowiedź jest twierdzeniem o kodzie (v0.81.0)

v0.80.0 znalazła trzy listy drukujące `↑↓ — Wybór`, które niczego nie wybierały,
i zostawiła pytanie: czy dałoby się to złapać skanem źródła, porównując linie
podpowiedzi z wiązaniami klawiszy?

**Zmierzone: nie.** Trzydzieści pięć napisów w tabeli to podpowiedzi, czternaście
wymienia klawisz. Po zestawieniu z wiązaniami w scenie, która je rysuje, cztery
wyszły jako „obiecane, nie związane" — i wszystkie cztery to skaner źle czytający
angielski (*„Enter your name, Captain"*, *„Fire L/R broadside"*). Prawdziwa liczba
to **zero**, i zawsze była: tamte trzy listy wiązały strzałki poprawnie.
**Wiązanie istniało i nic nie robiło.**

Skan źródła łapie jednak **węższy kształt**, i ten był żywy: klawisz obiecany,
a związany **do czegoś innego**. `sound.hint` obiecywał `← →` na głośność, a nad
`adjustVolume` stały wiązania `A` i `D` — z komentarzem *„← / → adjust volume when
a vol: item is focused"*. Komentarz opisywał **zamiar** i był czytany jak opis
kodu; dokładnie ta sama pułapka, co `VillageSystem` w v0.79.0. Strzałka na
wierszu głośności przewracała zakładkę.

Dwa słuchacze jednego klawisza nie mogą się nawzajem zatrzymać, więc zakładka
**zgłasza roszczenie** (`arrowsClaimed`), a globalne wiązanie zakładek je sprawdza.
Roszczenie kasuje `switchTab`, żeby żadna zakładka nie trzymała strzałek po tym,
jak przestała być rysowana.

## Żaden ekran nie rysuje się po tym, jak go opuszczono (v0.81.0)

Zakładka Zapis czyta pięć slotów z IndexedDB i rysowała je, **kiedy odczyt
wrócił** — niezależnie od tego, czy kapitan dalej na nią patrzył. Sloty i ich
linia podpowiedzi lądowały **na wierzchu mapy**. `switchTab` czyści kontener przed
rysowaniem i nie jest w stanie wyczyścić czegoś, co jeszcze nie zostało
narysowane.

To jedyne rysowanie po `await` w grze; sprawdza teraz zakładkę, a test trzyma przy
tej regule **każde** `.then` w każdej scenie.
