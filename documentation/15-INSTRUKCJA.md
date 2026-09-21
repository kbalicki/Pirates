# Pirates' Chronicles — instrukcja

**SZKIC.** Pisany z [14-MECHANICS.md](14-MECHANICS.md), czyli z liczb, które
są pilnowane testem. Wersja angielska pójdzie po tej samej strukturze.

---

## Zanim wypłyniesz

Jesteś kapitanem. Masz slup, garść ludzi i pięćset złotych. Reszty nie ma —
nie ma zadania głównego, nie ma listy rzeczy do odhaczenia. Karaiby żyją bez
Ciebie: korony toczą wojny, kupcy wożą towar, miasta głodują i się bogacą,
korsarze biorą pryzy. Ty decydujesz, czym w tym jesteś.

Kariera kończy się wtedy, kiedy zejdziesz na ląd na dobre. Wynik liczy się
najwyżej **koło pięćdziesiątki** — potem ręka już nie ta.

### Pięć umiejętności

Przy tworzeniu postaci rozdzielasz **dziesięć punktów premiowych**; każda
umiejętność startuje z **piątki**, skala to 1–10.

| umiejętność | co naprawdę robi |
|---|---|
| **Szermierka** | przewaga w pojedynku — abordaże i pojedynki honorowe |
| **Kanonierka** | celność dział w bitwie morskiej i pod murami fortu |
| **Nawigacja** | prędkość **ostro na wiatr**. Z wiatrem nie daje **nic** |
| **Medycyna** | ilu rannych wróci do służby zamiast umrzeć |
| **Urok** | zaloty, rozmowy z gubernatorami |

> **Nawigacja jest podstępna.** Nie przyspiesza statku ogólnie — dokłada tylko
> tam, gdzie wiatr przeszkadza. Kapitan z nawigacją 10 na baksztagu płynie
> dokładnie tak samo jak kapitan z nawigacją 1.

### Wybór ery

Sześć epok, od 1560 do 1680. Era decyduje o roku startu i o tym, które wojny
już trwają. **1680 (Zmierzch piratów)** otwiera się w pokoju — jeśli chcesz
wojny od pierwszego dnia, wybierz wcześniejszą.

---

## Morze

### Wiatr jest wszystkim

To jedyna mechanika, którą **musisz** zrozumieć, żeby grać.

Twój statek ma **kąt martwy** — wycinek prosto pod wiatr, w którym stoi. Dla
zwinnego slupa to 35°, dla galeona **60°**. Dziobem w wiatr masz resztkę
sterowności i nic więcej.

```
          WIATR
            ↓
        \   |   /
         \ MARTWA /        ← tu stoisz
          \STREFA/
     ——————— × ———————     ← 90°: PÓŁWIATR, najszybciej (150%)
          /     \
         /       \
        /  z wiatrem \     ← 90–110%, szybko, ale nie najszybciej
```

**Najszybciej płyniesz w poprzek wiatru, nie z wiatrem.** To zaskakuje, i o to
chodzi — tak było naprawdę.

Pod wiatr **halsuje się**: płyniesz zygzakiem tuż obok kąta martwego. Wygląda
na okrężną drogę i jest szybsze od pchania się dziobem w wiatr **kilkukrotnie**
— siedmiokrotnie dla pinasy, prawie trzykrotnie dla galeona. Kompas rysuje klin
martwej strefy i **dwa znaczniki najlepszego halsu**: celuj w nie.

Na HUD masz **prędkość nad dnem** — czyli to, co naprawdę robisz, już po
uwzględnieniu prądu.

### Żagle

`W` i `S` przechodzą przez cztery poziomy: **Zwinięte → Refowane → Połowa →
Pełne**. Zmiana trwa dwie sekundy przy pełnej obsadzie i **dłużej, gdy brakuje
rąk** — przy szczątkowej załodze prawie dwa i pół raza dłużej.

Mniej płótna to wolniej, ale **zwrotniej**. W ciasnym miejscu refuj.

### Prądy

Sześć stałych pasm. Prąd **znosi** statek — nigdy nie rusza sterem. To znaczy,
że droga tam i droga z powrotem **nie są tym samym rejsem**: z Gran Granady do
Hawany płynie się sześć dni, z powrotem **szesnaście**. `C` pokazuje prądy na
mapie. Planuj po nich, nie po linijce.

### Głębokość

Twój statek ma **zanurzenie**. Pinasa i slup wejdą wszędzie; fluyt, fregata
i trzy galeony **nie**. Turkusowa półka przy brzegu to płycizna — tam zwalniasz.
Za nią jest mielizna, a mielizna **ściera kadłub**.

