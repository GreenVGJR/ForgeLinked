import { EventManager, ForgeClient, ForgeExtension, Logger } from '@tryforge/forgescript'
import {
  LavalinkManager,
  LavalinkNodeOptions,
  Player,
  PlayerEvents,
  SearchPlatform,
  Track,
} from 'lavalink-client'
import path from 'path'
import { TypedEmitter } from 'tiny-typed-emitter'

import { PlayerRelatingManager } from './managers/playerRelating.js'
import { ForgeLinkedCommandManager } from './structures/ForgeLinkedCommandManager.js'
import { IForgeLinkedEvents } from './structures/ForgeLinkedEventManager.js'

/* -------------------------------------------------------------------------- */
/*                                Type Options                                */
/* -------------------------------------------------------------------------- */

export interface ForgeLinkSetupOptions {
  nodes: LavalinkNodeOptions[]
  defaultVolume?: number
  autoSkip?: boolean
  autoSkipOnResolveError?: boolean
  emitNewSongsOnly?: boolean
  /**
   * Move players to another healthy node when their current node disconnects.
   * Only takes effect when another connected node is available. Defaults to true.
   */
  autoMove?: boolean
  /**
   * Catch lifecycle promise rejections from lavalink-client instead of letting
   * them become unhandled rejections (which can terminate Node). Defaults to true.
   */
  catchLifeCycleRejections?: boolean
  /**
   * Enable lavalink-client debug events. Required for the `linkedDebug` event
   * to fire. Defaults to false.
   */
  enableDebugEvents?: boolean
  /**
   * Run autoplay outside lavalink-client's queueEnd await cycle so
   * linkedTrackEnd / linkedQueueEnd fire immediately, then start the autoplay
   * track when it arrives. Set to false to restore the old blocking behavior.
   * Defaults to true.
   */
  decoupleAutoplay?: boolean
  requesterTransformer?: (requester: unknown) => unknown
  /**
   * Custom autoplay function. When provided, this fully overrides the built-in
   * autoplay behaviour. The function receives the player and the last played
   * track and should add at least one track to the queue to keep playback going.
   */
  autoPlayFunction?: (player: Player, lastPlayedTrack: Track) => Promise<void>
  /**
   * Default search platform used by the built-in autoplay engine when looking
   * up related tracks. Defaults to the player's `defaultSearchPlatform`.
   * Common values: `'ytsearch'`, `'ytmsearch'`, `'scsearch'`.
   */
  defaultAutoPlaySource?: SearchPlatform
  events?: Array<keyof IForgeLinkedEvents>
  playerOptions?: {
    applyVolumeAsFilter?: boolean
    clientBasedPositionUpdateInterval?: number
    defaultSearchPlatform?: SearchPlatform
    volumeDecrementer?: number
    useUnresolvedData?: boolean
    onDisconnect?: {
      autoReconnect?: boolean
      destroyPlayer?: boolean
    }
    onEmptyQueue?: {
      destroyAfterMs?: number
    }
  }
  queueOptions?: {
    maxPreviousTracks?: number
  }
  autoplayOptions?: {
    maxFetchTracks?: number
    retryLimit?: number
    retryDuration?: number
  }
  linksAllowed?: boolean
  linksBlacklist?: string[]
  linksWhitelist?: string[]
}

export type TransformEvents<T> = {
  [P in keyof T]: T[P] extends unknown[] ? (...args: T[P]) => void : never
}

/* -------------------------------------------------------------------------- */
/*                               ForgeLink Class                              */
/* -------------------------------------------------------------------------- */

export class ForgeLinked extends ForgeExtension {
  name = 'ForgeLink'
  description = 'ForgeScript integration with lavalink-client'
  version = '2.3.0'

  public client!: ForgeClient
  public lavalink!: LavalinkManager
  public commands!: ForgeLinkedCommandManager

  private emitter = new TypedEmitter<TransformEvents<IForgeLinkedEvents>>()
  private lastEndedTrack = new Map<string, { track: any; payload: any }>()
  private pendingAutoplay = new Set<string>()

  constructor(private readonly options: ForgeLinkSetupOptions) {
    super()
  }

