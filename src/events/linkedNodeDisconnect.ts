import { Interpreter } from '@tryforge/forgescript'

import { ForgeLinked } from '..'
import { ForgeLinkedEventHandler } from '../structures/ForgeLinkedEventManager'

export default new ForgeLinkedEventHandler({
  name: 'linkedNodeDisconnect',
  version: '2.3.0',
  description: 'Triggered when the connection to a Lavalink node is closed',
  listener(node, payload) {
    const commands = this.getExtension(ForgeLinked, true).commands.get('linkedNodeDisconnect')

    for (const command of commands) {
      Interpreter.run({
        obj: {},
        client: this,
        command,
        data: command.compiled.code,
        extras: { node, payload },
      })
    }
  },
})