Kotwicowiska wszystkich 45 portów są pogłębione, więc do miasta wejdziesz
zawsze. Skróty wzdłuż brzegu to co innego.

> **Statek na mapie nigdy nie ma zera kadłuba.** Jeden punkt zostaje zawsze,
> żebyś miał czym dokuśtykać do stoczni. Zatonąć można w bitwie, nie z nudów.

### Pogoda

- **Szkwał** rwie płótno, jeśli niesiesz więcej niż połowę. Zrefuj.
- **Huragan** to zdarzenie świata, które naprawdę wędruje: jedno oko idące drogą
  przez ostrzeżone miasta. Widać je na czarcie razem z trasą. Drze żagle
  **i kadłub**, a widoczność spada do jednej trzeciej.
- **Mgła** nie robi krzywdy. Tnie Twój wzrok — i wzrok wszystkich innych.
  Czasem to Twój przyjaciel.

### Co widzisz i co widać

Zasięg lunety zależy od **najwyższego masztu we flocie**: pinasa widzi mało,
galeon dwa razy tyle. Mgła i sztorm to skracają.

Z daleka rozpoznasz obcy statek po trzech znakach:

| znak | co mówi |
|---|---|
| **bandera** | czyja to jednostka |
| **czerwony proporzec** | że się bije |
| **złoty proporczyk** | jak głęboko siedzi — czyli ile wiezie |

Proporczyk ładunku widać dopiero z **połowy** zasięgu lunety. Żeby wiedzieć,
czy warto gonić, trzeba podejść bliżej.

---

## Port

Sześć lad, a w zdobytym mieście siódma.

| lada | po co tam iść |
|---|---|
| **Gubernator** | list kaperski, zlecenie obrony, spichlerz, jego córka, ułaskawienie, emerytura |
| **Tawerna** | werbunek, plotki, kolejka dla załogi, mapa skarbu, podział łupu, informator |
| **Kupiec** | kupno i sprzedaż |
| **Kantor frachtowy** | przewóz cudzego towaru za zapłatą |
| **Stocznia** | kadłuby, naprawa, klarowanie |
| **Magazyn** | wynajem na trzydzieści dni |
| **Garnizon** | tylko gdy miasto jest Twoje: siła obrony i co nadciąga |

Nagłówek portu mówi dwie rzeczy od razu: **Twoje notowania tutaj** i czy
miastu **czegoś brakuje**.

### Notowania decydują o wszystkim

Reputacja jest **osobna dla każdej korony** i jedna liczba rządzi pięcioma
ladami naraz:

| notowania | narzut kupca | werbunek | fracht | magazyn | kadłuby | usługi |
|---|---|---|---|---|---|---|
| **Wrogie** | 60% | **nikt się nie zaciągnie** | nie | nie | **nie sprzedadzą** | ×2 |
| **Nieprzyjazne** | 40% | słaby | nie | nie | tak | ×1,3 |
| **Neutralne** | 24% | normalny | tak | tak | tak | ×1 |
| **Przyjazne** | 16% | dobry | tak | tak | tak | ×0,9 |
| **Sojusznicze** | **10%** | najlepszy | tak | tak | tak | ×0,8 |

*Narzut to różnica między ceną kupna a sprzedaży — płacisz go przy każdej
beczce, którą przełożysz przez ladę dwa razy.*

> **Ostrzeżenie.** Poniżej neutralnego droga w górę jest wąska. List kaperski
> wymaga przyjaznych notowań, zlecenie obrony wymaga listu, córka wymaga
> przyjaznych, a kantor **nie ma dla Ciebie pracy w ogóle**. Zostaje jedno
> wejście: **przywieźć jedzenie głodującemu miastu** i sprzedać je do
> spichlerza. To warte osiem punktów za kurs.

### Gdy nowy gubernator obejmie rezydencję

Nowy gubernator **nie zna Twojego nazwiska**. Za odpowiednią sumę odłoży Twoją
kartotekę — u swojej korony, **przy swojej ladzie**, i nigdzie indziej. Reszta
tej korony dalej chce Cię powiesić.

Podnosi do neutralnych i **ani stopnia wyżej**. Obejmuje to, co zrobiłeś
przedtem, i nic, co zrobisz potem. Cena to droga powrotna do neutralnego,
dwadzieścia pięć złotych za punkt, podwojona jeśli jesteś sławny — on nie
wycenia Twojej kartoteki, tylko **własne ryzyko**.

