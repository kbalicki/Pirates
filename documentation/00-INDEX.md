# Pirates Chronicles — Dokumentacja Projektu

**Wersja:** 0.58.0.0 | **Ostatnia aktualizacja:** 2026-09-11

---

## Spis dokumentów

| # | Dokument | Opis |
|---|----------|------|
| 01 | [Game Design Document](01-GAME-DESIGN.md) | Wizja gry, mechaniki, inspiracja Sid Meier's Pirates! |
| 02 | [Architektura](02-ARCHITECTURE.md) | Warstwy aplikacji, przepływ danych, wzorce projektowe |
| 03 | [Dane statyczne](03-CORE-DATA.md) | Statki, porty, frakcje, towary, ery historyczne |
| 04 | [Systemy gry](04-CORE-SYSTEMS.md) | Nawigacja, pogoda, ekonomia, walka, czas, reputacja |
| 05 | [Modele danych](05-DATA-MODELS.md) | TypeScript: WorldState, EntityState, Commands, Events |
| 06 | [Sceny i UI](06-SCENES-UI.md) | Sceny Phaser, flow gry, HUD, menu |
| 07 | [Rendering](07-RENDERING.md) | Tilemapy, sprite'y, kamera, chmury, efekty wizualne |
| 08 | [Persistence](08-PERSISTENCE.md) | System zapisu (IndexedDB), migracje, format danych |
| 09 | [Zasoby gry](09-ASSETS.md) | Sprite'y, audio, fonty, ikony, asset packi |
| 10 | [Poradnik deweloperski](10-DEVELOPMENT.md) | Uruchomienie, build, testy, konwencje kodu |
| 11 | [Roadmapa rozwoju](11-ROADMAP.md) | Plan rozwoju gry, moduły, fazy implementacji |
| 12 | [Klasy statków](12-SHIP-CLASSES.md) | 9 klas statków — parametry, takielunek, zastosowanie |
| 13 | [Pipeline 3D assets](13-3D-ASSET-PIPELINE.md) | Meshy.ai → spritesheet |

## Powiązane zasoby

- [AI Asset Generation](../ai-assets/README.md) — Subprojekt generowania assetów AI
- [SD Pipeline](../sd-pipeline/README.md) — Workflow ComfyUI + Tiled Diffusion
- [Changelog](../src/changelog.ts) — Historia zmian w kodzie
- [TODO / handoff](../TODO.md) — Bieżący stan prac, dług techniczny, kolejność releasów

## Konwencje

- Dokumentacja w języku polskim
- Sygnatury funkcji w formacie TypeScript
- Stałe i wartości liczbowe dokładnie z kodu źródłowego
- Każdy dokument jest samowystarczalny (nie wymaga czytania innych)

## Notatki z sesji

