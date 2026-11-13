// Settings pages. Labels follow the official NuvioMobile strings (GPL-3.0);
// edited by hand for the web version. Every row here does something.
export const THEMES = [
  {
    id: "Gold",
    label: "Gold",
    accent: "#e8a91c",
    onAccent: "#111111",
    bg: "#0f0e0b",
    surface: "#1d1a14",
    card: "#262116",
    focus: "#3d2d1a"
  },
  {
    id: "Jade",
    label: "Jade",
    accent: "#22d37c",
    onAccent: "#111111",
    bg: "#0b0f0d",
    surface: "#141d18",
    card: "#16251d",
    focus: "#153a2c"
  },
  {
    id: "RoseGold",
    label: "Rose Gold",
    accent: "#ec70a9",
    onAccent: "#111111",
    bg: "#100c0f",
    surface: "#1f161d",
    card: "#281a24",
    focus: "#442037"
  },
  {
    id: "ArcticBlue",
    label: "Arctic Blue",
    accent: "#3185f5",
    onAccent: "#ffffff",
    bg: "#0b0e14",
    surface: "#141a24",
    card: "#161e2a",
    focus: "#172844"
  },
  {
    id: "Graphite",
    label: "Graphite",
    accent: "#aab2be",
    onAccent: "#111111",
    bg: "#0c0d0f",
    surface: "#17191d",
    card: "#20242a",
    focus: "#30343a"
  },
  {
    id: "Crimson",
    label: "Crimson",
    accent: "#e53935",
    onAccent: "#ffffff",
    bg: "#0d0d0d",
    surface: "#1a1a1a",
    card: "#241a1a",
    focus: "#3d1a1a"
  },
  {
    id: "Ocean",
    label: "Ocean",
    accent: "#1e88e5",
    onAccent: "#ffffff",
    bg: "#0d0d0f",
    surface: "#1a1a1e",
    card: "#1a1f24",
    focus: "#1a2d3d"
  },
  {
    id: "Violet",
    label: "Violet",
    accent: "#8e24aa",
    onAccent: "#ffffff",
    bg: "#0d0d0f",
    surface: "#1a1a1e",
    card: "#1f1a24",
    focus: "#2d1a3d"
  },
  {
    id: "Emerald",
    label: "Emerald",
    accent: "#43a047",
    onAccent: "#ffffff",
    bg: "#0d0d0d",
    surface: "#1a1a1a",
    card: "#1a241a",
    focus: "#1a3d1e"
  },
  {
    id: "Amber",
    label: "Amber",
    accent: "#fb8c00",
    onAccent: "#ffffff",
    bg: "#0f0d0d",
    surface: "#1e1a1a",
    card: "#24201a",
    focus: "#3d2d1a"
  },
  {
    id: "Rose",
    label: "Rose",
    accent: "#d81b60",
    onAccent: "#ffffff",
    bg: "#0d0d0d",
    surface: "#1a1a1a",
    card: "#241a1f",
    focus: "#3d1a2d"
  },
  {
    id: "White",
    label: "White",
    accent: "#f5f5f5",
    onAccent: "#111111",
    bg: "#0d0d0d",
    surface: "#1a1a1a",
    card: "#222222",
    focus: "#303030"
  }
];

export const CATEGORIES = [
  {
    id: "you",
    label: "You",
    icon: "person",
    rows: [
      {
        t: "nav",
        page: "account",
        title: "Account",
        sub: "Account and sync status",
        icon: null
      },
      {
        t: "nav",
        page: "profiles",
        title: "Switch Profile",
        sub: "Change to a different profile.",
        icon: null
      }
    ]
  },
  {
    id: "look",
    label: "Look",
    icon: "palette",
    rows: [
      {
        t: "nav",
        page: "appearance",
        title: "Appearance",
        sub: "Theme and display",
        icon: null
      },
      {
        t: "nav",
        page: "layout",
        title: "Layout",
        sub: "Home, cards, details, streams, and navigation",
        icon: null
      }
    ]
  },
  {
    id: "watch",
    label: "Media",
    icon: "play",
    rows: [
      {
        t: "nav",
        page: "content",
        title: "Content & Discovery",
        sub: "Manage addons and discovery sources.",
        icon: null
      },
      {
        t: "nav",
        page: "playback",
        title: "Playback",
        sub: "Player, subtitles, and auto-play",
        icon: null
      }
    ]
  },
  {
    id: "services",
    label: "Services",
    icon: "link",
    rows: [
      {
        t: "nav",
        page: "integrations",
        title: "Integrations",
        sub: "Manage available integrations",
        icon: null
      },
      {
        t: "nav",
        page: "tracking",
        title: "Tracking",
        sub: "Connect tracking providers and choose which one powers your Library and Continue Watching.",
        icon: null
      }
    ]
  },
  {
    id: "system",
    label: "System",
    icon: "gear",
    rows: [
      {
        t: "nav",
        page: "notifications",
        title: "Notifications",
        sub: "Manage episode release alerts and send a test notification.",
        icon: null
      },
      {
        t: "nav",
        page: "advanced",
        title: "Advanced",
        sub: "Startup and profile behavior.",
        icon: null
      },
      {
        t: "nav",
        page: "about",
        title: "About",
        sub: "App info, updates, and acknowledgements",
        icon: null
      }
    ]
  }
];

