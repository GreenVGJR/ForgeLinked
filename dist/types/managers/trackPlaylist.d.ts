export interface PlaylistSource {
    title?: string | null;
    name?: string | null;
    uri?: string | null;
}
export interface PlaylistIndicator {
    isPlaylist: boolean;
    playlistName: string | null;
    playlistUrl: string | null;
}
interface QueueTrackLike {
    pluginInfo?: {
        clientData?: Record<string, any>;
        [key: string]: any;
    } | null;
}
export declare function stampPlaylistTracks(tracks: QueueTrackLike[], playlist: PlaylistSource | null | undefined): void;
export declare function markNonPlaylistTracks(tracks: QueueTrackLike[]): void;
export declare function getPlaylistInfo(track: QueueTrackLike | null | undefined): PlaylistIndicator;
export {};
