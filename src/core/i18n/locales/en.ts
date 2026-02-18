import type { LocaleData } from "../types.ts";

export const EN: LocaleData = {
  // -- Items --
  "item.sugar_cane.name": "Sugar Cane",
  "item.tobacco.name": "Tobacco",
  "item.cocoa.name": "Cocoa",
  "item.rum.name": "Rum",
  "item.food.name": "Food",
  "item.water.name": "Water",

  // -- Ports (45 cities) --
  "port.havana.name": "Havana",
  "port.santiago.name": "Santiago",
  "port.santo_domingo.name": "Santo Domingo",
  "port.san_juan.name": "San Juan",
  "port.cartagena.name": "Cartagena",
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
  "port.guadeloupe.name": "Guadeloupe",
  "port.petit_goave.name": "Petit Goâve",
  "port.port_de_paix.name": "Port de Paix",
  "port.florida_keys.name": "Florida Keys",
  "port.leogane.name": "Léogane",
  "port.montserrat.name": "Montserrat",
  "port.curacao.name": "Curaçao",
  "port.st_eustatius.name": "St. Eustatius",
  "port.st_martin.name": "St. Martin",

  // -- Factions --
  "faction.spain.name": "Spain",
  "faction.england.name": "England",
  "faction.france.name": "France",
  "faction.netherlands.name": "Netherlands",
  "faction.pirates.name": "Pirates",

  // -- Ship Classes --
  "ship.sloop.name": "Sloop",
  "ship.brigantine.name": "Brigantine",
  "ship.frigate.name": "Frigate",
  "ship.galleon.name": "Galleon",
  "ship.merchantman.name": "Merchantman",

  // -- Port types --
  "port_type.city": "CITY",
  "port_type.fort": "FORT",
  "port_type.outpost": "OUTPOST",

  // -- HUD --
  "hud.gold": "Gold",
  "hud.wind": "Wind: {{pct}}%",
  "hud.hull": "Hull: {{current}}/{{max}}",
  "hud.sails": "Sails: {{current}}/{{max}}",
  "hud.sail_pct": "Sail: {{pct}}%",
  "hud.speed": "Spd: {{value}}",
  "hud.pos": "Pos: {{x}},{{y}}",
  "hud.controls": "W/S/Arrows: Sails & Turn  E: Port  SPACE: Menu",
  "hud.crew": "Crew: {{current}}/{{max}}",
  "hud.morale": "Morale: {{pct}}%",
  "hud.cargo": "Cargo: {{current}}/{{max}}",

  // -- Time --
  "time.format": "Day {{day}}, {{hh}}:{{mm}}",
  "time.month_names": "January,February,March,April,May,June,July,August,September,October,November,December",

  // -- Port Scene --
  "port.trade_goods": "TRADE GOODS",
  "port.price": "{{price}} Gold",
  "port.stock": "Stock: {{qty}}",
  "port.own": "Own: {{qty}}",
  "port.buy": "[Buy]",
  "port.sell": "[Sell]",
  "port.repair": "[ REPAIR SHIP (2 Gold/HP) ]",
  "port.set_sail": "[ SET SAIL ]",

  // -- Port Approach --
  "approach.enter": "ENTER PORT",
  "approach.enter_desc": "Dock and visit the port.",
  "approach.sneak": "SNEAK IN",
  "approach.sneak_desc_fort": "Attempt to enter undetected. Risk of being caught.",
  "approach.sneak_desc_city": "Disguise your flag and slip into port.",
  "approach.attack": "ATTACK",
  "approach.attack_desc": "Open fire on the fort. All-out battle!",
  "approach.leave": "SAIL AWAY",
  "approach.leave_desc": "Continue sailing.",
  "approach.reputation": "Reputation: {{level}} ({{value}})",
  "approach.prompt": "Press E to open menu — {{name}}",
  "approach.population": "Population: {{size}}",
  "approach.wealth": "Wealth: {{level}}",
  "approach.exports": "Exports: {{items}}",

  // -- City sizes --
  "city.pop_small": "Small",
  "city.pop_medium": "Medium",
  "city.pop_large": "Large",
  "city.pop_capital": "Capital",

  // -- City wealth levels --
  "city.wealth_poor": "Poor",
  "city.wealth_modest": "Modest",
  "city.wealth_prosperous": "Prosperous",
  "city.wealth_wealthy": "Wealthy",

  // -- Reputation levels --
  "rep.hostile": "HOSTILE",
  "rep.unfriendly": "UNFRIENDLY",
  "rep.neutral": "NEUTRAL",
  "rep.friendly": "FRIENDLY",
  "rep.allied": "ALLIED",

  // -- Pause --
  "pause.title": "PAUSED",
  "pause.resume": "[ RESUME ]",
  "pause.save_load": "[ SAVE/LOAD ]",

  // -- Options Menu --
  "menu.title": "Captain's Log",
  "menu.tab_cabin": "Captain's Cabin",
  "menu.tab_calendar": "Calendar & Events",
  "menu.tab_options": "Options",
  "menu.tab_map": "Caribbean Map",
  "menu.close": "[ CLOSE ]",
  "menu.close_hint": "ESC / SPACE to close",

  // -- Captain's Cabin --
  "cabin.crew_title": "Crew",
  "cabin.cargo_title": "Cargo Manifest",
  "cabin.ships_title": "Your Fleet",
  "cabin.no_cargo": "Cargo hold is empty.",
  "cabin.cannons": "Cannons: {{count}}",

  // -- Calendar --
  "calendar.recent_events": "Recent Events",
  "calendar.no_events": "No events yet.",

  // -- Save/Load --
  "save.title": "SAVE / LOAD",
  "save.slot_empty": "Empty Slot",
  "save.slot_label": "Slot {{n}}: Day {{day}}",
  "save.btn_save": "[Save]",
  "save.btn_load": "[Load]",
  "save.btn_delete": "[Del]",
  "save.back": "[ BACK ]",
  "save.saved_ok": "Game saved!",
  "save.loaded_ok": "Game loaded!",

  // -- Map --
  "map.you_are_here": "You are here",

  // -- Battle --
  "battle.your_ship": "YOUR SHIP",
  "battle.enemy": "ENEMY",
  "battle.victory": "VICTORY! The enemy ship has been sunk!",
  "battle.defeat": "DEFEAT! Your ship has been destroyed...",
  "battle.disengaged": "You managed to disengage from battle.",
  "battle.continue": "Click to continue",
  "battle.controls": "WSAD: Sail/Turn  |  Q: Fire Left  |  E: Fire Right  |  ESC: Disengage",

  // -- Event Log --
  "event.departed": "Departed from {{port}}",
  "event.arrived": "Arrived at {{port}}",
  "event.trade_buy": "Bought {{qty}} {{item}} for {{gold}} Gold",
  "event.trade_sell": "Sold {{qty}} {{item}} for {{gold}} Gold",
  "event.repaired": "Ship repaired for {{gold}} Gold",
  "event.food_low": "Food supplies running low!",
  "event.water_low": "Water supplies running low!",
  "event.food_out": "Food has run out! Crew is starving!",
  "event.water_out": "Water has run out! Crew is dying of thirst!",
  "event.crew_died": "{{count}} crew members have died.",
  "event.morale_drop": "Crew morale is dropping.",
  "event.storm_start": "A storm has begun!",
  "event.storm_end": "The storm has passed.",
  "event.day_passed": "Day {{day}} has begun.",

  // -- Character Creation --
  "creation.title": "PIRATES CHRONICLES",
  "creation.name_label": "Enter your name, Captain:",
  "creation.era_label": "Choose your era:",
  "creation.era_hint": "Use arrows to select, Enter to confirm",
  "creation.confirm": "[ SET SAIL ]",

  // -- Eras --
  "era.silver_empire.name": "The Silver Empire",
  "era.merchants_smugglers.name": "Merchants and Smugglers",
  "era.new_colonists.name": "The New Colonists",
  "era.war_for_profit.name": "War for Profit",
  "era.buccaneer_heroes.name": "The Buccaneer Heroes",
  "era.pirates_sunset.name": "Pirates' Sunset",

  // -- Port Main Menu --
  "port.visit_governor": "Visit the Governor",
  "port.visit_tavern": "Visit the Tavern",
  "port.visit_merchant": "Visit the Merchant",
  "port.menu_hint": "W/S \u2014 Select   Enter \u2014 Confirm   Esc \u2014 Set Sail",

  // -- Governor --
  "governor.title": "GOVERNOR'S MANSION",
  "governor.reputation_label": "Standing with {{faction}}: {{level}} ({{value}})",
  "governor.letter_available": "The Governor offers you a Letter of Marque!",
  "governor.letter_accept": "[ ACCEPT LETTER OF MARQUE ]",
  "governor.letter_already": "You already hold a Letter of Marque from {{faction}}.",
  "governor.letter_denied": "The Governor does not trust you enough yet.",
  "governor.back": "[ BACK TO PORT ]",
  "governor.dialogue_hostile": "\"Guards! Remove this scoundrel from my sight!\"",
  "governor.dialogue_unfriendly": "\"I have no business with the likes of you. Good day.\"",
  "governor.dialogue_neutral": "\"Welcome, Captain. What brings you to our port?\"",
  "governor.dialogue_friendly": "\"Ah, Captain {{name}}! It is good to see a friend of the crown.\"",
  "governor.dialogue_allied": "\"My dear Captain {{name}}! The crown owes you a great debt.\"",

  // -- Tavern --
  "tavern.title": "THE TAVERN",
  "tavern.recruit_crew": "Recruit Crew ({{cost}} Gold each)",
  "tavern.hear_rumors": "Hear Rumors",
  "tavern.buy_drinks": "Buy Round of Drinks ({{cost}} Gold)",
  "tavern.back": "[ BACK TO PORT ]",
  "tavern.hint": "W/S \u2014 Select   Enter \u2014 Confirm   Esc \u2014 Back",
  "tavern.rumor_treasure": "\"I heard tell of a treasure buried on a small island south of Jamaica...\"",
  "tavern.rumor_fleet": "\"A Spanish treasure fleet was spotted heading through the Windward Passage.\"",
  "tavern.rumor_storm": "\"The old sailors say a great storm is brewing in the south.\"",
  "tavern.rumor_trade": "\"Sugar prices are sky-high in Barbados, I hear.\"",
  "tavern.rumor_pirates": "\"Blackbeard's men have been raiding ships near Nassau.\"",
  "tavern.rumor_war": "\"Word is that England and Spain are on the brink of war again.\"",
  "tavern.rumor_governor": "\"The Governor's been looking for capable captains to run errands.\"",
  "tavern.rumor_ghost_ship": "\"They say a ghost ship haunts the waters near Bermuda at night...\"",

  // -- New events --
  "event.letter_of_marque": "Received Letter of Marque from {{faction}}.",
  "event.recruited_crew": "Recruited {{count}} crew members for {{cost}} Gold.",
  "event.bought_drinks": "Bought a round of drinks for {{cost}} Gold. Morale boosted!",

  // -- Tavern: crew pool --
  "tavern.crew_available": "{{count}} available, {{berths}} berths",

  // -- Shipyard --
  "port.visit_shipyard": "Visit the Shipyard",
  "shipyard.title": "THE SHIPYARD",
  "shipyard.repair": "[ REPAIR HULL: {{damage}} HP ({{cost}} Gold) ]",
  "shipyard.no_damage": "Hull is in perfect condition.",
  "shipyard.ships_for_sale": "SHIPS FOR SALE",
  "shipyard.col_name": "Ship",
  "shipyard.col_speed": "Speed",
  "shipyard.col_hull": "Hull",
  "shipyard.col_cannons": "Guns",
  "shipyard.col_cargo": "Cargo",
  "shipyard.col_crew": "Crew",
  "shipyard.col_price": "Price",
  "shipyard.buy": "[Buy]",
  "shipyard.current": "(current)",
  "event.bought_ship": "Purchased a {{ship}} for {{cost}} Gold.",

  // -- Ranks: Spain --
  "rank.spain.0": "Sin rango",
  "rank.spain.1": "Capitán",
  "rank.spain.2": "Mayor",
  "rank.spain.3": "Coronel",
  "rank.spain.4": "Almirante",
  "rank.spain.5": "Marqués",

  // -- Ranks: England --
  "rank.england.0": "No rank",
  "rank.england.1": "Captain",
  "rank.england.2": "Major",
  "rank.england.3": "Colonel",
  "rank.england.4": "Admiral",
  "rank.england.5": "Duke",

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
  "rank.pirates.0": "Swab",
  "rank.pirates.1": "Mate",
  "rank.pirates.2": "Quartermaster",
  "rank.pirates.3": "First Mate",
  "rank.pirates.4": "Captain",
  "rank.pirates.5": "Pirate King",

  // -- Rank UI --
  "rank.label": "Rank: {{rank}}",
  "rank.unknown": "Unknown",

  // -- Game Speed --
  "speed.label": "Game Speed: {{speed}}",
  "speed.fast": "Fast",
  "speed.normal": "Normal",
  "speed.slow": "Slow",

  // -- Start Screen --
  "creation.load_game": "LOAD GAME",
  "creation.no_saves": "No saved games",

  // -- Options --
  "options.sound_on": "Sound: ON",
  "options.sound_off": "Sound: OFF",

  // -- Language --
  "lang.current": "Language: English",
  "lang.switch": "[ Polski ]",
};