  async init(client: ForgeClient) {
    const start = Date.now()
    this.client = client
    this.lavalink = new LavalinkManager({
      nodes: this.options.nodes,
      sendToShard: (guildId, payload) => {
        const guild = this.client.guilds.cache.get(guildId)
        if (guild) guild.shard.send(payload)
        return Promise.resolve()
      },
      autoSkip: this.options.autoSkip ?? true,
      autoSkipOnResolveError: this.options.autoSkipOnResolveError ?? true,
      emitNewSongsOnly: this.options.emitNewSongsOnly ?? true,
      autoMove: this.options.autoMove ?? true,
      catchLifeCycleRejections: this.options.catchLifeCycleRejections ?? true,
      advancedOptions: {
        enableDebugEvents: this.options.enableDebugEvents ?? false,
      },
      playerOptions: {
        applyVolumeAsFilter: this.options.playerOptions?.applyVolumeAsFilter ?? false,
        clientBasedPositionUpdateInterval:
          this.options.playerOptions?.clientBasedPositionUpdateInterval ?? 50,
        defaultSearchPlatform:
          this.options.playerOptions?.defaultSearchPlatform ?? ('ytsearch' as SearchPlatform),
        volumeDecrementer: this.options.playerOptions?.volumeDecrementer ?? 0.75,
        useUnresolvedData: this.options.playerOptions?.useUnresolvedData ?? true,
        requesterTransformer: this.options.requesterTransformer,
        onDisconnect: {
          autoReconnect: this.options.playerOptions?.onDisconnect?.autoReconnect ?? true,
          destroyPlayer: this.options.playerOptions?.onDisconnect?.destroyPlayer ?? false,
        },
        onEmptyQueue: {
          destroyAfterMs: this.options.playerOptions?.onEmptyQueue?.destroyAfterMs ?? 30000,
          autoPlayFunction: this._buildAutoPlayFunction(),
        },
      },
      queueOptions: {
        maxPreviousTracks: this.options.queueOptions?.maxPreviousTracks ?? 10,
      },
      linksAllowed: this.options.linksAllowed ?? true,
      linksBlacklist: this.options.linksBlacklist ?? [],
      linksWhitelist: this.options.linksWhitelist ?? [],
    })

    this.commands = new ForgeLinkedCommandManager(this.client)

    this.lavalink.on('trackStart', (_player, track) => {
      if ((track as any)?.pluginInfo?.clientData?.previousTrack) {
        delete (track as any).pluginInfo.clientData.previousTrack
      }
    })

    // lavalink-client does not emit trackEnd for the last track when the queue
    // empties; queueEnd is emitted instead. Emit the missing trackEnd once,
    // before the generic queueEnd forwarding below, so listeners still see
    // end -> queueEnd (and end -> start when autoplay picks a new track).
    this.lavalink.on('trackEnd', (player, track, payload) =>
      this._handleTrackEnd(player, track, payload),
    )
    this.lavalink.on('queueEnd', (player, track, payload) =>
      this._handleQueueEnd(player, track, payload),
    )
    this.lavalink.on('playerDestroy', (player) => {
      this.lastEndedTrack.delete(player.guildId)
      this.pendingAutoplay.delete(player.guildId)
    })

    // While a background autoplay lookup is pending, keep the player alive
    // long enough for it to finish instead of letting the queue-empty timer
    // destroy it mid-search.
    this.lavalink.on('playerQueueEmptyStart', (player, timeoutMs) =>
      this._handleQueueEmptyStart(player, timeoutMs),
    )

    EventManager.load('ForgeLinked', __dirname + `/events`)
    if (this.options.events?.length) {
      this.client.events.load('ForgeLinked', this.options.events)
    }

    const sendRawData = (packet: any, attempts = 0): void => {
      this.lavalink.sendRawData(packet).catch((err) => {
        const message = err instanceof Error ? err.message : String(err)
        const nodeNotReady =
          message.includes('Lavalink Node is either not ready or not up to date') ||
          message.includes('Lavalink-Node is either not ready or not up to date')

        if (nodeNotReady) {
          if (attempts < 5) setTimeout(() => sendRawData(packet, attempts + 1), 1000)
          return
        }

        console.error('Failed to send raw data to Lavalink:', err)
      })
    }

    client.on('raw', sendRawData)

    this.load(path.join(__dirname, './natives'))
    client.on('clientReady', async () => {
      // Register node listeners BEFORE init() so we never miss a node
      // connection or lifecycle event - including fallback reconnects when
      // one of multiple nodes fails during initialisation and comes back later.
      this.lavalink.nodeManager.on('connect', (node) => {
        const snapshot = this._nodeSnapshot(node)

        // The 0-key keeps the old `$linkedEvent[node][0]` shape working while
        // new scripts can use `$linkedEvent[node;id]` directly.
        this.emitter.emit('linkedNodeConnect', {
          ...snapshot,
          0: { id: snapshot.id, info: snapshot.info },
        })
      })

      this.lavalink.nodeManager.on('disconnect', (node, payload) => {
        this.emitter.emit('linkedNodeDisconnect', this._nodeSnapshot(node), payload)
      })

      this.lavalink.nodeManager.on('reconnecting', (node) => {
        this.emitter.emit('linkedNodeReconnecting', this._nodeSnapshot(node))
      })

      this.lavalink.nodeManager.on('destroy', (node, reason) => {
        this.emitter.emit('linkedNodeDestroy', this._nodeSnapshot(node), reason)
      })

      this.lavalink.nodeManager.on('resumed', (node, payload, players) => {
        this.emitter.emit('linkedNodeResumed', this._nodeSnapshot(node), payload, players)
      })

      try {
        await this.lavalink.init({
          id: client.user.id,
          username: client.user.username,
        })
      } catch (err) {
        // One or more nodes failed to connect on startup.
        // We intentionally do NOT return here - remaining nodes may still be
        // healthy, and failed nodes will fire 'connect' via the listener above
        // once they come back (fallback behaviour).
        Logger.error('Lavalink failed to initialize:', err)
        this._emitError(err)
      }
    })

    if (this.options.events?.length) {
      // Node lifecycle events are emitted directly from nodeManager listeners,
      // not from LavalinkManager, so they must not be forwarded here.
      const nodeLifecycleEvents = new Set<keyof IForgeLinkedEvents>([
        'linkedNodeConnect',
        'linkedNodeDisconnect',
        'linkedNodeReconnecting',
        'linkedNodeDestroy',
        'linkedNodeResumed',
        'linkedNodeError',
      ])

      for (const linkedEvent of this.options.events) {
        if (nodeLifecycleEvents.has(linkedEvent)) continue

        const lavalinkEvent = linkedEvent.startsWith('linked')
          ? linkedEvent.charAt(6).toLowerCase() + linkedEvent.slice(7)
          : linkedEvent

        this.lavalink.on(lavalinkEvent as any, (...args: unknown[]) => {
          this.emitter.emit(linkedEvent as keyof IForgeLinkedEvents, ...(args as any))
        })
      }
    }
    this.lavalink.nodeManager.on('error', (node, error) => {
      Logger.error(`Lavalink node "${node.id}" error:`, error)

      if (this.emitter.listenerCount('linkedNodeError') > 0) {
        this.emitter.emit('linkedNodeError', this._nodeSnapshot(node), this._errorInfo(error))
      }

      this._emitError(error)
    })
    console.debug(`ForgeLink: Initialized in ${Date.now() - start}ms`)
  }