Nominacje zdarzają się **około ośmiu razy w roku** i zdarzenie żyje trzydzieści
dni, więc da się do niego dopłynąć. Szukaj na czarcie (klawisz `N`) i słuchaj
w tawernach.

---

## Handel

### Skąd się biorą ceny

```
cena = cena bazowa × (popyt ÷ podaż) × to, co się w mieście dzieje
```

Pusty magazyn podbija cenę **do trzykrotności**, pełny zbija **do 40%**.
Kupuj tam, gdzie coś rośnie; sprzedawaj tam, gdzie tego nie ma.

Siedem towarów. Cukier, tytoń, kakao i rum to handel; jedzenie i woda to
zaopatrzenie; **złoto** jest osobne — żadne miasto go nie sprzedaje, pojawia
się dopiero po odkryciu złoża.

### Ceny zmieniają się, kiedy patrzysz

Notowanie przelicza się **przy każdym ruchu towaru**, nie raz na dobę. Jeśli
wykupisz cały magazyn, ostatnia tona będzie droższa od pierwszej. Magazynowanie
pod górkę cenową działa gorzej, niż się wydaje.

### Magazyn wraca, ale nie od razu

Kupujesz tylko to, co leży w szopie — lada nie sprzeda Ci więcej niż ma.
Ile tam leży, zależy od wielkości miasta: port trzyma **dwadzieścia dni
własnego jedzenia** tego, czego nie uprawia. Stolica ma więc około
**dziewięćdziesięciu ton** żywności i tyleż wody, a mała placówka
**dwanaście**. Osiemdziesięciu ludzi na fregacie wypija dwanaście ton wody na
dobę — z Hawany wyjdziesz zaopatrzony na tydzień, z placówki na dzień.

Miasto wykupione do zera odbudowuje zapas: **cztery piąte w miesiąc**, prawie
do pełna w dwa. Tego, co samo uprawia, przez większy wyrąb, a reszty przez
zamówienie u swojego dostawcy.

> Dwie zmiany, obie świeże. Przed **v0.66.0** szopa importowa **nigdy** się nie
> odbudowywała — każda tona, którą kapitan wyniósł, znikała z miasta do końca
> gry. Przed **v0.67.0** każde miasto mieściło płaskie trzydzieści ton, przez co
> **każde duże płaciło za wszystko tę samą maksymalną cenę** i nie było żadnego
> powodu, żeby wolić jedną ladę od drugiej.

**Wody nie produkuje żaden port.** Jest w popycie czterdziestu czterech miast
i w produkcji żadnego — dopływa bez szlaku, przemytem. Praktycznie: woda jest
wszędzie i **nie da się jej nikomu odciąć**.

### Głód

Miasto, któremu zabrakło importu, **mówi o tym** w nagłówku portu i na ladzie
kupca. Wtedy:

- **jedzenie i woda podwajają cenę** — i tylko one,
- w tawernie jest **pełniej**, bo ludzie tanieją,
- ludność powoli ubywa,
- gubernator **kupi zboże wprost z ładowni**, płacąc ceną korony **i reputacją**.

> To jest zmiana od v0.64.0 i warto ją znać: kiedyś głód podbijał cenę
> **wszystkiego**, więc opłacało się przywieźć cokolwiek. Teraz opłaca się
> przywieźć **to, czego im brakuje**.

### Szlaki

Osiemdziesiąt jeden stałych szlaków między miastami; `T` rysuje je na mapie.
Każdy ma nazwanego dostawcę i liczy się **czasem przeprawy**, nie odległością —
dostawca dwieście mil dalej, ale z prądem, jest bliżej.

Przecięcie cudzego szlaku to **płatna robota** u informatora w tawernie. Kosztuje
notowania u okradzionej korony.

### Blokada

Stań pod miastem i **zostań tam**. Po dwóch dniach dostawy zaczynają się
dławić, garnizon topnieje, a korona wścieka. Miasto z drugim dostawcą przeboleje
to bez trudu — sprawdź na mapie szlaków, zanim zakotwiczysz.

Kordon **wstrzymuje też odbudowę magazynu**, nie tylko dzienną dostawę: miasto
pod blokadą wydaje swój zapas, zamiast go uzupełniać. I jedna rzecz, której
blokada nie zrobi nigdy — **nie wysuszy miasta**. Wody nikt nie wozi, więc nie
ma czego przeciąć.

---

## Co się dzieje w świecie

Trzynaście rodzajów zdarzeń. W każdej chwili żyje ich w świecie **około
szesnastu**. Dowiesz się o nich z tablicy w porcie, z tawerny albo od mijanego
statku.