- [SESSION-2026-09-01.md](SESSION-2026-09-01.md) — v0.9.8.1 → v0.10.0.0: wiatr, testy, uszkodzenia, pojedynki
- [SESSION-2026-09-02.md](SESSION-2026-09-02.md) — v0.9.9.1 → v0.12.0.0: dialogi, łupy, starzenie, emerytura, questy, skarby
- [SESSION-2026-09-04.md](SESSION-2026-09-04.md) — v0.23.0.0 → v0.24.0.0: pętla pieniężna handlu, wycena przy każdym ruchu towaru, reputacja przy ladzie, magazyn na wynajem
- [SESSION-2026-09-04B.md](SESSION-2026-09-04B.md) — v0.24.0.0 → v0.25.0.0: proporczyk ładunku, informator w tawernie, przemyt na nazwisko (i dlaczego sufit bogactwa został odrzucony po raz drugi)
- [SESSION-2026-09-04C.md](SESSION-2026-09-04C.md) — v0.25.0.0 → v0.26.0.0: dostawa ubywa z magazynu, cztery przebiegi dziennego ticku, zamówienie na relief
- [SESSION-2026-09-04D.md](SESSION-2026-09-04D.md) — v0.26.0.0 → v0.27.0.0: głód widać w mieście, ludność z dokładnością do 0,1, miejski spichlerz
- [SESSION-2026-09-04E.md](SESSION-2026-09-04E.md) — v0.27.0.0 → v0.28.0.0: plotki z żywego świata (i odkrycie, że zdarzenia świata nigdy nie trafiały w żaden port)
- [SESSION-2026-09-04F.md](SESSION-2026-09-04F.md) — v0.28.0.0 → v0.29.0.0: zdarzenie, które gracz spotyka; trzy pola bez odbiorcy
- [SESSION-2026-09-05.md](SESSION-2026-09-05.md) — v0.29.0.0 → v0.30.0.0: znaki zdarzeń na mapie, pokój kończący wojnę
- [SESSION-2026-09-05B.md](SESSION-2026-09-05B.md) — v0.30.0.0 → v0.31.0.0: wojna, w której się urodziłeś, i `warBite`
- [SESSION-2026-09-05C.md](SESSION-2026-09-05C.md) — v0.31.0.0 → v0.32.0.0: statek, który ma nazwisko i rozkład; ułamek trasy zamiast pozycji
- [SESSION-2026-09-05D.md](SESSION-2026-09-05D.md) — v0.32.0.0 → v0.33.0.0: raport na mapie (rachuba, nie pozycja) i konwój
- [SESSION-2026-09-05E.md](SESSION-2026-09-05E.md) — v0.33.0.0 → v0.34.0.0: ona się dowiaduje — walka, którą przeżyła, odpowiadana w porcie
- [SESSION-2026-09-05F.md](SESSION-2026-09-05F.md) — v0.34.0.0 → v0.35.0.0: ona ucieka — do jednego z własnych dwóch końców, kursem o najlepszej prędkości uzyskanej
- [SESSION-2026-09-05G.md](SESSION-2026-09-05G.md) — v0.35.0.0 → v0.36.0.0: morze zna twoje nazwisko — każdy kupiec ucieka przed groźnym kapitanem, jeden predykat dla wszystkich
- [SESSION-2026-09-05H.md](SESSION-2026-09-05H.md) — v0.36.0.0 → v0.37.0.0: komisja jest posadą — pryz pokryty, pryz wstydliwy, zdrada patrona, list wyłączny
- [SESSION-2026-09-06.md](SESSION-2026-09-06.md) — v0.37.0.0 → v0.38.0.0: szkwał — pole, które było w każdym zapisie od pierwszego commita i którego nie czytało nic
- [SESSION-2026-09-06B.md](SESSION-2026-09-06B.md) — v0.38.0.0 → v0.39.0.0: pogoda ma miejsce na mapie — huragan przestaje być tylko nagłówkiem, strefy wiatru wreszcie ciągną pasat
- [SESSION-2026-09-06C.md](SESSION-2026-09-06C.md) — v0.39.0.0 → v0.40.0.0: mgła — trzecia pogoda i pierwsza, która nie jest zagrożeniem: tnie oczy obu stronom
- [SESSION-2026-09-06D.md](SESSION-2026-09-06D.md) — v0.40.0.0 → v0.41.0.0: prądy morskie — mapa dostaje kierunek; prąd znosi statek, nigdy nie rusza steru
- [SESSION-2026-09-06E.md](SESSION-2026-09-06E.md) — v0.41.0.0 → v0.42.0.0: handel uczy się prądu — szlak liczony w dniach, nie w milach; 12 z 82 szlaków zmienia ręce
- [SESSION-2026-09-06F.md](SESSION-2026-09-06F.md) — v0.42.0.0 → v0.43.0.0: korona przechodzi przez to samo morze — port wyjścia z nawietrznej, dni z mapy zamiast z kostki
- [SESSION-2026-09-06G.md](SESSION-2026-09-06G.md) — v0.43.0.0 → v0.44.0.0: jej rejs ma długą i krótką połowę — dwa czasy przejścia, `walkPhase`, informator mówi obie liczby
- [SESSION-2026-09-06H.md](SESSION-2026-09-06H.md) — v0.44.0.0 → v0.45.0.0: sztorm wędruje — jedno oko na drodze przez ostrzeżone miasta, `pickNeighbours`, droga na czarcie
- [SESSION-2026-09-06I.md](SESSION-2026-09-06I.md) — v0.45.0.0 → v0.46.0.0: flota skarbowa wypływa — cztery kadłuby, trasa odczytana z prądów, srebro jako zwykły towar
- [SESSION-2026-09-07.md](SESSION-2026-09-07.md) — v0.46.0.0 → v0.47.0.0: trzy z pięciu liczb na karcie postaci nic nie robiły — nawigator, kanonier i medyk; i dlaczego strefa martwa dalej nie jest martwa
- [SESSION-2026-09-07B.md](SESSION-2026-09-07B.md) — v0.47.0.0 → v0.48.0.0: woda ma dno — zanurzenie kadłuba, płycizna i mielizna, pogłębione porty, i renderer półki, którego nikt nigdy nie skonstruował
- [SESSION-2026-09-07C.md](SESSION-2026-09-07C.md) — v0.48.0.0 → v0.49.0.0: statek potrzebuje rąk — `crewMin` czytany przez jedno miejsce w grze, zdobyty galeon z dziewięćdziesięcioma sześcioma ludźmi znikąd, i pryz, którego nie ma kim obsadzić
- [SESSION-2026-09-07D.md](SESSION-2026-09-07D.md) — v0.49.0.0 → v0.50.0.0: Karaiby mają w sobie piratów — korsarzy nie było **wcale**, `aggression` i `targetEntityId` nie czytał nikt, a pomiar zabił po drodze cały jeden projekt (monopol koronny)
- [SESSION-2026-09-07E.md](SESSION-2026-09-07E.md) — v0.50.0.0 → v0.51.0.0: korony kłócą się same — **sześciu konsumentów bez producenta**; domyślna era startowała w dziewięcioletnim pokoju, więc list kaperski nie krył nigdy niczego
- [SESSION-2026-09-07F.md](SESSION-2026-09-07F.md) — v0.51.0.0 → v0.52.0.0: wróg mojego wroga — reputacja była czterema niezależnymi liczbami; dlaczego progi wygrały z proporcją, i zegar, który mówił `08:5.993680000000001`
- [SESSION-2026-09-11C.md](SESSION-2026-09-11C.md) — v0.58.0.0 → v0.59.0.0: kapitan, który stracił statek — mapa dostawała z powrotem kadłub w zerze, czyli zero prędkości, zero napraw i nieosiągalną stocznię; trzy wejścia do tej ślepej uliczki, cała różnica to **jeden punkt kadłuba**; bandera przechodzi na konsortę albo kapitan ląduje z pinasą; i baner wyniku bitwy rysowany przez cały czas poza ekranem
- [SESSION-2026-09-11B.md](SESSION-2026-09-11B.md) — v0.57.0.0 → v0.58.0.0: wioska, która nie nosi żadnej bandery — `native_raid` był skutkiem bez przyczyny od v0.9.7; rum kupuje złoto, złoto zaufanie, zaufanie wyprawę wojenną; dwa projekty zabite pomiarem; pierwsze wydanie prowadzone przez subagenta
- [SESSION-2026-09-11.md](SESSION-2026-09-11.md) — v0.56.0.0 → v0.57.0.0: dzień pierwszy świata — drugie czytanie tabeli zdarzeń rozjechane na pięć sposobów, trzy z sześciu er otwierały się puste; tablica ogłoszeń sortowana po zasięgu; trzy fałszywe tropy odrzucone pomiarem; test zielony i nieprawdziwy przepisany na rozkład
- [SESSION-2026-09-08C.md](SESSION-2026-09-08C.md) — v0.55.0.0 → v0.56.0.0: przyjaciel przyjaciela — sojusz wreszcie decyduje o czymś, czego gracz może dotknąć; papier patrona przy cudzej ladzie i na cudzych murach; warunek `neutral` jako cały projekt; komisja nietknięta celowo
- [SESSION-2026-09-08B.md](SESSION-2026-09-08B.md) — v0.54.0.0 → v0.55.0.0: sojusz jest bytem świata — fakt tylko wyliczany nie ma dnia, w którym się zaczął; 28,8% dni gry było faktem, którego gra nie umiała wymienić; wspólna wyprawa, obca bandera w linii, i symulacja z wyłączoną połową świata odrzucona jako kontrola
- [SESSION-2026-09-08.md](SESSION-2026-09-08.md) — v0.52.0.0 → v0.53.0.0: martwa strefa nie była martwa — halsowanie było ściśle gorsze od niehalsowania dla wszystkich dziewięciu klas; jedna linijka, dwa kandydaty wyrzucone po pomiarze, i sześć z dziesięciu przepraw bez zmiany
