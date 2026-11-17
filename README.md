<div align="center">

# ForgeLinked v2 🌋
A music extension for ForgeScript that adds Lavalink-based audio playback.

[![Forgescript](https://img.shields.io/github/package-json/v/tryforge/ForgeScript/main?label=@tryforge/forgescript&color=5c16d4)](https://github.com/tryforge/ForgeScript) [![Lavalink-Client](https://img.shields.io/github/package-json/v/Tomato6966/lavalink-client/main?label=Tomato6966/lavalink-client&color=ed9953)](https://github.com/Tomato6966/lavalink-client)

</div>

## ✨ Features
- Simple and easy-to-use ForgeScript functions
- Support for multiple event listeners
- Support for different audio providers
- Playlist & queue management
- Lavalink v4 ready

## 📦 Installation

> [!NOTE]
> Required Git

Install via npm, yarn, pnpm etc:

```bash
npm install https://github.com/GreenVGJR/ForgeLinked
```

## 🚀 Setup

A complete `index.js` main file:

```js
const { ForgeClient } = require('@tryforge/forgescript')
const { ForgeLinked } = require('@tryforge/forge.linked')
require('dotenv').config()

const lavalink = new ForgeLinked({
  nodes: [
    {
      id: 'serenetia',
      host: 'lavalinkv4.serenetia.com',
      port: 443,
      authorization: 'https://seretia.link/discord',
      secure: true,
      retryAmount: 5,
      retryDelay: 5000,
    },
  ],
  // You can find public Lavalink nodes online or host your own:
  // https://github.com/PerformanC/NodeLink

  // Manager behavior
  autoSkip: true,
  autoSkipOnResolveError: true,
  emitNewSongsOnly: true, // Emit linkedTrackStart event only when the track identifier changes (false = also on repeat/loop)
  autoMove: true, // Auto switch nodes
  catchLifeCycleRejections: true, // Catch internal fire-and-forget playback rejections
  enableDebugEvents: false, // set true to receive linkedDebug
  decoupleAutoplay: true, // false = wait for autoplay before trackEnd/queueEnd

  // Autoplay
  // These options only affect the **built-in** autoplay engine.
  // Autoplay must also be enabled per-player using `$playerSetAutoPlay` or `$playerToggleAutoPlay`.
  defaultAutoPlaySource: 'youtube',
  autoplayOptions: {
    maxFetchTracks: 1, // maximum tracks to queue per trigger (pre-fills the queue)
    retryLimit: 3, // retries if no track could be added
    retryDuration: 5000, // delay (ms) between retries
  },

  // Override the built-in autoplay engine entirely:
  // autoPlayFunction: async (player, lastPlayedTrack) => {},
  // requesterTransformer: (requester) => requester,

  playerOptions: {
    applyVolumeAsFilter: false,
    clientBasedPositionUpdateInterval: 50,
    defaultSearchPlatform: 'youtube',
    volumeDecrementer: 0.75,
    useUnresolvedData: true,
    onDisconnect: {
      autoReconnect: true,
      destroyPlayer: false,
    },
    onEmptyQueue: {
      destroyAfterMs: 30_000,
    },
  },

  queueOptions: {
    maxPreviousTracks: 25,
  },

  // Link filtering
  linksAllowed: true,
  linksBlacklist: [],
  linksWhitelist: [],

  // Only the events listed here are registered. Remove what you do not use.
  events: [
    'error',

    // Player
    'linkedPlayerCreate',
    'linkedPlayerDestroy',
    'linkedPlayerDisconnect',
    'linkedPlayerMove',
    'linkedPlayerSocketClosed',
    'linkedPlayerUpdate',
    'linkedPlayerMuteChange',
    'linkedPlayerDeafChange',
    'linkedPlayerSuppressChange',
    'linkedPlayerQueueEmptyStart',
    'linkedPlayerQueueEmptyEnd',
    'linkedPlayerQueueEmptyCancel',
    'linkedPlayerVoiceJoin',
    'linkedPlayerVoiceLeave',

    // Track / queue
    'linkedTrackStart',
    'linkedTrackEnd',
    'linkedTrackStuck',
    'linkedTrackError',
    'linkedQueueEnd',

    // Node lifecycle
    'linkedNodeConnect',
    'linkedNodeDisconnect',
    'linkedNodeReconnecting',
    'linkedNodeDestroy',
    'linkedNodeResumed',
    'linkedNodeError',

    // Lyrics / chapters / segments (NodeLink or plugin support required)
    'linkedLyricsLine',
    'linkedLyricsFound',
    'linkedLyricsNotFound',
    'linkedChaptersLoaded',
    'linkedChapterStarted',
    'linkedSegmentsLoaded',
    'linkedSegmentSkipped',

    // Requires enableDebugEvents: true
    // 'linkedDebug',
  ],
})

const client = new ForgeClient({
  intents: [
    'Guilds',
    'GuildMessages',
    'MessageContent',
    'GuildVoiceStates',
  ],
  events: ['messageCreate', 'interactionCreate'],
  extensions: [lavalink],
  prefixes: ['.'],
})

// client.commands.load('./commands')
// client.applicationCommands.load('./slash')

client.login(process.env.BOT_TOKEN)
```

## 💡 Tips

### Default Search Engine

Set a default search engine in `playerOptions`:

```js
const lavalink = new ForgeLinked({
  playerOptions: {
    defaultSearchPlatform: 'youtube'
  }
})
```

Available:

* `youtube`
* `youtube music`
* `soundcloud`
* `bandcamp`
* `spotify`
* `apple music`
* `deezer`
* `yandex music`
* `vk music`
* `tidal`
* `qobuz`
* `pandora`
* `jiosaavn`
* `flowery` (TTS)

Plugin-backed providers such as Spotify, Apple Music, Deezer, Yandex Music, VK Music, Tidal, Qobuz, Pandora, JioSaavn, and Flowery require the matching Lavalink plugin/source manager to be enabled.

## 📄 License

ForgeLinked v2 is licensed under the **GPL-3 License**.
