"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const index_js_1 = require("../../index.js");
const trackPlaylist_js_1 = require("../../managers/trackPlaylist.js");
exports.default = new forgescript_1.NativeFunction({
    name: '$playerCurrentTrack',
    description: 'Get the current track of a player',
    version: '1.0.0',
    brackets: false,
    unwrap: true,
    args: [
        {
            name: 'guildId',
            description: 'The guild id to get the current track for',
            type: forgescript_1.ArgType.Guild,
            required: false,
            rest: false,
        },
    ],
    output: forgescript_1.ArgType.Json,
    execute(ctx, [guildId]) {
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
        const current = player.queue.current;
        if (!current)
            return this.successJSON(null);
        return this.successJSON({
            ...current.info,
            ...current.pluginInfo,
            ...(0, trackPlaylist_js_1.getPlaylistInfo)(current),
        });
    },
});
//# sourceMappingURL=playerCurrentTrack.js.map