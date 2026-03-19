# 11 — Roadmapa rozwoju

## Wizja

Odtworzenie pełnej mechaniki **Sid Meier's Pirates!** (Amiga, 1987) w nowoczesnej formie przeglądarkowej z retro pixel art. Następnie rozbudowa o nowe moduły wykraczające poza oryginał.

---

## Status aktualny (v0.8.5)

### Ukończone fazy

| Faza | Opis | Status |
|------|------|--------|
| 0-1 | Scaffold, typy, mapa proceduralna | ✅ |
| 2 | Sterowanie statkiem (WSAD), kamera, HUD | ✅ |
| 3 | Porty z handlem, dialog zbliżania | ✅ |
| 4 | System reputacji i frakcji (5 frakcji) | ✅ |
| 5 | Bitwy morskie (podstawowe) | ✅ |
| 5.5 | Zapis/odczyt (IndexedDB, 5 slotów) | ✅ |
| 5.6 | Tworzenie postaci, umiejętności, ery | ✅ |
| 5.7 | 45 miast, geografia, i18n (en/pl) | ✅ |
| 5.8 | Asset packi, zoom, font Dancing Script | ✅ |
| 5.9 | Dokumentacja, AI assets subprojekt, roadmapa | ✅ |
| 6.0 | Statki NPC na mapie (spawn, AI, widoczność, fog-of-war) | ✅ |
| 6.1 | Fix embarku w zatokach (prostopadłe odpłynięcie) | ✅ |
| 6.2 | Czysty UI: minimap usunięta, HUD przeniesiony do SPACE | ✅ |
| 6.3 | UIOverlayScene: kompas wiatru + wersja (zoom-niezależne) | ✅ |
| 6.4 | Start ze zwiniętymi żaglami | ✅ |
| 6.5 | 10 poziomów zoom (0.5x–8.0x), domyślny z8 | ✅ |
| 6.6 | Chmury: mniejsze, więcej, fade-in, 3 profile wysokości | ✅ |
| 6.7 | Mewy: 2 rozmiary, soft steering, tylko nad wodą | ✅ |
| 6.8 | Mniejsze sprite'y statków (-30%), data w UIOverlay | ✅ |
| 6.9 | Fix odpływania z portu (perpendicular push) | ✅ |

---

## Planowane fazy

### Faza 6 — Statki AI na mapie
**Priorytet:** WYSOKI | **Złożoność:** Duża

Statki NPC żeglujące po mapie świata — handlarze, patrole marynarki, piraci.

**6.1 — System spawn i zarządzania statkami AI**
- Pula statków per frakcja (limit na mapie)
- Spawn w okolicy portów macierzystych
- Despawn gdy daleko od gracza (oszczędność zasobów)
- Różne typy: handlarz, patrol, pirat, konwój

**6.2 — AI nawigacyjne**
- Pathfinding A* między portami (szlaki handlowe)
- Omijanie lądu i raf
- Patrole marynarki: trasy wokół portów frakcji
- Piraci: strefy polowania, pościg za handlarzami

**6.3 — System widoczności**
- Statki widoczne tylko w zasięgu wzroku gracza
- Płynne pojawianie się (fade-in) przy zbliżaniu
- Płynne znikanie (fade-out) przy oddalaniu
- Zasięg zależny od pogody (sztorm = mniejszy) i umiejętności nawigacji
- Luneta (spyglass) zwiększa zasięg

**6.4 — Interakcje AI**
- Handlarze: neutralni, uciekają od piratów
- Patrole: kontrolują okolicę, atakują wrogów frakcji
- Piraci: agresywni, pościg za słabszymi
- Floty: grupy statków podróżujących razem

---

### Faza 7 — Rozbudowa bitew morskich
**Priorytet:** WYSOKI | **Złożoność:** Średnia

**7.1 — Uszkodzenia statków**
- **Kadłub:** drobne uszkodzenia → poważne przecieki → tonięcie
  - Etapy: 100%→75% (sprawny), 75%→50% (przecieka, powolny), 50%→25% (ciężkie uszkodzenia), <25% (tonięcie)
  - Wizualne: dym, ogień, przechył
- **Ożaglowanie:** lekkie → poważne → zerwane
  - Etapy: uszkodzone żagle (wolniej), zerwany maszt (drift), brak żagli (dryfowanie z wiatrem)
  - Wizualne: podarte żagle, brak masztu
- Naprawa: w porcie (stocznia) lub prowizoryczna na morzu (wolna, ograniczona)
- Tonięcie: animacja, utrata ładunku, ratowanie załogi

**7.2 — Typy amunicji**
- Kule (hull damage)
- Łańcuchówki (sail damage)
- Kartacze (crew damage)
- Wybór amunicji przed strzałem

**7.3 — Abordaż**
- Warunek: statki blisko siebie + niski sail level
- Porównanie załóg + modyfikator szermierki kapitana
- Mini-gra lub auto-resolve
- Zdobycie statku wroga (dodanie do floty)

---

### Faza 8 — Bitwy lądowe
**Priorytet:** ŚREDNI | **Złożoność:** Duża

