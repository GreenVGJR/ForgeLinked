import { Interpreter } from '@tryforge/forgescript'

import { ForgeLinked } from '..'
import { ForgeLinkedEventHandler } from '../structures/ForgeLinkedEventManager'

export default new ForgeLinkedEventHandler({
  name: 'linkedNodeError',
  version: '2.3.0',
  description: 'Triggered when a Lavalink node emits an error',
  listener(node, error) {
    const commands = this.getExtension(ForgeLinked, true).commands.get('linkedNodeError')

    for (const command of commands) {
      Interpreter.run({
        obj: {},
        client: this,
        command,
        data: command.compiled.code,
        extras: { node, error },
      })
    }
  },
})
