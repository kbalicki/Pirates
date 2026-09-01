# Playbook — wersja, changelog, commit

## Bump wersji — trzy miejsca naraz

| Plik | Pole |
|---|---|
| `package.json` | `"version": "0.9.9.0"` |
| `src/version.ts` | `export const APP_VERSION = "0.9.9.0";` |
| `src/changelog.ts` | nowy wpis **na górze** tablicy `CHANGELOG` |

Rozjazd między nimi nie wywali builda — użytkownik zobaczy w rogu ekranu inną wersję niż ta wdrożona i nikt się nie zorientuje przez tydzień. Zmieniaj wszystkie trzy w jednym commicie.

## Format wersji

Czteroczłonowy `0.x.y.z`, **nie semver**. Powód: przy trzech członach dotarlibyśmy do v1.0 o wiele za wcześnie.

| Człon | Kiedy rośnie | Przykład |
|---|---|---|
| `z` | poprawka, drobne uzupełnienie, porządki | 0.9.8.0 → 0.9.8.1 |
| `y` | nowa funkcjonalność w ramach modułu | 0.9.8.1 → 0.9.9.0 |
| `x` | duży moduł (bitwy morskie, ekonomia) | 0.9.9.0 → 0.10.0.0 |

## Wpis w changelogu

`src/changelog.ts` jest **czytany przez gracza w grze**, nie przez programistę. Pisz o tym, co się zmieniło w rozgrywce, nie o refaktorach.

```ts
{
  version: "0.9.9.0",
  date: "2026-09-14",
  changes: [
    "SHIP DAMAGE — hulls now degrade in stages instead of flipping to sunk",
    "  100-75% seaworthy, 75-50% leaking (slower), 50-25% crippled, <25% sinking",
    "  Smoke and fire scale with damage; a sinking ship lists before it goes down",
    "CHAIN SHOT now matters — torn sails cut speed, a downed mast means drifting",
    "REPAIRS AT SEA — slow, partial, and only up to 60% hull",
    "Migration v9 backfills damageStage on old saves",
  ],
},
```

Konwencje:
- Nagłówek zmiany WERSALIKAMI, szczegóły wcięte dwiema spacjami.
- Po angielsku.
- Liczby konkretne — gracz chce wiedzieć, o ile.
- Migracje zapisów wymieniaj zawsze: gracz musi wiedzieć, że stare zapisy zadziałają.
- Znane błędy, których świadomie nie naprawiłeś, też tu wpisz.

## Commit

```bash
git add -A
git commit -F - <<'EOF'
v0.9.9.0: ship damage stages and repairs at sea

Hull damage now moves through four stages instead of a binary alive/sunk
flag. Each stage cuts speed and changes the sprite: smoke at 75%, fire at
50%, listing below 25%. Chain shot finally pays off — torn sails throttle
speed and a downed mast leaves the ship drifting with the wind.

Repairs at sea are deliberately weak (60% hull ceiling, ~1% per game hour)
so the shipyard stays worth sailing to.

Migration v9 backfills damageStage from hullHp on existing saves.

Co-Authored-By: ...
EOF
git push origin main
```

Zasady:
- **Po angielsku.** Pierwsza linia: `vX.Y.Z.W: <co się zmieniło>`, tryb rozkazujący, bez kropki.
- Ciało wyjaśnia **dlaczego**, nie powtarza diffa.
- Stopkę atrybucji (`Co-Authored-By`, `Claude-Session`) bierz z instrukcji harnessu dla bieżącej sesji — nie kopiuj jej z innego commita.
- Używaj heredoca (`-F -`), nie `-m` z ucieczkami. PowerShellowe here-stringi tutaj nie działają — to Git Bash.
- Nie używaj `--no-verify`. Jeśli hook blokuje commit, napraw przyczynę.

## Push

Push i deploy są **z góry autoryzowane** jako część cyklu zadania — dla pracy ukończonej i zweryfikowanej w działającej grze. Autoryzacja nie obejmuje:
- pracy w połowie („zapiszę sobie stan"),
- `git push --force`, `git reset --hard`, rebase'u na `main`,
- zmian w innych repozytoriach.

Na te operacje pytaj osobno.

Jeśli jesteś na `main` i zadanie jest duże albo ryzykowne, załóż gałąź. Dla pojedynczych zadań z TODO praca na `main` jest przyjętą praktyką w tym repo.
