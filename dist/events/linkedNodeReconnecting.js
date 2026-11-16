"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("..");
const ForgeLinkedEventManager_1 = require("../structures/ForgeLinkedEventManager");
exports.default = new ForgeLinkedEventManager_1.ForgeLinkedEventHandler({
    name: 'linkedNodeReconnecting',
    version: '2.3.0',
    description: 'Triggered when a Lavalink node starts a reconnection attempt',
    listener(node) {
        const commands = this.getExtension(__1.ForgeLinked, true).commands.get('linkedNodeReconnecting');
        for (const command of commands) {
            forgescript_1.Interpreter.run({
                obj: {},
                client: this,
                command,
                data: command.compiled.code,
                extras: { node },
            });
        }
    },
});
//# sourceMappingURL=linkedNodeReconnecting.js.map