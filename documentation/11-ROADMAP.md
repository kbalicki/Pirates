# 11 — Roadmapa rozwoju

**Aktualizacja:** 2026-09-05 | **Wersja kodu:** 0.30.0.0

## Wizja

Odtworzenie pełnej mechaniki **Sid Meier's Pirates!** (Amiga, 1987) w nowoczesnej formie przeglądarkowej z retro pixel art. Następnie rozbudowa o nowe moduły wykraczające poza oryginał.

> **Bieżąca kolejność prac, dług techniczny i konkretne zadania:** [TODO.md](../TODO.md) w katalogu głównym repozytorium. Ten dokument opisuje **wizję i zakres** modułów; TODO.md opisuje **co robimy teraz**.

---

## Status ukończonych prac

### Fundament (v0.1 – v0.8)

| Faza | Opis | Status |
|------|------|--------|
| 0-1 | Scaffold, typy, mapa proceduralna | ✅ |
| 2 | Sterowanie statkiem (WSAD), kamera, HUD | ✅ |
| 3 | Porty z handlem, dialog zbliżania | ✅ |
| 4 | System reputacji i frakcji (5 frakcji) | ✅ |
| 5.5 | Zapis/odczyt (IndexedDB, 5 slotów, migracje) | ✅ |
| 5.6 | Tworzenie postaci, umiejętności, ery | ✅ |
| 5.7 | 45 miast, geografia, i18n (en/pl) | ✅ |
| 5.8 | Asset packi, zoom, font Dancing Script | ✅ |
| 5.9 | Dokumentacja, AI assets subprojekt | ✅ |

### Beta 1 — żywy świat (v0.9.x)

| Wersja | Opis | Status |
|--------|------|--------|
| 0.9.0-0.9.2 | 14 poziomów zoom, ikony i etykiety miast, czysty UI, `UIOverlayScene` | ✅ |
| 0.9.3 | Płynny ruch, sprite'y statków, system żagli (4 poziomy), wizyty pieszo w portach | ✅ |
| 0.9.3.1 | Fix jittera — `camera.setRoundPixels(false)` | ✅ |
| 0.9.4 | **Fizyka wiatru** — realistyczny diagram polarny, parametry takielunku, ekran pomocy | ✅ |
| 0.9.5 | **Flota gracza** (3 statki), 9 klas statków, wydarzenia świata, newsy NPC | ✅ |
| 0.9.5.1 | Spotkania ze statkami (`ShipEncounterScene`), dźwięk mew, OG image | ✅ |
| 0.9.6 | **Bitwy morskie** — arena, 3 typy amunicji, abordaż, przejmowanie statków | ✅ |
| 0.9.7 | **Żywa ekonomia** — populacja/zamożność/obrona, dzienny tick, 6 nowych wydarzeń | ✅ |
| 0.9.8 | Przeładowanie = f(załoga, morale, wyszkolenie); wyszkolenie załogi jako statystyka | ✅ |
| 0.9.8.1 | Sprzątanie: usunięcie martwych scen, naprawa testów, aktualizacja dokumentacji | ✅ |
| 0.9.8.2 | Naprawa nieciągłości krzywej polarnej wiatru na granicy 120° | ✅ |
| 0.9.8.3 | Pokrycie testami 119 → 257; migracja v9 i fix czasu zmiany żagli | ✅ |
| 0.9.9.0 | **Stopnie uszkodzeń** — stany kadłuba i ożaglowania, tonięcie, animacja zatonięcia, utrata ładunku | ✅ |
| 0.9.9.1 | Fix HMR: hot reload nie nakłada drugiej instancji gry na pierwszą | ✅ |
| 0.10.0.0 | **Pojedynki kapitanów** przy abordażu; naprawa na morzu; ratowanie rozbitków | ✅ |
| 0.11.0.0 | **System dialogów**, podział łupów, starzenie kapitana, emerytura z punktacją | ✅ |
| 0.12.0.0 | **System questów** (FSM) i **mapy skarbów** — kupno w tawernie, kopanie, zasadzki | ✅ |
| 0.12.1.0 | Proceduralne uszkodzenia na sprite'cie statku; ocena LoRA v2, zbiór v3 | ✅ |

### Beta 2 — świat, który się broni i handluje (v0.13 – v0.30)

