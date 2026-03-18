export type ChangelogEntry = {
  version: string;
  date: string;
  changes: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.8.4",
    date: "2026-02-20",
    changes: [
      "Classic map: caribbean_bg.png background (GitHub v0.8.2 style)",
      "Generated pack: procedural blob tiles + water_tile overlay",
      "Asset pack now controls map rendering style",
      "Dancing Script font (local, full Polish support)",
      "All fonts scaled +30% for readability",
      "Nationality-specific starting cities",
      "Renamed menu tabs (shorter labels)",
      "Options dialog enlarged 20%",
      "Puppeteer screenshot tool",
    ],
  },
  {
    version: "0.8.3",
    date: "2026-02-20",
    changes: [
      "Two-step character creation: name/era + nationality/skills",
      "Captain profile: 5 skills (fencing, gunnery, navigation, medicine, charm)",
      "Skill point allocation with 10 bonus points",
      "Ship faction now matches captain's nationality",
      "+20 reputation bonus with own nation at game start",
      "New 'Captain' tab in options menu (skills, ranks, age)",
      "Save migration v5: old saves get default captain profile",
      "Changelog visible in-game (Quartermaster tab)",
      "Allura italic font (replaces Treasure Map Deadhand, Polish support)",
      "New start screen music (pirate_adventure.wav)",
    ],
  },
  {
    version: "0.8.2",
    date: "2026-02-19",
    changes: [
      "Version label in bottom-right corner (start screen)",
      "Larger version font (8px -> 12px)",
      "Beach fringe overlay fix",
    ],
  },
  {
    version: "0.8.1",
    date: "2026-02-19",
    changes: [
      "Custom pirate font (Treasure Map Deadhand)",
      "Wind rose compass on map",
      "Caribbean map in options menu",
      "Smaller, cleaner dialog panels",
      "45 cities with full port data",
      "Shipyard: buy ships, repair hull",
      "Tavern: recruit crew, buy drinks, hear rumors",
      "Governor: ranks, letters of marque",
      "Era selection (6 historical eras)",
      "Save/load system (5 slots)",
      "Event log and calendar",
      "Asset pack switching (classic / AI sprites)",
      "Zoom level setting (far / normal / close)",
      "Polish language support",
    ],
  },
  {
    version: "0.8.0",
    date: "2026-02-18",
    changes: [
      "Initial release: Caribbean sailing, trading, combat",
      "Procedural world generation with factions",
      "Sea battle system",
      "Port trading and docking",
    ],
  },
];