  private _emitError(error: unknown) {
    if (this.emitter.listenerCount('error') === 0) return

    this.emitter.emit('error', error instanceof Error ? error : new Error(String(error)))
  }

  private _handleTrackEnd(player: Player, track: any, payload: any) {
    if (!player?.guildId) return
    this.lastEndedTrack.set(player.guildId, { track, payload })
  }

  private _handleQueueEmptyStart(player: Player, timeoutMs: any) {
    if (!this.pendingAutoplay.has(player.guildId)) return

    const timer = player.getData<any>('internal_queueempty')
    if (timer) clearTimeout(timer)

    player.setData('internal_queueempty', undefined)
    player.setData(
      'forgelinked_queueempty_delay',
      typeof timeoutMs === 'number' ? timeoutMs : 30000,
    )
  }

  private _deferQueueEmptyTimer(player: Player) {
    if (!this.pendingAutoplay.has(player.guildId)) return

    // playerQueueEmptyStart is emitted before lavalink-client installs its
    // timeout, so clear the timer again once queueEnd is emitted.
    const timer = player.getData<any>('internal_queueempty')
    if (timer) clearTimeout(timer)

    player.setData('internal_queueempty', undefined)
  }

  private _finishQueueEmptyWait(player: Player) {
    const delay = player.getData<number>('forgelinked_queueempty_delay')
    if (typeof delay !== 'number') return

    player.deleteData('forgelinked_queueempty_delay')
    if (!this.lavalink.players.has(player.guildId)) return

    if (player.playing || player.queue.current || player.queue.tracks.length > 0) {
      this.lavalink.emit('playerQueueEmptyCancel', player)
      return
    }

    this._armQueueEmptyTimer(player, delay)
  }