**8.1 — Atak na miasto z morza**
- Ostrzał armatni fortów
- Forty strzelają w odpowiedzi (damage)
- Siła obrony = garnison + fortyfikacje + wielkość miasta
- Desant na plażę po osłabieniu fortów

**8.2 — Atak lądowy**
- Desant → formacja piechoty
- Oblężenie: podkopy, drabiny, taran
- Uproszczona mechanika (auto-resolve z modyfikatorami)
- Sukces = przejęcie miasta (tymczasowe lub trwałe)

**8.3 — Obrona miast**
- AI atakuje miasta (inne frakcje, piraci)
- Gracz może bronić sojuszniczych miast
- Nagroda: reputacja + złoto

---

### Faza 9 — Moduł pojedynków
**Priorytet:** ŚREDNI | **Złożoność:** Średnia

**9.1 — Pojedynki szermierskie**
- Osobna scena (jak w oryginale)
- Ruchy: atak wysoki/średni/niski, obrona, riposte
- System oparty na umiejętności szermierki kapitana
- Kontekst: abordaż, wyzwanie gubernatora, obrona honoru

**9.2 — Typy pojedynków**
- Abordażowy (po wejściu na statek wroga)
- Honorowy (w portach, z NPC)
- Fabularny (z antagonistami)

**9.3 — Efekty pojedynku**
- Wygrana: zdobycie statku / awans / fabuła
- Przegrana: raniony kapitan, utrata statku, więzienie

---

### Faza 10 — Upływ czasu i wydarzenia historyczne
**Priorytet:** ŚREDNI | **Złożoność:** Duża

**10.1 — System wydarzeń historycznych**
- Kalendarz wydarzeń na podstawie realnej historii Karaibów
- Typy: wojny między frakcjami, epidemie, trzęsienia ziemi, nowi gubernatorzy
- Wpływ na: układ sił, ceny, dostępność portów

**10.2 — Dynamika miast**
- Miasta bogacą się / ubożeją w zależności od handlu
- Populacja rośnie/maleje
- Fortyfikacje budowane/niszczone
- Garnizony wzmacniane/osłabiane
- Przejmowanie miast przez frakcje (wojny)

**10.3 — Starzenie się kapitana**
- Kapitan starzeje się z upływem czasu gry
- Wiek wpływa na umiejętności:
  - 20-35: pełna sprawność
  - 35-50: lekki spadek szermierki, wzrost dyplomacji
  - 50+: znaczny spadek fizyczny, mądrość
- Emerytura: wymuszony koniec kariery w starszym wieku
- Punktacja końcowa: bogactwo + rangi + rodzina + skarby

**10.4 — Podział łupów**
- Co pewien czas załoga żąda podziału
- Im dłużej bez podziału → niższe morale
- Podział: % dla kapitana vs % dla załogi
- Po podziale: załoga się rozprasza, trzeba rekrutować nową

---

### Faza 11 — Córki gubernatorów
**Priorytet:** ŚREDNI | **Złożoność:** Mała

**11.1 — System romansów**
- Losowe córki gubernatorów w dużych portach
- Atrybuty: uroda, charakter, posag
- Wymóg: odpowiednia reputacja u frakcji + ranga

**11.2 — Zaloty**
- Wizyty u gubernatora → spotkania z córką
- Mini-gra taneczna lub dialog
- Modyfikator: umiejętność uroku kapitana
- Prezenty: biżuteria, egzotyczne towary

**11.3 — Małżeństwo**
- Bonus: posag (złoto), informacje o skarbach
- Efekt stały: baza w porcie żony, bonus reputacji
- Wpływ na punktację końcową

---

### Faza 12 — Poszukiwanie rodziny
**Priorytet:** ŚREDNI | **Złożoność:** Średnia

**12.1 — Zaginiona rodzina**
- Backstory: kapitan stracił rodzinę (piraci, wojna, porwanie)
- 4 członkowie do odnalezienia: brat, siostra, ciotka, wujek
- Każdy w innym regionie Karaibów

**12.2 — Tropy**
- Plotki w tawernach → ogólna lokalizacja
- Kupcy i marynarze → bardziej precyzyjne tropy
- Łańcuch wskazówek prowadzi do następnego kroku

**12.3 — Misje ratunkowe**
- Brat: więzień w twierdzy (wymaga bitwy)
- Siostra: w porcie dalekiej frakcji (wymaga dyplomacji)
- Ciotka: u Indian (wymaga nawigacji i handlu)
- Wujek: na bezludnej wyspie (wymaga mapy)

**12.4 — Nagrody**
- Każdy członek: punkty doświadczenia + bonus
- Brat: +1 szermierka, dołącza jako pierwszy oficer
- Siostra: +1 medycyna, informacje o skarbie
- Ciotka: +1 urok, kontakty handlowe
- Wujek: +1 nawigacja, mapa do wielkiego skarbu

---

### Faza 13 — Mapy skarbów
**Priorytet:** ŚREDNI | **Złożoność:** Średnia

