/**
 * scene-recipes.mjs — the one list of ways into this game's screens.
 *
 * Both screen tools used to carry their own copy of it, and the copy in
 * `probe-keys.mjs` said *"the same screens `audit-layout.mjs` reaches, and
 * reached the same way"*. It was not true on the day it was written: the audit
 * reached `RetirementScene` and the probe did not, the probe reached the
 * division of spoils and the audit did not. A sentence claiming two lists
 * agree, kept beside two lists that do not, is the shape v0.90.0 named — so
 * there is one list now and no sentence.
 *
 * ── Why a recipe per scene was never enough ────────────────────────────────
 *
 * A recipe names a scene; a screen is a scene **in a state**. `PortScene` is
 * ten counters behind one key, `OptionsMenuScene` seven tabs, `HelpScene` five
 * pages of the manual — and every tool this repo has ever pointed at them saw
 * the one state they open in. `audit-layout.mjs` answering "RAZEM: 0" was
 * answering about sixteen screens out of thirty-two.
 *
 * `STATES` below is the census, and `scene_states.test.ts` holds it to the
 * unions in the scene sources, so a view added to `PortView` with no recipe
 * reddens the suite instead of quietly shrinking the audit.
 *
 * ── Fields ─────────────────────────────────────────────────────────────────
 *
 *   key      the Phaser scene key the tools probe
 *   label    what the report calls this row; defaults to `key`
 *   url      the debug world to open (see `PreloadScene`)
 *   start    stop/pause everything and start this scene instead
 *   data     the `init` payload handed to `start` (`worldState` is added)
 *   keys     keys to press after the scene is up, comma separated
 *   settle   ms of pumped frames after the walk, for `delayedCall` chains
 *   then     keys pressed after `settle`, for a phase reached from a settled one
 *   frames   exact frames to pump, for a phase that is on a clock
 *   require  text that must be on screen for the walk to count as arrived
 *   wait     ms to wait after the page load before anything else
 *   probe    false for a screen `probe-keys.mjs` must not press keys at
 */

const LANG = 'lang=pl';

/**
 * The states each scene can draw, and the type in its source that names them.
 *
 * `union` is the declaration `scene_states.test.ts` parses. Where a scene has
 * no union — a scene with one screen — it is absent from this table and its
 * single recipe is the whole of it.
 */
export const STATES = {
  PortScene: {
    union: 'PortView',
    members: ['menu', 'governor', 'tavern', 'merchant', 'shipyard', 'daughter',
      'garrison', 'warehouse', 'charter', 'divide_confirm'],
  },
  OptionsMenuScene: {
    union: 'TabId',
    members: ['cabin', 'captain', 'journal', 'calendar', 'settings', 'save', 'map'],
  },
  HelpScene: {
    union: 'HelpSection',
    members: ['controls', 'ships', 'sailing', 'world', 'economy'],
  },
  CityAssaultScene: {
    union: 'phase',
    members: ['bombard', 'assault', 'spoils', 'done'],
  },
  CityDefenseScene: {
    union: 'phase',
    members: ['bombard', 'assault', 'done', 'closed'],
  },
  CharacterCreationScene: {
    union: 'step',
    members: ['1', '2'],
  },
};

/**
 * States that cannot be measured, and why. Anything here is exempt from the
 * guard; anything not here needs a recipe labelled `Scene[state]`.
 *
 * A state is only allowed in this table when it is not a screen: a phase the
 * scene passes through while it is already shutting down draws nothing a tool
 * could measure, and pinning it would measure the teardown.
 */
export const UNMEASURABLE = {
  'CityAssaultScene[assault]':
    'the wave loop runs on a delayedCall chain and leaves for "spoils" on its own',
  'CityDefenseScene[assault]':
    'the same wave loop, mirrored; it ends in "done" without waiting for a key',
  'CityDefenseScene[closed]':
    'set inside finish(), one frame before scene.stop() — there is no screen',
};

