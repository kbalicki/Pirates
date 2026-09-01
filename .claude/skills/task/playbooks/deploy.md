# Playbook — deploy na produkcję

**Produkcja:** https://pirates.k4.pl
**Serwer:** `s4.k4.pl`, port SSH **6543**, użytkownik **k4**
**Uwierzytelnianie:** klucz SSH (`~/.ssh/id_ed25519`, zainstalowany w `authorized_keys`). Bez hasła, bez `SSH_ASKPASS` — zwykłe `ssh`/`scp` po prostu działa.
**Serwer WWW:** `serve dist -l 11890` (node, statyczne pliki), uruchamiany z `~/pirates.k4.pl/`

> **Nigdy nie zapisuj hasła do konta w żadnym pliku.** Dostęp jest po kluczu i tak ma zostać.

## Procedura

```bash
# 1. Build
npm run build

# 2. Wyczyść stare bundle — KROK OBOWIĄZKOWY
ssh -p 6543 k4@s4.k4.pl "rm -rf ~/pirates.k4.pl/dist/assets/*"

# 3. Wgraj nowy build
scp -P 6543 -r dist/* k4@s4.k4.pl:~/pirates.k4.pl/dist/

# 4. Zweryfikuj
curl -s -o /dev/null -w "%{http_code}\n" https://pirates.k4.pl/
ssh -p 6543 k4@s4.k4.pl "ls -la ~/pirates.k4.pl/dist/assets/index-*.js"
```

Krok 4 ma pokazać **dokładnie jeden** plik `index-*.js` z dzisiejszą datą. Więcej niż jeden = krok 2 nie zadziałał.

## Dwie rzeczy, na których łatwo się przejechać

### Czyszczenie starych bundli jest obowiązkowe

Vite hashuje nazwy plików (`index-oamzP8DA.js`). Bez czyszczenia stare pliki zostają na serwerze, a przeglądarka potrafi podać użytkownikowi nieaktualną wersję **mimo Ctrl+Shift+R**. To już się zdarzyło i kosztowało sesję debugowania „dlaczego nie widzę zmian". Nie pomijaj tego kroku, nawet przy jednolinijkowej poprawce.

### Katalog docelowy to `dist/`, nie katalog domowy

Wgrywasz do `~/pirates.k4.pl/dist/`, **nie** do `~/pirates.k4.pl/`. Serwer `serve dist` czyta z podkatalogu. Wgranie o poziom wyżej nie wyrzuci błędu — po prostu nic się nie zmieni na stronie.

## Restart serwera gry

Normalnie **niepotrzebny** — `serve` podaje pliki statyczne i podchwytuje nowe natychmiast. Restartuj tylko wtedy, gdy serwer nie odpowiada albo padł.

```bash
# ubij i podnieś na nowo
ssh -p 6543 k4@s4.k4.pl "pkill -f 'serve dist'; cd ~/pirates.k4.pl && nohup serve dist -l 11890 > /tmp/pirates_serve.log 2>&1 & sleep 2 && curl -s -o /dev/null -w '%{http_code}' http://localhost:11890/"
```

Oczekiwane: `200`. Jeśli nie — zajrzyj do `/tmp/pirates_serve.log`.

## Po deployu

1. Sprawdź `https://pirates.k4.pl/` w przeglądarce albo `curl`em — wersja w prawym dolnym rogu ma się zgadzać z `APP_VERSION`.
2. Powiedz użytkownikowi, że wdrożone, i podaj numer wersji. Jeśli zmiana jest wizualna, dodaj, że może potrzebować Ctrl+Shift+R.

## Kiedy NIE deployować

- Zadanie nie przeszło weryfikacji w działającej grze.
- Zmiana dotyka odczucia rozgrywki, a użytkownik jeszcze jej nie przetestował na `localhost:3000`.
- `npm test` albo `npx tsc --noEmit` nie są czyste.
- Zmiana jest w połowie i chcesz „tylko zobaczyć, jak wygląda na produkcji" — od tego jest localhost.
