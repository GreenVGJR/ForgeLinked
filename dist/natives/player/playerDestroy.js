"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const index_js_1 = require("../../index.js");
exports.default = new forgescript_1.NativeFunction({
    name: '$playerDestroy',
    description: 'Destroy a player',
    version: '1.0.0',
    brackets: false,
    unwrap: true,
    args: [
        {
            name: 'guildId',
            description: 'The guild id to destroy the player for',
            type: forgescript_1.ArgType.Guild,
            required: false,
            rest: false,
        },
        {
            name: 'reason',
            description: 'The reason to destroy the player for',
            type: forgescript_1.ArgType.String,
            required: false,
            rest: false,
        },
    ],
    output: forgescript_1.ArgType.Boolean,
    async execute(ctx, [guildId, reason]) {
        try {
            const linked = ctx.client.getExtension(index_js_1.ForgeLinked, true)?.lavalink;
            if (!linked)
                return this.customError('ForgeLinked is not initialized');
            if (!guildId)
                guildId = ctx.guild;
            if (!guildId)
                return this.customError('Unable to find any guild. Ensure this command was ran inside of a guild and not DMs or a group chat');
            const player = linked.getPlayer(guildId.id);
            if (!player)
                return this.customError('Player not found');
            try {
                await player.destroy(reason || undefined);
            }
            catch (err) {
                // player.destroy() performs local cleanup before calling the Lavalink
                // node. If the local player is gone and the node is unavailable, there
                // is nothing left to clean up. The library skips its own playerDestroy
                // emit when that final REST call throws, so emit it here.
                if (!linked.players.has(guildId.id) && !player.node?.connected) {
                    linked.emit('playerDestroy', player, reason || undefined);
                    return this.success(true);
                }
                throw err;
            }
            return this.success(true);
        }
        catch (err) {
            return this.customError(`Failed to destroy player: ${err instanceof Error ? err.message : String(err)}`);
        }
    },
});
//# sourceMappingURL=playerDestroy.js.map