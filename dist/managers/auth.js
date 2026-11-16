"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalSearchAuthManager = exports.localSearchHeaders = exports.localSearchUserAgent = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
exports.localSearchUserAgent = 'Mozilla/5.0 (X11; Linux x86_64; rv:160.0) Gecko/20100101 Firefox/160.0';
const spotifyTotpSecret = ',7/*F("rLJ2oxaKL^f+E1xvP@N';
const spotifyTotpVersion = 61;
exports.localSearchHeaders = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Encoding': 'gzip, br',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'User-Agent': exports.localSearchUserAgent,
};
class LocalSearchAuthManager {
    youtubeVisitorData;
    soundCloudClientId;
    spotifyAccessToken;
    spotifyClientToken;
    async getYoutubeVisitor() {
        if (this.youtubeVisitorData)
            return this.youtubeVisitorData;
        try {
            const text = await this.fetchText(`https://www.youtube.com/sw.js_data`, {
                headers: exports.localSearchHeaders,
            });
            const dataLine = text
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line.startsWith('['))
                .slice(-1)[0];
            const parsed = dataLine ? JSON.parse(dataLine) : undefined;
            const visitorData = parsed?.[0]?.[2]?.[6];
            if (typeof visitorData !== 'string')
                return undefined;
            this.youtubeVisitorData = visitorData;
            return visitorData;
        }
        catch {
            return undefined;
        }
    }
    async getSoundCloudClientId(refresh = false) {
        if (!refresh && this.soundCloudClientId)
            return this.soundCloudClientId;
        try {
            const text = await this.fetchText('https://m.soundcloud.com', {
                method: 'GET',
                headers: exports.localSearchHeaders,
            });
            this.soundCloudClientId = text.split('"clientId":"')[1]?.split('"')[0];
            return this.soundCloudClientId;
        }
        catch {
            return undefined;
        }
    }
    async getSpotifyAuth(refresh = false) {
        if (!refresh && this.spotifyAccessToken && this.spotifyClientToken) {
            return { accessToken: this.spotifyAccessToken, clientToken: this.spotifyClientToken };
        }
        const [clientToken, accessToken] = await Promise.all([
            this.getSpotifyClientToken(),
            this.getSpotifyAccessToken(),
        ]);
        if (!clientToken || !accessToken)
            return null;
        this.spotifyClientToken = clientToken;
        this.spotifyAccessToken = accessToken;
        return { accessToken, clientToken };
    }
    async getSpotifyClientToken() {
        const body = {
            client_data: {
                client_version: '1.0',
                client_id: 'f6a40776580943a7bc5173125a1e8832',
                js_sdk_data: {},
            },
        };
        try {
            const data = await this.fetchJson('https://clienttoken.spotify.com/v1/clienttoken', {
                method: 'POST',
                body: JSON.stringify(body),
                headers: {
                    ...exports.localSearchHeaders,
                    Origin: 'https://clienttoken.spotify.com',
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
            });
            return data.granted_token?.token;
        }
        catch {
            return undefined;
        }
    }
    async getSpotifyAccessToken() {
        try {
            const totp = this.generateSpotifyTotp();
            const data = await this.fetchJson(`https://open.spotify.com/api/token?reason=init&productType=mobile-web-player&totp=${totp}&totpServer=${totp}&totpVer=${spotifyTotpVersion}`, {
                headers: {
                    ...exports.localSearchHeaders,
                    Accept: 'application/json',
                    Origin: 'https://open.spotify.com',
                    Referer: 'https://open.spotify.com/',
                },
            });
            return data.accessToken;
        }
        catch {
            return undefined;
        }
    }
    generateSpotifyTotp(timestamp = Date.now(), secret = spotifyTotpSecret) {
        const counter = Math.floor(timestamp / 1000 / 30);
        const counterBuffer = Buffer.alloc(8);
        counterBuffer.writeBigUInt64BE(BigInt(counter));
        const key = Buffer.from(Array.from(secret, (char, index) => char.charCodeAt(0) ^ ((index % 33) + 9)).join(''), 'utf8');
        const hmac = node_crypto_1.default.createHmac('sha1', key).update(counterBuffer).digest();
        const offset = hmac[hmac.length - 1] & 0xf;
        const code = ((hmac[offset] & 0x7f) << 24) |
            ((hmac[offset + 1] & 0xff) << 16) |
            ((hmac[offset + 2] & 0xff) << 8) |
            (hmac[offset + 3] & 0xff);
        return String(code % 1_000_000).padStart(6, '0');
    }
    async fetchJson(url, init) {
        const text = await this.fetchText(url, init);
        return JSON.parse(text);
    }
    async fetchText(url, init) {
        try {
            const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
            if (!res.ok)
                throw new Error(`Request failed: ${res.status}`);
            return res.text();
        }
        catch {
            throw new Error('Fetch failed');
        }
    }
}
exports.LocalSearchAuthManager = LocalSearchAuthManager;
//# sourceMappingURL=auth.js.map