| Wersja | Opis | Status |
|--------|------|--------|
| 0.13.0.0 | **Bitwy lądowe** (`SiegeSystem` + `CityAssaultScene`), warstwa fabularna: romans i wątek rodzinny | ✅ |
| 0.14.0.0 | Trzon fabuły: córki gubernatorów, rejestr questów odbudowywany z `questLog` | ✅ |
| 0.15.0.0 | **Korona wraca po swoje** — `ReconquestSystem`, `settleRelief` jako jedyne miejsce rozliczenia desantu | ✅ |
| 0.16.0.0 | **Rozgrywalna bitwa obronna** z murów + wojny koron przesuwające flagi | ✅ |
| 0.17.0.0 | Wyprawa jako **eskadra na mapie** do przechwycenia; zlecenie obrony u gubernatora; załoga konsorty | ✅ |
| 0.18.0.0 | Kurs wyprawy rysowany na mapie; **port macierzysty** po ślubie (posag, klarowanie, magazyn) | ✅ |
| 0.19.0.0 | Bandery statków NPC jako sprite; morale konsorty; ekonomia miast pod czarną banderą | ✅ |
| 0.20.0.0 | **Import do portów** (`EconomyTickSystem` krok 3.5) — każdy port w grze po cichu głodował | ✅ |
| 0.21.0.0 | Wojna obcina dostawy; wyszkolenie konsorty; zielona załoga pryzowa | ✅ |
| 0.22.0.0 | **Szlaki handlowe** (81), prawdziwy **pathfinding A\***, blokada portu, ładownia pryzu | ✅ |
| 0.23.0.0 | **Fracht dla gracza** (kantor frachtowy); towar naprawdę wędruje z magazynu do magazynu; przekierowanie dostaw | ✅ |
| 0.24.0.0 | **Pętla pieniężna handlu**, wycena przy każdym ruchu towaru, **reputacja przy ladzie**, magazyn na wynajem | ✅ |
| 0.25.0.0 | **Czym naładowany jest kupiec** (proporczyk ładunku, manifest przy spotkaniu); **informator w tawernie** jako trzecie źródło zleceń; przemyt do miasta pod czarną banderą płynie na nazwisko kapitana | ✅ |
| 0.26.0.0 | **Ładunek wychodzi z czyjegoś magazynu** — port, który przejmuje cudze kursy, drenuje własne szopy i bogaci się na tym; drugie źródło jest skończone. **Zlecenie na dostawę** u informatora | ✅ |
| 0.27.0.0 | **Głód ma twarz** — miasto zapisuje, czego mu wczoraj zabrakło; ludzie wyjeżdżają, a ci, co zostają, zaciągają się za chleb. **Miejski spichlerz**: gubernator kupuje z ładowni na miejscu i płaci reputacją | ✅ |
| 0.28.0.0 | **Zdarzenia świata zaczęły się dziać** — jedna linijka (`roll % length` na ułamku) sprawiała, że żadne nigdy nie trafiało w port; tabela efektów zmierzona i przeskalowana. **Plotki w tawernie mówią, co się naprawdę dzieje** w promieniu 1300 | ✅ |
| 0.29.0.0 | **Zdarzenie, które gracz spotyka** — zamknięty port naprawdę nie wpuszcza, zaraza opróżnia tawernę, a odkryte złoto jest towarem, po który się płynie (pierwszy towar `rare`) | ✅ |
| 0.30.0.0 | **Mapa mówi, co się dzieje** — miasto, o którym kapitan słyszał, nosi znak zdarzenia, zamknięta przystań przerywany pierścień. **Pokój wreszcie następuje**: każda wojna historyczna wygasała przed własną datą końca, więc traktatu nie podpisano ani razu | ✅ |

**Zrealizowane moduły w ujęciu tematycznym:**

