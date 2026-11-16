import { ArgType, NativeFunction } from '@tryforge/forgescript'
import { ChannelType } from 'discord.js'

import { ForgeLinked } from '../../index.js'

export default new NativeFunction({
  name: '$playerCreate',
  description: 'Create a player for a guild',
  version: '1.0.0',
  brackets: true,
  unwrap: true,
  args: [
    {
      name: 'guildId',
      description: 'The guild id to create the player for',
      type: ArgType.Guild,
      required: true,
      rest: false,
    },
    {
      name: 'voiceID',
      description: 'The ID of the voice channel for the bot to use',
      type: ArgType.Channel,
      required: true,
      rest: false,
    },
    {
      name: 'textID',
      description: 'The ID of the text channel for the bot to use',
      type: ArgType.Channel,
      required: false,
      rest: false,
    },
    {
      name: 'volume',
      description: 'The volume to set the player to',
      type: ArgType.Number,
      required: false,
      rest: false,
    },
    {
      name: 'selfDeaf',
      description: 'Whether to deafen the bot',
      type: ArgType.Boolean,
      required: false,
      rest: false,
    },
    {
      name: 'selfMute',
      description: 'Whether to mute the bot',
      type: ArgType.Boolean,
      required: false,
      rest: false,
    },
    {
      name: 'node',
      description: 'The node to use for the player',
      type: ArgType.String,
      required: false,
      rest: false,
    },
  ],
  output: ArgType.Boolean,
  async execute(ctx, [guildId, voiceId, textId, volume, selfDeaf, selfMute, node]) {
    try {
      const linked = ctx.client.getExtension(ForgeLinked, true)?.lavalink
      if (!linked) return this.customError('ForgeLinked is not initialized')

      if (voiceId.type !== ChannelType.GuildVoice && voiceId.type !== ChannelType.GuildStageVoice) {
        return this.customError('The provided channel is not a voice channel')
      }

      if (typeof volume === 'number' && (volume < 0 || volume > 1000))
        return this.customError('Volume must be between 0 and 1000')

      if (node) {
        const requestedNode = linked.nodeManager.nodes.get(node)
        if (!requestedNode) return this.customError(`Lavalink node "${node}" was not found`)
        if (!requestedNode.connected)
          return this.customError(`Lavalink node "${node}" is not connected`)
      }

      const connectedNodes = Array.from(linked.nodeManager.nodes.values()).filter(
        (n: any) => n.connected,
      )
      if (!connectedNodes.length)
        return this.customError(
          'No Lavalink nodes are connected. Please wait for a node to connect.',
        )

      const player = linked.createPlayer({
        guildId: guildId.id,
        voiceChannelId: voiceId.id,
        textChannelId: textId?.id || ctx.channel?.id,
        volume: volume ?? 100,
        selfDeaf: selfDeaf ?? true,
        selfMute: selfMute ?? false,
        node: node || undefined,
      })

      await player.connect()

      return this.success(linked.players.has(guildId.id))
    } catch (err) {
      return this.customError(
        `Failed to create player: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  },
})
