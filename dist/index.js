"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForgeLinked = void 0;
const forgescript_1 = require("@tryforge/forgescript");
const lavalink_client_1 = require("lavalink-client");
const path_1 = __importDefault(require("path"));
const tiny_typed_emitter_1 = require("tiny-typed-emitter");
const playerRelating_js_1 = require("./managers/playerRelating.js");
const ForgeLinkedCommandManager_js_1 = require("./structures/ForgeLinkedCommandManager.js");
/* -------------------------------------------------------------------------- */
/*                               ForgeLink Class                              */
/* -------------------------------------------------------------------------- */
class ForgeLinked extends forgescript_1.ForgeExtension {
    options;
    name = 'ForgeLink';
    description = 'ForgeScript integration with lavalink-client';
    version = '2.3.0';
    client;
    lavalink;
    commands;
    emitter = new tiny_typed_emitter_1.TypedEmitter();
    lastEndedTrack = new Map();
    pendingAutoplay = new Set();
    relating;
    autoplayState = new Map();
    constructor(options) {
        super();
        this.options = options;
    }
    async init(client) {
        const start = Date.now();
        this.client = client;
        this.lavalink = new lavalink_client_1.LavalinkManager({
            nodes: this.options.nodes,
            sendToShard: (guildId, payload) => {
                const guild = this.client.guilds.cache.get(guildId);
                if (guild)
                    guild.shard.send(payload);
                return Promise.resolve();
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
                clientBasedPositionUpdateInterval: this.options.playerOptions?.clientBasedPositionUpdateInterval ?? 50,
                defaultSearchPlatform: this.options.playerOptions?.defaultSearchPlatform ?? 'ytsearch',
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
        });
        this.commands = new ForgeLinkedCommandManager_js_1.ForgeLinkedCommandManager(this.client);
        this.lavalink.on('trackStart', (player, track) => {
            if (track?.pluginInfo?.clientData?.previousTrack) {
                delete track.pluginInfo.clientData.previousTrack;
            }
            if (player && track) {
                player.deleteData('forgelinked_autoplay_filled');
                this._prefetchAutoplay(player, track);
            }
        });
        // lavalink-client does not emit trackEnd for the last track when the queue
        // empties; queueEnd is emitted instead. Emit the missing trackEnd once,
        // before the generic queueEnd forwarding below, so listeners still see
        // end -> queueEnd (and end -> start when autoplay picks a new track).
        this.lavalink.on('trackEnd', (player, track, payload) => this._handleTrackEnd(player, track, payload));
        this.lavalink.on('queueEnd', (player, track, payload) => this._handleQueueEnd(player, track, payload));
        this.lavalink.on('playerDestroy', (player) => {
            this.lastEndedTrack.delete(player.guildId);
            this.pendingAutoplay.delete(player.guildId);
            this.clearAutoplayState(player.guildId);
            player.deleteData('forgelinked_autoplay_filled');
        });
        // While a background autoplay lookup is pending, keep the player alive
        // long enough for it to finish instead of letting the queue-empty timer
        // destroy it mid-search.
        this.lavalink.on('playerQueueEmptyStart', (player, timeoutMs) => this._handleQueueEmptyStart(player, timeoutMs));
        forgescript_1.EventManager.load('ForgeLinked', __dirname + `/events`);
        if (this.options.events?.length) {
            this.client.events.load('ForgeLinked', this.options.events);
        }
        const sendRawData = (packet, attempts = 0) => {
            this.lavalink.sendRawData(packet).catch((err) => {
                const message = err instanceof Error ? err.message : String(err);
                const nodeNotReady = message.includes('Lavalink Node is either not ready or not up to date') ||
                    message.includes('Lavalink-Node is either not ready or not up to date');
                if (nodeNotReady) {
                    if (attempts < 5)
                        setTimeout(() => sendRawData(packet, attempts + 1), 1000);
                    return;
                }
                console.error('Failed to send raw data to Lavalink:', err);
            });
        };
        client.on('raw', sendRawData);
        this.load(path_1.default.join(__dirname, './natives'));
        client.on('clientReady', async () => {
            // Register node listeners BEFORE init() so we never miss a node
            // connection or lifecycle event - including fallback reconnects when
            // one of multiple nodes fails during initialisation and comes back later.
            this.lavalink.nodeManager.on('connect', (node) => {
                const snapshot = this._nodeSnapshot(node);
                // The 0-key keeps the old `$linkedEvent[node][0]` shape working while
                // new scripts can use `$linkedEvent[node;id]` directly.
                this.emitter.emit('linkedNodeConnect', {
                    ...snapshot,
                    0: { id: snapshot.id, info: snapshot.info },
                });
            });
            this.lavalink.nodeManager.on('disconnect', (node, payload) => {
                this.emitter.emit('linkedNodeDisconnect', this._nodeSnapshot(node), payload);
            });
            this.lavalink.nodeManager.on('reconnecting', (node) => {
                this.emitter.emit('linkedNodeReconnecting', this._nodeSnapshot(node));
            });
            this.lavalink.nodeManager.on('destroy', (node, reason) => {
                this.emitter.emit('linkedNodeDestroy', this._nodeSnapshot(node), reason);
            });
            this.lavalink.nodeManager.on('resumed', (node, payload, players) => {
                this.emitter.emit('linkedNodeResumed', this._nodeSnapshot(node), payload, players);
            });
            try {
                await this.lavalink.init({
                    id: client.user.id,
                    username: client.user.username,
                });
            }
            catch (err) {
                // One or more nodes failed to connect on startup.
                // We intentionally do NOT return here - remaining nodes may still be
                // healthy, and failed nodes will fire 'connect' via the listener above
                // once they come back (fallback behaviour).
                forgescript_1.Logger.error('Lavalink failed to initialize:', err);
                this._emitError(err);
            }
        });
        if (this.options.events?.length) {
            // Node lifecycle events are emitted directly from nodeManager listeners,
            // not from LavalinkManager, so they must not be forwarded here.
            // linkedQueueEnd is handled in _handleQueueEnd for autoplay suppression.
            const directlyHandledEvents = new Set([
                'linkedNodeConnect',
                'linkedNodeDisconnect',
                'linkedNodeReconnecting',
                'linkedNodeDestroy',
                'linkedNodeResumed',
                'linkedNodeError',
                // Emitted from _handleQueueEnd so a successful autoplay fill can
                // suppress it.
                'linkedQueueEnd',
            ]);
            for (const linkedEvent of this.options.events) {
                if (directlyHandledEvents.has(linkedEvent))
                    continue;
                const lavalinkEvent = linkedEvent.startsWith('linked')
                    ? linkedEvent.charAt(6).toLowerCase() + linkedEvent.slice(7)
                    : linkedEvent;
                this.lavalink.on(lavalinkEvent, (...args) => {
                    this.emitter.emit(linkedEvent, ...args);
                });
            }
        }
        this.lavalink.nodeManager.on('error', (node, error) => {
            forgescript_1.Logger.error(`Lavalink node "${node.id}" error:`, error);
            if (this.emitter.listenerCount('linkedNodeError') > 0) {
                this.emitter.emit('linkedNodeError', this._nodeSnapshot(node), this._errorInfo(error));
            }
            this._emitError(error);
        });
        console.debug(`ForgeLink: Initialized in ${Date.now() - start}ms`);
    }
    _emitError(error) {
        if (this.emitter.listenerCount('error') === 0)
            return;
        this.emitter.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
    /** Drop all cached/in-flight autoplay work for a guild. */
    clearAutoplayState(guildId) {
        this.autoplayState.delete(guildId);
        this.pendingAutoplay.delete(guildId);
    }
    _getAutoplayState(guildId) {
        let state = this.autoplayState.get(guildId);
        if (!state) {
            state = { generation: 0 };
            this.autoplayState.set(guildId, state);
        }
        return state;
    }
    _autoplayTrackKey(track) {
        if (!track)
            return '';
        const info = track.info ?? {};
        return String(info.uri || info.identifier || '');
    }
    /**
     * Race a lookup against the configured timeout. A timeout (or retryDuration
     * of 0, meaning no cap) is reported as a miss so callers fail straight away.
     */
    _withAutoplayTimeout(promise, ms) {
        if (!Number.isFinite(ms) || ms <= 0)
            return promise.then((value) => value);
        let timer;
        const timeout = new Promise((resolve) => {
            timer = setTimeout(() => resolve(null), ms);
        });
        return Promise.race([promise, timeout]).finally(() => {
            if (timer)
                clearTimeout(timer);
        });
    }
    /** Start the background lookup at trackStart without touching the queue. */
    _prefetchAutoplay(player, track) {
        if (this.options.decoupleAutoplay === false)
            return;
        if (!this.relating)
            return;
        if (!player?.guildId || !track)
            return;
        if (!player.autoPlay)
            return;
        if (player.queue.tracks.length > 1)
            return;
        const state = this._getAutoplayState(player.guildId);
        const baseId = this._autoplayTrackKey(track);
        if (state.cache?.baseId === baseId || state.inFlight?.baseId === baseId)
            return;
        state.cache = undefined;
        state.generation++;
        const token = state.generation;
        const promise = Promise.resolve()
            .then(() => this.relating.collectTracks(player, track))
            .catch(() => []);
        state.inFlight = { baseId, token, promise };
        this.pendingAutoplay.add(player.guildId);
        void promise.then((tracks) => {
            const current = this._getAutoplayState(player.guildId);
            if (current.inFlight?.token !== token)
                return;
            current.inFlight = undefined;
            if (this.lavalink.players.has(player.guildId) && tracks?.length) {
                current.cache = { baseId, tracks };
            }
            this.pendingAutoplay.delete(player.guildId);
        });
    }
    _handleTrackEnd(player, track, payload) {
        if (!player?.guildId)
            return;
        this.lastEndedTrack.set(player.guildId, { track, payload });
    }
    _handleQueueEmptyStart(player, timeoutMs) {
        if (!this.pendingAutoplay.has(player.guildId))
            return;
        const timer = player.getData('internal_queueempty');
        if (timer)
            clearTimeout(timer);
        player.setData('internal_queueempty', undefined);
        player.setData('forgelinked_queueempty_delay', typeof timeoutMs === 'number' ? timeoutMs : 30000);
    }
    _deferQueueEmptyTimer(player) {
        if (!this.pendingAutoplay.has(player.guildId))
            return;
        // playerQueueEmptyStart is emitted before lavalink-client installs its
        // timeout, so clear the timer again once queueEnd is emitted.
        const timer = player.getData('internal_queueempty');
        if (timer)
            clearTimeout(timer);
        player.setData('internal_queueempty', undefined);
    }
    _handleQueueEnd(player, track, payload) {
        if (!player?.guildId)
            return;
        this._deferQueueEmptyTimer(player);
        const last = this.lastEndedTrack.get(player.guildId);
        this.lastEndedTrack.delete(player.guildId);
        // lavalink-client reuses the same payload object when it emits trackEnd
        // from inside queueEnd's autoplay branch.
        const alreadyEmitted = !!last && last.track === track && last.payload === payload;
        if (!alreadyEmitted &&
            track &&
            payload?.type === 'TrackEndEvent' &&
            this.emitter.listenerCount('linkedTrackEnd') > 0) {
            this.emitter.emit('linkedTrackEnd', player, track, payload);
        }
        // A successful autoplay fill means this queue-end was immediately resolved
        // by autoplay, so do not notify listeners of an empty queue.
        if (player.getData('forgelinked_autoplay_filled')) {
            player.deleteData('forgelinked_autoplay_filled');
            return;
        }
        this.emitter.emit('linkedQueueEnd', player, track, payload);
    }
    _nodeSnapshot(node) {
        return {
            id: node.id,
            info: node.info ?? null,
            connected: node.connected === true,
            stats: node.stats ?? null,
            sessionId: node.sessionId ?? null,
        };
    }
    _errorInfo(error) {
        if (error instanceof Error) {
            return {
                name: error.name,
                message: error.message,
                stack: error.stack ?? null,
            };
        }
        return {
            name: 'Error',
            message: String(error),
            stack: null,
        };
    }
    _buildAutoPlayFunction() {
        const custom = this.options.autoPlayFunction;
        this.relating = custom
            ? undefined
            : new playerRelating_js_1.PlayerRelatingManager({
                defaultAutoPlaySource: this.options.defaultAutoPlaySource,
                defaultSearchPlatform: this.options.playerOptions?.defaultSearchPlatform,
                autoplayOptions: this.options.autoplayOptions,
            });
        const timeout = this.options.autoplayOptions?.retryDuration ?? 5000;
        const collect = (player, track) => this.relating ? this.relating.collectTracks(player, track) : Promise.resolve([]);
        return async (player, lastPlayedTrack) => {
            if (!player || !lastPlayedTrack)
                return;
            if (!custom && !player.autoPlay) {
                const state = this._getAutoplayState(player.guildId);
                state.cache = undefined;
                state.inFlight = undefined;
                state.generation++;
                player.setData('forgelinked_autoplay_filled', false);
                return;
            }
            const guildId = player.guildId;
            const state = this._getAutoplayState(guildId);
            const baseId = this._autoplayTrackKey(lastPlayedTrack);
            this.pendingAutoplay.add(guildId);
            try {
                if (custom) {
                    // Custom functions manage the queue themselves; only cap their time.
                    await this._withAutoplayTimeout(Promise.resolve().then(() => custom(player, lastPlayedTrack)), timeout).catch((err) => {
                        forgescript_1.Logger.error('ForgeLinked autoplay error:', err);
                        return null;
                    });
                    state.cache = undefined;
                    state.inFlight = undefined;
                    state.generation++;
                    if (player.queue.tracks.length > 0 || player.queue.current) {
                        player.setData('forgelinked_autoplay_filled', true);
                    }
                    return;
                }
                let tracks = null;
                if (state.cache && state.cache.baseId === baseId) {
                    tracks = state.cache.tracks;
                    state.cache = undefined;
                    state.inFlight = undefined;
                    state.generation++;
                }
                else if (state.inFlight && state.inFlight.baseId === baseId) {
                    // Reuse the prefetch that is still processing instead of starting a
                    // second lookup. Timeout turns a slow lookup into a straight miss.
                    const inflight = state.inFlight;
                    tracks = await this._withAutoplayTimeout(inflight.promise, timeout);
                    state.inFlight = undefined;
                    state.generation++;
                }
                else {
                    state.cache = undefined;
                    state.inFlight = undefined;
                    state.generation++;
                    tracks = await this._withAutoplayTimeout(collect(player, lastPlayedTrack), timeout);
                }
                if (tracks?.length) {
                    await player.queue.add(tracks);
                    player.setData('forgelinked_autoplay_filled', true);
                }
            }
            catch (err) {
                forgescript_1.Logger.error('ForgeLinked autoplay error:', err);
            }
            finally {
                this.pendingAutoplay.delete(guildId);
            }
        };
    }
}
exports.ForgeLinked = ForgeLinked;
//# sourceMappingURL=index.js.map