- **Statki NPC na mapie** — spawn z portów i despawn w portach, 5 typów zachowań, limit 30 jednostek, mgła wojny, zasięg obserwacji zależny od najwyższego masztu floty
- **Bitwy morskie** — arena 3× viewport, łuki ostrzału ±60°, kule / łańcuchówki / kartacze, przeładowanie zależne od stanu załogi, kapitulacja, abordaż z przejęciem statku
- **Wydarzenia i ekonomia** — 10 wojen historycznych 1568-1697 z traktatem pokojowym na końcu każdej, 15 typów wydarzeń, dzienna symulacja produkcji, konsumpcji i cen w 45 portach, wojna zmienia ruch morski, a mapa nosi znaki tego, o czym kapitan słyszał
- **Obieg informacji** — wydarzenie → news w porcie → NPC jako kurier → gracz
- **Flota gracza** — do 3 własnych statków, prędkość eskadry = najwolniejsza jednostka
- **Ruchoma mapa polityczna** — korony odbijają utracone kolonie i biją się między sobą, wyprawy płyną realną wodą i dają się przechwycić, zdobyte miasto trzeba obronić
- **Warstwa handlowa** — 81 szlaków wyliczonych z geografii, towar fizycznie wędrujący między magazynami, pieniądz idący za tym towarem, fracht na zlecenie i trzy sposoby zaatakowania cudzej żeglugi (blokada, pryz, zakłócenie szlaku)
- **Reputacja, która coś znaczy** — opinia korony o graczu rozstrzyga spread u kupca, werbunek w tawernie, dostęp do frachtu i najmu oraz rachunek stoczni
- **Sława, która coś daje** — notoriety przestało być wyłącznie kosztem: przemytnicy płyną do przystani znanego kapitana, więc miasto pod jego czarną banderą dostaje 35–75% tego, co kolonia
- **Handel, który ma skąd brać** — dostawa szlakiem ubywa z magazynu eksportera, więc zdobycie miasta wypycha jego klientów na sąsiada, sąsiad drenuje własne szopy przez dwa tygodnie i bogaci się na cenie, a potem oba końce zaczynają głodować
- **Głód, który widać i którym można grać** — miasto zapisuje, czego mu zabrakło; traci ludzi, zapełnia tawernę chętnymi na koję i posiłek, a jego gubernator kupi z ładowni wszystko, czego brakuje, płacąc po części reputacją
- **Świat, o którym się słyszy** — tawerna opowiada o głodzie, blokadzie, przeciętym szlaku i czarnej banderze w promieniu 1300, a zdarzenia świata po raz pierwszy naprawdę trafiają w miasta, których dotyczą
- **Zdarzenia, które się spotyka** — huragan zamyka port przed graczem, zaraza opróżnia ławę w tawernie, a miasto z odkrytym złotem staje się punktem na mapie, po który warto płynąć

---

## Planowane moduły

Kolejność wynika z zasady: **najpierw domykamy pętle, które już istnieją**, potem otwieramy nowe moduły. Gracz ma dziś świat, ekonomię, NPC i bitwy — ale brakuje mu powodu, żeby walczyć, i ceny za przegraną.

### Moduł A — Uszkodzenia i tonięcie *(v0.9.9)* — ✅ zamknięty w v0.10.0.0
**Domyka:** bitwy morskie

- ✅ **Kadłub:** ≥75% sprawny, ≥50% przeciek, ≥25% ciężko uszkodzony, poniżej — tonie
- ✅ **Ożaglowanie:** podarte → w strzępach → zerwany maszt (dryf w bitwie, pełzanie ×0.15 na mapie)
- ✅ **Wizualne:** dym, ogień przy tonięciu, animacja zatonięcia, utrata ładunku, przestrzeliny i wyrwy w żaglach (`ShipDamageOverlay`, v0.12.1)
- ✅ **Naprawa prowizoryczna na morzu** — dzienna, sufit 50% kadłuba / 60% takielunku
- ✅ **Ratowanie załogi** — 40% żywej załogi zatopionego wroga, w miarę wolnych koi
- ⬜ **Przechył** — pominięty świadomie: widok z góry, przechył byłby niewidoczny

Szczegóły w [04-CORE-SYSTEMS.md](04-CORE-SYSTEMS.md), sekcje „Stopnie uszkodzeń" i „Naprawa na morzu".

### Moduł B — Pojedynki szermiercze *(v0.10.0)* — ✅ mechanika, ⬜ konteksty
**Priorytet:** WYSOKI | **Złożoność:** Średnia

- ✅ Osobna scena `DuelScene`: cios wysoki / średni / niski, zasłona, riposta, kondycja
- ✅ Wejście przez abordaż — pojedynek zastąpił rzut kośćmi w `resolveBoarding()`
- ✅ Efekt: przejęcie statku albo przegrany abordaż ze stratami w załodze
- ⬜ Wyzwanie w porcie i wątek fabularny jako kolejne konteksty wejścia
- ⬜ Awans / rana kapitana / więzienie jako dodatkowe wyjścia
- ✅ **System dialogów** — `DialogueSystem.ts` + `data/dialogues.ts`, pierwszy konsument: gubernator (v0.11.0)

