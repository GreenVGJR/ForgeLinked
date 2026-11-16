import { ArgType, NativeFunction } from '@tryforge/forgescript'
import { SearchPlatform } from 'lavalink-client'

import { ForgeLinked } from '../../index.js'
import { getPlaylistInfo, stampPlaylistTracks } from '../../managers/trackPlaylist.js'

export default new NativeFunction({
  name: '$playerSearchTrack',
  description: 'Search for a track',
  version: '1.0.0',
  brackets: true,
  unwrap: true,
  args: [
    {
      name: 'guildId',
      description: 'The guild id to search for the track in',
      type: ArgType.Guild,
      required: true,
      rest: false,
    },
    {
      name: 'query',
      description: 'The query to search for',
      type: ArgType.String,
      required: true,
      rest: false,
    },
    {
      name: 'source',
      description:
        'The source to use. Such as yt for youtube ytm for youtube music etc. Depends on the lavalink server config',
      type: ArgType.String,
      required: false,
      rest: false,
    },
    {
      name: 'requester',
      description: 'The requester of the track',
      type: ArgType.Member,
      required: false,
      rest: false,
    },
    {
      name: 'limit',
      description: 'The limit of the tracks to return',
      type: ArgType.Number,
      required: false,
      rest: false,
    },
  ],
  output: ArgType.Json,
  async execute(ctx, [guildId, query, source, requester, limit]) {
    try {
      const linked = ctx.client.getExtension(ForgeLinked, true)?.lavalink
      if (!linked) return this.customError('ForgeLinked is not initialized')

      const player = linked.getPlayer(guildId.id)
      if (!player) return this.customError('Player not found')
      if (!player.node?.connected)
        return this.customError(
          'Lavalink node is not connected. Please wait for the node to reconnect.',
        )

      // lavalink-client resolves source aliases (youtube/ytsearch/yt, ytm, etc.)
      // and validates them against the node. Do not duplicate that logic here.
      const searchSource = source?.replace(/:+$/, '').trim()

      const result = await player
        .search(
          {
            query,
            source: (searchSource || undefined) as SearchPlatform | undefined,
          },
          requester ?? ctx.member,
        )
        .catch((err: unknown) => {
          throw new Error(err instanceof Error ? err.message : String(err))
        })

      if (!result) return this.customError('No results found!')

      if (result.loadType === 'error') {
        const exception = (result as any).exception
        return this.customError(
          `Search failed: ${exception?.message ?? 'The Lavalink node returned an error.'}`,
        )
      }

      if (!result.tracks.length || result.loadType === 'empty')
        return this.customError('No results found!')

      let tracks = result.tracks
      if (typeof limit === 'number' && limit > 0) tracks = tracks.slice(0, limit)

      const isPlaylist = result.loadType === 'playlist'
      const playlistName = isPlaylist ? (result.playlist?.name ?? null) : null
      const playlistUri = isPlaylist ? (result.playlist?.uri ?? null) : null
      stampPlaylistTracks(tracks, isPlaylist ? result.playlist : null)

      const trackRequester = result.tracks[0]?.requester as any
      const requesterInfo = trackRequester
        ? typeof trackRequester === 'string'
          ? { requester: trackRequester }
          : Object.assign(
              typeof trackRequester.toJSON === 'function'
                ? trackRequester.toJSON()
                : { ...trackRequester },
              { requester: trackRequester.id ?? trackRequester.requester ?? null },
            )
        : null

      return this.successJSON({
        status: 'success',
        source,
        type: result.loadType,
        message:
          result.loadType === 'playlist'
            ? `Found ${tracks.length} tracks from ${result.playlist?.name}`
            : `Found ${tracks.length} tracks matching the query.`,
        isPlaylist,
        playlistName,
        playlistUri: playlistUri,
        playlistDuration: result.loadType === 'playlist' ? result.playlist?.duration : null,
        requester: requesterInfo,
        trackCount: tracks.length,
        tracks: tracks.map((track) => ({
          title: track.info.title,
          author: track.info.author,
          duration: track.info.duration,
          url: track.info.uri,
          thumbnail: track.info.artworkUrl,
          source,
          ...getPlaylistInfo(track),
        })),
      })
    } catch (err) {
      return this.customError(`Search failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  },
})