| zdarzenie | co znaczy dla Ciebie |
|---|---|
| **Głód** | przywieź jedzenie i wodę — podwójna cena, reputacja u gubernatora |
| **Zaraza** | drogie jedzenie, **pusta tawerna** — nie werbuj tutaj |
| **Żniwa** | cukier i jedzenie tanieją o jedną trzecią — kupuj |
| **Hossa** | wszystko tanieje o jedną piątą, miasto bogaci się szybko |
| **Bunt niewolników** | produkcja pada do jednej trzeciej — będzie drogo |
| **Najazd piratów** | osłabiona obrona, tańsze podejście pod mury |
| **Najazd Indian** | **minus czterdzieści punktów obrony** — najlepsza okazja na miasto |
| **Huragan** | **port zamknięty**, nie wpłyniesz; na morzu drze żagle i kadłub |
| **Odkrycie złota** | jedyne miejsce, gdzie kupisz **złoto** |
| **Dekret królewski** | ceny w górę o jedną piątą w **całej** koronie |
| **Nowy gubernator** | ułaskawienie do kupienia (patrz wyżej) |
| **Flota skarbowa** | cztery hiszpańskie kadłuby ze srebrem, trasą Vera Cruz → Hawana |
| **Wojna** | więcej okrętów zamiast kupców, korsarze, cięcie dostaw, ceny w górę |

Klawisz `N` rysuje na czarcie to, o czym już wiesz: pinezki zdarzeń, kursy
wypraw koronnych, drogę huraganu.

---

## Statki, które spotkasz

Na mapie w każdej chwili jest do trzydziestu obcych kadłubów. W kolonii
w czasie pokoju to mniej więcej **połowa kupców, trzecia część marynarki
i jeden łowca piratów na dziesięciu**. Wojna przesuwa to mocno w stronę
okrętów — z 45% do 70% — i sprawia, że częściej wychodzą z portów walczącej
korony. **Trzydzieści żagli jest tak czy owak**: wojna zmienia, czyje są, nie
ile ich jest. Przystanie pirackie wypuszczają **korsarzy**.

### Oni żyją bez Ciebie

Korsarz bierze kupca, okręt bierze korsarza — **statek ginie w takiej walce
mniej więcej raz na trzy dni**, czy patrzysz, czy nie. Jeśli jesteś dość
blisko, zobaczysz to.

### Uciekają przed nazwiskiem

Kupiec ucieka przed czarną banderą, przed koroną, która Cię nienawidzi, i przed
**sławą powyżej pięćdziesięciu**. Przed uczciwym kapitanem **nie ucieka nikt**.

To jest realny koszt kariery pirackiej: im głośniejsze nazwisko, tym trudniej
kogokolwiek dogonić.

### Nazwane statki

Sześć kadłubów z nazwiskiem chodzi stałymi obiegami. Walkę, którą przeżyła,
**taka pamięta**: zostaje dłużej w porcie, bierze eskortę, a po drugim strachu
zmienia szlak. Informator w tawernie sprzeda Ci jej rozkład.

---

## Bitwa morska

### Sterowanie

| klawisz | co robi |
|---|---|
| `W` / `S` | żagle: Zwinięte → Bojowe → Pełne |
| `A` / `D` | skręt |
| `Q` | ognia z **lewej** burty |
| `E` | ognia z **prawej** burty |
| `1` / `2` / `3` | kula / łańcuch / kartacz |
| `B` | abordaż |
| `Esc` | zerwij kontakt — **tylko poza zasięgiem dział** |
| `H` | podręcznik bitwy |

### Łuki ognia

Działa strzelają **na boki**, w wycinku ±60° od burty. Prosto przed dziobem
i za rufą **nie masz czym strzelać**. Cała bitwa morska polega na tym, żeby
ustawić burtę i nie dać ustawić jej przeciwnikowi.

Zasięg to **pół szerokości areny**. Dalej kule wpadają do wody.

**Te same łuki obowiązują przeciwnika.** Kiedy zbliża się dziobem, nie ma czym
strzelać — i odwrotnie: kiedy leży burtą na swoim stanowisku, strzela z tej,
która akurat ma kąt. Sternik przeciwnika **trzyma odległość**, której chce: pirat
i marynarka schodzą się blisko, kupiec trzyma dystans, a jeśli ma dwa razy mniej
ludzi niż Ty — ucieka poza strzał i strzela łańcuchem w żagle.

### Amunicja