### Moduł C — Cele i konsekwencje *(v0.11.0)* — ✅
**Domyka:** łuk kariery

- ✅ **Podział łupów** — załoga upomina się co 60 dni; zwłoka zjada morale do podłogi 15%; podział w tawernie zabiera złoto i 65% ludzi
- ✅ **Starzenie kapitana** — 20-35 pełnia, 35-50 szermierka słabnie a doświadczenie rośnie, 50+ wyraźny schyłek; działa na efektywną umiejętność w miejscu użycia
- ✅ **Emerytura i punktacja** — gubernator proponuje ziemię po roku na morzu; `RetirementScene` z księgą wyniku i tytułem
- Przy okazji: umiejętność `fencing` kapitana **w ogóle** nie docierała do abordażu — `setSwordsmanship()` nigdy nie było wołane

### Moduł D — Mapy skarbów *(v0.12.0)* — ✅
**Domyka:** tryb pieszy, tawerny, system questów

- ✅ **System questów** — `QuestSystem.ts`: etapy, wyzwalacze jako dane, nagrody przez `DialogueEffect`, walidator
- ✅ **Zdobywanie map** — kupno w tawernie, jedna oferta na port na dzień, jakość zależna od zamożności portu
- ✅ **Poziomy precyzji** — promień 220 / 110 / 45; przy chybieniu podpowiedź „ciepło/zimno" plus kierunek
- ✅ **Desant → chodzenie → kopanie** — klawisz X na lądzie
- ✅ **Zasadzki** — 25% map to przynęta, rozstrzygana pojedynkiem w `DuelScene`
- ⬜ Mapy jako łup z pirackich statków (dziś tylko kupno w tawernie)
- ⬜ Fragmenty map składane w całość

### Moduł E — Bitwy lądowe *(v0.13.0)* — ✅ (v0.13.0.0)
**Priorytet:** ŚREDNI | **Złożoność:** Duża

`SiegeSystem.ts` + `CityAssaultScene.ts`. Wzory i stałe: [04-CORE-SYSTEMS.md](04-CORE-SYSTEMS.md).

