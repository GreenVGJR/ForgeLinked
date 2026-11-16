import { Interpreter } from '@tryforge/forgescript'

import { ForgeLinked } from '..'
import { ForgeLinkedEventHandler } from '../structures/ForgeLinkedEventManager'

export default new ForgeLinkedEventHandler({
  name: 'linkedNodeResumed',
  version: '2.3.0',
  description: 'Triggered when a Lavalink node session is resumed',
  listener(node, payload, players) {
    const commands = this.getExtension(ForgeLinked, true).commands.get('linkedNodeResumed')

    for (const command of commands) {
      Interpreter.run({
        obj: {},
        client: this,
        command,
        data: command.compiled.code,
        extras: { node, payload, players },
      })
    }
  },
})