| rodzaj | do czego |
|---|---|
| **Kula** | kadłub — chcesz go zatopić albo zmiękczyć |
| **Łańcuch** | żagle — **około ośmiu razy skuteczniejszy od kuli**; chcesz, żeby nie uciekła |
| **Kartacz** | ludzie — trzykrotnie skuteczniejszy od kuli, ale **połowa zasięgu**; chcesz wejść na pokład |

> **Zmiana amunicji zeruje oba paski przeładowania.** To, co już było w lufach,
> przepada. Decyduj się przed zbliżeniem, nie w trakcie.

### Przeładowanie

Podstawa to **dziewięć sekund** na burtę. Spowalniają je trzy rzeczy: **mało
ludzi**, **niskie morale** i **zielona załoga**. Najgorszy możliwy zestaw to
około **dwudziestu jeden sekund** — ponad dwa razy wolniej.

Wyszkolenie rośnie samo: trochę za każdą dobę na morzu, więcej za wygraną
walkę. **Werbunek świeżych ludzi je rozwadnia** — nowi przychodzą z zerowym
doświadczeniem.

Morale spada, gdy giną ludzie i gdy dostajesz kartaczem. Podnosi je kolejka
w tawernie za dziesięć złotych.

### Uszkodzenia

Kadłub i takielunek mają po cztery stany. Warto znać dwa progi:

- **Poniżej trzech czwartych kadłuba** ster zaczyna się ociągać.
- **Bez masztów** nie płyniesz w bitwie w ogóle, a na mapie pełzniesz.

Pełne żagle kosztują **jedną czwartą zwrotności** — w zwarciu często warto je
zrefować.

### Jak to się kończy

| zakończenie | co dostajesz |
|---|---|
| **Zatopiłeś** | pięćdziesiąt złotych |
| **Poddała się** | trzydzieści złotych, koniec strzelania |
| **Abordaż udany** | **statek do floty**, sto złotych oraz jej własna kiesa i ładunek |
| **Zerwałeś kontakt** | nic — i tak jest czasem najlepiej |
| **Przegrałeś** | patrz niżej |

Przeciwnik **opuszcza banderę sam**, gdy spadnie poniżej dziesięciu procent
kadłuba albo żagli, albo zostanie mu mniej niż dziesięciu ludzi.

Abordaż wymaga **odległości poniżej trzydziestu** i osłabionego przeciwnika:
kadłub poniżej 35% **albo** załoga poniżej połowy. Rozstrzyga liczba ludzi
razy morale razy Twoja szermierka.

> **`Esc` zrywa kontakt od razu**, jeśli jesteś dalej niż dziewięć dziesiątych
> zasięgu dział. Bliżej — odmawia i mówi dlaczego: spod burty się nie odchodzi.
>
> **Jeśli po prostu oddalisz się poza zasięg dział na minutę**, zacznie lecieć
> odliczanie i druga minuta kończy bitwę tak samo. Zbliżenie zeruje oba zegary.
> To ten sam próg, co przy `Esc` — jedna liczba, nie dwie.
>
> Do v0.85.0 `Esc` **nie robił nic**, choć ta tabela i wiersz na dole ekranu
> obiecywały inaczej. Zegar był jedynym wyjściem z bitwy bez rozstrzygnięcia.

---

## Bitwy lądowe

### Bierzesz miasto

Najpierw **ostrzał** — zbijasz mury i działa fortu, one zbijają Twój kadłub
i załogę. Kiedy mury spadną poniżej dwóch piątych, idzie **desant**: na brzeg
schodzi 85% załogi, pięciu zostaje na pokładzie. Najwyżej **sześć fal**.

Obrońca się rozsypie, jeśli straci ponad dwie trzecie ludzi — Ty, jeśli
stracisz prawie połowę.

Wybieraj miasta **po najeździe Indian** albo **po najeździe piratów**: obrona
jest wtedy realnie niższa.

### Bronisz miasta

Zdobyte miasto **nie zostaje Twoje samo z siebie**. Korona wraca po swoje:
wysyła eskadrę, którą zobaczysz na czarcie z wyprzedzeniem. Twoja flota strzela
razem z fortem, a eskorta przeciwnika zasłania szalupy.

Garnizon **topnieje sam**, jeśli go nie uzupełniasz. Miasto pod czarną banderą
ma też **sufit obrony** — nie zbudujesz z niego twierdzy.

### Bronisz cudzego miasta za pieniądze

Gubernator, u którego masz dobre notowania **i list kaperski**, zapłaci za
obronę swojej kolonii. Trzysta złotych plus pięć za każdego napastnika. Trzeba
**dopłynąć na czas** (najwyżej trzy dni spóźnienia) i **zostać** — do
dwudziestu pięciu dni.

