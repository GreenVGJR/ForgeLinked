export declare const localSearchUserAgent = "Mozilla/5.0 (X11; Linux x86_64; rv:160.0) Gecko/20100101 Firefox/160.0";
export declare const localSearchHeaders: {
    Accept: string;
    'Accept-Encoding': string;
    'Accept-Language': string;
    'Sec-Fetch-Dest': string;
    'Sec-Fetch-Mode': string;
    'Sec-Fetch-Site': string;
    'User-Agent': string;
};
export interface SpotifyAuth {
    accessToken: string;
    clientToken: string;
}
export declare class LocalSearchAuthManager {
    private youtubeVisitorData?;
    private soundCloudClientId?;
    private spotifyAccessToken?;
    private spotifyClientToken?;
    getYoutubeVisitor(): Promise<string | undefined>;
    getSoundCloudClientId(refresh?: boolean): Promise<string | undefined>;
    getSpotifyAuth(refresh?: boolean): Promise<SpotifyAuth | null>;
    private getSpotifyClientToken;
    private getSpotifyAccessToken;
    private generateSpotifyTotp;
    private fetchJson;
    private fetchText;
}
