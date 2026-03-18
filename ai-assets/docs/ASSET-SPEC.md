# Specyfikacja docelowych assetów

## Styl wizualny

**Inspiracja:** Sid Meier's Pirates! (Amiga, 1987) + Sid Meier's Pirates! (C64, 1987)

### Cechy stylu
- Pixel art, widok top-down (mapa) i side-view (bitwy, porty)
- Paleta 32 kolorów (OCS Amiga)
- Ostre piksele, bez anti-aliasingu
- Wyraźne kontury (1-2px outline)
- Flat shading z minimalnym cieniowaniem
- Czytelne sylwetki nawet w małym rozmiarze

### Paleta referencyjna (Amiga OCS 32 kolory)

```
Morze:    #000033, #000066, #003399, #0055AA, #2277CC, #4499DD
Ląd:      #003300, #006600, #228822, #44AA44, #66CC44, #88DD66
Piasek:   #886622, #AA8833, #CCAA55, #DDBB77, #EEDD99
Budynki:  #442200, #664400, #886644, #AA8866, #CCAA88
Skóra:    #CC8866, #DDAA88, #EECCAA
Czerwony: #990000, #CC2222, #FF4444
Niebieski:#000088, #2244AA, #4466CC
Biały:    #FFFFFF
Czarny:   #000000
```

## Specyfikacja per typ assetu

### 1. Kafelki terenu

| Typ | Rozmiar | Ilość | Uwagi |
|-----|---------|-------|-------|
| Morze głębokie | 32×32 | 1 + animacja (8 klatek) | Seamless |
| Morze płytkie | 32×32 | 1 + animacja | Jaśniejszy odcień |
| Plaża/piasek | 32×32 | 4 warianty | Seamless |
| Trawa | 32×32 | 4 warianty | Seamless |
| Dżungla | 32×32 | 4 warianty | Gęsta roślinność |
| Skała | 32×32 | 2 warianty | Góry, klify |
| Rafa koralowa | 32×32 | 2 warianty | Niebezpieczny teren |
| Brzeg (blob) | 32×32 | ~48 wariantów | 8-bit bitmask transitions |

**Łącznie:** ~70 kafelków

### 2. Sprite'y statków (mapa)

| Klasa | Rozmiar klatki | Kierunki | Frakcje | Stany |
|-------|---------------|----------|---------|-------|
| Sloop | 96×64 | 8 | 5+neutral | normal, damaged, sinking |
| Brigantine | 96×64 | 8 | 5+neutral | normal, damaged, sinking |
| Merchantman | 96×64 | 8 | 5+neutral | normal, damaged, sinking |
| Frigate | 96×64 | 8 | 5+neutral | normal, damaged, sinking |
| Galleon | 128×96 | 8 | 5+neutral | normal, damaged, sinking |

**Łącznie:** 5 klas × 8 kierunków × 6 kolorystyk × 3 stany = **720 klatek**
(w praktyce: recolor per frakcja, nie pełna regeneracja)

### 3. Sprite'y statków (bitwa side-view)

| Klasa | Rozmiar | Stany |
|-------|---------|-------|
| Sloop | 128×128 | normal, damaged, heavily_damaged, sinking |
| Brigantine | 128×128 | j.w. |
| Merchantman | 160×128 | j.w. |
| Frigate | 160×128 | j.w. |
| Galleon | 192×160 | j.w. |

**Łącznie:** 5 × 4 = **20 sprite'ów** (+ recolor per frakcja)

### 4. Sprite'y miast (top-down)

| Rozmiar | Wymiary | Frakcje | Uwagi |
|---------|---------|---------|-------|
| Wioska (small) | 64×64 | 5 | Kilka budynków |
| Miasteczko (medium) | 96×96 | 5 | Więcej budynków, dok |
| Miasto (large) | 128×128 | 5 | Duże, fort, kościół |
| Stolica (capital) | 160×160 | 5 | Największe, pałac |

**Łącznie:** 4 × 5 = **20 sprite'ów**

### 5. Budynki (port view)

| Budynek | Rozmiar | Uwagi |
|---------|---------|-------|
| Tawerna | 128×128 | Z szyldem |
| Stocznia | 128×128 | Z dokiem |
| Fort | 128×128 | Z armatami |
| Rezydencja gubernatora | 128×128 | Okazała |
| Kościół | 96×128 | Wieża |
| Rynek | 128×96 | Stragany |

**Łącznie:** **6 budynków** (× warianty architektoniczne per frakcja)

### 6. Portrety NPC

| Postać | Rozmiar | Warianty |
|--------|---------|----------|
| Gubernator | 128×128 | 5 frakcji × 2 typy |
| Barmanka/barman | 128×128 | 3 warianty |
| Kupiec | 128×128 | 3 warianty |
| Stoczniowiec | 128×128 | 2 warianty |
| Pirat (tawerniany) | 128×128 | 5 wariantów |
| Córka gubernatora | 128×128 | 6 wariantów |
| Brat | 128×128 | 1 |
| Siostra | 128×128 | 1 |
| Ciotka | 128×128 | 1 |
| Wujek | 128×128 | 1 |

**Łącznie:** ~**30 portretów**

### 7. Ikony

| Kategoria | Rozmiar | Ilość |
|-----------|---------|-------|
| Towary | 64×64 | 6 (sugar, tobacco, cocoa, rum, food, water) |
| Broń | 64×64 | 8 (sword, cutlass, pistol, cannon...) |
| Skarby | 64×64 | 8 (chest, coins, ring, crown...) |
| Nawigacja | 64×64 | 6 (compass, map, spyglass...) |
| Umiejętności | 64×64 | 5 (fencing, gunnery, navigation, medicine, charm) |
| Statusy | 32×32 | 10 (morale, hunger, thirst, storm...) |
| Misc | 64×64 | 15+ |

**Łącznie:** ~**60 ikon** (64 już istnieje — do poprawy jakości)

### 8. Efekty wizualne (spritesheet)

| Efekt | Rozmiar klatki | Klatki |
|-------|---------------|--------|
| Eksplozja armatnia | 64×64 | 8 |
| Trafienie w kadłub | 32×32 | 6 |
| Rozbryzg wody | 32×32 | 6 |
| Ogień | 32×32 | 4 (loop) |
| Dym | 32×32 | 6 |
| Piorun | 128×256 | 4 |

### 9. UI elementy

| Element | Rozmiar | Uwagi |
|---------|---------|-------|
| Panel dialogowy | 400×300 | Parchment texture |
| Przycisk | 120×40 | Normal + hover + pressed |
| Pasek HP | 100×12 | Segmented |
| Pasek morale | 100×12 | Gradient |
| Ramka portretu | 140×140 | Ozdobna |
| Mapa skarbu | 300×300 | Szablon z X |
| Róża wiatrów | 96×96 | Już istnieje |

## Priorytety

1. **P0 (krytyczne):** Sprite'y statków (mapa), kafelki terenu
2. **P1 (ważne):** Sprite'y miast, ikony (poprawa), portrety kluczowych NPC
3. **P2 (normalne):** Budynki portowe, efekty, UI
4. **P3 (opcjonalne):** Córki gubernatorów, rodzina, warianty architektoniczne