To działa też **u sojusznika Twojego patrona**, i to jest najłatwiejsza praca
dla kapitana z papierami.

---

## Ludzie

### Obsada

Każda klasa statku ma **minimalną obsadę**. Poniżej niej tracisz najpierw
**zwrotność**, dopiero potem prędkość:

| obsada | prędkość | zwrotność | zmiana żagli |
|---|---|---|---|
| pełna | 100% | 100% | ×1 |
| niedobór | 92% | **75%** | ×1,6 |
| szczątkowa | 78% | **50%** | ×2,4 |
| nie do obsługi | 65% | **30%** | ×3,5 |

> **Pryz obsadza się z własnego pokładu.** Slup obsadzi brygantynę. Slup **nie
> obsadzi galeona** — taki pryz będzie pełzł i ciągnął za sobą całą eskadrę.
> Zanim weźmiesz duży kadłub, policz ludzi.

### Ranni

Cztery na dziesięciu poległych trafia **pod pokład, nie do morza**. Medyk
obchodzi ich codziennie. Przy medycynie 5 wraca do służby **dwie trzecie**.

### Łup

Załoga upomina się o udział **co sześćdziesiąt dni**. Zwłoka zjada morale.
Podział robi się w tawernie i **kosztuje ludzi** — opłaceni marynarze schodzą
na ląd. Bierzesz od jednej trzeciej do trzech piątych.

---

## Flota

Do **trzech kadłubów**: flagowiec i dwie konsorty.

- **Prędkość floty = najwolniejszy statek.**
- **Wzrok floty = najwyższy maszt.**

Konsorty mają własną załogę, morale i wyszkolenie. Ludzie zabici na konsorcie
**zostają zabici**.

Kadłub do floty kupuje się w stoczni klawiszem **`F`** — `Enter` kupuje go na
flagowca, czyli **przesiadasz się**, a stary statek zostaje w porcie.

Konsortę sprzedajesz w tej samej stoczni: zjedź kursorem pod listę, na swoje
kadłuby, i naciśnij `Enter`. Porzucasz ją na morzu w kajucie (`Spacja`), klawiszem
`X`. **Jeśli coś z nią odejdzie, ekran zapyta i powie ile** — a wiersz przez cały
czas pokazuje, ile ma w ładowni. Chcesz jej ładunek zatrzymać? Sprzedaj go najpierw
u kupca albo złóż w magazynie: lada wybiera **od flagowca**, więc opróżnia się ją
na końcu.

### Eskadra ma jedną ładownię

Każdy kadłub w Twojej flocie **wozi towar**, a liczby, które widzisz w porcie
i w kajucie, mówią o całej eskadrze. Statek handlowy kupiony w stoczni dokłada
dwieście pięćdziesiąt ton — i to jest powód, żeby go kupić.

Ładuje się i rozładowuje **od flagowca**, więc dopóki pływasz sam, nic się dla
Ciebie nie zmienia.

**Pryz jest Twój z ładownią.** Kiedy bierzesz statek na abordaż i wchodzi do
floty, to, co nie zmieści się do Twoich kadłubów, **zostaje w jej własnym** —
nie idzie do wody.

**Ale co wiezie konsorta, idzie tam, gdzie ona.** Sprzedana w stoczni sprzedaje
się razem z ładunkiem; porzucona na morzu idzie z nim na dno. Do pozostałych
kadłubów przechodzi tyle, ile się w nich zmieści, a dziennik zapisze tony, które
przepadły. Rozładuj ją, zanim ją sprzedasz.

Czasem i tak lepiej **sprzedać** świeży pryz niż go trzymać.

---

## Papiery

### List kaperski

Gubernator z przyjaznymi notowaniami da Ci list. Odtąd pryz wzięty koronie,
z którą Twój patron **jest w wojnie**, jest **pokryty**: płaci notowaniami
u patrona zamiast kosztować. Pryz niepokryty **kosztuje u patrona**.

Komisja jest **wyłączna** — jeden list naraz, sprawdzany przy ladzie.

### Sojusznik patrona

Jeśli inna korona bije się w **tej samej wojnie**, jej porty obsłużą Cię
**stopień wyżej** i powiedzą dlaczego. Ale tylko od neutralnych w górę: sojusz
ministrów nie jest amnestią, a miasto, którego żeglugę paliłeś, pamięta
to samo.

### Sława

Sława to osobna liczba od reputacji. Rośnie od rzeczy, które robisz głośno.
**Powyżej pięćdziesięciu wszyscy kupcy przed Tobą uciekają**, a ułaskawienie
kosztuje dwa razy tyle. Przystanie pirackie za to chętniej z Tobą handlują.

