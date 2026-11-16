import { Interpreter } from '@tryforge/forgescript'

import { ForgeLinked } from '..'
import { ForgeLinkedEventHandler } from '../structures/ForgeLinkedEventManager'

export default new ForgeLinkedEventHandler({
  name: 'linkedNodeDestroy',
  version: '2.3.0',
  description: 'Triggered when a Lavalink node is destroyed',
  listener(node, reason) {
    const commands = this.getExtension(ForgeLinked, true).commands.get('linkedNodeDestroy')

    for (const command of commands) {
      Interpreter.run({
        obj: {},
        client: this,
        command,
        data: command.compiled.code,
        extras: { node, reason },
      })
    }
  },
})
