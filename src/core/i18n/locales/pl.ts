import type { LocaleData } from "../types.ts";

export const PL: LocaleData = {
  // -- Items --
  "item.sugar_cane.name": "Cukier trzcinowy",
  "item.tobacco.name": "Tytoń",
  "item.cocoa.name": "Kakao",
  "item.rum.name": "Rum",
  "item.food.name": "Jedzenie",
  "item.water.name": "Woda",

  // -- Ports (45 cities) --
  "port.havana.name": "Havana",
  "port.santiago.name": "Santiago",
  "port.santo_domingo.name": "Santo Domingo",
  "port.san_juan.name": "San Juan",
  "port.cartagena.name": "Kartagena",
  "port.porto_bello.name": "Puerto Bello",
  "port.panama.name": "Panama",
  "port.vera_cruz.name": "Vera Cruz",
  "port.campeche.name": "Campeche",
  "port.maracaibo.name": "Maracaibo",
  "port.cumana.name": "Cumaná",
  "port.trinidad.name": "Trinidad",
  "port.gran_granada.name": "Gran Granada",
  "port.caracas.name": "Caracas",
  "port.gibraltar.name": "Gibraltar",
  "port.margarita.name": "Margarita",
  "port.nombre_de_dios.name": "Nombre De Dios",
  "port.puerto_cabello.name": "Puerto Cabello",
  "port.puerto_principe.name": "Puerto Príncipe",
  "port.rio_de_la_hacha.name": "Río de la Hacha",
  "port.santa_catalina.name": "Santa Catalina",
  "port.santa_marta.name": "Santa Marta",
  "port.st_augustine.name": "St. Augustine",
  "port.villa_hermosa.name": "Villa Hermosa",
  "port.port_royal.name": "Port Royale",
  "port.nassau.name": "Nassau",
  "port.barbados.name": "Barbados",
  "port.antigua.name": "Antigua",
  "port.st_kitts.name": "St. Kitts",
  "port.belize.name": "Belize",
  "port.bermuda.name": "Bermuda",
  "port.eleuthera.name": "Eleuthera",
  "port.gran_bahama.name": "Gran Bahama",
  "port.nevis.name": "Nevis",
  "port.tortuga.name": "Tortuga",
  "port.martinique.name": "Martinique",
  "port.guadeloupe.name": "Gwadelupa",
  "port.petit_goave.name": "Petit Goâve",
  "port.port_de_paix.name": "Port de Paix",
  "port.florida_keys.name": "Florida Keys",
  "port.leogane.name": "Léogane",
  "port.montserrat.name": "Montserrat",
  "port.curacao.name": "Curaçao",
  "port.st_eustatius.name": "St. Eustatius",
  "port.st_martin.name": "St. Martin",

  // -- Factions --
  "faction.spain.name": "Hiszpania",
  "faction.england.name": "Anglia",
  "faction.france.name": "Francja",
  "faction.netherlands.name": "Holandia",
  "faction.pirates.name": "Piraci",

  // -- Ship Classes --
  "ship.sloop.name": "Slup",
  "ship.brigantine.name": "Brygantyna",
  "ship.frigate.name": "Fregata",
  "ship.galleon.name": "Galeon",
  "ship.merchantman.name": "Statek handlowy",

  // -- Port types --
  "port_type.city": "MIASTO",
  "port_type.fort": "FORT",
  "port_type.outpost": "PRZYSTAŃ",

  // -- HUD --
  "hud.gold": "Złoto",
  "hud.wind": "Wiatr: {{pct}}%",
  "hud.hull": "Kadłub: {{current}}/{{max}}",
  "hud.sails": "Żagle: {{current}}/{{max}}",
  "hud.sail_pct": "Żagiel: {{pct}}%",
  "hud.speed": "Prd: {{value}}",
  "hud.pos": "Poz: {{x}},{{y}}",
  "hud.controls": "W/S/Strzałki: Żagle i Ster  E: Port  SPACE: Menu",
  "hud.controls_land": "W/S/Strzałki: Marsz  E: Na statek  SPACE: Menu",
  "hud.disembark_prompt": "Naciśnij L aby zejść na ląd",
  "hud.embark_prompt": "Podejdź do statku, aby wsiadać",
  "hud.embark_ship_prompt": "Naciśnij E aby wsiąść na statek",
  "hud.mode_land": "NA LĄDZIE",
  "hud.crew": "Załoga: {{current}}/{{max}}",
  "hud.morale": "Morale: {{pct}}%",
  "hud.cargo": "Ładunek: {{current}}/{{max}}",

  // -- Time --
  "time.format": "Dzień {{day}}, {{hh}}:{{mm}}",
  "time.month_names": "Styczeń,Luty,Marzec,Kwiecień,Maj,Czerwiec,Lipiec,Sierpień,Wrzesień,Październik,Listopad,Grudzień",

  // -- Port Scene --
  "port.trade_goods": "TOWARY HANDLOWE",
  "port.price": "{{price}} Złoto",
  "port.stock": "Zapas: {{qty}}",
  "port.own": "Własne: {{qty}}",
  "port.buy": "[Kup]",
  "port.sell": "[Sprzedaj]",
  "port.repair": "[ NAPRAW STATEK (2 Złoto/PŻ) ]",
  "port.set_sail": "[ WYPŁYŃ ]",
  "port.leave_on_foot": "[ ODEJDŹ ]",

  // -- Port Approach --
  "approach.enter": "WEJDŹ DO PORTU",
  "approach.enter_desc": "Zacumuj i odwiedź port.",
  "approach.sneak": "WKRADNIJ SIĘ",
  "approach.sneak_desc_fort": "Spróbuj wejść niezauważenie. Ryzyko wykrycia.",
  "approach.sneak_desc_city": "Zmień banderę i wślizgnij się do portu.",
  "approach.attack": "ATAK",
  "approach.attack_desc": "Otwórz ogień na fort. Bitwa na pełną skalę!",
  "approach.leave": "ODPŁYŃ",
  "approach.leave_on_foot": "ODEJDŹ",
  "approach.leave_desc": "Kontynuuj żeglugę.",
  "approach.reputation": "Reputacja: {{level}} ({{value}})",
  "approach.prompt": "Naciśnij E aby otworzyć menu — {{name}}",
  "approach.population": "Populacja: {{size}}",
  "approach.wealth": "Zamożność: {{level}}",
  "approach.exports": "Eksport: {{items}}",

  // -- City sizes --
  "city.pop_small": "Mała",
  "city.pop_medium": "Średnia",
  "city.pop_large": "Duża",
  "city.pop_capital": "Stolica",

  // -- City wealth levels --
  "city.wealth_poor": "Biedne",
  "city.wealth_modest": "Skromne",
  "city.wealth_prosperous": "Zamożne",
  "city.wealth_wealthy": "Bogate",

  // -- Sail levels --
  "sail.furled": "Żagle zwinięte",
  "sail.reefed": "Żagle zrefowane",
  "sail.half": "Połowa żagli",
  "sail.full": "Pełne żagle",
  "sail.in_irons": "⚠ Pod wiatr!",
  "sail.transitioning": "Zmiana żagli...",

  // -- City info panel --
  "cityinfo.type": "Typ",
  "cityinfo.fort": "Fort obronny",
  "cityinfo.shipyard": "Stocznia",
  "cityinfo.shipyard_1": "Slupy",
  "cityinfo.shipyard_2": "Brygantyny",
  "cityinfo.shipyard_3": "Fregaty",
  "cityinfo.shipyard_4": "Galeony",
  "cityinfo.exports": "Eksport",
  "cityinfo.imports": "Import",
  "cityinfo.reputation": "Reputacja",
  "cityinfo.last_visit": "Ostatnia wizyta",
  "cityinfo.never_visited": "Nigdy",
  "cityinfo.day": "Dzień",

  // -- Reputation levels --
  "rep.hostile": "WROGI",
  "rep.unfriendly": "NIEPRZYJAZNY",
  "rep.neutral": "NEUTRALNY",
  "rep.friendly": "PRZYJAZNY",
  "rep.allied": "SPRZYMIERZONY",

  // -- Pause --
  "pause.title": "PAUZA",
  "pause.resume": "[ WZNÓW ]",
  "pause.save_load": "[ ZAPIS/ODCZYT ]",

  // -- Options Menu --
  "menu.title": "Dziennik Kapitana",
  "menu.tab_cabin": "Kajuta",
  "menu.tab_calendar": "Kalendarz",
  "menu.tab_options": "Opcje",
  "menu.tab_save": "Zapis",
  "menu.tab_map": "Mapa",
  "menu.close": "[ ZAMKNIJ ]",
  "menu.close_hint": "ESC / SPACE aby zamknąć",

  // -- Captain's Cabin --
  "cabin.crew_title": "Załoga",
  "cabin.cargo_title": "Manifest ładunku",
  "cabin.ships_title": "Twoja flota",
  "cabin.no_cargo": "Ładownia jest pusta.",
  "cabin.cannons": "Działa: {{count}}",

  // -- Calendar --
  "calendar.recent_events": "Ostatnie zdarzenia",
  "calendar.no_events": "Brak zdarzeń.",

  // -- Save/Load --
  "save.title": "ZAPIS / ODCZYT",
  "save.slot_empty": "Pusty slot",
  "save.slot_label": "Slot {{n}}: Dzień {{day}}",
  "save.btn_save": "[Zapisz]",
  "save.btn_load": "[Wczytaj]",
  "save.btn_delete": "[Usuń]",
  "save.back": "[ WRÓĆ ]",
  "save.saved_ok": "Gra zapisana!",
  "save.loaded_ok": "Gra wczytana!",

  // -- Map --
  "map.you_are_here": "Jesteś tutaj",

  // -- Battle --
  "battle.your_ship": "TWÓJ STATEK",
  "battle.enemy": "WRÓG",
  "battle.victory": "ZWYCIĘSTWO! Wrogi statek zatopiony!",
  "battle.defeat": "PORAŻKA! Twój statek został zniszczony...",
  "battle.disengaged": "Udało ci się wycofać z bitwy.",
  "battle.continue": "Kliknij aby kontynuować",
  "battle.controls": "WSAD: Żagle/Ster  |  Q: Ogień lewo  |  E: Ogień prawo  |  ESC: Wycofaj",

  // -- Event Log --
  "event.departed": "Wypłynięto z {{port}}",
  "event.arrived": "Przybito do {{port}}",
  "event.trade_buy": "Kupiono {{qty}} {{item}} za {{gold}} Złoto",
  "event.trade_sell": "Sprzedano {{qty}} {{item}} za {{gold}} Złoto",
  "event.repaired": "Naprawiono statek za {{gold}} Złoto",
  "event.food_low": "Zapasy jedzenia się kończą!",
  "event.water_low": "Zapasy wody się kończą!",
  "event.food_out": "Jedzenie się skończyło! Załoga głoduje!",
  "event.water_out": "Woda się skończyła! Załoga umiera z pragnienia!",
  "event.crew_died": "{{count}} członków załogi zginęło.",
  "event.morale_drop": "Morale załogi spada.",
  "event.storm_start": "Rozpoczął się sztorm!",
  "event.storm_end": "Sztorm minął.",
  "event.day_passed": "Rozpoczął się dzień {{day}}.",
  "event.disembarked": "Załoga zeszła na ląd.",
  "event.embarked": "Załoga wróciła na statek.",

  // -- Character Creation --
  "creation.title": "PIRATES CHRONICLES",
  "creation.name_label": "Podaj swoje imię, Kapitanie:",
  "creation.era_label": "Wybierz epokę:",
  "creation.era_hint": "Użyj strzałek, Enter aby potwierdzić",
  "creation.confirm": "ZACZYNAJMY",
  "creation.step2_title": "STWÓRZ KAPITANA",
  "creation.nationality_label": "Kraj pochodzenia:",
  "creation.skills_label": "Punkty umiejętności:",
  "creation.points_remaining": "Pozostałe punkty: {{pts}}",
  "creation.skill_hint": "+/- aby przydzielić",
  "creation.back": "WSTECZ",
  "creation.start_game": "WYPŁYŃ",

  // -- Eras --
  "era.silver_empire.name": "Srebrne Imperium",
  "era.merchants_smugglers.name": "Kupcy i Przemytnicy",
  "era.new_colonists.name": "Nowi Koloniści",
  "era.war_for_profit.name": "Wojna dla Zysku",
  "era.buccaneer_heroes.name": "Bohaterowie Bukanierów",
  "era.pirates_sunset.name": "Zmierzch Piratów",

  // -- Port Main Menu --
  "port.visit_governor": "Wizyta u Gubernatora",
  "port.visit_tavern": "Odwiedź Tawernę",
  "port.visit_merchant": "Odwiedź Handlarza",
  "port.menu_hint": "W/S \u2014 Wybierz   Enter \u2014 Potwierdź   Esc \u2014 Wypłyń",

  // -- Governor --
  "governor.title": "REZYDENCJA GUBERNATORA",
  "governor.reputation_label": "Stosunki z {{faction}}: {{level}} ({{value}})",
  "governor.letter_available": "Gubernator oferuje ci List Kaperski!",
  "governor.letter_accept": "[ PRZYJMIJ LIST KAPERSKI ]",
  "governor.letter_already": "Posiadasz już List Kaperski od {{faction}}.",
  "governor.letter_denied": "Gubernator nie darzy cię jeszcze wystarczającym zaufaniem.",
  "governor.back": "[ WRÓĆ DO PORTU ]",
  "governor.dialogue_hostile": "\"Straże! Wyprowadzić tego łotra!\"",
  "governor.dialogue_unfriendly": "\"Nie mam interesów z takimi jak ty. Dobrego dnia.\"",
  "governor.dialogue_neutral": "\"Witaj, Kapitanie. Co cię sprowadza do naszego portu?\"",
  "governor.dialogue_friendly": "\"Ach, Kapitanie {{name}}! Miło widzieć przyjaciela korony.\"",
  "governor.dialogue_allied": "\"Drogi Kapitanie {{name}}! Korona jest ci winna wielki dług.\"",

  // -- Tavern --
  "tavern.title": "TAWERNA",
  "tavern.recruit_crew": "Zwerbuj załogę (za darmo)",
  "tavern.hear_rumors": "Posłuchaj plotek",
  "tavern.buy_drinks": "Postaw kolejkę ({{cost}} Złoto)",
  "tavern.back": "[ WRÓĆ DO PORTU ]",
  "tavern.hint": "W/S \u2014 Wybierz   Enter \u2014 Potwierdź   Esc \u2014 Wróć",
  "tavern.rumor_treasure": "\"Słyszałem o skarbie zakopanym na małej wyspie na południe od Jamajki...\"",
  "tavern.rumor_fleet": "\"Hiszpańską flotę skarbową widziano w Cieśninie Nawietrznej.\"",
  "tavern.rumor_storm": "\"Starzy żeglarze mówią, że na południu zbiera się wielki sztorm.\"",
  "tavern.rumor_trade": "\"Ceny cukru w Barbados biją rekordy, podobno.\"",
  "tavern.rumor_pirates": "\"Ludzie Czarnobrodego napadają na statki koło Nassau.\"",
  "tavern.rumor_war": "\"Mówią, że Anglia i Hiszpania znów są o krok od wojny.\"",
  "tavern.rumor_governor": "\"Gubernator szuka zdolnych kapitanów do specjalnych zleceń.\"",
  "tavern.rumor_ghost_ship": "\"Podobno statek-widmo nawiedza wody koło Bermudów nocą...\"",

  // -- New events --
  "event.letter_of_marque": "Otrzymano List Kaperski od {{faction}}.",
  "event.recruited_crew": "Zwerbowano {{count}} członków załogi za {{cost}} Złoto.",
  "event.bought_drinks": "Postawiono kolejkę za {{cost}} Złoto. Morale podniesione!",

  // -- Tavern: crew pool --
  "tavern.crew_available": "{{count}} dostępnych, {{berths}} koi",

  // -- Shipyard --
  "port.visit_shipyard": "Odwiedź Stocznię",
  "shipyard.title": "STOCZNIA",
  "shipyard.repair": "[ NAPRAW KADŁUB: {{damage}} PŻ ({{cost}} Złoto) ]",
  "shipyard.no_damage": "Kadłub w doskonałym stanie.",
  "shipyard.ships_for_sale": "STATKI NA SPRZEDAŻ",
  "shipyard.col_name": "Statek",
  "shipyard.col_speed": "Prędkość",
  "shipyard.col_hull": "Kadłub",
  "shipyard.col_cannons": "Działa",
  "shipyard.col_cargo": "Ładunek",
  "shipyard.col_crew": "Załoga",
  "shipyard.col_price": "Cena",
  "shipyard.buy": "[Kup]",
  "shipyard.current": "(obecny)",
  "event.bought_ship": "Zakupiono {{ship}} za {{cost}} Złoto.",

  // -- Ranks: Spain --
  "rank.spain.0": "Sin rango",
  "rank.spain.1": "Capitán",
  "rank.spain.2": "Mayor",
  "rank.spain.3": "Coronel",
  "rank.spain.4": "Almirante",
  "rank.spain.5": "Marqués",

  // -- Ranks: England --
  "rank.england.0": "Brak rangi",
  "rank.england.1": "Kapitan",
  "rank.england.2": "Major",
  "rank.england.3": "Pułkownik",
  "rank.england.4": "Admirał",
  "rank.england.5": "Książę",

  // -- Ranks: France --
  "rank.france.0": "Sans grade",
  "rank.france.1": "Capitaine",
  "rank.france.2": "Commandant",
  "rank.france.3": "Colonel",
  "rank.france.4": "Amiral",
  "rank.france.5": "Marquis",

  // -- Ranks: Netherlands --
  "rank.netherlands.0": "Geen rang",
  "rank.netherlands.1": "Kapitein",
  "rank.netherlands.2": "Majoor",
  "rank.netherlands.3": "Kolonel",
  "rank.netherlands.4": "Admiraal",
  "rank.netherlands.5": "Hertog",

  // -- Ranks: Pirates --
  "rank.pirates.0": "Szmata",
  "rank.pirates.1": "Towarzysz",
  "rank.pirates.2": "Kwatermistrz",
  "rank.pirates.3": "Pierwszy oficer",
  "rank.pirates.4": "Kapitan",
  "rank.pirates.5": "Król Piratów",

  // -- Rank UI --
  "rank.label": "Ranga: {{rank}}",
  "rank.unknown": "Nieznany",

  // -- Sound --
  "sound.on": "Dźwięk: WŁ",
  "sound.off": "Dźwięk: WYŁ",

  // -- Game Speed --
  "speed.label": "Prędkość gry: {{speed}}",
  "speed.fast": "Szybko",
  "speed.normal": "Normalnie",
  "speed.slow": "Wolno",

  // -- Start Screen --
  "creation.load_game": "WCZYTAJ GRĘ",
  "creation.no_saves": "Brak zapisanych gier",

  // -- Options --
  "options.sound_on": "Dźwięk: WŁ.",
  "options.sound_off": "Dźwięk: WYŁ.",

  // -- Language --
  "lang.current": "Język: Polski",
  "lang.switch": "[ English ]",

  // -- Settings Tab --
  "menu.tab_settings": "Ustawienia",
  "settings.title": "SKRYTKA KWATERMISTRZA",
  "settings.style_label": "Styl grafiki",
  "settings.style_hint": "* Zrestartuj grę, aby zobaczyć pełen efekt",
  "settings.pack.basic": "1. Podstawowy — kontury OSM",
  "settings.pack.buccaneer": "2. Bukanier — wkrótce",
  "settings.pack.corsair": "3. Korsarz — wkrótce",

  // -- Zoom --
  "settings.zoom_label": "Luneta",
  "settings.zoom.z1": "1 — Duża mapa",
  "settings.zoom.z2": "2 — Przegląd",
  "settings.zoom.z3": "3 — Daleko",
  "settings.zoom.z4": "4 — Średnio",
  "settings.zoom.z5": "5 — Normalnie",
  "settings.zoom.z6": "6 — Blisko",
  "settings.zoom.z7": "7 — Bliżej",
  "settings.zoom.z8": "8 — Detale",
  "settings.zoom.z9": "9 — Bardzo blisko",
  "settings.zoom.z10": "10 — Maksimum",
  "settings.zoom.z11": "11 — Ultra",
  "settings.zoom.z12": "12 — Ekstremalny",
  "settings.zoom.z13": "13 — Luneta",
  "settings.zoom.z14": "14 — Bocianie gniazdo",
  "settings.zoom_hint": "* Działa natychmiast",

  // -- Skills --
  "skill.fencing": "Szermierka",
  "skill.gunnery": "Artyleria",
  "skill.navigation": "Nawigacja",
  "skill.medicine": "Medycyna",
  "skill.charm": "Urok",

  // -- Captain Tab --
  "menu.tab_captain": "Kapitan",
  "captain.name_label": "Kapitan {{name}}",
  "captain.age_label": "Wiek: {{age}}",
  "captain.experience_label": "Doświadczenie: {{value}}",
  "captain.nationality_label": "Pochodzenie: {{nation}}",
  "captain.skills_title": "Umiejętności",
  "captain.ranks_title": "Rangi",

  // -- Changelog --
  "changelog.title": "LOG ZMIAN",
  "changelog.version": "v{{version}} ({{date}})",
};