---

## Wątki

### Rodzina

Markiz trzyma Twoich krewnych w trzech miastach. Informator w tawernie
sprzedaje trop za dwieście złotych; za każdego krewnego jest **pojedynek**.

### Córka gubernatora

Jedna na miasto. Trzeba mieć **przyzwoite notowania**, żeby w ogóle Cię
przyjęto, i cztery podejścia, żeby doszło do oświadczyn. Podarunek kosztuje
pięćset.

Ślub jest **raz na karierę** i daje **port macierzysty**: posag, darmowe
klarowanie całej floty i magazyn na trzysta ton. **Wygasa**, gdy miasto
przejdzie pod inną koronę — a to się zdarza.

### Skarby

Mapę kupisz w tawernie w trzech jakościach: im droższa, tym mniejszy krąg do
przekopania. Kopiesz klawiszem `X` na lądzie. **Co czwarte wykopalisko to
zasadzka** i kończy się pojedynkiem.

### Wioski Indian

Osiem osad na czarcie, **żadna pod banderą**. Sześć ton rumu kupuje zaufanie —
i **złoto**, którego nie sprzedaje żaden port.

Przy zaufaniu sześćdziesiąt kupisz coś więcej: **wyprawę wojenną na sąsiednią
kolonię**. Zabiera jej czterdzieści punktów obrony, piętnaście procent ludzi
i sto pięćdziesiąt bogactwa.

**Nikt się nigdy nie dowiaduje, że to byłeś Ty.**

Do wioski wejdą tylko płytkie kadłuby: pinasa, slup, barka, brygantyna.

---

## Kiedy przegrasz

Zatopiony flagowiec **przepada**. Są dwie drogi:

1. **Masz konsortę** — bandera przechodzi na największy kadłub, który jeszcze
   pływa. To jedyny moment, w którym pływanie w zespole naprawdę ratuje.
2. **Jesteś sam** — lądujesz na brzegu. Królewski okręt wiezie Cię do
   najbliższej kolonii swojej korony jako jeńca; każdy inny zostawia łodziom
   znalezienie plaży. **Połowa kiesy idzie na okup**, a z reszty stocznia bierze
   cenę pinasy.

Nic nie bierze się znikąd: ludzie to ocalali z Twojej załogi, pinasa jest
kupiona za Twoje złoto, ładunek to ten, który przeżył zatonięcie.

**Gra się nie kończy.** Zaczynasz od nowa, mniejszym statkiem, z tym samym
nazwiskiem — i z tą samą kartoteką u każdej korony.

---

## Sterowanie

### Na mapie

| klawisz | co robi |
|---|---|
| `W` / `S` | więcej / mniej żagli |
| `A` / `D` | ster |
| `E` | wejdź do portu / wsiądź na statek |
| `L` | zejdź na ląd / wróć na statek |
| `X` | kop (na lądzie) |
| `Spacja` | menu |
| `H` | podręcznik |
| `N` | znaki zdarzeń na czarcie |
| `T` | szlaki handlowe |
| `C` | prądy |
| `G` | siatka |
| `V` | strefa widzenia |
| klik na miasto | informacje o mieście |

### W menu (Spacja)

Siedem zakładek: **Kajuta** (stan statku i załogi) · **Kapitan** (umiejętności,
notowania, stan koron) · **Dziennik** (aktywne zlecenia) · **Kalendarz** (data
i ostatnie zdarzenia) · **Ustawienia** · **Zapis** (pięć slotów) · **Mapa**.

`1`-`7` otwierają zakładkę wprost, `←` / `→` przewracają na sąsiednią, `↑` / `↓`
chodzą po wierszach, `Enter` przełącza, `Esc` albo `Spacja` zamyka. Na wierszach
głośności strzelki lewo/prawo należą do suwaka, nie do zakładki.
**Zakładka Ustawień jest dłuższa niż okno** — nie trzeba nic z tym robić, okno jedzie
za kursorem; kółkiem myszy albo `PgUp`/`PgDn` można przewijać samemu.

Każda zakładka ma teraz swój wiersz klawiszy u dołu panelu (v0.84.0). Do tego
wydania stał tam jeden — i tylko na zakładce Ustawień. **Cyfry też się zmieniły:
do v0.84.0 `3` otwierało Kalendarz, a Dziennika nie otwierała żadna.**

### W podręczniku (H)

