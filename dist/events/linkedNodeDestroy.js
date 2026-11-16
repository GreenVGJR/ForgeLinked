"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("..");
const ForgeLinkedEventManager_1 = require("../structures/ForgeLinkedEventManager");
exports.default = new ForgeLinkedEventManager_1.ForgeLinkedEventHandler({
    name: 'linkedNodeDestroy',
    version: '2.3.0',
    description: 'Triggered when a Lavalink node is destroyed',
    listener(node, reason) {
        const commands = this.getExtension(__1.ForgeLinked, true).commands.get('linkedNodeDestroy');
        for (const command of commands) {
            forgescript_1.Interpreter.run({
                obj: {},
                client: this,
                command,
                data: command.compiled.code,
                extras: { node, reason },
            });
        }
    },
});
//# sourceMappingURL=linkedNodeDestroy.js.map