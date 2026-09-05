# Playbook — serwer deweloperski

## Restart — jedyna poprawna procedura

```bash
taskkill //F //IM node.exe     # ubij WSZYSTKIE node'y
npm run dev                    # Vite, port 3000
```

Podwójny ukośnik `//F` `//IM` jest wymagany w Git Bashu — pojedynczy zostanie potraktowany jak ścieżka.

**Bezwzględne zasady:**
- **Tylko port 3000.** Nigdy 3001, 3002 ani żaden inny.
- **Nigdy dwie instancje naraz.**

Jeśli Vite sam przeskoczy na 3001, znaczy to, że 3000 jest zajęty przez poprzednią instancję — ubij node'y i zacznij od nowa. Nie pracuj na porcie, który Vite wybrał zamiennie: użytkownik testuje na 3000 i zobaczy nieaktualną wersję.

Weryfikacja po starcie:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/   # oczekiwane: brak odpowiedzi
```

`taskkill //F //IM node.exe` ubija też serwery uruchomione w tle przez narzędzia. Jeśli w tle działa ComfyUI (to Python, nie Node), pozostaje nietknięty.

## Parametry debugowania w URL

Parsowane w `src/game/scenes/PreloadScene.ts`. Używaj ich zamiast klikania przez menu — oszczędzają czas i dają powtarzalny stan.

| Parametr | Efekt |
|---|---|
| `?skip` | Pomija tworzenie postaci, wchodzi prosto na mapę |
| `?zoom=z10` | Startowy poziom zoomu `z1`..`z14`. Idzie przez `setZoomLevel()`, więc działa za pierwszym razem (v0.30.0) |
| `?era=<id>` | Era historyczna dla `?skip`; trzy z sześciu otwierają się w środku wojny (v0.31.0) |
| `?debug=1` | Tryb debug — wyłącza mgłę wojny |
| `?battle=1\|trader\|navy\|pirate\|hunter` | Bitwa testowa |
| `?siege=<port>` | Szturm na miasto (fregata + konsorta + list kaperski) |
| `?relief=<port>` | Miasto zdobyte, eskadra królewska dociera dzisiaj; `&garrison=N`, `&soldiers=N` |
| `?defend=<port>` | Rozgrywalna bitwa obronna od razu; `&ally=1`, `&garrison=N`, `&soldiers=N` |
| `?intercept=<port>` | Wyprawa w połowie przeprawy, gracz stoi na niej; `&soldiers=N` |
| `?commission=<port>` | Gubernator z kolonią pod desantem, gracz z listem kaperskim |
| `?home=<port>` | Kapitan żonaty z tamtejszą córką gubernatora, flota do wyklarowania |
| `?blockade=<port>` | Fregata na stanowisku, kordon dzień przed zaciśnięciem |
| `?famine=<port>` | Miasto od dwóch tygodni głoduje, dostawca pod czarną banderą; `&stand=cover` |
| `?event=<typ>&port=<klucz>` | Dowolne z 15 zdarzeń świata na dowolnym mieście; zdarzenie i wszystkie zasiane trafiają do `knownEventIds` |

Łączenie: `http://localhost:3000/?skip&zoom=z10&debug=1`

## Ustawienia w localStorage

Nie są częścią zapisów gry. Przy diagnozowaniu „u mnie działa inaczej" sprawdź je najpierw.

| Klucz | Wartości | Default |
|---|---|---|
| `pc_debug` | `1` / `0` (brak = włączone) | włączone |
| `pc_fog` | `1` / `0` — mgła wojny / zasięg lunety | włączone |
| `pc_zoom_level` | `z1`..`z14` (1.5×–12×) | `z8` |
| `pc_lanes` | `1` / `0` — szlaki handlowe (klawisz **T**) | włączone |
| `pc_marks` | `1` / `0` — znaki zdarzeń na mapie (klawisz **N**) | włączone |
| `pc_lang` | `en` / `pl` | `en` |
| `pc_asset_pack` | `basic` / `buccaneer` / `corsair` | `basic` |
| `pc_vol_wind`, `pc_vol_seagulls`, `pc_vol_music` | 0–10 | 5 |
| `pc_user_id` | UUID — izoluje zapisy między użytkownikami | auto |
