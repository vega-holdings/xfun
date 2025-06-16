// ==UserScript==
// @name         Twitter Ultimate Filter & Block Tool
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Comprehensive Twitter filtering, blocking, and enhancement tool with configurable settings
// @author       You
// @match        *://*.twitter.com/*
// @match        *://*.x.com/*
// @include      *://*.twitter.com/*
// @include      *://*.x.com/*
// @grant        GM_log
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-start
// @require      https://cdn.jsdelivr.net/npm/axios@0.25.0/dist/axios.min.js
// @require      https://cdn.jsdelivr.net/npm/qs@6.10.3/dist/qs.min.js
// @require      https://cdn.jsdelivr.net/npm/jquery@3.5.1/dist/jquery.min.js
// ==/UserScript==

/* global axios $ Qs */

(function() {
    'use strict';

    // ==================== SETTINGS MANAGEMENT ====================
    const DEFAULT_SETTINGS = {
        // Keyword/Ratio Filter Settings
        filterEnabled: true,
        bannedWords: 'groyper,nafo',
        whitelistedHandles: 'someVIP,anotherVIP',
        followLimit: 100,
        ratioLimit: 10,
        
        /*
        // Not Interested Button Settings (disabled)
        notInterestedEnabled: true,
        onlyForYouFeed: true,
        */
        
        // Block With Love Settings
        blockToolsEnabled: true,
        autoBlockEnabled: true,
        autoBlockWords: 'groyper,fella,1488,noticer,troon',

        // UI Settings
        showSettingsPanel: true,
        debugMode: false,
        eventLogging: true
    };

    let settings = { ...DEFAULT_SETTINGS };

    function loadSettings() {
        try {
            const saved = GM_getValue('twitterUltimateSettings', '{}');
            settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
        } catch (e) {
            console.log('[Twitter Ultimate] Failed to load settings, using defaults');
            settings = { ...DEFAULT_SETTINGS };
        }
    }

    function saveSettings() {
        try {
            GM_setValue('twitterUltimateSettings', JSON.stringify(settings));
        } catch (e) {
            console.error('[Twitter Ultimate] Failed to save settings');
        }
    }

    function log(...args) {
        if (settings.debugMode) {
            console.log('%c[Twitter Ultimate]', 'background: #1DA1F2; color: white', ...args);
        }
    }

    // Log message regardless of debug setting
    function info(...args) {
        console.log('%c[Twitter Ultimate]', 'background: #1DA1F2; color: white', ...args);
    }

 oig3ub-codex/ensure-full-functionality-and-filtering-options
    function eventLog(...args) {
        if (settings.eventLogging) {
            console.log('%c[Twitter Event]', 'background: #FFAD1F; color: black', ...args);
        }
    }

=======
 main
    // ==================== KEYWORD/RATIO FILTER MODULE ====================
    class TwitterFilterModule {
        constructor() {
            this.bannedWords = [];
            this.whitelistedHandles = new Set();
            this.blf_exception_log = [];
            this.filteredCount = 0;
            this.init();
        }

        init() {
            if (!settings.filterEnabled) return;

            this.updateBannedWords();
            this.updateWhitelistedHandles();
            this.hookXHR();
            info('Filter module initialized');
            info(`Banned words: ${this.bannedWords.join(', ') || 'none'}`);
            info(`Follower limit: ${settings.followLimit}, ratio limit: ${settings.ratioLimit}`);
        }

        updateBannedWords() {
            this.bannedWords = settings.bannedWords.split(',')
                .map(w => w.trim().toLowerCase())
                .filter(Boolean);
        }

        updateWhitelistedHandles() {
            this.whitelistedHandles = new Set(
                settings.whitelistedHandles.split(',')
                    .map(h => h.trim().toLowerCase())
                    .filter(Boolean)
            );
        }

        hookXHR() {
            const self = this;
            const oldXHROpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function() {
                if (arguments.length >= 2) {
                    const url = arguments[1];
                    if (
                        url.includes('/HomeTimeline') ||
                        url.includes('/HomeLatestTimeline') ||
                        url.includes('/TweetDetail') ||
                        url.includes('/search/adaptive.json') ||
                        url.includes('/notifications/all.json') ||
                        url.includes('/notifications/mentions.json')
                    ) {
                        if (!this._hooked) {
                            this._hooked = true;
                            this.hookResponse(self);
                        }
                    }
                }
                return oldXHROpen.apply(this, arguments);
            };

            XMLHttpRequest.prototype.hookResponse = function(filterInstance) {
                const xhr = this;
                const getter = function() {
                    delete xhr.responseText;
                    let response = xhr.responseText;

                    try {
                        let json = JSON.parse(response);
                        filterInstance.filterContent(json);
                        response = JSON.stringify(json);
                    } catch (e) {
                        filterInstance.logException(e);
                    }

                    Object.defineProperty(xhr, 'responseText', {
                        value: response,
                        writable: false
                    });
                    return response;
                };

                Object.defineProperty(this, 'responseText', {
                    get: getter,
                    configurable: true
                });
            };
        }

        logException(e) {
            while (this.blf_exception_log.length >= 10) {
                this.blf_exception_log.shift();
            }
            this.blf_exception_log.push(e);
            log('Exception:', e);
        }

        getHideReasons(user) {
            if (user.we_follow || user.followed_by) return [];
            if (this.whitelistedHandles.has(user.handle.toLowerCase())) return [];

            let reasons = [];
            const handleDesc = (user.handle + " " + user.description).toLowerCase();
            
            for (const w of this.bannedWords) {
                if (handleDesc.includes(w)) {
                    reasons.push(`matched banned keyword: "${w}"`);
                }
            }

            if (user.followers > 0 && user.friends_count >= settings.ratioLimit * user.followers) {
                reasons.push(`follows >= ${settings.ratioLimit}x more accounts than followers`);
            }

            if (user.followers < settings.followLimit) {
                reasons.push(`has fewer than ${settings.followLimit} followers`);
            }

            return reasons;
        }

        filterContent(json) {
            if (json.data) {
                const instructions = (
                    json.data.home?.home_timeline_urt?.instructions ||
                    json.data.threaded_conversation_with_injections_v2?.instructions ||
                    []
                );

                instructions.forEach(instruction => {
                    if (instruction.type === 'TimelineAddEntries') {
                        instruction.entries.forEach(entry => {
                            this.processEntry(entry);
                        });
                    }
                });
            }
        }

        processEntry(entry) {
            if (!entry.content) return;

            if (entry.content.entryType === 'TimelineTimelineItem') {
                this.processTimelineItem(entry.content.itemContent);
            } else if (entry.content.entryType === 'TimelineTimelineModule') {
                entry.content.items?.forEach(item => {
                    this.processTimelineItem(item.item.itemContent);
                });
            }
        }

        processTimelineItem(itemContent) {
            if (!itemContent || itemContent.itemType !== 'TimelineTweet') return;

            const tweetResults = itemContent.tweet_results;
            if (!tweetResults?.result) return;

            const userData = this.extractUserData(tweetResults.result);
            if (!userData) return;

            const reasons = this.getHideReasons(userData);
            if (reasons.length > 0) {
                this.hideTweet(tweetResults);
                this.filteredCount++;
                info(`Filtered tweet from @${userData.handle}`);
                eventLog(`Hidden @${userData.handle}`, `Reasons: ${reasons.join('; ')}`);
                log(`Filtered count: ${this.filteredCount}`);
            } else {
                log(`Tweet from @${userData.handle} passed filters`);
            }
        }

        hideTweet(tweetResults) {
            if (tweetResults.result && tweetResults.result.__typename === 'Tweet') {
                tweetResults.result.__typename = '';
            }
        }

        extractUserData(tweetData) {
            if (!tweetData.core?.user_results?.result) return null;

            const userObj = tweetData.core.user_results.result;
            const legacyData = userObj.legacy;
            if (!legacyData) return null;

            return {
                id: userObj.rest_id,
                handle: legacyData.screen_name,
                name: legacyData.name,
                followers: legacyData.followers_count,
                friends_count: legacyData.friends_count,
                we_follow: legacyData.following,
                followed_by: legacyData.followed_by,
                description: legacyData.description || ""
            };
        }
    }

    /*
    // ==================== NOT INTERESTED BUTTON MODULE ====================
    class NotInterestedModule {
        constructor() {
            this.observer = null;
            this.init();
        }

        init() {
            if (!settings.notInterestedEnabled) return;
            
            this.initializeObserver();
            this.startPeriodicCheck();
            log('Not Interested module initialized');
        }

        isInForYouFeed() {
            if (!settings.onlyForYouFeed) return true;
            
            const tabs = document.querySelectorAll('[role="tab"]');
            for (const tab of tabs) {
                if (tab.textContent.includes('For you') && tab.getAttribute('aria-selected') === 'true') {
                    return true;
                }
            }
            return false;
        }

        createNotInterestedButton() {
            const button = document.createElement('button');
            button.className = 'css-175oi2r r-1777fci r-bt1l66 r-bztko3 r-lrvibr r-1loqt21 r-1ny4l3l not-interested-btn';
            button.setAttribute('aria-label', 'Not interested in this post');
            button.setAttribute('role', 'button');
            button.style.marginRight = '8px';
            button.innerHTML = `
                <div dir="ltr" class="css-146c3p1 r-bcqeeo r-1ttztb7 r-qvutc0 r-1qd0xha r-a023e6 r-rjixqe r-16dba41 r-1awozwy r-6koalj r-1h0z5md r-o7ynqc r-clp7b1 r-3s2u2q" style="color: rgb(113, 118, 123); display: flex; align-items: center;">
                    <div class="css-175oi2r r-xoduu5" style="display: flex; align-items: center;">
                        <svg viewBox="0 0 24 24" class="r-4qtqp9 r-yyyyoo r-1xvli5t r-dnmrzs r-bnwqim r-1plcrui r-lrvibr r-1hdv0qi" style="height: 1.25em;">
                            <g><path d="M9.5 7c.828 0 1.5 1.119 1.5 2.5S10.328 12 9.5 12 8 10.881 8 9.5 8.672 7 9.5 7zm5 0c.828 0 1.5 1.119 1.5 2.5s-.672 2.5-1.5 2.5S13 10.881 13 9.5 13.672 7 14.5 7zM12 22.25C6.348 22.25 1.75 17.652 1.75 12S6.348 1.75 12 1.75 22.25 6.348 22.25 12 17.652 22.25 12 22.25zm0-18.5c-4.549 0-8.25 3.701-8.25 8.25s3.701 8.25 8.25 8.25 8.25-3.701 8.25-8.25S16.549 3.75 12 3.75zM8.947 17.322l-1.896-.638C7.101 16.534 8.322 13 12 13s4.898 3.533 4.949 3.684l-1.897.633c-.031-.09-.828-2.316-3.051-2.316s-3.021 2.227-3.053 2.322z"></path></g>
                        </svg>
                    </div>
                </div>
            `;
            return button;
        }

        addNotInterestedClickHandler(button, article) {
            button.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                const moreButton = article.querySelector('[data-testid="caret"]');
                if (!moreButton) {
                    log('Could not find More button');
                    return;
                }
                moreButton.click();

                setTimeout(() => {
                    const menu = document.querySelector('[role="menu"]');
                    if (!menu) {
                        log('Menu not found');
                        return;
                    }

                    const notInterestedItem = Array.from(menu.querySelectorAll('[role="menuitem"]'))
                        .find(item => item.textContent.includes('Not interested in this post'));

                    if (notInterestedItem) {
                        log('Found Not Interested option, clicking it');
                        notInterestedItem.blur();
                        moreButton.focus();
                        notInterestedItem.click();
                        notInterestedItem.blur();
                        setTimeout(() => moreButton.focus(), 0);
                    } else {
                        log('Not Interested option not found in menu');
                        moreButton.click();
                    }
                }, 100);
            });
        }

        insertNotInterestedButton(article) {
            if (!this.isInForYouFeed()) return;

            if (!article.tagName || article.tagName !== 'ARTICLE') return;
            if (article.querySelector('.not-interested-btn')) return;

            const moreButton = article.querySelector('[data-testid="caret"]');
            if (!moreButton) return;

            const actionsContainer = moreButton.closest('.css-175oi2r.r-18u37iz.r-1h0z5md');
            if (!actionsContainer) return;

            const button = this.createNotInterestedButton();
            const container = document.createElement('div');
            container.className = 'css-175oi2r r-18u37iz r-1h0z5md';
            container.style.display = 'flex';
            container.style.alignItems = 'center';
            container.appendChild(button);

            actionsContainer.parentNode.insertBefore(container, actionsContainer);
            this.addNotInterestedClickHandler(button, article);
        }

        initializeObserver() {
            const config = { childList: true, subtree: true };

            this.observer = new MutationObserver((mutations) => {
                if (!this.isInForYouFeed()) return;

                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        if (node.tagName === 'ARTICLE') {
                            this.insertNotInterestedButton(node);
                        } else if (node.querySelector) {
                            const articles = node.querySelectorAll('article');
                            articles.forEach(article => this.insertNotInterestedButton(article));
                        }
                    }
                }
            });

            try {
                this.observer.observe(document.body, config);
                log('Successfully started observing document body');
            } catch (error) {
                console.error('Error starting observer:', error);
            }
        }

        startPeriodicCheck() {
            setInterval(() => {
                if (!this.isInForYouFeed()) return;

                const articles = document.querySelectorAll('article:not(:has(.not-interested-btn))');
                if (articles.length > 0) {
                    articles.forEach(article => this.insertNotInterestedButton(article));
                }
            }, 5000);
        }
    }

    */
    // ==================== BLOCK WITH LOVE MODULE ====================
    class BlockWithLoveModule {
        constructor() {
            this.queryIds = {};
            this.requestLimit = this.p_limit(2);
            this.auto_blocked = new Set();
            this.init();
        }

        init() {
            if (!settings.blockToolsEnabled) return;
            
            this.setupAjax();
            this.hookFetch();
            this.hookXhr();
            this.setupAutoBlock();
            log('Block With Love module initialized');
        }

        p_limit(concurrency) {
            const queue = [];
            let active = 0;
            const next = () => {
                if (active >= concurrency || !queue.length) return;
                const { fn, res, rej } = queue.shift();
                active++;
                Promise.resolve()
                    .then(fn)
                    .then(v => { active--; res(v); next(); },
                          e => { active--; rej(e); next(); });
            };
            return fn => new Promise((res, rej) => { queue.push({ fn, res, rej }); next(); });
        }

        setupAjax() {
            this.ajax = axios.create({
                baseURL: 'https://api.x.com',
                withCredentials: true,
                headers: {
                    Authorization: `Bearer ${this.getBearerToken()}`,
                    'X-Twitter-Auth-Type': 'OAuth2Session',
                    'X-Twitter-Active-User': 'yes',
                    'X-Csrf-Token': this.getCookie('ct0')
                }
            });
        }

        getCookie(cname) {
            const name = cname + '=';
            const ca = document.cookie.split(';');
            for (let i = 0; i < ca.length; ++i) {
                const c = ca[i].trim();
                if (c.indexOf(name) === 0) {
                    return c.substring(name.length, c.length);
                }
            }
            return '';
        }

        getBearerToken() {
            for (const script of document.querySelectorAll('script')) {
                const m = script.textContent.match(/Bearer\s+([A-Za-z0-9%-]+)/);
                if (m) return m[1];
            }
            return this.getCookie('ct0') || 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
        }

        hookFetch() {
            const origFetch = window.fetch;
            window.fetch = (...args) => {
                const req = args[0];
                const url = req instanceof Request ? req.url : req;
                this.captureQueryId(url);
                return origFetch.apply(window, args);
            };
        }

        hookXhr() {
            const self = this;
            const OrigOpen = XMLHttpRequest.prototype.open;
            const OrigSend = XMLHttpRequest.prototype.send;

            XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                this._tbwl_url = url;
                return OrigOpen.call(this, method, url, ...rest);
            };

            XMLHttpRequest.prototype.send = function(...args) {
                if (this._tbwl_url) self.captureQueryId(this._tbwl_url);
                return OrigSend.apply(this, args);
            };
        }

        captureQueryId(url) {
            let m;
            if ((m = /\/i\/api\/graphql\/([^/]+)\/Followers/.exec(url))) {
                this.queryIds.followers = { id: m[1], feat: this.extractFeat(url) };
            } else if ((m = /\/i\/api\/graphql\/([^/]+)\/UserByScreenName/.exec(url))) {
                this.queryIds.userByScreenName = { id: m[1], feat: this.extractFeat(url) };
            } else if ((m = /\/i\/api\/graphql\/([^/]+)\/Favoriters/.exec(url))) {
                this.queryIds.favoriters = { id: m[1], feat: this.extractFeat(url) };
            } else if ((m = /\/i\/api\/graphql\/([^/]+)\/Retweeters/.exec(url))) {
                this.queryIds.retweeters = { id: m[1], feat: this.extractFeat(url) };
            }
        }

        extractFeat(url) {
            try {
                const qs = url.split('?')[1] || '';
                const params = new URLSearchParams(qs);
                const out = [];
                if (params.has('features')) out.push('features=' + params.get('features'));
                if (params.has('fieldToggles')) out.push('fieldToggles=' + params.get('fieldToggles'));
                return out.join('&');
            } catch { return ''; }
        }

        setupAutoBlock() {
            if (!settings.autoBlockEnabled) return;

            const self = this;
            const autoBlockWords = settings.autoBlockWords.split(',').map(w => w.trim().toLowerCase()).filter(Boolean);

            const scanAutoBlock = () => {
                $('div[data-testid="UserCell"], div[data-testid="User-Name"]').each((_, el) => {
                    const $el = $(el);
                    if ($el.data('tbwlAuto')) return;
                    $el.data('tbwlAuto', true);
                    const link = $el.find('a[href^="/"]')[0];
                    if (!link) return;
                    const username = $(link).attr('href').split('/')[1];
                    const displayName = $el.text();
                    const reason = self.getAutoBlockReason(username, displayName, autoBlockWords);
                    if (!self.auto_blocked.has(username) && reason) {
                        self.auto_blocked.add(username);
                        eventLog(`Auto-blocking @${username}`, `Matched word: "${reason}"`);
                        self.blockByScreenName(username, reason);
                    }
                });
            };

            const startObserver = () => {
                new MutationObserver(scanAutoBlock).observe(document.body, {
                    childList: true,
                    subtree: true
                });
                scanAutoBlock();
            };

            if (document.body) {
                startObserver();
            } else {
                document.addEventListener('DOMContentLoaded', startObserver);
            }
        }

        shouldAutoBlock(username, displayName, autoBlockWords) {
            return this.getAutoBlockReason(username, displayName, autoBlockWords) !== null;
        }

        getAutoBlockReason(username, displayName, autoBlockWords) {
            const u = (username || '').toLowerCase();
            const d = (displayName || '').toLowerCase();
            for (const w of autoBlockWords) {
                if (u.includes(w) || d.includes(w)) return w;
            }
            return null;
        }

        async blockByScreenName(name, reason) {
            try {
                const resp = await this.safeCall(
                    'userByScreenName',
                    this.buildGqlUrl('userByScreenName', { screen_name: name })
                );
                const id = resp.data.data.user.result.rest_id;
                await this.requestLimit(() => this.blockUser(id));
                eventLog(`Blocked @${name}`, reason ? `Reason: ${reason}` : '');
                log(`Auto-blocked user: @${name}`);
            } catch (e) {
                console.error('[TBWL] auto block failed', name, e);
            }
        }

        blockUser(id) {
            eventLog('Blocking user ID', id);
            return this.ajax.post('/1.1/blocks/create.json', Qs.stringify({
                user_id: id
            }), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
        }

        muteUser(id) {
            eventLog('Muting user ID', id);
            return this.ajax.post('/1.1/mutes/users/create.json', Qs.stringify({
                user_id: id
            }), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
        }

        buildGqlUrl(key, vars) {
            const info = this.queryIds[key];
            if (!info) throw new Error(`[TBWL] Missing query ID for ${key}`);
            const { id, feat = '' } = typeof info === 'string' ? { id: info, feat: '' } : info;
            const opNameMap = {
                followers: 'Followers',
                userByScreenName: 'UserByScreenName',
                favoriters: 'Favoriters',
                retweeters: 'Retweeters'
            };
            const opName = opNameMap[key];
            if (!opName) throw new Error(`[TBWL] Unknown op ${key}`);
            const variables = encodeURIComponent(JSON.stringify(vars));
            return `/i/api/graphql/${id}/${opName}?variables=${variables}${feat ? '&' + feat : ''}`;
        }

        async safeCall(opKey, url) {
            try {
                return await this.ajax.get(url);
            } catch (e) {
                if (e.response?.status === 404 && this.queryIds[opKey]) {
                    delete this.queryIds[opKey];
                    // Retry logic would go here
                }
                throw e;
            }
        }
    }

    // ==================== SETTINGS UI MODULE ====================
    class SettingsUI {
        constructor() {
            this.panel = null;
            this.init();
        }

        init() {
            const start = () => {
                this.createSettingsPanel();
                this.registerMenuCommand();
                log('Settings UI initialized');
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', start);
            } else {
                start();
            }
        }

        registerMenuCommand() {
            GM_registerMenuCommand('Open Settings', () => {
                this.showSettingsPanel();
            });
        }

        createSettingsPanel() {
            this.panel = $(`
                <div id="twitter-ultimate-settings" inert style="
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: white;
                    border: 2px solid #1DA1F2;
                    border-radius: 12px;
                    padding: 20px;
                    z-index: 10000;
                    max-width: 500px;
                    max-height: 80vh;
                    overflow-y: auto;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    display: none;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h2 style="margin: 0; color: #1DA1F2;">Twitter Ultimate Settings</h2>
                        <button id="close-settings" style="background: none; border: none; font-size: 24px; cursor: pointer;">×</button>
                    </div>
                    
                    <div class="setting-section">
                        <h3>🔍 Content Filter</h3>
                        <label><input type="checkbox" id="filterEnabled"> Enable Content Filter</label><br>
                        <label>Banned Words (comma-separated):<br>
                            <input type="text" id="bannedWords" style="width: 100%; margin-top: 5px;"></label><br>
                        <label>Whitelisted Handles (comma-separated):<br>
                            <input type="text" id="whitelistedHandles" style="width: 100%; margin-top: 5px;"></label><br>
                        <label>Minimum Followers: <input type="number" id="followLimit" style="width: 80px;"></label><br>
                        <label>Ratio Limit (following/followers): <input type="number" id="ratioLimit" style="width: 80px;"></label>
                    </div>

                    <!--
                    <div class="setting-section">
                        <h3>👎 Not Interested Button</h3>
                        <label><input type="checkbox" id="notInterestedEnabled"> Show Not Interested Button</label><br>
                        <label><input type="checkbox" id="onlyForYouFeed"> Only on For You Feed</label>
                    </div>
                    -->

                    <div class="setting-section">
                        <h3>🚫 Block Tools</h3>
                        <label><input type="checkbox" id="blockToolsEnabled"> Enable Block Tools</label><br>
                        <label><input type="checkbox" id="autoBlockEnabled"> Enable Auto-Block</label><br>
                        <label>Auto-Block Words (comma-separated):<br>
                            <input type="text" id="autoBlockWords" style="width: 100%; margin-top: 5px;"></label>
                    </div>

                    <div class="setting-section">
                        <h3>⚙️ General</h3>
                        <label><input type="checkbox" id="debugMode"> Debug Mode</label><br>
                        <label><input type="checkbox" id="eventLogging"> Log Account Actions</label>
                    </div>

                    <div style="margin-top: 20px; text-align: center;">
                        <button id="save-settings" style="
                            background: #1DA1F2;
                            color: white;
                            border: none;
                            padding: 10px 20px;
                            border-radius: 6px;
                            cursor: pointer;
                            margin-right: 10px;
                        ">Save Settings</button>
                        <button id="reset-settings" style="
                            background: #657786;
                            color: white;
                            border: none;
                            padding: 10px 20px;
                            border-radius: 6px;
                            cursor: pointer;
                        ">Reset to Defaults</button>
                    </div>
                </div>
            `);

            $('body').append(this.panel);
            this.panel.prop('inert', true);
            this.setupEventHandlers();
            this.loadSettingsIntoUI();
        }

        setupEventHandlers() {
            $('#close-settings').click(() => this.hideSettingsPanel());
            $('#save-settings').click(() => this.saveSettingsFromUI());
            $('#reset-settings').click(() => this.resetSettings());

            // Close panel when clicking outside
            $(document).click((e) => {
                if ($(e.target).closest('#twitter-ultimate-settings').length === 0 && 
                    !$(e.target).is('#twitter-ultimate-settings')) {
                    this.hideSettingsPanel();
                }
            });
        }

        showSettingsPanel() {
            this.loadSettingsIntoUI();
            this.panel.prop('inert', false);
            this.panel.fadeIn();
        }

        hideSettingsPanel() {
            this.panel.find(':focus').blur();
            this.panel.prop('inert', true);
            this.panel.fadeOut();
        }

        loadSettingsIntoUI() {
            $('#filterEnabled').prop('checked', settings.filterEnabled);
            $('#bannedWords').val(settings.bannedWords);
            $('#whitelistedHandles').val(settings.whitelistedHandles);
            $('#followLimit').val(settings.followLimit);
            $('#ratioLimit').val(settings.ratioLimit);
            /*
            $('#notInterestedEnabled').prop('checked', settings.notInterestedEnabled);
            $('#onlyForYouFeed').prop('checked', settings.onlyForYouFeed);
            */
            $('#blockToolsEnabled').prop('checked', settings.blockToolsEnabled);
            $('#autoBlockEnabled').prop('checked', settings.autoBlockEnabled);
            $('#autoBlockWords').val(settings.autoBlockWords);
            $('#debugMode').prop('checked', settings.debugMode);
            $('#eventLogging').prop('checked', settings.eventLogging);
        }

        saveSettingsFromUI() {
            settings.filterEnabled = $('#filterEnabled').is(':checked');
            settings.bannedWords = $('#bannedWords').val();
            settings.whitelistedHandles = $('#whitelistedHandles').val();
            settings.followLimit = parseInt($('#followLimit').val()) || 100;
            settings.ratioLimit = parseInt($('#ratioLimit').val()) || 10;
            /*
            settings.notInterestedEnabled = $('#notInterestedEnabled').is(':checked');
            settings.onlyForYouFeed = $('#onlyForYouFeed').is(':checked');
            */
            settings.blockToolsEnabled = $('#blockToolsEnabled').is(':checked');
            settings.autoBlockEnabled = $('#autoBlockEnabled').is(':checked');
            settings.autoBlockWords = $('#autoBlockWords').val();
            settings.debugMode = $('#debugMode').is(':checked');
            settings.eventLogging = $('#eventLogging').is(':checked');

            saveSettings();
            this.hideSettingsPanel();

            info('Settings saved');

            // Show notification
            this.showNotification('Settings saved! Please refresh the page for all changes to take effect.');
            
            // Restart modules with new settings
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        }

        resetSettings() {
            if (confirm('Are you sure you want to reset all settings to defaults?')) {
                settings = { ...DEFAULT_SETTINGS };
                saveSettings();
                this.loadSettingsIntoUI();
                this.showNotification('Settings reset to defaults!');
                info('Settings reset to defaults');
            }
        }

        showNotification(message) {
            const notification = $(`
                <div style="
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: #1DA1F2;
                    color: white;
                    padding: 15px;
                    border-radius: 8px;
                    z-index: 10001;
                    max-width: 300px;
                ">${message}</div>
            `);
            
            $('body').append(notification);
            setTimeout(() => notification.fadeOut(() => notification.remove()), 3000);
        }
    }

    // ==================== INITIALIZATION ====================
    let filterModule, notInterestedModule, blockModule, settingsUI;

    function initializeModules() {
        loadSettings();

        const start = () => {
            // Initialize UI first
            settingsUI = new SettingsUI();

            // Initialize modules based on settings
            if (settings.filterEnabled) {
                filterModule = new TwitterFilterModule();
            } else {
                info('Filter module disabled via settings');
            }

            /*
            if (settings.notInterestedEnabled) {
                notInterestedModule = new NotInterestedModule();
            } else {
                info('Not Interested module disabled via settings');
            }
            */

            if (settings.blockToolsEnabled) {
                blockModule = new BlockWithLoveModule();
            } else {
                info('Block With Love module disabled via settings');
            }

            info('Twitter Ultimate Tool initialized');
            info(`Follower limit: ${settings.followLimit}, ratio limit: ${settings.ratioLimit}`);
            log('Debug mode is', settings.debugMode ? 'ON' : 'OFF');
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start);
        } else {
            start();
        }
    }

    // Start the tool
    initializeModules();

    // Add styles for settings panel
    $('head').append(`
        <style>
            #twitter-ultimate-settings .setting-section {
                margin-bottom: 20px;
                padding: 15px;
                background: #f7f9fa;
                border-radius: 8px;
            }
            #twitter-ultimate-settings .setting-section h3 {
                margin: 0 0 10px 0;
                color: #14171a;
            }
            #twitter-ultimate-settings label {
                display: block;
                margin: 8px 0;
                color: #14171a;
            }
            #twitter-ultimate-settings input[type="text"], 
            #twitter-ultimate-settings input[type="number"] {
                padding: 6px;
                border: 1px solid #ccd6dd;
                border-radius: 4px;
            }
            #twitter-ultimate-settings input[type="checkbox"] {
                margin-right: 8px;
            }
        </style>
    `);

    console.log('🚀 Twitter Ultimate Filter & Block Tool loaded successfully!');
})();
