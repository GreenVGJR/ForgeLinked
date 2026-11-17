"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerRelatingManager = void 0;
const forgescript_1 = require("@tryforge/forgescript");
const auth_js_1 = require("./auth.js");
const trackPlaylist_js_1 = require("./trackPlaylist.js");
class PlayerRelatingManager {
    options;
    auth;
    lockKey = 'forgelinked_autoplay_running';
    autoplayOptions;
    constructor(options = {}) {
        this.options = options;
        this.auth = options.auth ?? new auth_js_1.LocalSearchAuthManager();
        const raw = options.autoplayOptions ?? {};
        this.autoplayOptions = {
            maxFetchTracks: Math.max(1, Math.floor(raw.maxFetchTracks ?? 1)),
            retryLimit: Math.max(0, Math.floor(raw.retryLimit ?? 3)),
            retryDuration: Math.max(0, Math.floor(raw.retryDuration ?? 5000)),
        };
    }
    /**
     * Resolve related tracks without touching the player's queue. Used by the
     * prefetch path so the lookup can run in the background at trackStart.
     *
     * Returns null when the lookup must abort entirely (SoundCloud 403).
     */
    async collectTracks(player, lastPlayedTrack) {
        if (!player.autoPlay)
            return [];
        if (!this.isEligibleAutoplayTrack(lastPlayedTrack))
            return [];
        if (player.queue.tracks.length >= this.autoplayOptions.maxFetchTracks)
            return [];
        if (player.getData(this.lockKey))
            return [];
        player.setData(this.lockKey, true);
        try {
            const localCandidates = await this.relatedCandidates(lastPlayedTrack);
            if (localCandidates === null)
                return null;
            const collected = [];
            await this.fillQueue(player, lastPlayedTrack, localCandidates, collected);
            return collected;
        }
        catch (err) {
            forgescript_1.Logger.error('ForgeLinked autoplay error:', err);
            return [];
        }
        finally {
            player.deleteData(this.lockKey);
        }
    }
    async autoplay(player, lastPlayedTrack) {
        const tracks = await this.collectTracks(player, lastPlayedTrack);
        if (tracks?.length)
            await player.queue.add(tracks);
    }
    isEligibleAutoplayTrack(track) {
        if (this.sourceName(track))
            return true;
        // Direct links have no provider feed. Only search by metadata when there
        // is some; otherwise "popular music" would queue unrelated tracks.
        return !!String(track.info.title ?? '').trim() || !!String(track.info.author ?? '').trim();
    }
    async fillQueue(player, lastPlayedTrack, initialCandidates, collected) {
        let baseTrack = lastPlayedTrack;
        let candidates = initialCandidates;
        let chains = 0;
        while ((collected?.length ?? player.queue.tracks.length) < this.autoplayOptions.maxFetchTracks) {
            const ok = await this.fetchOneTrack(player, baseTrack, candidates, collected);
            if (ok)
                continue;
            // The chain depth is capped at retryLimit so it can't loop indefinitely.
            if (chains >= this.autoplayOptions.retryLimit)
                break;
            const pool = collected?.length ? collected : player.queue.tracks;
            const last = pool[pool.length - 1];
            if (!last || last === baseTrack)
                break;
            baseTrack = last;
            const nextCandidates = await this.relatedCandidates(baseTrack).catch(() => []);
            if (nextCandidates === null)
                return;
            candidates = nextCandidates;
            chains++;
        }
    }
    async fetchOneTrack(player, lastPlayedTrack, localCandidates, collected) {
        if (await this.queueLocalRelatedCandidate(player, lastPlayedTrack, localCandidates, collected))
            return true;
        if (await this.queueLavalinkSearchCandidate(player, lastPlayedTrack, collected))
            return true;
        return false;
    }
    async queueLocalRelatedCandidate(player, baseTrack, candidates, collected) {
        if (!candidates.length)
            return false;
        const unblocked = candidates.filter((candidate) => !this.isBlockedCandidate(player, baseTrack, candidate, collected));
        const shuffled = this.shuffleArray(unblocked);
        for (const candidate of shuffled) {
            const result = await player.search(candidate.url, baseTrack.requester).catch(() => null);
            if (!result ||
                !result.tracks.length ||
                result.loadType === 'empty' ||
                result.loadType === 'error') {
                continue;
            }
            const pick = this.pickTrack(player, baseTrack, result.tracks, collected);
            if (!pick)
                continue;
            (0, trackPlaylist_js_1.markNonPlaylistTracks)([pick]);
            if (collected)
                collected.push(pick);
            else
                player.queue.add(pick);
            return true;
        }
        return false;
    }
    async queueLavalinkSearchCandidate(player, baseTrack, collected) {
        for (const attempt of this.buildSearchAttempts(baseTrack)) {
            const result = await player
                .search({ query: attempt.query, source: attempt.source }, baseTrack.requester)
                .catch(() => null);
            if (!result ||
                !result.tracks.length ||
                result.loadType === 'empty' ||
                result.loadType === 'error') {
                continue;
            }
            const pick = this.pickTrack(player, baseTrack, result.tracks, collected);
            if (!pick)
                continue;
            (0, trackPlaylist_js_1.markNonPlaylistTracks)([pick]);
            if (collected)
                collected.push(pick);
            else
                player.queue.add(pick);
            return true;
        }
        return false;
    }
    async relatedCandidates(track) {
        switch (this.sourceName(track)) {
            case 'youtube':
            case 'youtubemusic':
                return this.youtubeRelated(track);
            case 'soundcloud':
                return this.soundCloudRelated(track);
            case 'spotify':
                return this.spotifyRelated(track);
            case 'applemusic':
                return this.appleMusicRelated(track);
            default:
                return [];
        }
    }
    async requestYoutubeWithRetry(url, init) {
        let res = await this.requestJson(url, init);
        for (let attempt = 1; attempt < 5; attempt++) {
            if (res.status !== 403 && res.status !== 429)
                return res;
            res = await this.requestJson(url, init);
        }
        return res;
    }
    async youtubeRelated(track) {
        const videoId = this.youtubeVideoId(track);
        if (!videoId)
            return [];
        const isMusic = this.sourceName(track) === 'youtubemusic' ||
            track.info.uri?.toLowerCase().includes('music.youtube.com');
        // YouTube Music has its own radio queue. It is much more relevant than
        // the regular YouTube related feed, so try it first and only fall back to
        // YouTube when the music feed returns nothing.
        if (isMusic) {
            const musicCandidates = await this.youtubeMusicRelated(videoId);
            if (musicCandidates.length)
                return musicCandidates;
        }
        return this.youtubeVideoRelated(videoId);
    }
    async youtubeMusicRelated(videoId) {
        const visitorData = await this.auth.getYoutubeVisitor().catch(() => undefined);
        const client = {
            clientName: 67,
            clientVersion: '1.20261231',
            hl: 'en',
            gl: 'US',
            visitorData: visitorData ?? undefined,
        };
        const fields = 'contents.singleColumnMusicWatchNextResultsRenderer.tabbedRenderer.watchNextTabbedResultsRenderer.tabs.tabRenderer.content.musicQueueRenderer.content.playlistPanelRenderer.contents(playlistPanelVideoRenderer(videoId,title(runs(text)),shortBylineText(runs(text))))';
        const res = await this.requestYoutubeWithRetry(`https://music.youtube.com/youtubei/v1/next?prettyPrint=false&fields=${encodeURIComponent(fields)}`, {
            method: 'POST',
            headers: {
                ...auth_js_1.localSearchHeaders,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                context: { client },
                attestationRequest: { omitBotguardData: false },
                playlistId: `RDAMVM${videoId}`,
            }),
        });
        if (res.status >= 400 || !res.data)
            return [];
        const tabs = res.data?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer
            ?.watchNextTabbedResultsRenderer?.tabs ?? [];
        const items = [];
        for (const tab of tabs) {
            const contents = tab?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer?.contents;
            if (Array.isArray(contents))
                items.push(...contents);
        }
        return items
            .map((item) => {
            const view = item.playlistPanelVideoRenderer;
            if (!view?.videoId || view.videoId === videoId)
                return null;
            const title = (view.title?.runs ?? [])
                .map((run) => run?.text)
                .filter(Boolean)
                .join('');
            const author = (view.shortBylineText?.runs ?? [])
                .map((run) => run?.text)
                .filter(Boolean)
                .join('');
            return {
                source: 'youtubemusic',
                identifier: view.videoId,
                // Use the standard YouTube URL so Lavalink can resolve it even when
                // its source regex does not accept music.youtube.com links.
                url: `https://www.youtube.com/watch?v=${view.videoId}`,
                title: title || undefined,
                author: author || undefined,
            };
        })
            .filter((item) => !!item?.url);
    }
    async youtubeVideoRelated(videoId) {
        const visitorData = await this.auth.getYoutubeVisitor().catch(() => undefined);
        const client = {
            clientName: 1,
            clientVersion: '2.20261231',
            hl: 'en',
            gl: 'US',
            visitorData: visitorData ?? undefined,
        };
        const fields = 'contents.twoColumnWatchNextResults.secondaryResults.secondaryResults.results(lockupViewModel(contentId,contentType,metadata(lockupMetadataViewModel(title(content),metadata(contentMetadataViewModel(metadataRows(metadataParts(text(content)))))))))';
        const res = await this.requestYoutubeWithRetry(`https://m.youtube.com/youtubei/v1/next?prettyPrint=false&fields=${encodeURIComponent(fields)}`, {
            method: 'POST',
            headers: {
                ...auth_js_1.localSearchHeaders,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ context: { client }, videoId }),
        });
        const results = res.data?.contents?.twoColumnWatchNextResults?.secondaryResults?.secondaryResults?.results ??
            [];
        return results
            .map((item) => {
            const view = item.lockupViewModel;
            const contentType = String(view?.contentType ?? '');
            if (!view?.contentId ||
                (!contentType.endsWith('_VIDEO') && !contentType.endsWith('_MUSIC')))
                return null;
            return {
                source: 'youtube',
                identifier: view.contentId,
                url: `https://www.youtube.com/watch?v=${view.contentId}`,
                title: view.metadata?.lockupMetadataViewModel?.title?.content,
                author: view.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel
                    ?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content,
            };
        })
            .filter((item) => !!item?.url);
    }
    async soundCloudRelated(track, refreshAuth = false) {
        const clientId = await this.auth.getSoundCloudClientId(refreshAuth);
        if (!clientId) {
            if (!refreshAuth)
                return this.soundCloudRelated(track, true);
            return [];
        }
        const trackId = await this.soundCloudTrackId(track, clientId);
        if (!trackId) {
            if (!refreshAuth)
                return this.soundCloudRelated(track, true);
            return [];
        }
        const url = new URL(`https://api-v2.soundcloud.com/tracks/${trackId}/related`);
        url.searchParams.set('client_id', clientId);
        url.searchParams.set('limit', String(this.relatedFetchLimit(20)));
        const res = await this.requestJson(url.toString(), {
            headers: auth_js_1.localSearchHeaders,
        });
        if (res.status === 401 && !refreshAuth)
            return this.soundCloudRelated(track, true);
        // SoundCloud 403 means this IP/token is blocked
        if (res.status === 403)
            return null;
        return (res.data?.collection ?? [])
            .map((item) => {
            if (!item.permalink_url)
                return null;
            return {
                source: 'soundcloud',
                identifier: item.id ? String(item.id) : undefined,
                url: item.permalink_url,
                title: item.title,
                author: item.user?.permalink ?? item.user?.username,
            };
        })
            .filter((item) => !!item?.url);
    }
    async spotifyRelated(track, refreshAuth = false) {
        const trackId = this.spotifyTrackId(track);
        if (!trackId)
            return [];
        let auth = await this.auth.getSpotifyAuth(refreshAuth);
        if (!auth) {
            if (!refreshAuth)
                auth = await this.auth.getSpotifyAuth(true);
            if (!auth)
                return [];
        }
        const res = await this.requestJson('https://api-partner.spotify.com/pathfinder/v2/query', {
            method: 'POST',
            headers: {
                ...auth_js_1.localSearchHeaders,
                Accept: 'application/json',
                'App-Platform': 'WebPlayer',
                Authorization: `Bearer ${auth.accessToken}`,
                'Client-Token': auth.clientToken,
                'Content-Type': 'application/json',
                Origin: 'https://open.spotify.com',
            },
            body: JSON.stringify({
                variables: {
                    uri: `spotify:track:${trackId}`,
                    limit: this.relatedFetchLimit(20),
                },
                operationName: 'internalLinkRecommenderTrack',
                extensions: {
                    persistedQuery: {
                        version: 1,
                        sha256Hash: 'c77098ee9d6ee8ad3eb844938722db60570d040b49f41f5ec6e7be9160a7c86b',
                    },
                },
            }),
        });
        if ((res.status === 401 || res.status === 400) && !refreshAuth) {
            return this.spotifyRelated(track, true);
        }
        if (res.status === 403 || res.status === 429)
            return [];
        const items = res.data?.data?.seoRecommendedTrack?.items ?? [];
        return items
            .map((item) => {
            const data = item.data;
            if (!data?.id)
                return null;
            const artists = data.artists?.items
                ?.map((artist) => artist.profile?.name)
                .filter(Boolean)
                .join(', ') ?? '';
            return {
                source: 'spotify',
                identifier: data.id,
                url: `https://open.spotify.com/track/${data.id}`,
                title: data.name,
                author: artists,
            };
        })
            .filter((item) => !!item?.url);
    }
    async appleMusicRelated(track) {
        const baseTrackId = this.appleMusicTrackId(track);
        const candidates = [];
        const seen = new Set();
        for (const query of this.appleMusicSearchQueries(track)) {
            const url = new URL('https://itunes.apple.com/search');
            url.searchParams.set('term', query);
            url.searchParams.set('media', 'music');
            url.searchParams.set('entity', 'song');
            url.searchParams.set('limit', String(this.relatedFetchLimit(50)));
            const res = await this.requestJson(url.toString(), {
                headers: auth_js_1.localSearchHeaders,
            });
            if (res.status >= 400)
                continue;
            for (const item of res.data?.results ?? []) {
                const trackId = item.trackId ? String(item.trackId) : undefined;
                if (!item.trackViewUrl || !trackId || trackId === baseTrackId)
                    continue;
                if (item.wrapperType !== 'track' || item.kind !== 'song')
                    continue;
                const key = trackId || item.trackViewUrl;
                if (seen.has(key))
                    continue;
                seen.add(key);
                candidates.push({
                    source: 'applemusic',
                    identifier: trackId,
                    url: item.trackViewUrl,
                    title: item.trackName,
                    author: item.artistName,
                });
            }
        }
        return candidates;
    }
    async soundCloudTrackId(track, clientId) {
        if (/^\d+$/.test(track.info.identifier))
            return track.info.identifier;
        if (!track.info.uri)
            return null;
        const url = new URL('https://api-v2.soundcloud.com/resolve');
        url.searchParams.set('client_id', clientId);
        url.searchParams.set('url', track.info.uri);
        const res = await this.requestJson(url.toString(), {
            headers: auth_js_1.localSearchHeaders,
        });
        return res.data?.id ? String(res.data.id) : null;
    }
    buildSearchAttempts(track) {
        const sourceName = this.sourceName(track);
        const textQuery = this.textQuery(track);
        const attempts = [];
        const add = (query, source) => {
            const trimmed = query.trim();
            if (!trimmed || !source)
                return;
            if (trimmed.toLowerCase() === 'null')
                return;
            const attempt = { query: trimmed, source: source };
            if (attempts.some((item) => item.query === attempt.query && item.source === attempt.source))
                return;
            attempts.push(attempt);
        };
        if (track.info.identifier) {
            switch (sourceName) {
                case 'spotify':
                    add(track.info.identifier, 'sprec');
                    break;
                case 'applemusic':
                case 'apple music':
                    add(track.info.identifier, 'amrec');
                    break;
                case 'deezer':
                    add(track.info.identifier, 'dzrec');
                    break;
                case 'yandex':
                case 'yandexmusic':
                    add(track.info.identifier, 'ymrec');
                    break;
                case 'vkmusic':
                case 'vk':
                    add(track.info.identifier, 'vkrec');
                    break;
                case 'tidal':
                    add(track.info.identifier, 'tdrec');
                    break;
                case 'qobuz':
                    add(track.info.identifier, 'qbrec');
                    break;
            }
        }
        if (sourceName === 'soundcloud')
            add(textQuery, 'scsearch');
        const broaderQueries = this.broaderTextQueries(track);
        for (const source of this.textSearchSources(sourceName)) {
            add(textQuery, source);
            for (const query of broaderQueries)
                add(query, source);
        }
        return attempts;
    }
    textSearchSources(sourceName) {
        const preferred = this.isTextSearchSource(this.options.defaultAutoPlaySource) &&
            sourceName !== 'youtube' &&
            sourceName !== 'youtubemusic'
            ? this.options.defaultAutoPlaySource
            : this.options.defaultSearchPlatform;
        return [preferred, 'ytmsearch', 'ytsearch'].filter((source, index, sources) => this.isTextSearchSource(source) && sources.indexOf(source) === index);
    }
    isTextSearchSource(source) {
        return typeof source === 'string' && source.endsWith('search');
    }
    pickTrack(player, baseTrack, tracks, collected) {
        const blockedIdentifiers = new Set();
        const blockedUris = new Set();
        const block = (track) => {
            if (!track)
                return;
            if (track.info.identifier)
                blockedIdentifiers.add(track.info.identifier);
            if (track.info.uri)
                blockedUris.add(track.info.uri);
        };
        block(baseTrack);
        block(player.queue.current);
        for (const track of player.queue.previous ?? [])
            block(track);
        for (const track of player.queue.tracks ?? [])
            block(track);
        for (const track of collected ?? [])
            block(track);
        const pool = tracks.filter((track) => {
            if (track.info.identifier && blockedIdentifiers.has(track.info.identifier))
                return false;
            if (track.info.uri && blockedUris.has(track.info.uri))
                return false;
            return !this.hasSimilarTitle(baseTrack, track);
        });
        if (!pool.length)
            return null;
        return this.shuffleArray(pool)[0];
    }
    isBlockedCandidate(player, baseTrack, candidate, collected) {
        if (candidate.url === baseTrack.info.uri || candidate.identifier === baseTrack.info.identifier)
            return true;
        if (this.hasSimilarLocalTitle(baseTrack, candidate))
            return true;
        const queuedTracks = [
            player.queue.current,
            ...(player.queue.previous ?? []),
            ...(player.queue.tracks ?? []),
            ...(collected ?? []),
        ];
        return queuedTracks.some((track) => {
            if (!track)
                return false;
            if (candidate.url && track.info.uri === candidate.url)
                return true;
            return !!candidate.identifier && track.info.identifier === candidate.identifier;
        });
    }
    hasSimilarLocalTitle(baseTrack, candidate) {
        const baseTitle = this.normalize(baseTrack.info.title);
        const candidateTitle = this.normalize(candidate.title ?? '');
        if (!baseTitle || !candidateTitle)
            return false;
        if (baseTitle === candidateTitle)
            return true;
        const baseAuthor = this.normalize(baseTrack.info.author);
        const candidateAuthor = this.normalize(candidate.author ?? '');
        if (baseAuthor && candidateAuthor && baseAuthor === candidateAuthor) {
            return baseTitle.includes(candidateTitle) || candidateTitle.includes(baseTitle);
        }
        return false;
    }
    hasSimilarTitle(baseTrack, candidate) {
        const baseTitle = this.normalize(baseTrack.info.title);
        const candidateTitle = this.normalize(candidate.info.title);
        if (!baseTitle || !candidateTitle)
            return false;
        if (baseTitle === candidateTitle)
            return true;
        const baseAuthor = this.normalize(baseTrack.info.author);
        const candidateAuthor = this.normalize(candidate.info.author);
        if (baseAuthor && candidateAuthor && baseAuthor === candidateAuthor) {
            return baseTitle.includes(candidateTitle) || candidateTitle.includes(baseTitle);
        }
        return false;
    }
    sourceName(track) {
        const source = String(track.info.sourceName ?? '')
            .toLowerCase()
            .replace(/\s+/g, '');
        if (source)
            return source;
        const uri = (track.info.uri ?? '').toLowerCase();
        if (uri.includes('music.youtube.com'))
            return 'youtubemusic';
        if (uri.includes('youtube.com') || uri.includes('youtu.be'))
            return 'youtube';
        if (uri.includes('soundcloud.com'))
            return 'soundcloud';
        if (uri.includes('spotify.com'))
            return 'spotify';
        if (uri.includes('music.apple.com'))
            return 'applemusic';
        if (uri.includes('deezer.com'))
            return 'deezer';
        return '';
    }
    relatedFetchLimit(cap) {
        return Math.min(Math.max(this.autoplayOptions.maxFetchTracks * 3, 5), cap);
    }
    shuffleArray(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
    normalize(value) {
        return (value ?? '')
            .toString()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }
    textQuery(track) {
        const author = (track.info.author ?? '').toString().trim();
        const title = (track.info.title ?? '').toString().trim();
        if (author && title)
            return `${author} ${title}`;
        if (title)
            return title;
        if (author)
            return author;
        return 'popular music';
    }
    broaderTextQueries(track) {
        const author = (track.info.author ?? '').toString().trim();
        if (!author)
            return ['popular music'];
        return [`${author} mix`, `${author} songs`];
    }
    youtubeVideoId(track) {
        const source = this.sourceName(track);
        const uri = track.info.uri ?? '';
        if (source && source !== 'youtube' && source !== 'youtubemusic')
            return null;
        if (!source && !/youtube\.com|youtube\.be|youtu\.be/i.test(uri))
            return null;
        if (/^[A-Za-z0-9_-]{11}$/.test(track.info.identifier))
            return track.info.identifier;
        return (track.info.uri.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1] ??
            track.info.uri.match(/youtu\.be\/([A-Za-z0-9_-]{11})/)?.[1] ??
            track.info.uri.match(/\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/)?.[1] ??
            null);
    }
    spotifyTrackId(track) {
        const source = this.sourceName(track);
        const uri = track.info.uri ?? '';
        if (source && source !== 'spotify')
            return null;
        if (!source && !/spotify/i.test(uri))
            return null;
        if (/^[A-Za-z0-9]{22}$/.test(track.info.identifier))
            return track.info.identifier;
        return (track.info.identifier.match(/spotify:track:([A-Za-z0-9]+)/)?.[1] ??
            track.info.uri.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/)?.[1] ??
            track.info.uri.match(/spotify:track:([A-Za-z0-9]+)/)?.[1] ??
            null);
    }
    appleMusicTrackId(track) {
        const source = this.sourceName(track);
        const uri = track.info.uri ?? '';
        if (source && source !== 'applemusic')
            return null;
        if (!source && !/music\.apple\.com/i.test(uri))
            return null;
        if (/^\d+$/.test(track.info.identifier))
            return track.info.identifier;
        return track.info.uri.match(/[?&]i=(\d+)/)?.[1] ?? null;
    }
    appleMusicSearchQueries(track) {
        const queries = [];
        const add = (query) => {
            const trimmed = query?.trim();
            if (!trimmed || queries.includes(trimmed))
                return;
            queries.push(trimmed);
        };
        const author = (track.info.author ?? '').toString().trim();
        const title = (track.info.title ?? '').toString().trim();
        const album = String(track.pluginInfo?.albumName ?? '').trim();
        add(author);
        if (author && album)
            add(`${author} ${album}`);
        if (author && title)
            add(`${author} ${title}`);
        add(this.textQuery(track));
        return queries.length ? queries : ['popular music'];
    }
    async requestJson(url, init) {
        try {
            const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
            const text = await res.text();
            try {
                return { status: res.status, data: JSON.parse(text) };
            }
            catch {
                return { status: res.status, data: null };
            }
        }
        catch {
            return { status: 0, data: null };
        }
    }
}
exports.PlayerRelatingManager = PlayerRelatingManager;
//# sourceMappingURL=playerRelating.js.map