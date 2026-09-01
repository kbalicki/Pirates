---
name: task
description: Pełny cykl pracy nad JEDNYM zadaniem z TODO.md w Pirates Chronicles — wybór zadania, implementacja, testy, weryfikacja w działającej grze, changelog, dokumentacja, commit, push na GitHub i deploy na pirates.k4.pl. Wywołuj na start pracy nad kolejnym zadaniem ("weź następne zadanie", "zrób P0-2", "rób dalej wg TODO"), a także gdy trzeba domknąć zadanie już zaczęte.
---

# Cykl zadania — Pirates Chronicles

Prowadzisz **jedno zadanie na raz**, od wyboru z TODO.md do wdrożenia na produkcję.
Nie zaczynasz drugiego zadania, dopóki pierwsze nie jest wdrożone albo świadomie odłożone.

Odpowiadasz po polsku. Kod, komunikaty commitów, wpisy changelogu i nazwy plików — po angielsku.
Dokumentacja w `documentation/` — po polsku.

---

## Faza 0 — Wybór zadania

1. Przeczytaj `TODO.md` (sekcja 2 = dług techniczny P0, sekcja 3 = kolejność releasów, sekcja 4 = zadania równoległe).
2. Jeśli użytkownik nie wskazał zadania, weź **pierwsze niezrobione** w tej kolejności: P0 → bieżący release z sekcji 3 → sekcja 4.
3. Sprawdź, czy w `C:\Users\websy\.claude\projects\C--GIT-PiratesChronicles\memory\` istnieje plik `task_<nazwa>.md` dla tego zadania. **Jeśli tak — przeczytaj go przed pisaniem kodu.** Zawiera listę podejść, które już zawiodły. Powtórzenie nieudanego podejścia to najgorszy możliwy błąd w tym projekcie.
4. Powiedz użytkownikowi jednym zdaniem, co bierzesz i dlaczego. Nie proś o zatwierdzenie planu — zadanie z TODO jest już zatwierdzone.

**Rozmiar zadania.** Jeśli zadanie z TODO to cały release (np. „v0.9.9 — domknięcie bitwy morskiej"), rozbij je na podzadania i weź **jedno**. Cały release to nie jest jedno zadanie.

**Kiedy pytać.** Pytaj tylko wtedy, gdy dwie sensowne interpretacje prowadzą do istotnie różnej pracy, albo gdy potrzebujesz zewnętrznego źródła (kod z codepena, asset, decyzja balansowa). Wtedy pytaj **od razu**, nie po godzinie zgadywania. Nigdy nie zgaduj treści zewnętrznego linku.

---

## Faza 1 — Implementacja

Zasady architektury, których nie wolno złamać — szczegóły w [playbooks/codebase.md](playbooks/codebase.md):

- `src/core/` **nie importuje Phasera**. Nigdy. Cała logika gry musi być testowalna bez silnika.
- Każde nowe pole w `WorldState` wymaga migracji w `src/persistence/Migrations.ts` — inaczej psujesz wszystkie zapisy graczy.
- Każdy nowy tekst w UI → klucz w `en.ts` **i** `pl.ts`.
- Font tylko przez `UI_FONT` / `txt()` z `src/game/ui/textStyle.ts`.
- Nie rejestruj scen „na zapas" — scena bez wejścia to martwy kod.
- Nowe assety kompresuj **przed** dodaniem (`sharp` dla PNG, ffmpeg dla JPEG).
- Grafiki nie szukaj w internecie — generuj lokalnie, patrz [playbooks/assets.md](playbooks/assets.md) i skill `comfyui`.

Pisz kod w stylu otaczających plików: ta baza kodu ma gęste komentarze wyjaśniające *wzory i decyzje*, nie oczywistości. Wzór matematyczny (obrażenia, przeładowanie, krzywa wiatru) opisuj w komentarzu nad funkcją.

---

## Faza 2 — Testy

Kolejność, zawsze cała:

```bash
npx tsc --noEmit          # musi być czysto
npm test                  # musi być zielono
npm run build             # musi przejść
```

Do **każdej nowej czystej funkcji w `src/core/`** dopisz testy w `src/core/systems/__tests__/`.
Szczegóły i pułapki (jednostki prędkości, konwencja kierunku wiatru) — [playbooks/testing.md](playbooks/testing.md).

Jeśli test failuje: **najpierw ustal, czy błąd jest w kodzie, czy w teście.** W tym projekcie zdarzało się, że testy kodowały nieaktualny model fizyki. Nie „naprawiaj" testu przez rozluźnienie asercji, dopóki nie wiesz, która strona ma rację.

---

## Faza 3 — Weryfikacja w działającej grze

Testy jednostkowe nie wystarczą. Zmiana musi być zobaczona.

1. Zrestartuj serwer deweloperski — **wyłącznie port 3000**, najpierw ubij wszystkie node'y.
   Pełna procedura: [playbooks/dev-server.md](playbooks/dev-server.md).
2. Wejdź w stan gry, którego dotyczy zmiana — użyj parametrów URL, nie klikaj przez menu:
   `?skip`, `?zoom=z10`, `?debug=1`, `?battle=1|trader|navy|pirate|hunter`.
3. Zrób zrzut ekranu przez `scripts/screenshot.mjs` albo poproś użytkownika o obejrzenie na `localhost:3000`.
4. Zmiany wpływające na *odczucie* gry (prędkość, sterowność, tempo bitwy, balans) **wymagają playtestu użytkownika** — pokaż, co zmieniłeś, i poczekaj na jego ocenę, zanim wdrożysz.

**Jeśli nie działa:** wróć do fazy 1. Po drugim nieudanym podejściu **załóż lub uzupełnij plik `task_<nazwa>.md`** w katalogu memory: co próbowałeś, dlaczego nie zadziałało, jaki jest stan. Dopiero potem próbuj trzeci raz.

---

## Faza 4 — Wydanie

Dopiero gdy faza 3 wyszła. Kolejność jest sztywna.

### 4a. Wersja

Bump w **trzech** miejscach naraz — rozjazd między nimi to błąd, którego nikt nie zauważy od razu:

| Plik | Pole |
|------|------|
| `package.json` | `"version"` |
| `src/version.ts` | `APP_VERSION` |
| `src/changelog.ts` | nowy wpis **na górze** tablicy `CHANGELOG` |

Format czteroczłonowy `0.x.y.z`, nie semver. Czwarty człon = poprawka, trzeci = funkcjonalność, drugi = duży moduł.
Zasady pisania wpisu changelogu — [playbooks/release.md](playbooks/release.md).

### 4b. Dokumentacja

Sprawdź, czy zmiana unieważniła któryś dokument. Mapa „co zmieniłeś → co zaktualizować" jest w [playbooks/docs.md](playbooks/docs.md).

Dokumentacja tego projektu potrafiła być pół roku do tyłu i mylić kolejnych agentów. **Nieaktualny dokument jest gorszy niż jego brak** — kosztuje godzinę pracy na fałszywym tropie.

### 4c. TODO.md

- Odhacz zrobione zadanie (`~~przekreślenie~~ ✅ vX.Y.Z.W` z jednozdaniowym wynikiem).
- Dopisz problemy znalezione po drodze, których **nie** naprawiłeś — z lokalizacją `plik:linia` i sugerowaną poprawką.
- Zaktualizuj nagłówek: wersja, liczba plików, LOC, stan testów.

### 4d. Commit i push

Użytkownik **z góry autoryzował** commit, push i deploy jako część tego cyklu — nie pytaj o zgodę na każdy z osobna. Autoryzacja dotyczy zadania ukończonego i zweryfikowanego w fazie 3; nie obejmuje pushowania pracy w połowie.

```bash
git add -A
git commit -F -    # heredoc, treść po angielsku
git push origin main
```

Format komunikatu i przykład — [playbooks/release.md](playbooks/release.md).
Stopkę atrybucji (`Co-Authored-By` / `Claude-Session`) bierz z instrukcji harnessu dla bieżącej sesji.

### 4e. Deploy na produkcję

**Zawsze czyść stare bundle przed wgraniem.** Vite hashuje nazwy plików; bez czyszczenia stare `index-*.js` zostają na serwerze, a przeglądarka potrafi podać użytkownikowi nieaktualną wersję mimo Ctrl+Shift+R. To się już zdarzyło i nie może się powtórzyć.

Pełna procedura z weryfikacją i restartem serwera gry — [playbooks/deploy.md](playbooks/deploy.md).

---

## Faza 5 — Domknięcie

1. **Pamięć zadania** — jeśli zadanie było średnie lub duże, zapisz `task_<nazwa>.md` w katalogu memory: co zadziałało, co nie, stan implementacji. To ratuje kolejnego agenta przed powtarzaniem twoich ślepych uliczek.
2. **Konserwacja skilla** — jeśli w trakcie pracy okazało się, że któraś procedura w tym skillu albo w playbooku jest nieaktualna, niepełna lub myląca: **popraw ją w tym samym commicie**. Zmienił się adres serwera, komenda deployu, nazwa skryptu, struktura katalogów — wszystko to należy do zadania, nie do „kiedyś".
3. **Raport** — jednym akapitem: co zrobione, co zweryfikowane i jak, co wdrożone, co świadomie zostawione. Bez podsumowywania planu, bez powtarzania tego, co przed chwilą napisałeś.

---

## Czego nie robić

- Nie bierz drugiego zadania, zanim pierwsze nie jest wdrożone albo jawnie odłożone.
- Nie pushuj i nie deployuj pracy niezweryfikowanej w fazie 3.
- Nie uruchamiaj serwera deweloperskiego na innym porcie niż 3000 i nigdy w dwóch instancjach.
- Nie rozluźniaj asercji testu, żeby zrobił się zielony, zanim nie ustalisz, która strona ma rację.
- Nie poszerzaj zakresu zadania po drodze. Znalazłeś inny problem — zapisz go w TODO.md i idź dalej.
- Nie zgaduj treści zewnętrznego źródła (codepen, dokumentacja, asset). Poproś użytkownika o wklejenie.
- Nie zapisuj haseł ani sekretów w żadnym pliku. Dostęp do serwera jest po kluczu SSH.

---

## Playbooki

| Playbook | Kiedy |
|----------|-------|
| [codebase.md](playbooks/codebase.md) | Orientacja w architekturze, gdzie co mieszka, pułapki renderingu |
| [testing.md](playbooks/testing.md) | Pisanie i naprawianie testów, weryfikacja w grze, Puppeteer |
| [dev-server.md](playbooks/dev-server.md) | Restart serwera deweloperskiego, parametry debugowania URL |
| [release.md](playbooks/release.md) | Bump wersji, wpis changelogu, format commita |
| [deploy.md](playbooks/deploy.md) | Deploy na pirates.k4.pl, czyszczenie bundli, restart serwera gry |
| [docs.md](playbooks/docs.md) | Który dokument zaktualizować po jakiej zmianie |
| [assets.md](playbooks/assets.md) | Generowanie grafiki do gry (ComfyUI) i wprowadzanie jej do projektu |

Do generowania grafiki jest osobny skill **`comfyui`** (poziom użytkownika, dostępny we wszystkich projektach) — obsługa lokalnego ComfyUI, dobór modeli, CLI, diagnostyka. `playbooks/assets.md` opisuje tylko to, co swoiste dla tej gry.
