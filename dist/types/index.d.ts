import { ForgeClient, ForgeExtension } from '@tryforge/forgescript';
import { LavalinkManager, LavalinkNodeOptions, Player, PlayerEvents, SearchPlatform, Track } from 'lavalink-client';
import { ForgeLinkedCommandManager } from './structures/ForgeLinkedCommandManager.js';
import { IForgeLinkedEvents } from './structures/ForgeLinkedEventManager.js';
export interface ForgeLinkSetupOptions {
    nodes: LavalinkNodeOptions[];
    defaultVolume?: number;
    autoSkip?: boolean;
    autoSkipOnResolveError?: boolean;
    emitNewSongsOnly?: boolean;
    /**
     * Move players to another healthy node when their current node disconnects.
     * Only takes effect when another connected node is available. Defaults to true.
     */
    autoMove?: boolean;
    /**
     * Catch lifecycle promise rejections from lavalink-client instead of letting
     * them become unhandled rejections (which can terminate Node). Defaults to true.
     */
    catchLifeCycleRejections?: boolean;
    /**
     * Enable lavalink-client debug events. Required for the `linkedDebug` event
     * to fire. Defaults to false.
     */
    enableDebugEvents?: boolean;
    /**
     * Prefetch autoplay tracks in the background at trackStart when at most one
     * track remains, then consume the result at queueEnd. With false, the lookup
     * only starts at queueEnd. Defaults to true.
     */
    decoupleAutoplay?: boolean;
    requesterTransformer?: (requester: unknown) => unknown;
    /**
     * Custom autoplay function. When provided, this fully overrides the built-in
     * autoplay behaviour. The function receives the player and the last played
     * track and should add at least one track to the queue to keep playback going.
     */
    autoPlayFunction?: (player: Player, lastPlayedTrack: Track) => Promise<void>;
    /**
     * Default search platform used by the built-in autoplay engine when looking
     * up related tracks. Defaults to the player's `defaultSearchPlatform`.
     * Common values: `'ytsearch'`, `'ytmsearch'`, `'scsearch'`.
     */
    defaultAutoPlaySource?: SearchPlatform;
    events?: Array<keyof IForgeLinkedEvents>;
    playerOptions?: {
        applyVolumeAsFilter?: boolean;
        clientBasedPositionUpdateInterval?: number;
        defaultSearchPlatform?: SearchPlatform;
        volumeDecrementer?: number;
        useUnresolvedData?: boolean;
        onDisconnect?: {
            autoReconnect?: boolean;
            destroyPlayer?: boolean;
        };
        onEmptyQueue?: {
            destroyAfterMs?: number;
        };
    };
    queueOptions?: {
        maxPreviousTracks?: number;
    };
    autoplayOptions?: {
        maxFetchTracks?: number;
        retryLimit?: number;
        retryDuration?: number;
    };
    linksAllowed?: boolean;
    linksBlacklist?: string[];
    linksWhitelist?: string[];
}
export type TransformEvents<T> = {
    [P in keyof T]: T[P] extends unknown[] ? (...args: T[P]) => void : never;
};
export declare class ForgeLinked extends ForgeExtension {
    private readonly options;
    name: string;
    description: string;
    version: string;
    client: ForgeClient;
    lavalink: LavalinkManager;
    commands: ForgeLinkedCommandManager;
    private emitter;
    private lastEndedTrack;
    private pendingAutoplay;
    private relating?;
    private autoplayState;
    constructor(options: ForgeLinkSetupOptions);
    init(client: ForgeClient): Promise<void>;
    private _emitError;
    /** Drop all cached/in-flight autoplay work for a guild. */
    clearAutoplayState(guildId: string): void;
    private _getAutoplayState;
    private _autoplayTrackKey;
    /**
     * Race a lookup against the configured timeout. A timeout (or retryDuration
     * of 0, meaning no cap) is reported as a miss so callers fail straight away.
     */
    private _withAutoplayTimeout;
    /** Start the background lookup at trackStart without touching the queue. */
    private _prefetchAutoplay;
    private _handleTrackEnd;
    private _handleQueueEmptyStart;
    private _deferQueueEmptyTimer;
    private _handleQueueEnd;
    private _nodeSnapshot;
    private _errorInfo;
    private _buildAutoPlayFunction;
}
export type { PlayerEvents, SearchPlatform, LavalinkNodeOptions };
