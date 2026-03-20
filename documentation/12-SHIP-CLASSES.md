# 12 — Klasy statków

## Przegląd

Bazując na Sid Meier's Pirates! (1987), gra zawiera **9 klas statków** od małych szybkich łodzi po wielkie galeony. Każda klasa ma unikalne właściwości wpływające na gameplay.

## Właściwości statku

| Właściwość | Opis | Wpływ na gameplay |
|------------|------|-------------------|
| **tonnage** | Tonaż (tony) | Ogólna wielkość statku, wpływa na prestiż |
| **speedBase** | Prędkość bazowa | Prędkość przy pełnych żaglach, bez wiatru. Mnożona przez sailLevel × windMod |
| **turnRate** | Szybkość skrętu (rad/tick) | Jak szybko statek reaguje na ster |
| **hullMax** | Wytrzymałość kadłuba (HP) | Ile obrażeń zniesie przed zatonięciem |
| **sailsMax** | Wytrzymałość ożaglowania (HP) | Uszkodzone żagle = wolniejsze pływanie |
| **cannons** | Maksymalna liczba dział | Siła ognia w bitwach morskich |
| **cargoCap** | Pojemność ładowni (jednostki) | Ile towaru można przewieźć |
| **crewMax** | Maksymalna załoga | Limit ludzi na pokładzie |
| **crewMin** | Minimalna załoga | Poniżej = statek nie może żeglować |
| **draft** | Zanurzenie (1-5) | Głębokość zanurzenia kadłuba |
| **buyPrice** | Cena zakupu (złoto) | Koszt w stoczni |

## Zanurzenie (Draft) — logika

Draft to kluczowa właściwość wpływająca na nawigację:

| Draft | Opis | Rafy płytkie | Rafy głębokie |
|-------|------|-------------|---------------|
| 1 | Bardzo płytki (łodzie) | Przechodzi bez obrażeń | Lekkie obrażenia |
| 2 | Płytki (szalupy, barki) | Przechodzi bez obrażeń | Średnie obrażenia |
| 3 | Średni (brygantymy, fregaty) | Lekkie obrażenia | Duże obrażenia |
| 4 | Głęboki (galeony) | Średnie obrażenia | Krytyczne → zatopienie |
| 5 | Bardzo głęboki (wielkie galeony) | Duże obrażenia | Natychmiastowe zatopienie |

**Mechanika obrażeń od raf:**
- Obrażenia = `(draft - rafThreshold) × dmgPerTick × dt`
- Rafy płytkie: threshold=2 (draft ≤ 2 przechodzi)
- Rafy głębokie: threshold=0 (wszystko dostaje damage, ale draft 1 = minimalne)
- Obrażenia zadawane kadłubowi (hullHp), nie ożaglowaniu
- Gdy hullHp ≤ 0 → statek tonie (game over lub utrata statku NPC)

## Tabela klas statków

Wzorowane na Sid Meier's Pirates! z dostosowaniem do naszej mechaniki:

| Klasa | Tonaż | Prędkość | Skręt | Kadłub | Żagle | Działa | Ładunek | Załoga max/min | Draft | Cena |
|-------|-------|----------|-------|--------|-------|--------|---------|---------------|-------|------|
| **Pinnace** | 20t | 0.70 | 0.28 | 30 | 30 | 4 | 15 | 15/4 | 1 | 200 |
| **Sloop** | 40t | 0.60 | 0.24 | 60 | 50 | 8 | 40 | 30/8 | 1 | 500 |
| **Barque** | 60t | 0.50 | 0.20 | 70 | 60 | 10 | 50 | 40/10 | 2 | 800 |
| **Brigantine** | 100t | 0.55 | 0.20 | 80 | 70 | 16 | 60 | 50/15 | 2 | 1200 |
| **Merchantman** | 120t | 0.32 | 0.12 | 100 | 80 | 12 | 200 | 60/20 | 3 | 2000 |
| **Frigate** | 150t | 0.50 | 0.16 | 120 | 90 | 28 | 80 | 80/25 | 3 | 3000 |
| **Fast Galleon** | 200t | 0.42 | 0.12 | 140 | 100 | 32 | 120 | 100/30 | 4 | 4500 |
| **War Galleon** | 300t | 0.38 | 0.10 | 180 | 120 | 36 | 150 | 120/40 | 4 | 6000 |
| **Ship of the Line** | 400t | 0.30 | 0.08 | 250 | 150 | 48 | 100 | 150/50 | 5 | 10000 |

## Cechy per klasa

### Pinnace (Pinasa)
- Najszybsza, najbardziej zwrotna
- Minimalne uzbrojenie i ładunek
- Idealna do rekonesansu i ucieczek
- Przechodzi nad wszystkimi rafami

### Sloop (Szalupa)
- Szybka, zwrotna, mało dział
- Klasyczny statek piracki do szybkich ataków
- Niskie zanurzenie — bezpieczna na płyciznach

### Barque (Barka)
- Pośrednia między sloopem a brygantymą
- Dobre cargo, przyzwoita prędkość
- Popularna wśród małych kupców

### Brigantine (Brygantyna)
- Wszechstronny statek średniej wielkości
- Dobra równowaga prędkość/uzbrojenie/cargo
- Ulubieniec piratów i korsarzy

### Merchantman (Kupiec)
- Wolny ale ogromna ładownia (200 jednostek!)
- Słabo uzbrojony — łatwy cel dla piratów
- Głębokie zanurzenie — wrażliwy na rafy

### Frigate (Fregata)
- Szybki statek bojowy
- Silne uzbrojenie, dobra prędkość
- Statek marynarki wojennej

### Fast Galleon (Szybki Galeon)
- Kompromis między galeyonem a fregatą
- Duży ładunek + przyzwoita prędkość
- Ulubieniec bogatych kupców i hiszpańskich konwojów

### War Galleon (Galeon Wojenny)
- Klasyczny statek floty hiszpańskiej
- Bardzo silne uzbrojenie, duży ładunek
- Wolny, głębokie zanurzenie — wrażliwy na rafy

### Ship of the Line (Okręt Liniowy)
- Największy, najpotężniejszy statek w grze
- 48 dział, 150 załogi, 250 HP kadłuba
- Ekstremalnie wolny, najgłębsze zanurzenie
- Nad głębokimi rafami → natychmiast tonie
- Bardzo rzadki — tylko największe floty

## Dostępność

- **Pinnace, Sloop** — dostępne od początku w małych portach
- **Barque, Brigantine** — średnie porty ze stocznią level 2+
- **Merchantman, Frigate** — duże porty ze stocznią level 3+
- **Fast Galleon, War Galleon** — tylko stolice frakcji, stocznia level 4+
- **Ship of the Line** — ekstremalnie rzadki, tylko Havana/Port Royal/Cartagena w stoczni level 5