- ✅ **Atak z morza:** ostrzał rundowy, odpowiedź fortu, siła obrony = garnizon × mury × działa × `defense`
- ✅ **Desant:** auto-resolve falami, szanse pokazane przed decyzją; mury warte do 2.5× garnizonu
- ✅ **Przejęcie miasta:** `PortRuntimeState.factionId` zmienia się, a za nim flaga na mapie, gubernator, ceny i spawn NPC
- ✅ **Flota liczy się na lądzie:** działa i desant sumowane ze wszystkich kadłubów
- ✅ **Odbicie miasta przez koronę** (v0.15.0.0, `ReconquestSystem.ts`) — patrz moduł H
- ✅ **Obrona sojusznika** (v0.16.0.0) — desant na kolonię korony, która liczy gracza za swojego (list kaperski albo reputacja „allied"), jest rozgrywalny; patrz moduł I
- ⬜ **Straty konsorty w ludziach** nie są zapisywane: `FleetShip` nie ma pola załogi

### Moduł F — Warstwa fabularna *(v0.14.0)* — ✅ trzon (v0.14.0.0)
**Priorytet:** ŚREDNI | **Złożoność:** Średnia | **Wymaga:** modułów B i D

✅ **Córki gubernatorów** (`RomanceSystem.ts`) — jedna na miasto powyżej przystani, wyprowadzona z klucza portu, nie losowana. Cztery podejścia (komplement, taniec, podarunek, przechwałka) oparte kolejno na uroku, złocie i sławie; szanse pokazane przy opcji. Przy 30 dzieli się tropem, przy 85 i randze 2 przyjmuje oświadczyny. Ślub jest jeden i wart 500-1500 punktów na emeryturze.

✅ **Poszukiwanie rodziny** (`FamilyQuestSystem.ts`) — trzy osoby (siostra, brat, ojciec) w trzech miastach markiza korony wrogiej koronie kapitana. Wejście: informator w tawernie za 200 złota albo darmowo od córki gubernatora. Odbicie każdej to pojedynek w `DuelScene`; 800 / 1500 / 3000 złota, na koniec +20 reputacji własnej korony.

⬜ **Zostało z tego modułu:**
- Posag i baza w porcie żony (dziś ślub daje reputację i punkty, nic więcej)
- Mini-gra taneczna zamiast rzutu kością na urok
- Ciotka i wujek jako czwarty i piąty krewny, z unikalnymi nagrodami (brat jako pierwszy oficer, mapa wielkiego skarbu)
- Tropy od kupców i z tawern jako alternatywa dla nazwania miasta wprost

### Moduł H — Korona wraca po swoje *(v0.15.0)* — ✅ (v0.15.0.0)
**Priorytet:** WYSOKI | **Złożoność:** Średnia | **Wymaga:** modułu E

`ReconquestSystem.ts`. Druga połowa modułu E: zdobycz, której da się nie utrzymać. Wzory i stałe: [04-CORE-SYSTEMS.md](04-CORE-SYSTEMS.md).

- ✅ **Eskadra odbijająca** — korona, która straciła miasto, po 12 dniach karencji rzuca codziennie o wypłynięcie; szansa zależy od rozmiaru miasta, od tego, ile korona jeszcze trzyma, i od tego, czy nie prowadzi już wojny
- ✅ **Ostrzeżenie przed desantem** — eskadra jest zwykłym `WorldEventState`, więc jedzie istniejącą siecią newsów: tawerny całej korony i NPC roznoszący plotki, 6-14 dni wyprzedzenia
- ✅ **Eskalacja** — wyprawa podwaja się przez pół roku utraty miasta
- ✅ **Załoga miasta** — ludzie zostawieni na murach liczą się 1:1 jako żołnierze, dezerterują 0.4%/dzień, pojemność = 2× etat miasta
- ✅ **Obecność floty** — flota w promieniu 400 px rzuca desant do obrony; kosztuje ludzi, płaci złotem z rozbitych transportowców
- ✅ **Sufit odbudowy** — miasto, które zmieniło właściciela, odbudowuje obronę tylko do 45% baseline'u. Czekanie nie jest planem
- ✅ **Flaga na mapie** nadąża za miastem zmieniającym właściciela w trakcie rejsu
- ✅ **Rozgrywalna bitwa obronna** (v0.16.0.0, `CityDefenseSystem.ts` + `CityDefenseScene.ts`) — patrz moduł I

### Moduł I — Miasto się broni, korony się biją *(v0.16.0)* — ✅ (v0.16.0.0)
**Priorytet:** WYSOKI | **Złożoność:** Duża | **Wymaga:** modułów E i H

`CityDefenseSystem.ts` + `CityDefenseScene.ts` + `CrownCampaignSystem.ts`. Wzory i stałe: [04-CORE-SYSTEMS.md](04-CORE-SYSTEMS.md).

- ✅ **Rozgrywalna bitwa obronna** — desant na miasto, przy którym stoi gracz, jest rozgrywany rundami zza murów zamiast rozstrzygać się w komunikacie
- ✅ **Wybór celu ostrzału** — szalupy (mniej żołnierzy na plaży) albo eskorta (mniej ognia w mur). Eskorta zasłania transportowce (`ESCORT_COVER = 0.65`), więc droga do szalup prowadzi przez nią i kosztuje mur
- ✅ **Ludzie na mury** — desant floty na mury jest jednorazowy i wycisza działa okrętowe proporcjonalnie; przy utracie miasta wraca 30% z nich
- ✅ **Cierpliwość eskadry** — 8 rund albo mur poniżej 40%; przeczekać się nie da
- ✅ **Korona kontra korona** (`CrownCampaignSystem.ts`) — wojny przesuwają flagi: wyprawy na najsłabsze kolonie przeciwnika, jadące tą samą siecią newsów, rozstrzygane tym samym kodem co eskadra odbijająca
- ✅ **Obrona sojusznika** — kolonia korony, która liczy gracza za swojego, jest rozgrywalna; wygrana płaci +25 reputacji i złotem z transportowców
- ✅ **Sufit odbudowy tylko pod czarną banderą** — kolonia pod koroną (także zdobyta) odbudowuje obronę do pełnego baseline'u
- ⬜ **Bitwa obronna z pozycjami** — dziś to ekran liczb, jak `CityAssaultScene`; taktyczna bitwa lądowa to inny projekt
- ⬜ **Sojusznik prosi o pomoc** — dziś gracz musi sam być na miejscu; brak zlecenia „broń Port Royale" u gubernatora

### Moduł G — Rozszerzenia poza oryginał *(bez terminu)*
**Priorytet:** NISKI

- **Wioski Indian** — lokacje nie-portowe, handel egzotyką, wskazówki do skarbów i rodziny
- **Misje jezuickie** — leczenie załogi, informacje o regionie, konwersja piratów
- **Pogoda rozszerzona** — huragany sezonowe, mgła (mniejszy zasięg), prądy morskie, deszcz i pioruny
- **Specjalizacje statków** — ulepszenia żagli, kadłuba i uzbrojenia, galion (bonus morale), balast (stabilność vs prędkość)
- **Pathfinding A\*** — prawdziwe szlaki handlowe zamiast reaktywnego sterowania NPC
- **Muzyka** — `MusicManager` ma 5 slotów, wypełniony jeden; brakuje ścieżek dla żeglugi, portu, tawerny i bitwy

---

## Faza AI — Generowanie assetów
**Priorytet:** WYSOKI (równolegle z rozwojem mechanik)

Stan: pipeline opisany w [13-3D-ASSET-PIPELINE.md](13-3D-ASSET-PIPELINE.md) i `sd-pipeline/`. W grze działają ikony miast (6 sprite'ów PNG) i jeden arkusz statku (`sailship.png`, 8 kierunków) współdzielony przez wszystkie klasy.

- **AI-1** — dopracowanie LoRA, workflow ComfyUI per typ assetu, automatyczna konwersja do formatu gry
- **AI-2** — sprite'y statków: 9 klas × 8 kierunków × warianty frakcji; animacje uszkodzeń i tonięcia (potrzebne przez moduł A)
- **AI-3** — sprite'y miast i budynków: tawerna, stocznia, fort, rezydencja gubernatora, kościół
- **AI-4** — portrety NPC, animacje walki (potrzebne przez moduł B), córki gubernatorów, rodzina kapitana
- **AI-5** — efekty: pogoda, eksplozje, ogień, dym; fauna i flora

---

## Kolejność implementacji

```
Moduł A ─── Uszkodzenia i tonięcie ─────── [GOTOWY]
  │
Moduł B ─── Pojedynki ──────────────────── [MECHANIKA GOTOWA]
  │          (zostaje system dialogów + konteksty wejścia)
  │
Moduł C ─── Podział łupów, starzenie, punktacja  [GOTOWY]
  │
Moduł D ─── Mapy skarbów (+ system questów)  [GOTOWY]
  │
Moduł E ─── Bitwy lądowe ─────────────── [GOTOWY]
  │
Moduł F ─── Córki gubernatorów, rodzina  [TRZON GOTOWY]
  │
Moduł H ─── Korona wraca po swoje ─────── [GOTOWY]
  │
Moduł I ─── Miasto się broni, korony się biją  [GOTOWY]
  │
Moduł G ─── Rozszerzenia poza oryginał

║ Równolegle: Faza AI (generowanie assetów) ║
```

---

## Kamienie milowe

| Milestone | Zakres | Wersja |
|-----------|--------|--------|
| Alpha | Fundament, handel, reputacja | v0.8.x ✅ |
| **Beta 1 — żywy świat** | NPC, wydarzenia, ekonomia, bitwy morskie, flota | v0.9.x ✅ |
| Beta 2 — pełna walka | Moduły A + B (uszkodzenia, pojedynki) | v1.0.x |
| Beta 3 — kariera kapitana | Moduł C (łupy, starzenie, punktacja) | v1.1.x |
| Beta 4 — questy i skarby | Moduły D + E + H + I (skarby, bitwy lądowe, obrona zdobyczy, ruchoma mapa) | v1.2.x |
| Warstwa handlowa | Szlaki, blokada, fracht, pętla pieniężna, reputacja przy ladzie (v0.22-0.24) | ✅ |
| Release Candidate | Moduł F (fabuła) | v1.5.x |
| v2.0 — pełna gra | Moduł G + kompletne assety AI | v2.0 |

---

## Etap 3 — port na Godot

Długoterminowo rozważany przepis silnika na Godot 4 + GDScript z eksportem do WASM. Decyzja niepodjęta; Phaser 3 pozostaje platformą docelową do co najmniej v1.0.
