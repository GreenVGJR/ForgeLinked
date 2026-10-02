"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stampPlaylistTracks = stampPlaylistTracks;
exports.markNonPlaylistTracks = markNonPlaylistTracks;
exports.getPlaylistInfo = getPlaylistInfo;
function resolveName(playlist) {
    if (!playlist)
        return null;
    const name = playlist.title ?? playlist.name ?? null;
    return typeof name === 'string' && name.trim() ? name : null;
}
function resolveUrl(playlist) {
    if (!playlist)
        return null;
    const uri = playlist.uri ?? null;
    return typeof uri === 'string' && uri.trim() ? uri : null;
}
function stampPlaylistTracks(tracks, playlist) {
    const playlistName = resolveName(playlist);
    const playlistUrl = resolveUrl(playlist);
    const isPlaylist = playlistName !== null || playlistUrl !== null;
    for (const track of tracks) {
        track.pluginInfo = track.pluginInfo ?? {};
        track.pluginInfo.clientData = {
            ...(track.pluginInfo.clientData ?? {}),
            isPlaylist,
            playlistName,
            playlistUrl,
        };
    }
}
function markNonPlaylistTracks(tracks) {
    stampPlaylistTracks(tracks, null);
}
function getPlaylistInfo(track) {
    const clientData = track?.pluginInfo?.clientData;
    const name = typeof clientData?.playlistName === 'string' && clientData.playlistName.trim()
        ? clientData.playlistName
        : null;
    const url = typeof clientData?.playlistUrl === 'string' && clientData.playlistUrl.trim()
        ? clientData.playlistUrl
        : null;
    const isPlaylist = clientData?.isPlaylist === true || name !== null || url !== null;
    return {
        isPlaylist,
        playlistName: isPlaylist ? name : null,
        playlistUrl: isPlaylist ? url : null,
    };
}
//# sourceMappingURL=trackPlaylist.js.map