export const PAGES = {
  account: {
    id: "account",
    title: "Account",
    parent: "you",
    rows: [
      {
        t: "action",
        id: "signout",
        title: "Switch Profile",
        sub: "Back to the profile picker.",
        danger: false
      },
      {
        t: "action",
        id: "deleteProfile",
        title: "Delete This Profile",
        sub: "Remove this profile and its library, progress and watched history from this device.",
        danger: true
      }
    ],
    custom: "account"
  },
  appearance: {
    id: "appearance",
    title: "Appearance",
    parent: "look",
    rows: [
      {
        t: "section",
        title: "THEME"
      },
      {
        t: "themes"
      },
      {
        t: "section",
        title: "DISPLAY"
      },
      {
        t: "toggle",
        pref: "amoled",
        title: "AMOLED Black",
        sub: "Use pure black backgrounds for OLED screens.",
        def: false
      }
    ],
    custom: null
  },
  layout: {
    id: "layout",
    title: "Layout",
    parent: "look",
    rows: [
      {
        t: "section",
        title: "HOME"
      },
      {
        t: "nav",
        page: "homescreen",
        title: "Home Layout",
        sub: "Adjust home layout, content visibility, and poster behavior",
        icon: null
      },
      {
        t: "nav",
        page: "collections",
        title: "Collections",
        sub: "Create custom catalog groupings with folders shown on Home.",
        icon: null
      },
      {
        t: "nav",
        page: "cw",
        title: "Continue Watching",
        sub: "Settings for the Continue Watching section.",
        icon: null
      },
      {
        t: "nav",
        page: "poster",
        title: "Poster Card Style",
        sub: "Tune card width and corner radius.",
        icon: null
      },
      {
        t: "section",
        title: "STREAMS"
      },
      {
        t: "nav",
        page: "streams",
        title: "Streams",
        sub: "Stream result display and badge URL rules.",
        icon: null
      },
      {
        t: "section",
        title: "DETAIL PAGE"
      },
      {
        t: "nav",
        page: "meta",
        title: "Detail Page",
        sub: "Settings for the detail and episode screens.",
        icon: null
      },
      {
        t: "section",
        title: "NAVIGATION BAR"
      },
      {
        t: "toggle",
        pref: "liquidGlass",
        title: "Liquid Glass",
        sub: "Frosted-glass tab bar. Turn off for a solid bar.",
        def: true
      }
    ],
    custom: null
  },
  homescreen: {
    id: "homescreen",
    title: "Home Layout",
    parent: "layout",
    rows: [
      {
        t: "section",
        title: "HOME LAYOUT"
      },
      {
        t: "toggle",
        pref: "home.showHero",
        title: "Show Hero Section",
        sub: "Display hero carousel at top of home.",
        def: true
      },
      {
        t: "toggle",
        pref: "home.catalogType",
        title: "Show Catalog Type",
        sub: "Show type suffix next to catalog name (Movie/Series).",
        def: true
      },
      {
        t: "toggle",
        pref: "home.hideUnreleased",
        title: "Hide Unreleased Content",
        sub: "Hide movies and shows that haven't been released yet.",
        def: false
      },
      {
        t: "section",
        title: "HERO CATALOGS"
      },
      {
        t: "heroSources"
      },
      {
        t: "section",
        title: "CATALOGS"
      },
      {
        t: "catalogVisibility"
      },
      {
        t: "action",
        id: "resetHome",
        title: "Reset to Default",
        sub: null,
        danger: false
      }
    ],
    custom: null
  },
  collections: {
    id: "collections",
    title: "Collections",
    parent: "layout",
    rows: [],
    custom: "collections"
  },
  cw: {
    id: "cw",
    title: "Continue Watching",
    parent: "layout",
    rows: [
      {
        t: "section",
        title: "VISIBILITY"
      },
      {
        t: "toggle",
        pref: "cw.show",
        title: "Show Continue Watching",
        sub: "Display the Continue Watching shelf on the Home screen.",
        def: true
      },
      {
        t: "section",
        title: "POSTER CARD STYLE"
      },
      {
        t: "tiles",
        pref: "cw.style",
        opts: [
          {
            v: "card",
            l: "Card",
            d: "TV-style landscape card"
          },
          {
            v: "wide",
            l: "Wide",
            d: "Info-dense horizontal card"
          },
          {
            v: "poster",
            l: "Poster",
            d: "Artwork-first poster card"
          }
        ],
        def: "card"
      },
      {
        t: "section",
        title: "NEXT UP BEHAVIOR"
      },
      {
        t: "toggle",
        pref: "cw.episodeThumbs",
        title: "Prefer Episode Thumbnails in Continue Watching",
        sub: "Prefer episode thumbnails when available.",
        def: true
      },
      {
        t: "toggle",
        pref: "cw.furthest",
        title: "Next Up From Furthest Episode",
        sub: "Show next episode based on the furthest watched episode. Disable for rewatches to use the most recently watched episode instead.",
        def: true
      },
      {
        t: "toggle",
        pref: "cw.unaired",
        title: "Show Unaired Next Up Episodes",
        sub: "Include upcoming episodes in Continue Watching before they air.",
        def: false
      },
      {
        t: "toggle",
        pref: "cw.blur",
        title: "Blur Unwatched in Continue Watching",
        sub: "Blur unwatched episode thumbnails in Continue Watching to avoid spoilers.",
        def: false
      },
      {
        t: "section",
        title: "ON LAUNCH"
      },
      {
        t: "toggle",
        pref: "cw.resumePrompt",
        title: "Resume prompt on launch",
        sub: "Show a popup to continue where you left off when opening the app after leaving from the player.",
        def: false
      },
      {
        t: "section",
        title: "SORT ORDER"
      },
      {
        t: "select",
        pref: "cw.sort",
        title: "Sort Order",
        sub: null,
        opts: [
          {
            v: "default",
            l: "Default"
          },
          {
            v: "streaming",
            l: "Streaming Style"
          },
          {
            v: "split",
            l: "Separate Upcoming Row"
          }
        ],
        def: "default"
      }
    ],
    custom: null
  },
  poster: {
    id: "poster",
    title: "Poster Card Style",
    parent: "layout",
    rows: [
      {
        t: "section",
        title: "POSTER CARD STYLE"
      },
      {
        t: "posterPreview"
      },
      {
        t: "select",
        pref: "poster.width",
        title: "Width",
        sub: null,
        opts: [
          {
            v: 104,
            l: "Compact"
          },
          {
            v: 112,
            l: "Dense"
          },
          {
            v: 120,
            l: "Standard"
          },
          {
            v: 126,
            l: "Balanced"
          },
          {
            v: 134,
            l: "Comfort"
          },
          {
            v: 140,
            l: "Large"
          }
        ],
        def: 126
      },
      {
        t: "select",
        pref: "poster.radius",
        title: "Corner Radius",
        sub: null,
        opts: [
          {
            v: 0,
            l: "Sharp"
          },
          {
            v: 4,
            l: "Subtle"
          },
          {
            v: 8,
            l: "Classic"
          },
          {
            v: 12,
            l: "Rounded"
          },
          {
            v: 16,
            l: "Pill"
          }
        ],
        def: 12
      },
      {
        t: "toggle",
        pref: "poster.hideLabels",
        title: "Hide labels",
        sub: null,
        def: false
      },
      {
        t: "toggle",
        pref: "poster.landscape",
        title: "Landscape Posters",
        sub: null,
        def: false
      },
      {
        t: "toggle",
        pref: "poster.landscapeLogo",
        title: "Always backdrop with logo for landscape posters",
        sub: null,
        def: false
      },
      {
        t: "action",
        id: "resetPoster",
        title: "Reset to Default",
        sub: null,
        danger: false
      },
      {
        t: "section",
        title: "CUSTOM POSTER SOURCE"
      },
      {
        t: "note",
        text: "Provide a poster URL pattern from an external service. If a placeholder has no value for a given title, the original poster is used instead."
      },
      {
        t: "text",
        pref: "poster.customUrl",
        title: "CUSTOM POSTER SOURCE",
        sub: null,
        ph: "https://example.com/poster?id={id}&id_type={id_type}&type={type}",
        secret: false
      },
      {
        t: "section",
        title: "CARD DEPTH EFFECT"
      },
      {
        t: "note",
        text: "Adds a lit top edge and a soft sheen to image cards for a subtle sense of depth."
      },
      {
        t: "toggle",
        pref: "depth.on",
        title: "Enable depth effect",
        sub: null,
        def: false
      },
      {
        t: "select",
        pref: "depth.edge",
        title: "Edge glow",
        sub: null,
        opts: [
          {
            v: "subtle",
            l: "Subtle"
          },
          {
            v: "balanced",
            l: "Balanced"
          },
          {
            v: "bold",
            l: "Bold"
          }
        ],
        def: "balanced"
      },
      {
        t: "select",
        pref: "depth.sheen",
        title: "Top sheen",
        sub: null,
        opts: [
          {
            v: "off",
            l: "Off"
          },
          {
            v: "soft",
            l: "Soft"
          },
          {
            v: "bright",
            l: "Bright"
          }
        ],
        def: "soft"
      }
    ],
    custom: null
  },
  streams: {
    id: "streams",
    title: "Streams",
    parent: "layout",
    rows: [
      {
        t: "section",
        title: "FUSION STYLE"
      },
      {
        t: "toggle",
        pref: "streams.sizeBadges",
        title: "Size badges",
        sub: "Show file size badges in stream results and player source panels.",
        def: true
      },
      {
        t: "select",
        pref: "streams.badgePos",
        title: "Badge position",
        sub: null,
        opts: [
          {
            v: "top",
            l: "Top"
          },
          {
            v: "bottom",
            l: "Bottom"
          }
        ],
        def: "bottom"
      },
      {
        t: "section",
        title: "DISPLAY"
      },
      {
        t: "toggle",
        pref: "streams.addonLogo",
        title: "Addon logo",
        sub: "Show addon logo and name next to stream sources.",
        def: false
      },
      {
        t: "select",
        pref: "streams.background",
        title: "Background",
        sub: "Choose the background for the streams screen.",
        opts: [
          {
            v: "cinematic",
            l: "Cinematic"
          },
          {
            v: "normal",
            l: "Normal"
          }
        ],
        def: "cinematic"
      },
      {
        t: "section",
        title: "MKV FILES"
      },
      {
        t: "select",
        pref: "streams.mkvMode",
        title: "MKV files",
        sub: "MKVs are repackaged and played in the app when their host allows it. If one can't play, the app tries another source, then offers VLC or Infuse.",
        opts: [
          {
            v: "app",
            l: "Try in the app first"
          },
          {
            v: "external",
            l: "Open in a player app"
          }
        ],
        def: "app"
      },
      {
        t: "toggle",
        pref: "pb.remux",
        title: "Repackage MKVs in the app",
        sub: "Rewraps the video and audio of MKV files as MP4 so they play here, without re-encoding. Not for DTS or TrueHD audio. AirPlay isn't available for these.",
        def: true
      },
      {
        t: "toggle",
        pref: "pb.streamRelay",
        title: "Use stream relay when needed",
        sub: "Some hosts (like TorBox) don't let the app read their files. Your relay on Cloudflare fetches them for the repackager. Only video passes through it, and only for this app.",
        def: true
      },
      {
        t: "text",
        pref: "pb.streamRelayUrl",
        title: "Stream relay address",
        sub: "Leave empty to use the one set up for you.",
        ph: "https://nuvio-relay.yourname.workers.dev",
        secret: false
      }
    ],
    custom: null
  },
  meta: {
    id: "meta",
    title: "Detail Page",
    parent: "layout",
    rows: [
      {
        t: "section",
        title: "APPEARANCE"
      },
      {
        t: "select",
        pref: "meta.background",
        title: "Background Mode",
        sub: "Choose how artwork appears behind metadata pages.",
        opts: [
          {
            v: "normal",
            l: "Normal"
          },
          {
            v: "cinematic",
            l: "Cinematic"
          },
          {
            v: "dominant",
            l: "Dominant Color"
          }
        ],
        def: "cinematic"
      },
      {
        t: "toggle",
        pref: "meta.posterTransition",
        title: "Poster Transition",
        sub: "Expand and blur posters when opening details.",
        def: true
      },
      {
        t: "toggle",
        pref: "meta.heroTrailer",
        title: "Hero Trailer Playback",
        sub: "Play trailer previews in the metadata hero when a trailer is available.",
        def: false
      },
      {
        t: "toggle",
        pref: "meta.shuffle",
        title: "Shuffle",
        sub: "Shuffle episodes from any series. Turning this off pauses shuffle.",
        def: true
      },
      {
        t: "toggle",
        pref: "meta.blurUnwatched",
        title: "Blur Unwatched Episodes",
        sub: "Blur episode thumbnails until watched to avoid spoilers.",
        def: false
      },
      {
        t: "select",
        pref: "meta.episodeCards",
        title: "Episode Cards",
        sub: "Choose how episodes are rendered on the metadata screen.",
        opts: [
          {
            v: "horizontal",
            l: "Horizontal"
          },
          {
            v: "list",
            l: "List"
          }
        ],
        def: "horizontal"
      }
    ],
    custom: null
  },
  content: {
    id: "content",
    title: "Content & Discovery",
    parent: "watch",
    rows: [
      {
        t: "section",
        title: "SEARCH"
      },
      {
        t: "toggle",
        pref: "search.recent",
        title: "Recent Searches",
        sub: "Save recent searches and show them when the search bar is focused.",
        def: true
      },
      {
        t: "section",
        title: "SOURCES"
      },
      {
        t: "nav",
        page: "addons",
        title: "Addons",
        sub: "Install, remove, refresh, and sort your content sources.",
        icon: null
      },
      {
        t: "nav",
        page: "servers",
        title: "Media servers",
        sub: "Connect Jellyfin or Emby to browse and play your own library.",
        icon: null
      },
      {
        t: "nav",
        page: "plugins",
        title: "Plugins",
        sub: "Install JavaScript scraper repositories and test providers internally.",
        icon: null
      }
    ],
    custom: null
  },
  servers: {
    id: "servers",
    title: "Media servers",
    parent: "content",
    rows: [
      {
        t: "section",
        title: "SERVERS"
      },
      {
        t: "note",
        text: "No servers connected yet."
      },
      {
        t: "section",
        title: "ADD SERVER"
      },
      {
        t: "note",
        text: "Sign in with your server address and Jellyfin / Emby user."
      },
      {
        t: "note",
        text: "Jellyfin and Emby sign-in is not available in the touch app yet."
      }
    ],
    custom: null
  },
  plugins: {
    id: "plugins",
    title: "Plugins",
    parent: "content",
    rows: [
      {
        t: "note",
        text: "Install JavaScript scraper repositories and test providers internally."
      },
      {
        t: "note",
        text: "Plugins need the JavaScript scraper runtime and are not available in the touch app yet."
      }
    ],
    custom: null
  },
  addons: {
    id: "addons",
    title: "Addons",
    parent: "content",
    rows: [],
    custom: "addons"
  },
  playback: {
    id: "playback",
    title: "Playback",
    parent: "watch",
    rows: [
      {
        t: "nav",
        page: "pb.player",
        title: "Player",
        sub: "Default player and playback engine",
        icon: null
      },
      {
        t: "nav",
        page: "pb.stream",
        title: "Stream selection",
        sub: "Choose streams automatically or reuse the last link",
        icon: null
      },
      {
        t: "nav",
        page: "pb.upnext",
        title: "Up next",
        sub: "Next episode autoplay and when to show the prompt",
        icon: null
      },
      {
        t: "nav",
        page: "pb.skip",
        title: "Skip segments",
        sub: "Skip intros, recaps, and credits",
        icon: null
      },
      {
        t: "nav",
        page: "pb.interface",
        title: "Player interface",
        sub: "Controls, overlays, touch gestures, and hold to speed",
        icon: null
      },
      {
        t: "nav",
        page: "pb.audio",
        title: "Audio",
        sub: "Preferred languages and audio output",
        icon: null
      },
      {
        t: "nav",
        page: "pb.subs",
        title: "Subtitles",
        sub: "Languages, style, and rendering",
        icon: null
      }
    ],
    custom: null
  },
  "pb.player": {
    id: "pb.player",
    title: "Player",
    parent: "playback",
    rows: [
      {
        t: "section",
        title: "PLAYER"
      },
      {
        t: "select",
        pref: "pb.playerPref",
        title: "Player",
        sub: "Choose which player handles new playback.",
        opts: [
          {
            v: "internal",
            l: "Internal"
          },
          {
            v: "external",
            l: "External"
          }
        ],
        def: "internal"
      },
      {
        t: "note",
        text: "The web player uses Safari's built-in engine. Use the open-in button on a stream to hand off to VLC, Infuse or Outplayer."
      }
    ],
    custom: null
  },
  "pb.stream": {
    id: "pb.stream",
    title: "Stream selection",
    parent: "playback",
    rows: [
      {
        t: "section",
        title: "STREAM SELECTION"
      },
      {
        t: "toggle",
        pref: "pb.reuseLink",
        title: "Reuse Last Link",
        sub: "Auto-play your last working stream for this same movie/episode when cache is still valid",
        def: false
      },
      {
        t: "section",
        title: "STREAM AUTO-PLAY"
      },
      {
        t: "select",
        pref: "pb.autoMode",
        title: "Auto Stream Selection",
        sub: null,
        opts: [
          {
            v: "manual",
            l: "Manual (choose stream)"
          },
          {
            v: "first",
            l: "Auto-play first source"
          },
          {
            v: "regex",
            l: "Auto-play regex match"
          }
        ],
        def: "manual"
      },
      {
        t: "text",
        pref: "pb.autoRegex",
        title: "Regex pattern",
        sub: 'Used by "Auto-play regex match". Checked against each stream\'s name and description, e.g. 2160p|4K.',
        ph: "2160p|4K",
        secret: false
      },
      {
        t: "select",
        pref: "pb.timeout",
        title: "Stream Selection Timeout",
        sub: "Wait time for addons before selecting.",
        opts: [
          {
            v: 0,
            l: "Instant"
          },
          {
            v: 3,
            l: "3s"
          },
          {
            v: 5,
            l: "5s"
          },
          {
            v: 10,
            l: "10s"
          },
          {
            v: 15,
            l: "15s"
          },
          {
            v: -1,
            l: "Unlimited"
          }
        ],
        def: 5
      }
    ],
    custom: null
  },
  "pb.upnext": {
    id: "pb.upnext",
    title: "Up next",
    parent: "playback",
    rows: [
      {
        t: "section",
        title: "NEXT EPISODE"
      },
      {
        t: "toggle",
        pref: "pb.autoNext",
        title: "Auto-play Next Episode",
        sub: "Start next episode automatically when prompt appears.",
        def: true
      },
      {
        t: "toggle",
        pref: "pb.binge",
        title: "Prefer Binge Group (Next Episode)",
        sub: "Try the same source profile first (same addon/quality group) before normal auto-play rules.",
        def: true
      },
      {
        t: "toggle",
        pref: "pb.preload",
        title: "Preload Next Episode Sources",
        sub: "Start searching for sources in the background before the next episode button appears.",
        def: false
      },
      {
        t: "select",
        pref: "pb.threshMode",
        title: "Next Episode Threshold Mode",
        sub: null,
        opts: [
          {
            v: "pct",
            l: "Percentage"
          },
          {
            v: "min",
            l: "Minutes before end"
          }
        ],
        def: "pct"
      },
      {
        t: "slider",
        pref: "pb.threshPct",
        title: "Threshold Percentage",
        min: 90,
        max: 99,
        step: 1,
        def: 95,
        unit: "%"
      },
      {
        t: "slider",
        pref: "pb.threshMin",
        title: "Minutes Before End",
        min: 1,
        max: 10,
        step: 1,
        def: 2,
        unit: " min"
      }
    ],
    custom: null
  },
  "pb.skip": {
    id: "pb.skip",
    title: "Skip segments",
    parent: "playback",
    rows: [
      {
        t: "section",
        title: "SKIP SEGMENTS"
      },
      {
        t: "toggle",
        pref: "pb.skipIntro",
        title: "Skip Intro",
        sub: "Show a Skip button during intros, recaps and credits.",
        def: true
      },
      {
        t: "toggle",
        pref: "pb.autoSkip",
        title: "Automatic Skipping",
        sub: "Skip them without tapping.",
        def: false
      },
      {
        t: "section",
        title: "SOURCES"
      },
      {
        t: "note",
        text: "Built in: TheIntroDB for TV shows and movies (uses your TMDB key) and AniSkip for anime. Optional: IntroDB as an extra source, through a small free relay (see relay/README.md in the GitHub repo); paste its address below."
      },
      {
        t: "text",
        pref: "pb.skipRelay",
        title: "IntroDB relay address (optional)",
        sub: "For example https://introdb-relay.yourname.workers.dev",
        ph: "https://…workers.dev",
        secret: false
      }
    ],
    custom: null
  },
  "pb.interface": {
    id: "pb.interface",
    title: "Player interface",
    parent: "playback",
    rows: [
      {
        t: "toggle",
        pref: "pb.loadingStatus",
        title: "Show loading status",
        sub: "Display step-by-step progress while the player is initializing.",
        def: true
      },
      {
        t: "toggle",
        pref: "pb.pauseOverlay",
        title: "Pause Overlay",
        sub: "Show details overlay after 5 seconds while paused.",
        def: true
      },
      {
        t: "toggle",
        pref: "pb.parental",
        title: "Content Warnings",
        sub: "Show parental guidance overlay when playback starts.",
        def: true
      },
      {
        t: "toggle",
        pref: "pb.gestures",
        title: "Touch Gestures",
        sub: "Double-tap the left or right side to skip 10 seconds, or swipe sideways to seek.",
        def: true
      },
      {
        t: "toggle",
        pref: "pb.holdSpeed",
        title: "Hold To Speed",
        sub: "Press and hold the video to play at 2× until you let go.",
        def: true
      }
    ],
    custom: null
  },
  "pb.audio": {
    id: "pb.audio",
    title: "Audio",
    parent: "playback",
    rows: [
      {
        t: "select",
        pref: "pb.audioLang",
        title: "Preferred Audio Language",
        sub: null,
        opts: [
          {
            v: "",
            l: "Default (media file)"
          },
          {
            v: "eng",
            l: "English"
          },
          {
            v: "spa",
            l: "Spanish"
          },
          {
            v: "fre",
            l: "French"
          },
          {
            v: "ger",
            l: "German"
          },
          {
            v: "ita",
            l: "Italian"
          },
          {
            v: "por",
            l: "Portuguese"
          },
          {
            v: "jpn",
            l: "Japanese"
          },
          {
            v: "kor",
            l: "Korean"
          },
          {
            v: "hin",
            l: "Hindi"
          }
        ],
        def: ""
      },
      {
        t: "select",
        pref: "pb.audioLang2",
        title: "Secondary Audio Language",
        sub: null,
        opts: [
          {
            v: "",
            l: "None"
          },
          {
            v: "eng",
            l: "English"
          },
          {
            v: "spa",
            l: "Spanish"
          },
          {
            v: "fre",
            l: "French"
          },
          {
            v: "ger",
            l: "German"
          },
          {
            v: "jpn",
            l: "Japanese"
          }
        ],
        def: ""
      },
      {
        t: "note",
        text: "Safari can switch between the audio tracks a stream includes. MKV files with several tracks usually need VLC or Infuse."
      }
    ],
    custom: null
  },
  "pb.subs": {
    id: "pb.subs",
    title: "Subtitles",
    parent: "playback",
    rows: [
      {
        t: "select",
        pref: "subs.lang",
        title: "Preferred Language",
        sub: null,
        opts: [
          {
            v: "",
            l: "None"
          },
          {
            v: "eng",
            l: "English"
          },
          {
            v: "spa",
            l: "Spanish"
          },
          {
            v: "fre",
            l: "French"
          },
          {
            v: "ger",
            l: "German"
          },
          {
            v: "ita",
            l: "Italian"
          },
          {
            v: "por",
            l: "Portuguese"
          },
          {
            v: "pob",
            l: "Portuguese (Brazil)"
          },
          {
            v: "ara",
            l: "Arabic"
          },
          {
            v: "hin",
            l: "Hindi"
          },
          {
            v: "tur",
            l: "Turkish"
          },
          {
            v: "rus",
            l: "Russian"
          },
          {
            v: "jpn",
            l: "Japanese"
          },
          {
            v: "kor",
            l: "Korean"
          },
          {
            v: "chi",
            l: "Chinese"
          },
          {
            v: "dut",
            l: "Dutch"
          },
          {
            v: "pol",
            l: "Polish"
          },
          {
            v: "swe",
            l: "Swedish"
          }
        ],
        def: ""
      },
      {
        t: "select",
        pref: "subs.lang2",
        title: "Secondary Preferred Language",
        sub: null,
        opts: [
          {
            v: "",
            l: "None"
          },
          {
            v: "eng",
            l: "English"
          },
          {
            v: "spa",
            l: "Spanish"
          },
          {
            v: "fre",
            l: "French"
          },
          {
            v: "ger",
            l: "German"
          },
          {
            v: "ita",
            l: "Italian"
          },
          {
            v: "por",
            l: "Portuguese"
          },
          {
            v: "pob",
            l: "Portuguese (Brazil)"
          },
          {
            v: "ara",
            l: "Arabic"
          },
          {
            v: "hin",
            l: "Hindi"
          },
          {
            v: "tur",
            l: "Turkish"
          },
          {
            v: "rus",
            l: "Russian"
          },
          {
            v: "jpn",
            l: "Japanese"
          },
          {
            v: "kor",
            l: "Korean"
          },
          {
            v: "chi",
            l: "Chinese"
          },
          {
            v: "dut",
            l: "Dutch"
          },
          {
            v: "pol",
            l: "Polish"
          },
          {
            v: "swe",
            l: "Swedish"
          }
        ],
        def: ""
      },
      {
        t: "toggle",
        pref: "subs.stripSdh",
        title: "Strip SDH Subtitles",
        sub: "Hide sound descriptions and speaker labels from text subtitles.",
        def: false
      },
      {
        t: "toggle",
        pref: "subs.forced",
        title: "Use Forced Subtitles",
        sub: "Prefer forced subtitles when audio matches the subtitle language; if unavailable, select nothing.",
        def: false
      },
      {
        t: "toggle",
        pref: "subs.preferredOnly",
        title: "Show Only Preferred Languages",
        sub: "Only show subtitles matching your preferred subtitle languages.",
        def: false
      },
      {
        t: "toggle",
        pref: "subs.builtin",
        title: "Built-in OpenSubtitles",
        sub: "Find subtitles on OpenSubtitles when none of your add-ons provide them.",
        def: true
      },
      {
        t: "subPreview"
      },
      {
        t: "slider",
        pref: "subs.size",
        title: "Subtitle Size",
        min: 60,
        max: 160,
        step: 5,
        def: 100,
        unit: "%"
      },
      {
        t: "toggle",
        pref: "subs.bold",
        title: "Bold",
        sub: null,
        def: false
      },
      {
        t: "select",
        pref: "subs.color",
        title: "Text Color",
        sub: null,
        opts: [
          {
            v: "#ffffff",
            l: "White"
          },
          {
            v: "#ffd60a",
            l: "Yellow"
          },
          {
            v: "#64d2ff",
            l: "Cyan"
          },
          {
            v: "#ff453a",
            l: "Red"
          },
          {
            v: "#30d158",
            l: "Green"
          },
          {
            v: "#bf5af2",
            l: "Purple"
          },
          {
            v: "#ff9f0a",
            l: "Orange"
          }
        ],
        def: "#ffffff"
      },
      {
        t: "slider",
        pref: "subs.bgOpacity",
        title: "Background opacity",
        min: 0,
        max: 100,
        step: 5,
        def: 0,
        unit: "%"
      },
      {
        t: "toggle",
        pref: "subs.outline",
        title: "Outline",
        sub: null,
        def: true
      },
      {
        t: "toggle",
        pref: "subs.shadow",
        title: "Drop shadow",
        sub: "Separate the text from bright scenes.",
        def: false
      },
      {
        t: "slider",
        pref: "subs.offset",
        title: "Vertical Offset",
        min: 0,
        max: 200,
        step: 5,
        def: 20,
        unit: "pt"
      },
      {
        t: "action",
        id: "resetSubs",
        title: "Reset appearance",
        sub: null,
        danger: false
      }
    ],
    custom: null
  },
  integrations: {
    id: "integrations",
    title: "Integrations",
    parent: "services",
    rows: [
      {
        t: "section",
        title: "INTEGRATIONS"
      },
      {
        t: "nav",
        page: "tmdb",
        title: "TMDB Enrichment",
        sub: "Metadata enrichment controls",
        icon: null
      },
      {
        t: "nav",
        page: "mdblist",
        title: "MDBList Ratings",
        sub: "External ratings providers",
        icon: null
      },
      {
        t: "nav",
        page: "debrid",
        title: "Connected Services",
        sub: "Connect accounts for links and library access",
        icon: null
      }
    ],
    custom: null
  },
  tmdb: {
    id: "tmdb",
    title: "TMDB Enrichment",
    parent: "integrations",
    rows: [
      {
        t: "section",
        title: "TMDB ENRICHMENT"
      },
      {
        t: "toggle",
        pref: "tmdb.on",
        title: "Enable TMDB Enrichment",
        sub: "Use TMDB as a metadata source to enhance addon data",
        def: true
      },
      {
        t: "text",
        pref: "tmdb.key",
        title: "Personal API key",
        sub: "Use your own TMDB API key (v3 key or v4 read token). Leave blank to use the app's built-in key, if it has one.",
        ph: "",
        secret: true
      },
      {
        t: "text",
        pref: "tmdb.lang",
        title: "Language",
        sub: "Language for titles, logos and descriptions, e.g. en-US or fr-FR.",
        ph: "en-US",
        secret: false
      },
      {
        t: "section",
        title: "MODULES"
      },
      {
        t: "toggle",
        pref: "tmdb.m.trailers",
        title: "Trailers",
        sub: "Trailer candidates from TMDB videos for the detail trailer section",
        def: true
      },
      {
        t: "toggle",
        pref: "tmdb.m.artwork",
        title: "Artwork",
        sub: "Logo and backdrop images from TMDB",
        def: true
      },
      {
        t: "toggle",
        pref: "tmdb.m.basic_info",
        title: "Basic Info",
        sub: "Description, genres, and rating from TMDB",
        def: true
      },
      {
        t: "toggle",
        pref: "tmdb.m.details",
        title: "Details",
        sub: "Runtime, status, country, and language from TMDB",
        def: true
      },
      {
        t: "toggle",
        pref: "tmdb.m.credits",
        title: "Credits",
        sub: "Cast with photos, director, and writer from TMDB",
        def: true
      },
      {
        t: "toggle",
        pref: "tmdb.m.production_companies",
        title: "Productions",
        sub: "Production companies from TMDB",
        def: true
      },
      {
        t: "toggle",
        pref: "tmdb.m.networks",
        title: "Networks",
        sub: "Networks with logos from TMDB",
        def: true
      },
      {
        t: "toggle",
        pref: "tmdb.m.episodes",
        title: "Episodes",
        sub: "Episode titles, overviews, thumbnails, and runtime from TMDB",
        def: true
      },
      {
        t: "toggle",
        pref: "tmdb.m.season_posters",
        title: "Season posters",
        sub: "Use TMDB season posters in the metadata screen season selector for series.",
        def: true
      },
      {
        t: "toggle",
        pref: "tmdb.m.more_like_this",
        title: "More Like This",
        sub: "TMDB recommendation backdrops on detail page",
        def: true
      },
      {
        t: "toggle",
        pref: "tmdb.m.collections",
        title: "Collections",
        sub: "TMDB movie collections in release order",
        def: true
      }
    ],
    custom: null
  },
  mdblist: {
    id: "mdblist",
    title: "MDBList Ratings",
    parent: "integrations",
    rows: [
      {
        t: "section",
        title: "MDBList RATINGS"
      },
      {
        t: "toggle",
        pref: "mdb.on",
        title: "Enable MDBList Ratings",
        sub: "Fetch ratings from external providers in metadata detail screen",
        def: false
      },
      {
        t: "toggle",
        pref: "mdb.hero",
        title: "Use Ratings on Hero",
        sub: "Show MDBList ratings on the home hero",
        def: false
      },
      {
        t: "section",
        title: "API KEY"
      },
      {
        t: "text",
        pref: "mdb.key",
        title: "API Key",
        sub: "Your MDBList API key, from mdblist.com/preferences. It's needed for ratings and saved on this device only.",
        ph: "",
        secret: true
      }
    ],
    custom: null
  },
  debrid: {
    id: "debrid",
    title: "Connected Services",
    parent: "integrations",
    rows: [
      {
        t: "section",
        title: "CONNECTED SERVICES"
      },
      {
        t: "note",
        text: "Debrid accounts (Real-Debrid, TorBox, Premiumize and others) are set up on each add-on's own configure page, for example Torrentio. Install the configured add-on and its streams play here. Browsing a cloud library directly isn't available on the web."
      }
    ],
    custom: null
  },
  tracking: {
    id: "tracking",
    title: "Tracking",
    parent: "services",
    rows: [],
    custom: "tracking"
  },
  notifications: {
    id: "notifications",
    title: "Notifications",
    parent: "system",
    rows: [
      {
        t: "section",
        title: "NEW EPISODES"
      },
      {
        t: "toggle",
        pref: "notif.episodes",
        title: "Check when the app opens",
        sub: "Looks for new episodes of your saved shows each time you open Nuvio.",
        def: false
      },
      {
        t: "section",
        title: "ALERTS SERVICE"
      },
      {
        t: "text",
        pref: "notif.relay",
        title: "Alerts service address",
        sub: "Your alerts worker, e.g. https://nuvio-alerts.yourname.workers.dev. Setup steps: relay/README.md in the project.",
        ph: "https://nuvio-alerts.yourname.workers.dev",
        secret: false
      }
    ],
    custom: "notifications"
  },
  advanced: {
    id: "advanced",
    title: "Advanced",
    parent: "system",
    rows: [
      {
        t: "section",
        title: "STARTUP"
      },
      {
        t: "toggle",
        pref: "adv.rememberProfile",
        title: "Remember Last Profile",
        sub: "Remember last selected profile at startup",
        def: true
      },
      {
        t: "section",
        title: "CACHE"
      },
      {
        t: "action",
        id: "clearCw",
        title: "Clear Continue Watching Cache",
        sub: "Remove cached Continue Watching data and refresh watch progress",
        danger: false
      },
      {
        t: "section",
        title: "SETTINGS"
      },
      {
        t: "action",
        id: "exportSettings",
        title: "Export Settings",
        sub: "Save your settings to a file."
      },
      {
        t: "action",
        id: "importSettings",
        title: "Import Settings",
        sub: "Load settings from a file."
      },
      {
        t: "section",
        title: "THIS DEVICE"
      },
      {
        t: "action",
        id: "reset",
        title: "Reset this device",
        sub: "Delete all profiles, add-ons, library and progress stored here",
        danger: true
      }
    ],
    custom: null
  },
  about: {
    id: "about",
    title: "About",
    parent: "system",
    rows: [
      {
        t: "section",
        title: "ABOUT"
      },
      {
        t: "link",
        title: "Supporters & Contributors",
        sub: "Open recognition and project credits",
        href: "https://github.com/NuvioMedia/NuvioMobile/graphs/contributors"
      },
      {
        t: "link",
        title: "Privacy Policy",
        sub: "Learn how Nuvio handles your data",
        href: "https://nuvioapp.space/privacy"
      },
      {
        t: "link",
        title: "Licenses & Attribution",
        sub: "Data sources, acknowledgements, and platform licenses",
        href: "https://github.com/NuvioMedia/NuvioMobile/blob/main/LICENSE"
      },
      {
        t: "link",
        title: "Check for updates",
        sub: "Download latest release",
        href: "https://github.com/kai122/kai122-NuvioWeb"
      }
    ],
    custom: "about"
  }
};