Pięć kart: **Sterowanie** · **Statki** · **Żeglowanie** · **Świat** · **Ekonomia**.
Kartę przewracają `←` / `→`, `A` / `D` albo `1`-`5`; `H` lub `Esc` zamyka.

### W podręczniku bitwy (H w czasie bitwy)

To jest pełna specyfikacja modelu walki — wzór na obrażenia, mnożniki amunicji,
pancerz każdej klasy, przykłady liczbowe, zasady reloadu, abordażu i timeoutu.
**Trzy strony**, przewracane `←` / `→` albo `A` / `D`; `H`, `Esc` lub `Spacja`
zamyka. (Do v0.83.0 większość tego tekstu była rysowana pod dolną krawędzią
panelu i nie dawało się jej zobaczyć wcale.)

### W wiosce

`W`/`S` wybiera, `Enter` potwierdza, `Esc` odchodzi. Po każdej transakcji ekran
rysuje się od nowa, ale **kursor zostaje na Twoim wierszu** — a jeśli to, co
właśnie zrobiłeś, ten wiersz zamknęło (barter ma dziesięciodniową karencję),
spada na *Wracaj do szalupy*, nigdy na wyprawę wojenną.

### Na ladzie

`W`/`S` wybiera, `Enter` kupuje, `Backspace` sprzedaje, `Esc` cofa.
W magazynie `Q` znosi na brzeg, `E` na statek.

**Ile naraz:** samo naciśnięcie to **jedna tona**, z `Shift` — **dziesięć**,
z `Ctrl` — **wszystko**, co zniesie ładownia, kiesa i druga strona. Działa tak
samo na ladzie i w magazynie, myszą też.

Rachunek jest zaokrąglany **raz, na pieniądzach**, a nie na każdej tonie — dlatego
dziesięć ton potrafi kosztować mniej niż dziesięć razy cena jednej, i dlatego
notowania w mieście w ogóle da się odczuć przy tanim towarze.

---

## Jedenaście rzeczy, których nikt Ci nie powie

1. **Najszybciej płyniesz w poprzek wiatru**, nie z wiatrem.
2. **Halsowanie się opłaca** — kilkukrotnie, nie o kilka procent.
3. **Droga tam i z powrotem to nie ten sam rejs.** Prądy.
4. **Notowania poniżej neutralnych to pułapka.** Jedyne wyjście prowadzi przez
   dowiezienie jedzenia do głodującego miasta — i to działa nawet wtedy, gdy
   korona cię nienawidzi: gubernator, którego ludzie nie jedli, odkłada kłótnię
   na później. Skala kończy się na stu w obie strony.
5. **Nowy gubernator to okazja** — ułaskawienie jest lokalne i trzeba po nie
   przypłynąć w trzydzieści dni.
6. **W głodującym mieście sprzedawaj jedzenie**, nie tytoń.
7. **Sława ma cenę**: powyżej pięćdziesięciu notowań każdy kupiec zaczyna
   uciekać na Twój widok. Dogonisz go dalej — merchantman robi 5 węzłów,
   fluyt 6, barka 9 — ale brygantyny (11) nie złapiesz niczym wolniejszym
   od fregaty.
8. **Zmiana amunicji zeruje przeładowanie.** Wybierz przed zbliżeniem.
9. **Policz ludzi, zanim weźmiesz galeon.** Niedomanowany pryz zabiera całej
   eskadrze zwrotność.
10. **Bierz miasto po najeździe Indian.** Czterdzieści punktów obrony mniej.
11. **Nie licz na jeden port przy długim rejsie.** Import leży w szopie
    w około dwudziestu pięciu tonach, a osiemdziesięciu ludzi wypija dwanaście
    ton wody na dobę.

---

## Czego w grze nie ma

Żeby nie szukać: **nie ma** kolejki w stoczni ani czasu budowy statku, **nie
ma** monopolu koronnego ani przemytu jako mechaniki, **nie ma** dźwięku walki,
**nie ma** deszczu ani piorunów, **nie ma** misji jezuickich. Wszystkie
dziewięć klas statków dzieli na razie **jeden sprite**.

---

## Do dokończenia w tym szkicu

- **Wersja angielska** — ta sama struktura, gra ma pełne tłumaczenie.
- **Zrzuty ekranu** — instrukcja bez obrazków jest o połowę mniej warta.
- **Tabela 45 portów** dla gracza: co produkują, czego chcą. Dane są
  w [14-MECHANICS.md](14-MECHANICS.md) §7a.
- **Przykładowy pierwszy rejs** — prowadzenie za rękę przez pierwsze pół
  godziny: z Port Royale po rum, do Hawany, pierwszy spotkany kupiec.