  private _armQueueEmptyTimer(player: Player, delay: number) {
    const timer = player.getData<any>('internal_queueempty')
    if (timer) clearTimeout(timer)

    player.setData(
      'internal_queueempty',
      setTimeout(
        () => {
          player.setData('internal_queueempty', undefined)
          if (!this.lavalink.players.has(player.guildId)) return
          if (player.queue.current) {
            this.lavalink.emit('playerQueueEmptyCancel', player)
            return
          }

          this.lavalink.emit('playerQueueEmptyEnd', player)
          player.destroy('QueueEmpty').catch((error) => {
            if (!this.lavalink.options.catchLifeCycleRejections) throw error
          })
        },
        Math.max(delay, 0),
      ),
    )
  }

  private _handleQueueEnd(player: Player, track: any, payload: any) {
    if (!player?.guildId) return

    this._deferQueueEmptyTimer(player)

    const last = this.lastEndedTrack.get(player.guildId)
    this.lastEndedTrack.delete(player.guildId)

    // lavalink-client reuses the same payload object when it emits trackEnd
    // from inside queueEnd's autoplay branch.
    const alreadyEmitted = !!last && last.track === track && last.payload === payload

    if (alreadyEmitted) return
    if (!track || payload?.type !== 'TrackEndEvent') return
    if (this.emitter.listenerCount('linkedTrackEnd') === 0) return

    this.emitter.emit('linkedTrackEnd', player, track, payload)
  }

  private _nodeSnapshot(node: any) {
    return {
      id: node.id,
      info: node.info ?? null,
      connected: node.connected === true,
      stats: node.stats ?? null,
      sessionId: node.sessionId ?? null,
    }
  }

  private _errorInfo(error: unknown) {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack ?? null,
      }
    }

    return {
      name: 'Error',
      message: String(error),
      stack: null,
    }
  }

  private _buildAutoPlayFunction():
    ((player: Player, lastPlayedTrack: Track) => Promise<void>) | undefined {
    const custom = this.options.autoPlayFunction
    const relating = custom
      ? undefined
      : new PlayerRelatingManager({
          defaultAutoPlaySource: this.options.defaultAutoPlaySource,
          defaultSearchPlatform: this.options.playerOptions?.defaultSearchPlatform,
          autoplayOptions: this.options.autoplayOptions,
        })

    const runAutoplay =
      custom ??
      ((player: Player, lastPlayedTrack: Track): Promise<void> =>
        relating!.autoplay(player, lastPlayedTrack))

    if (this.options.decoupleAutoplay === false) return runAutoplay

    const lockKey = 'forgelinked_autoplay_background'

    return async (player, lastPlayedTrack) => {
      if (!player || !lastPlayedTrack) return
      // The built-in engine already no-ops when autoplay is disabled; avoid
      // arming the background lock/timer extension in that case.
      if (!custom && !(player as any).autoPlay) return
      if (player.getData<boolean>(lockKey)) return

      player.setData(lockKey, true)
      this.pendingAutoplay.add(player.guildId)

      // Defer the actual search until after lavalink-client has emitted
      // queueEnd/trackEnd. The library awaits this autoplay function, so it
      // must resolve immediately.
      setImmediate(() => {
        if (!this.lavalink.players.has(player.guildId)) {
          player.deleteData(lockKey)
          this.pendingAutoplay.delete(player.guildId)
          return
        }

        const run = Promise.resolve().then(() => runAutoplay(player, lastPlayedTrack))

        void run
          .then(async () => {
            if (!this.lavalink.players.has(player.guildId)) return
            if (player.queue.tracks.length === 0) return
            if (player.playing || player.queue.current) return

            if (this.lavalink.options.autoSkip === false) {
              // Match lavalink-client's old behavior: autoplay fills the
              // queue, but autoSkip=false means it is not started.
              player.queue.current = (player.queue.tracks.shift() as any) ?? null
              await player.queue.utils.save().catch(() => undefined)
              return
            }

            await player.play({ noReplace: true, paused: false })
          })
          .catch((err) => Logger.error('ForgeLinked autoplay background error:', err))
          .finally(() => {
            player.deleteData(lockKey)
            this.pendingAutoplay.delete(player.guildId)
            this._finishQueueEmptyWait(player)
          })
      })
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Exports                                   */
/* -------------------------------------------------------------------------- */

export type { PlayerEvents, SearchPlatform, LavalinkNodeOptions }
