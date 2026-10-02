export interface PlaylistSource {
  title?: string | null
  name?: string | null
  uri?: string | null
}

export interface PlaylistIndicator {
  isPlaylist: boolean
  playlistName: string | null
  playlistUrl: string | null
}

interface QueueTrackLike {
  pluginInfo?: {
    clientData?: Record<string, any>
    [key: string]: any
  } | null
}

function resolveName(playlist: PlaylistSource | null | undefined): string | null {
  if (!playlist) return null
  const name = playlist.title ?? playlist.name ?? null
  return typeof name === 'string' && name.trim() ? name : null
}

function resolveUrl(playlist: PlaylistSource | null | undefined): string | null {
  if (!playlist) return null
  const uri = playlist.uri ?? null
  return typeof uri === 'string' && uri.trim() ? uri : null
}

export function stampPlaylistTracks(
  tracks: QueueTrackLike[],
  playlist: PlaylistSource | null | undefined,
): void {
  const playlistName = resolveName(playlist)
  const playlistUrl = resolveUrl(playlist)
  const isPlaylist = playlistName !== null || playlistUrl !== null

  for (const track of tracks) {
    track.pluginInfo = track.pluginInfo ?? {}
    track.pluginInfo.clientData = {
      ...(track.pluginInfo.clientData ?? {}),
      isPlaylist,
      playlistName,
      playlistUrl,
    }
  }
}

export function markNonPlaylistTracks(tracks: QueueTrackLike[]): void {
  stampPlaylistTracks(tracks, null)
}

export function getPlaylistInfo(track: QueueTrackLike | null | undefined): PlaylistIndicator {
  const clientData = track?.pluginInfo?.clientData as Partial<PlaylistIndicator> | undefined

  const name =
    typeof clientData?.playlistName === 'string' && clientData.playlistName.trim()
      ? clientData.playlistName
      : null
  const url =
    typeof clientData?.playlistUrl === 'string' && clientData.playlistUrl.trim()
      ? clientData.playlistUrl
      : null
  const isPlaylist = clientData?.isPlaylist === true || name !== null || url !== null

  return {
    isPlaylist,
    playlistName: isPlaylist ? name : null,
    playlistUrl: isPlaylist ? url : null,
  }
}