const port = (view, extra = {}) => ({
  key: 'PortScene',
  label: view === 'menu' ? 'PortScene' : `PortScene[${view}]`,
  url: `?skip&${LANG}`,
  start: 'PortScene',
  data: { portId: 'havana', ...(view === 'menu' ? {} : { returnToView: view }) },
  ...extra,
});

const tab = (name, index) => ({
  key: 'OptionsMenuScene',
  label: index === 0 ? 'OptionsMenuScene' : `OptionsMenuScene[${name}]`,
  url: `?skip&${LANG}`,
  start: 'OptionsMenuScene',
  data: { initialTab: index },
});

const help = (name, index) => ({
  key: 'HelpScene',
  label: index === 0 ? 'HelpScene' : `HelpScene[${name}]`,
  url: `?skip&${LANG}`,
  start: 'HelpScene',
  data: {},
  // The manual's tabs answer to the number row; `goTo` restarts the scene, so
  // one press is the whole walk in.
  ...(index === 0 ? {} : { keys: String(index + 1) }),
});

export const RECIPES = [
  { key: 'CharacterCreationScene', url: `?${LANG}` },
  {
    key: 'CharacterCreationScene', label: 'CharacterCreationScene[2]',
    url: `?${LANG}`, start: 'CharacterCreationScene',
    // The second page of the sheet: the skill columns and the points left.
    // Reached in play by typing a name and pressing Enter, which a probe
    // cannot type into a canvas — `init` takes the step, so it is handed over.
    data: { step: 2, playerName: 'Kapitan' },
  },
  { key: 'MainMapScene', url: `?skip&${LANG}` },
  { key: 'UIOverlayScene', url: `?skip&${LANG}` },
  { key: 'SeaBattleScene', url: `?battle=navy&${LANG}`, wait: 5000 },

  { key: 'CityAssaultScene', url: `?siege=cartagena&${LANG}` },
  // The same screen in its other half. Nine of its twelve keys belong to the
  // division of spoils and are gated on `phase === "spoils"`, which is three
  // bombardments and a landing away: from the opening screen they do nothing,
  // and a probe that only ever sees the opening screen would call them dead.
  {
    key: 'CityAssaultScene', label: 'CityAssaultScene[spoils]',
    url: `?siege=cartagena&${LANG}`, keys: 'Space,Space,Space,l', settle: 500,
    // The walk in is not deterministic — a bombardment rolls dice and an
    // assault takes as many waves as it takes. Without this check the rebuild
    // before key `2` lands in a different phase from the one before key `1`,
    // and the report compares two different screens: the first draft of this
    // tool said `UP` and `DOWN` were dead here, and they are not.
    //
    // Both rows, not just the first: the sponsor's line is what makes `3` a
    // real choice rather than an empty one, and a screen without it answers
    // three of these keys differently.
    require: ['Złupić i odpłynąć', 'bractwa', 'Oddać'],
  },
  {
    key: 'CityAssaultScene', label: 'CityAssaultScene[done]',
    // The same walk as the spoils, and then the key that takes them. That key
    // has to come after `settle`: pressed while the wave loop is still
    // running it reaches a screen with no spoils list on it and does nothing.
    // What is left is drawn for 1600 ms — 96 frames — before the screen hands
    // back to the chart, so the wait after it is counted in frames.
    url: `?siege=cartagena&${LANG}`, keys: 'Space,Space,Space,l', settle: 500,
    then: 'Enter', frames: 40,
    // The gold line, which only the settled screen carries. The spoils list
    // and the controls line are both gone by then, so there is nothing else
    // here to tell the two states apart.
    require: 'złota do ładowni',
    // **Layout only.** This screen is on a 1 600 ms fuse — `pickSpoils` sets
    // the phase and hands back to the chart on a `delayedCall` — so the audit,
    // which measures one still frame, catches it comfortably and the probe,
    // which walks in again for **every key**, races that fuse twelve times and
    // loses some of them. What it measured when it did win is that all twelve
    // bound keys do nothing, which is what a screen with every handler gated
    // on the two earlier phases should say. A tool that answers a screen
    // differently depending on how loaded the machine is answers nothing.
    probe: false,
  },

  { key: 'CityDefenseScene', url: `?defend=cartagena&${LANG}` },
  {
    key: 'CityDefenseScene', label: 'CityDefenseScene[done]',
    // `L` puts the men on the walls and SPACE is a round of fire; the boats
    // ground when a round says they do, which is as many rounds as it is. So
    // the walk mans the walls, fires until they land, and then waits: `settle`
    // pumps the `delayedCall` chain that carries the wave log from the beach
    // to the result line, and `require` is what makes an uncertain walk
    // honest — five goes, and it says so if none of them arrives.
    url: `?defend=cartagena&${LANG}`, keys: 'l,Space,Space,Space,Space,Space,Space,Space,Space',
    settle: 4000, require: 'Enter — dalej',
  },

  { key: 'VillageScene', url: `?village=darien&${LANG}`, start: 'VillageScene', data: { villageKey: 'darien' } },

  port('menu'),
  port('governor'),
  port('tavern'),
  port('merchant'),
  port('shipyard'),
  port('warehouse'),
  port('charter'),
  port('divide_confirm'),
  // Two counters the captain only sees when the world has put something there:
  // a governor with a daughter of age, and a town he holds himself.
  // Havana, because `renderDaughter` falls back to the governor's room when
  // there is no daughter of age — and it does so silently, so the first
  // recipe here pointed at Tortuga and quietly measured the governor twice.
  // `require` is what turns that into an error instead of a duplicate row.
  port('daughter', {
    url: `?skip&${LANG}`,
    data: { portId: 'havana', returnToView: 'daughter' },
    require: 'Isabella',
  }),
  port('garrison', { url: `?home=port_royal&${LANG}`, data: { portId: 'port_royal', returnToView: 'garrison' } }),

  { key: 'PortApproachScene', url: `?skip&${LANG}`, start: 'PortApproachScene', data: { portId: 'havana' } },
  { key: 'CityInfoScene', url: `?skip&${LANG}`, start: 'CityInfoScene', data: { portKey: 'havana' } },

  tab('cabin', 0),
  tab('captain', 1),
  tab('journal', 2),
  tab('calendar', 3),
  tab('settings', 4),
  tab('save', 5),
  tab('map', 6),

  help('controls', 0),
  help('ships', 1),
  help('sailing', 2),
  help('world', 3),
  help('economy', 4),

  { key: 'BattleHelpScene', url: `?battle=navy&${LANG}`, start: 'BattleHelpScene', data: {}, wait: 5000 },
  { key: 'DuelScene', url: `?skip&${LANG}`, start: 'DuelScene', data: { playerFencing: 6, enemyFencing: 5, seed: 3 } },
  {
    key: 'ShipEncounterScene', url: `?hail=havana&${LANG}`,
    start: 'ShipEncounterScene', data: { npcEntityId: 'hail_trader' },
  },
  {
    key: 'RetirementScene', url: `?skip&${LANG}`, start: 'RetirementScene',
    // Hand-built rather than computed: the only captain who reaches this screen
    // is one who has sailed for thirty years, and there is no flag for that.
    data: {
      captainName: 'Kapitan',
      score: {
        age: 52, yearsAtSea: 31, total: 8400, titleKey: 'retire.title_admiral',
        lines: [
          { key: 'retire.line_gold', amount: 124000, points: 12400 },
          { key: 'retire.line_fleet', amount: 46000, points: 2300 },
          { key: 'retire.line_ranks', amount: 7, points: 2100 },
          { key: 'retire.line_reputation', amount: 180, points: 720 },
          { key: 'retire.line_fame', amount: 74, points: 888 },
          { key: 'retire.line_years', amount: 31, points: 1100 },
          { key: 'retire.line_towns', amount: 3, points: 1200 },
          { key: 'retire.line_family', amount: 2, points: 1400 },
          { key: 'retire.line_marriage', amount: 1, points: 900 },
        ],
      },
    },
  },
];

/** What a report calls this row. */
export const labelOf = (recipe) => recipe.label ?? recipe.key;