**13.1 — Zdobywanie map**
- Plotki w tawernach (za złoto)
- Łupy z pokonanych piratów
- Nagrody za misje
- Wskazówki od rodziny

**13.2 — System map**
- Mapa skarbu = fragment mapy świata + X marks the spot
- Różne poziomy trudności (precyzyjne → mgliste wskazówki)
- Wyświetlanie: overlay na minimapie lub osobna scena

**13.3 — Poszukiwanie**
- Dopłynięcie do obszaru → desant na ląd
- Chodzenie po wyspie → szukanie miejsca
- Wykopywanie: mini-gra lub auto-resolve
- Pułapki: niektóre mapy to zasadzki

**13.4 — Skarby**
- Złoto (duże ilości)
- Artefakty (unikalne itemy z bonusami)
- Wskazówki do kolejnych skarbów
- Legendarny skarb Kapitana Kidda (quest końcowy?)

---

### Faza 14 — Flota gracza
**Priorytet:** NISKI | **Złożoność:** Średnia

**14.1 — Zarządzanie flotą**
- Gracz może posiadać więcej niż 1 statek
- Zdobyte statki: abordaż, kupno
- Max 4 statki w flocie
- Przesiadanie się między statkami

**14.2 — AI floty**
- Statki floty podążają za flagowcem
- Formacje: linia, klin, luźna
- W bitwie: wsparcie ogniowe

**14.3 — Podział zasobów**
- Załoga / ładunek / armaty rozdzielane między statki
- Stocznia: naprawa całej floty

---

### Faza 15 — Moduły dodatkowe (poza oryginałem)
**Priorytet:** NISKI | **Złożoność:** Różna

**15.1 — Wioski Indian**
- Lokacje na mapie (nie-portowe)
- Handel egzotycznymi towarami
- Wskazówki do skarbów i rodziny
- Misje pomocnicze

**15.2 — Misje jezuickie**
- Leczenie załogi (medycyna)
- Informacje o regionie
- Konwersja piratów (reputacja)

**15.3 — System pogodowy rozszerzony**
- Huragany: sezonowe, niszczycielskie
- Mgła: zmniejszony zasięg widzenia
- Prądy morskie: wpływ na dryf
- Wizualne efekty: deszcz, pioruny

**15.4 — System specjalizacji statków**
- Ulepszenia: szybsze żagle, mocniejszy kadłub, dodatkowe armaty
- Figurehead (galion): bonusy moralne
- Balas: stabilność vs prędkość

---

## Faza AI — Generowanie assetów
**Priorytet:** WYSOKI (równolegle z rozwojem mechanik)

### AI-1 — Pipeline graficzny
- Poprawienie modelu LoRA (trening na danych z Amiga/C64)
- Workflow ComfyUI dla każdego typu assetu
- Automatyczna konwersja do formatu gry (32×32 tiles, 64×64 sprites)

### AI-2 — Sprite'y statków
- 5 klas × 8 kierunków × 5 frakcji (kolorystyka) = 200 sprite'ów
- Animacje: żegluga, uszkodzenia, tonięcie

### AI-3 — Sprite'y miast i budynków
- Porty: 4 rozmiary × style architektoniczne per frakcja
- Budynki: tawerna, stocznia, fort, gubernator, kościół
- Animacje: dym, flagi

### AI-4 — Sprite'y postaci
- Portrety NPC (8-bit style)
- Animacje walki (pojedynki)
- Córki gubernatorów (warianty)
- Rodzina kapitana

### AI-5 — Efekty i otoczenie
- Efekty pogodowe (deszcz, mgła, pioruny)
- Eksplozje, ogień, dym
- Fauna: mewy, delfiny, rekiny
- Flora: palmy, lasy, kwiaty

---

## Kolejność implementacji (sugerowana)

```
Faza 6  ─── Statki AI na mapie ──────────── [NASTĘPNA]
  │
Faza 7  ─── Rozbudowa bitew morskich
  │
Faza 9  ─── Pojedynki szermierskie
  │
Faza 8  ─── Bitwy lądowe
  │
Faza 10 ─── Upływ czasu + wydarzenia
  │
Faza 13 ─── Mapy skarbów
  │
Faza 12 ─── Poszukiwanie rodziny
  │
Faza 11 ─── Córki gubernatorów
  │
Faza 14 ─── Flota gracza
  │
Faza 15 ─── Moduły dodatkowe

║ Równolegle: Faza AI (generowanie assetów) ║
```

---

## Kamienie milowe

| Milestone | Fazy | Wersja docelowa |
|-----------|------|-----------------|
| **Alpha** (obecny) | 0-5 | v0.8.x |
| **Beta 1** — żywy świat | 6-7 | v0.9.x |
| **Beta 2** — pełna walka | 8-9 | v1.0.x |
| **Beta 3** — historia i czas | 10-11 | v1.1.x |
| **Beta 4** — questy i skarby | 12-13 | v1.2.x |
| **Release Candidate** | 14-15 | v1.5.x |
| **v2.0** — pełna gra | wszystkie | v2.0 |
