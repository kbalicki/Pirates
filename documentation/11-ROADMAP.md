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

**Zrealizowane moduły w ujęciu tematycznym:**

- **Statki NPC na mapie** — spawn z portów i despawn w portach, 5 typów zachowań, limit 30 jednostek, mgła wojny, zasięg obserwacji zależny od najwyższego masztu floty
- **Bitwy morskie** — arena 3× viewport, łuki ostrzału ±60°, kule / łańcuchówki / kartacze, przeładowanie zależne od stanu załogi, kapitulacja, abordaż z przejęciem statku
- **Wydarzenia i ekonomia** — 10 wojen historycznych 1568-1697, 15 typów wydarzeń, dzienna symulacja produkcji, konsumpcji i cen w 45 portach, wojna zmienia ruch morski
- **Obieg informacji** — wydarzenie → news w porcie → NPC jako kurier → gracz
- **Flota gracza** — do 3 własnych statków, prędkość eskadry = najwolniejsza jednostka

---

## Planowane moduły

Kolejność wynika z zasady: **najpierw domykamy pętle, które już istnieją**, potem otwieramy nowe moduły. Gracz ma dziś świat, ekonomię, NPC i bitwy — ale brakuje mu powodu, żeby walczyć, i ceny za przegraną.

### Moduł A — Uszkodzenia i tonięcie *(v0.9.9)* — ✅ w większości
**Priorytet:** WYSOKI | **Złożoność:** Średnia | **Domyka:** bitwy morskie

- ✅ **Kadłub:** ≥75% sprawny, ≥50% przeciek, ≥25% ciężko uszkodzony, poniżej — tonie
- ✅ **Ożaglowanie:** podarte → w strzępach → zerwany maszt (dryf w bitwie, pełzanie ×0.15 na mapie)
- ✅ **Wizualne:** dym od stanu „ciężko uszkodzony", ogień przy tonięciu, animacja zatonięcia, utrata ładunku
- ⬜ **Naprawa prowizoryczna na morzu** — powolna, ograniczona. `repairShip()` w `PortInteractionSystem:241` obsługuje wyłącznie port
- ⬜ **Przechył** — pominięty świadomie: widok z góry, przechył byłby niewidoczny. Zamiast tego statek osiada, obraca się i zostawia pierścień na wodzie
- ⬜ **Ratowanie załogi** po zatonięciu

Szczegóły w [04-CORE-SYSTEMS.md](04-CORE-SYSTEMS.md), sekcja „Stopnie uszkodzeń".

### Moduł B — Pojedynki szermiercze *(v0.10.0)*
**Priorytet:** WYSOKI | **Złożoność:** Średnia

Umiejętność `fencing` istnieje od v0.5.6, ale wpływa dziś wyłącznie na jeden mnożnik w auto-rozstrzygnięciu abordażu.

- Osobna scena `DuelScene`: atak wysoki / średni / niski, parada, riposta
- Konteksty: abordaż (zamiast rzutu kośćmi), wyzwanie w porcie, wątek fabularny
- Efekty: przejęcie statku / awans / rana kapitana / więzienie
- **Wymaga:** odbudowy systemu dialogów (stara `DialogueScene` była atrapą i została usunięta) — potrzebny też przez moduły E i F

### Moduł C — Cele i konsekwencje *(v0.11.0)*
**Priorytet:** WYSOKI | **Złożoność:** Średnia

Bez tego rozgrywka nie ma łuku — można żeglować w nieskończoność bez presji i bez zakończenia.

- **Podział łupów** — załoga domaga się go co pewien czas; zwłoka obniża morale (a morale wpływa już na przeładowanie); po podziale załoga się rozprasza i trzeba rekrutować od nowa
- **Starzenie kapitana** — 20-35 pełna sprawność, 35-50 spadek szermierki i wzrost dyplomacji, 50+ wyraźny spadek fizyczny. `calculateAge()` istnieje, ale wiek jest dziś tylko wyświetlany
- **Emerytura i punktacja końcowa** — bogactwo + rangi + rodzina + skarby, ekran wyniku

### Moduł D — Mapy skarbów *(v0.12.0)*
**Priorytet:** ŚREDNI | **Złożoność:** Średnia

Pierwszy realny cel eksploracji. Wykorzystuje istniejący tryb pieszy i tawerny.

- **Zdobywanie:** plotki w tawernie (`getRumorKey()` już działa), łupy z piratów, nagrody za misje
- **System map:** fragment mapy świata + X; poziomy precyzji od dokładnych po mgliste
- **Poszukiwanie:** dopłynięcie → desant → chodzenie po wyspie → wykopanie; część map to zasadzki
- **Skarby:** złoto, artefakty z bonusami, wskazówki do kolejnych, legendarny skarb Kapitana Kidda
- **Wymaga:** systemu questów — `QUESTS` jest dziś pustą mapą, `QuestSystem` ma tylko prymitywy logu zadań

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
Moduł A ─── Uszkodzenia i tonięcie ─────── [NASTĘPNY]
  │
Moduł B ─── Pojedynki + system dialogów
  │
Moduł C ─── Podział łupów, starzenie, punktacja
  │
Moduł D ─── Mapy skarbów (+ system questów)
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
