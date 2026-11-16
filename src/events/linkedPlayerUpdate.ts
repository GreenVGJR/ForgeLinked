import { Interpreter } from '@tryforge/forgescript'
import { Guild } from 'discord.js'

import { ForgeLinked } from '..'
import { ForgeLinkedEventHandler } from '../structures/ForgeLinkedEventManager'

export default new ForgeLinkedEventHandler({
  name: 'linkedPlayerUpdate',
  version: '2.0.0',
  description: 'This event is called when a player is updated',
  listener(oldPlayer, player) {
    const commands = this.getExtension(ForgeLinked, true).commands.get('linkedPlayerUpdate')

    const guild = this.guilds.cache.get(player.guildId) as Guild

    for (const command of commands) {
      Interpreter.run({
        obj: guild,
        client: this,
        command,
        data: command.compiled.code,
        // Keep the old flat fields for backwards compatibility while exposing
        // the live player separately.
        extras: { ...oldPlayer, player, oldPlayer },
      })
    }
  },
})
