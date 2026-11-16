import { Interpreter } from '@tryforge/forgescript'

import { ForgeLinked } from '..'
import { ForgeLinkedEventHandler } from '../structures/ForgeLinkedEventManager'

export default new ForgeLinkedEventHandler({
  name: 'linkedNodeReconnecting',
  version: '2.3.0',
  description: 'Triggered when a Lavalink node starts a reconnection attempt',
  listener(node) {
    const commands = this.getExtension(ForgeLinked, true).commands.get('linkedNodeReconnecting')

    for (const command of commands) {
      Interpreter.run({
        obj: {},
        client: this,
        command,
        data: command.compiled.code,
        extras: { node },
      })
    }
  },
})
