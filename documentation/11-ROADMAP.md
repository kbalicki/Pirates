# 11 — Roadmapa rozwoju

**Aktualizacja:** 2026-09-01 | **Wersja kodu:** 0.9.8.1

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

**Zrealizowane moduły w ujęciu tematycznym:**

- **Statki NPC na mapie** — spawn z portów i despawn w portach, 5 typów zachowań, limit 30 jednostek, mgła wojny, zasięg obserwacji zależny od najwyższego masztu floty
- **Bitwy morskie** — arena 3× viewport, łuki ostrzału ±60°, kule / łańcuchówki / kartacze, przeładowanie zależne od stanu załogi, kapitulacja, abordaż z przejęciem statku
- **Wydarzenia i ekonomia** — 10 wojen historycznych 1568-1697, 15 typów wydarzeń, dzienna symulacja produkcji, konsumpcji i cen w 45 portach, wojna zmienia ruch morski
- **Obieg informacji** — wydarzenie → news w porcie → NPC jako kurier → gracz
- **Flota gracza** — do 3 własnych statków, prędkość eskadry = najwolniejsza jednostka

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

### Moduł E — Bitwy lądowe *(v0.13.0)*
**Priorytet:** ŚREDNI | **Złożoność:** Duża

Największa nowa mechanika. Fundament już jest: `defense` per port istnieje i spada po najazdach.

- **Atak z morza:** ostrzał fortów, odpowiedź fortów, siła obrony = garnizon + fortyfikacje + wielkość miasta
- **Desant:** po osłabieniu fortów; oblężenie w uproszczonym auto-resolve z modyfikatorami
- **Przejęcie miasta:** zmiana `factionId` portu z kaskadą w ekonomii i spawnie NPC
- **Obrona:** AI atakuje miasta, gracz może bronić sojuszników (reputacja + złoto)

### Moduł F — Warstwa fabularna *(v0.14.0+)*
**Priorytet:** ŚREDNI | **Złożoność:** Średnia | **Wymaga:** modułów B i D

**Córki gubernatorów** — losowe w dużych portach, atrybuty (uroda, charakter, posag), zaloty przez wizyty u gubernatora, mini-gra taneczna lub dialog z modyfikatorem uroku, prezenty. Małżeństwo daje posag, bazę w porcie żony, bonus reputacji i punkty na koniec.

**Poszukiwanie rodziny** — 4 osoby (brat, siostra, ciotka, wujek), każda w innym regionie. Tropy z tawern i od kupców tworzą łańcuch wskazówek. Misje ratunkowe wymagają różnych umiejętności: bitwy, dyplomacji, nawigacji, mapy. Nagroda: +1 do umiejętności i unikalny bonus (brat jako pierwszy oficer, mapa wielkiego skarbu od wujka).

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
Moduł E ─── Bitwy lądowe
  │
Moduł F ─── Córki gubernatorów, rodzina
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
| Beta 4 — questy i skarby | Moduły D + E (skarby, bitwy lądowe) | v1.2.x |
| Release Candidate | Moduł F (fabuła) | v1.5.x |
| v2.0 — pełna gra | Moduł G + kompletne assety AI | v2.0 |

---

## Etap 3 — port na Godot

Długoterminowo rozważany przepis silnika na Godot 4 + GDScript z eksportem do WASM. Decyzja niepodjęta; Phaser 3 pozostaje platformą docelową do co najmniej v1.0.
