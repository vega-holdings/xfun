// ==UserScript==
// @name         Twitter Ultimate Filter & Block Tool
// @namespace    http://tampermonkey.net/
// @version      1.0.1
// @description  Comprehensive Twitter filtering, blocking, and enhancement tool with configurable settings
// @author       You
// @match        https://twitter.com/*
// @match        https://x.com/*
// @match        https://www.twitter.com/*
// @match        https://www.x.com/*
// @grant        GM_log
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-end
// @require      https://cdn.jsdelivr.net/npm/axios@0.25.0/dist/axios.min.js
// @require      https://cdn.jsdelivr.net/npm/qs@6.10.3/dist/qs.min.js
// @require      https://cdn.jsdelivr.net/npm/jquery@3.5.1/dist/jquery.min.js
// ==/UserScript==

/* global axios $ Qs */

(function() {
    'use strict';
    
    // IMMEDIATE CONSOLE OUTPUT TO VERIFY SCRIPT LOADING
    console.log('%c🚀 TWITTER ULTIMATE USERSCRIPT LOADING...', 'background: red; color: white; font-size: 16px; padding: 5px;');
    console.log('URL:', window.location.href);
    console.log('User Agent:', navigator.userAgent);
    console.log('Tampermonkey available:', typeof GM_setValue !== 'undefined');
    console.log('jQuery available:', typeof $ !== 'undefined');
    console.log('Axios available:', typeof axios !== 'undefined');
    console.log('Qs available:', typeof Qs !== 'undefined');

    // ==================== SETTINGS MANAGEMENT ====================
    const DEFAULT_SETTINGS = {
        // Keyword/Ratio Filter Settings
        filterEnabled: true,
        bannedWords: 'groyper,nafo,goyim,goy,🇺🇸🇮🇱,🇮🇱🇺🇸',
        whitelistedHandles: 'someVIP,anotherVIP',
        followLimit: 100,
        ratioLimit: 5,
        
        /*
        // Not Interested Button Settings (disabled)
        notInterestedEnabled: true,
        onlyForYouFeed: true,
        */
        
        // Block With Love Settings
        blockToolsEnabled: true,
        autoBlockEnabled: true,
        autoBlockWords: 'groyper,fella,1488,noticer,troon,goyim,goy',

        // UI Settings
        showSettingsPanel: true,
        debugMode: true,
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

    function eventLog(...args) {
        if (settings.eventLogging) {
            console.log('%c[Twitter Event]', 'background: #FFAD1F; color: black', ...args);
        }
    }

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
            console.log('🔍 TwitterFilterModule.init() called');
            if (!settings.filterEnabled) {
                console.log('❌ Filter disabled in settings, aborting init');
                return;
            }

            console.log('⚙️ Initializing filter settings...');
            this.updateBannedWords();
            this.updateWhitelistedHandles();
            console.log('🔌 Setting up XHR hooks...');
            this.hookXHR();
            
            console.log('✅ FILTER MODULE FULLY INITIALIZED');
            console.log(`🚫 Banned words: ${this.bannedWords.join(', ') || 'none'}`);
            console.log(`👥 Whitelisted handles: ${Array.from(this.whitelistedHandles).join(', ') || 'none'}`);
            console.log(`📊 Follower limit: ${settings.followLimit}, ratio limit: ${settings.ratioLimit}`);
            console.log('🎯 Ready to filter Twitter content!');
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
            console.log('🔌 Setting up XHR hooks for Twitter API interception...');
            const self = this;
            const oldXHROpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function() {
                if (arguments.length >= 2) {
                    const url = arguments[1];
                    const isTargetUrl = (
                        url.includes('/HomeTimeline') ||
                        url.includes('/HomeLatestTimeline') ||
                        url.includes('/TweetDetail') ||
                        url.includes('/search/adaptive.json') ||
                        url.includes('/notifications/all.json') ||
                        url.includes('/notifications/mentions.json') ||
                        url.includes('/graphql/') ||
                        url.includes('/2/timeline/') ||
                        url.includes('timeline.json') ||
                        url.includes('home.json')
                    );
                    
                    if (isTargetUrl) {
                        console.log('🎯 INTERCEPTING REQUEST:', url);
                        if (!this._hooked) {
                            this._hooked = true;
                            this.hookResponse(self);
                            console.log('✅ Response hook attached');
                        }
                    } else {
                        // Only log non-target URLs occasionally to avoid spam
                        if (Math.random() < 0.1) {
                            console.log('📡 Non-target request:', url.substring(0, 100));
                        }
                    }
                }
                return oldXHROpen.apply(this, arguments);
            };

            XMLHttpRequest.prototype.hookResponse = function(filterInstance) {
                console.log('🔗 Setting up response interceptor...');
                const xhr = this;
                const getter = function() {
                    console.log('📥 PROCESSING RESPONSE...');
                    delete xhr.responseText;
                    let response = xhr.responseText;

                    try {
                        console.log('🔍 Parsing JSON response...');
                        let json = JSON.parse(response);
                        console.log('✅ JSON parsed successfully, filtering content...');
                        filterInstance.filterContent(json);
                        response = JSON.stringify(json);
                        console.log('✅ Response processed and modified');
                    } catch (e) {
                        console.log('❌ Error processing response:', e.message);
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
            if (!user || typeof user !== 'object') {
                log('Invalid user object passed to getHideReasons:', user);
                return [];
            }

            // Skip filtering for mutuals and whitelisted accounts
            if (user.we_follow || user.followed_by) {
                log(`Skipping filtering for mutual: @${user.handle}`);
                return [];
            }
            
            if (this.whitelistedHandles.has((user.handle || '').toLowerCase())) {
                log(`Skipping filtering for whitelisted: @${user.handle}`);
                return [];
            }

            let reasons = [];
            const handleDesc = ((user.handle || '') + " " + (user.name || '') + " " + (user.description || '')).toLowerCase();
            
            // Check banned words
            for (const w of this.bannedWords) {
                if (w && handleDesc.includes(w)) {
                    reasons.push(`matched banned keyword: "${w}"`);
                }
            }

            // Check ratio filtering (only if user has followers)
            const followers = Number(user.followers) || 0;
            const friends = Number(user.friends_count) || 0;
            
            // Flag accounts that follow significantly more people than follow them
            // Example: if ratioLimit is 10, flag accounts following 10x+ more than their followers
            if (followers > 0 && friends >= settings.ratioLimit * followers) {
                const actualRatio = (friends / followers).toFixed(1);
                reasons.push(`follows ${actualRatio}x more accounts than followers (${friends} following / ${followers} followers, limit: ${settings.ratioLimit}x)`);
                console.log(`🚫 Ratio filter triggered: ${friends}/${followers} = ${actualRatio}x (limit: ${settings.ratioLimit}x)`);
            } else if (followers > 0) {
                const actualRatio = (friends / followers).toFixed(1);
                console.log(`✅ Ratio OK: ${friends}/${followers} = ${actualRatio}x (limit: ${settings.ratioLimit}x)`);
            }

            // Check minimum followers
            if (followers < settings.followLimit) {
                reasons.push(`has fewer than ${settings.followLimit} followers (${followers})`);
            }

            if (reasons.length > 0) {
                log(`User @${user.handle} filtered:`, reasons);
            }

            return reasons;
        }

        filterContent(json) {
            console.log('🔍 FILTER CONTENT CALLED');
            if (!json || !json.data) {
                console.log('❌ No data in response');
                return;
            }

            console.log('📋 Response data keys:', Object.keys(json.data));

            // CHECK FOR BULK BLOCKING: Retweeters API response
            if (json.data.retweeters_timeline && window.location.href.includes('/retweets')) {
                console.log('🎯 RETWEETERS API DETECTED - Processing for bulk blocking!');
                if (window.blockModule) {
                    window.blockModule.processRetweetersAPIResponse(json);
                } else {
                    console.log('❌ blockModule not available');
                }
            }
            let instructions = [];

            // Try different response structures
            if (json.data.home?.home_timeline_urt?.instructions) {
                instructions = json.data.home.home_timeline_urt.instructions;
                console.log('✅ Found home timeline instructions:', instructions.length);
            } else if (json.data.threaded_conversation_with_injections_v2?.instructions) {
                instructions = json.data.threaded_conversation_with_injections_v2.instructions;
                console.log('✅ Found threaded conversation instructions:', instructions.length);
            } else if (json.data.user?.result?.timeline?.timeline?.instructions) {
                instructions = json.data.user.result.timeline.timeline.instructions;
                console.log('✅ Found user timeline instructions:', instructions.length);
            } else if (json.data.search_by_raw_query?.search_timeline?.timeline?.instructions) {
                instructions = json.data.search_by_raw_query.search_timeline.timeline.instructions;
                console.log('✅ Found search timeline instructions:', instructions.length);
            }

            if (instructions.length === 0) {
                console.log('❌ No timeline instructions found in response structure');
                console.log('🔍 Available data structure:', JSON.stringify(Object.keys(json.data), null, 2));
                return;
            }

            let processedCount = 0;
            let filteredCount = 0;
            instructions.forEach(instruction => {
                console.log('📝 Processing instruction type:', instruction.type);
                if (instruction.type === 'TimelineAddEntries' && instruction.entries) {
                    console.log('📊 Processing', instruction.entries.length, 'entries');
                    instruction.entries.forEach(entry => {
                        const wasFiltered = this.processEntry(entry);
                        processedCount++;
                        if (wasFiltered) filteredCount++;
                    });
                }
            });

            console.log(`✅ FILTERING COMPLETE: Processed ${processedCount} entries, filtered ${filteredCount}`);
        }

        processEntry(entry) {
            if (!entry.content) {
                console.log('🔍 Entry has no content, skipping');
                return false;
            }

            console.log('📄 Processing entry type:', entry.content.entryType);
            let wasFiltered = false;

            if (entry.content.entryType === 'TimelineTimelineItem') {
                wasFiltered = this.processTimelineItem(entry.content.itemContent);
            } else if (entry.content.entryType === 'TimelineTimelineModule') {
                if (entry.content.items) {
                    console.log('📦 Processing module with', entry.content.items.length, 'items');
                    entry.content.items?.forEach(item => {
                        if (this.processTimelineItem(item.item.itemContent)) {
                            wasFiltered = true;
                        }
                    });
                }
            } else {
                console.log('⏭️ Skipping entry type:', entry.content.entryType);
            }

            return wasFiltered;
        }

        processTimelineItem(itemContent) {
            if (!itemContent) {
                console.log('⚠️ No item content');
                return false;
            }

            console.log('📋 Item content type:', itemContent.itemType);
            console.log('📋 Item content keys:', Object.keys(itemContent));

            if (itemContent.itemType !== 'TimelineTweet') {
                console.log('⏭️ Skipping non-tweet item:', itemContent.itemType);
                return false;
            }

            const tweetResults = itemContent.tweet_results;
            if (!tweetResults?.result) {
                console.log('⚠️ No tweet results found in item');
                console.log('🔍 Available itemContent keys:', Object.keys(itemContent));
                return false;
            }

            console.log('🐦 Processing tweet...');
            console.log('🔍 Tweet result typename:', tweetResults.result.__typename);
            console.log('🔍 Tweet result keys:', Object.keys(tweetResults.result));
            
            const userData = this.extractUserData(tweetResults.result);
            if (!userData) {
                console.log('❌ Could not extract user data from tweet');
                return false;
            }

            // COLLECT USERS FOR BULK BLOCKING (if BlockWithLoveModule exists)
            if (window.blockModule && window.blockModule.collectUserForBulkBlocking) {
                window.blockModule.collectUserForBulkBlocking(userData);
            }

            console.log('👤 Checking user:', userData.handle, 'followers:', userData.followers);
            
            // DON'T FILTER ON BULK BLOCKING PAGES - we need to see the users to block them
            const url = window.location.href;
            if (url.includes('/retweets') || url.includes('/quotes')) {
                console.log('🔓 Skipping filter on bulk blocking page - need to see users to block them');
                return false;
            }
            
            const reasons = this.getHideReasons(userData);
            if (reasons.length > 0) {
                console.log('🚫 FILTERING TWEET from @' + userData.handle);
                console.log('📋 Reasons:', reasons);
                this.hideTweet(tweetResults);
                this.filteredCount++;
                console.log(`✅ Tweet filtered! Total filtered: ${this.filteredCount}`);
                eventLog(`Hidden @${userData.handle}`, `Reasons: ${reasons.join('; ')}`);
                return true;
            } else {
                console.log('✅ Tweet from @' + userData.handle + ' passed all filters');
                return false;
            }
        }

        hideTweet(tweetResults) {
            if (!tweetResults) return;
            
            // Method 1: Clear typename
            if (tweetResults.result) {
                const result = tweetResults.result;
                if (result.__typename === 'Tweet' || result.__typename === 'TweetWithVisibilityResults') {
                    result.__typename = 'TweetUnavailable';
                    log('Hidden tweet by changing typename');
                }
                
                // Method 2: Clear tweet content
                if (result.legacy) {
                    result.legacy = null;
                }
                
                // Method 3: Mark as tombstone
                result.tombstone = {
                    __typename: 'TextTombstone',
                    text: { text: 'This Tweet was filtered' }
                };
            }
            
            // Method 4: Clear entire result
            tweetResults.result = {
                __typename: 'TweetUnavailable',
                reason: 'ContentFiltered'
            };
        }

        extractUserData(tweetData) {
            // Raw tweet structure logging disabled for performance
            
            // Try multiple possible data paths for user data
            let userObj = null;
            let legacyData = null;

            // Path 1: tweetData.core.user_results.result (original)
            if (tweetData.core?.user_results?.result) {
                userObj = tweetData.core.user_results.result;
                legacyData = userObj.legacy;
                console.log('✅ Found user data via Path 1: core.user_results.result');
            }
            
            // Path 2: Alternative structure
            if (!legacyData && tweetData.core?.user?.legacy) {
                userObj = tweetData.core.user;
                legacyData = userObj.legacy;
                console.log('✅ Found user data via Path 2: core.user.legacy');
            }
            
            // Path 3: Direct legacy data
            if (!legacyData && tweetData.legacy) {
                legacyData = tweetData.legacy;
                userObj = tweetData;
                console.log('✅ Found user data via Path 3: direct legacy');
            }

            // Path 4: Check if it's a retweet or quoted tweet
            if (!legacyData && tweetData.quoted_status_result?.result?.core?.user_results?.result) {
                userObj = tweetData.quoted_status_result.result.core.user_results.result;
                legacyData = userObj.legacy;
                console.log('✅ Found user data via Path 4: quoted_status_result');
            }

            // Path 5: Check retweeted status
            if (!legacyData && tweetData.legacy?.retweeted_status_result?.result?.core?.user_results?.result) {
                userObj = tweetData.legacy.retweeted_status_result.result.core.user_results.result;
                legacyData = userObj.legacy;
                console.log('✅ Found user data via Path 5: retweeted_status_result');
            }

            if (!legacyData) {
                console.log('❌ Could not extract user data from tweet');
                console.log('🔍 Available top-level keys:', Object.keys(tweetData));
                if (tweetData.core) {
                    console.log('🔍 Core keys:', Object.keys(tweetData.core));
                }
                return null;
            }

            console.log('📋 Raw legacy data:', legacyData);

            // Check for relationship data in different locations
            let we_follow = false;
            let followed_by = false;
            
            // Check legacy data first
            if (legacyData?.following !== undefined) {
                we_follow = Boolean(legacyData.following);
            }
            if (legacyData?.followed_by !== undefined) {
                followed_by = Boolean(legacyData.followed_by);
            }
            
            // Check relationship_perspectives if legacy doesn't have it
            if (userObj?.relationship_perspectives) {
                if (userObj.relationship_perspectives.following !== undefined) {
                    we_follow = Boolean(userObj.relationship_perspectives.following);
                }
                if (userObj.relationship_perspectives.followed_by !== undefined) {
                    followed_by = Boolean(userObj.relationship_perspectives.followed_by);
                }
            }

            const userData = {
                id: userObj?.rest_id || userObj?.id_str || legacyData?.id_str || 'unknown',
                handle: legacyData?.screen_name || userObj?.core?.screen_name || 'unknown',
                name: legacyData?.name || userObj?.core?.name || 'unknown',
                followers: parseInt(legacyData?.followers_count || legacyData?.normal_followers_count) || 0,
                friends_count: parseInt(legacyData?.friends_count) || 0,
                we_follow: we_follow,
                followed_by: followed_by,
                description: legacyData?.description || ''
            };

            console.log('✅ Extracted user data:', userData);
            return userData;
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
            this.setupBulkBlockingFromAPI();
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
            const bearerToken = this.getBearerToken();
            const csrfToken = this.getCookie('ct0');
            
            console.log('🔐 Setting up AJAX with auth tokens...');
            console.log('Bearer token:', bearerToken ? bearerToken.substring(0, 50) + '...' : 'none');
            console.log('CSRF token:', csrfToken ? csrfToken.substring(0, 20) + '...' : 'none');
            console.log('All cookies:', document.cookie.split(';').map(c => c.trim().split('=')[0]));
            
            if (!csrfToken) {
                console.log('❌ Missing CSRF token - checking for alternative names...');
                const altCsrf = this.getCookie('csrf_token') || this.getCookie('x-csrf-token') || this.getCookie('_csrf');
                if (altCsrf) {
                    console.log('🔑 Found alternative CSRF token');
                } else {
                    console.log('❌ No CSRF token found at all');
                    eventLog('Blocking disabled', 'No CSRF token');
                    return;
                }
            }
            
            this.ajax = axios.create({
                baseURL: 'https://x.com',
                withCredentials: true,
                headers: {
                    'Accept': '*/*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Authorization': `Bearer ${bearerToken}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Client-Transaction-Id': this.generateTransactionId(),
                    'X-Csrf-Token': csrfToken,
                    'X-Twitter-Active-User': 'yes',
                    'X-Twitter-Auth-Type': 'OAuth2Session',
                    'X-Twitter-Client-Language': 'en'
                }
            });
            
            console.log('✅ AJAX client configured for blocking');
            
            // Test the configuration
            this.testAuth();
        }
        
        async testAuth() {
            try {
                console.log('🧪 Testing authentication...');
                const response = await this.ajax.get('/i/api/1.1/account/verify_credentials.json');
                console.log('✅ Auth test successful:', response.data.screen_name);
            } catch (e) {
                console.log('❌ Auth test failed:', e.response?.status, e.response?.statusText);
                if (e.response?.status === 401) {
                    console.log('💡 401 = Invalid/expired tokens. Try refreshing the page.');
                }
            }
        }

        generateTransactionId() {
            // Generate a transaction ID similar to Twitter's format
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
            let result = '';
            for (let i = 0; i < 150; i++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return result;
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
            // Try to find bearer token in script tags
            for (const script of document.querySelectorAll('script')) {
                const m = script.textContent.match(/Bearer\s+([A-Za-z0-9%-]+)/);
                if (m) {
                    console.log('🔑 Found Bearer token in script');
                    return m[1];
                }
            }
            
            // Try to find it in localStorage
            try {
                const stored = localStorage.getItem('twitter_bearer_token');
                if (stored) {
                    console.log('🔑 Found Bearer token in localStorage');
                    return stored;
                }
            } catch (e) {}
            
            // Fallback to known token
            console.log('🔑 Using fallback Bearer token');
            return 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
        }

        hookFetch() {
            const origFetch = window.fetch;
            const self = this;
            window.fetch = async (...args) => {
                const req = args[0];
                const url = req instanceof Request ? req.url : req;
                self.captureQueryId(url);
                
                const response = await origFetch.apply(window, args);
                
                // Debug: Log ALL fetch calls to see what's happening
                if (url.includes('graphql')) {
                    console.log('🌐 FETCH INTERCEPTED:', url.split('/').pop().split('?')[0]);
                }
                
                // Intercept Retweeters API responses for bulk blocking
                if (url.includes('/Retweeters?')) {
                    console.log('🎯 RETWEETERS FETCH DETECTED!');
                    console.log('📍 Current URL:', window.location.href);
                    
                    if (window.location.href.includes('/retweets')) {
                        try {
                            const clonedResponse = response.clone();
                            const json = await clonedResponse.json();
                            console.log('🔄 Processing Retweeters for bulk blocking...');
                            self.processRetweetersAPIResponse(json);
                        } catch (e) {
                            console.log('❌ Failed to process Retweeters:', e);
                        }
                    }
                }
                
                return response;
            };
            console.log('✅ Fetch hook installed for bulk blocking');
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
                console.log('📋 Captured Followers query ID');
            } else if ((m = /\/i\/api\/graphql\/([^/]+)\/UserByScreenName/.exec(url))) {
                this.queryIds.userByScreenName = { id: m[1], feat: this.extractFeat(url) };
                console.log('📋 Captured UserByScreenName query ID');
            } else if ((m = /\/i\/api\/graphql\/([^/]+)\/Favoriters/.exec(url))) {
                this.queryIds.favoriters = { id: m[1], feat: this.extractFeat(url) };
                console.log('📋 Captured Favoriters query ID');
            } else if ((m = /\/i\/api\/graphql\/([^/]+)\/Retweeters/.exec(url))) {
                this.queryIds.retweeters = { id: m[1], feat: this.extractFeat(url) };
                console.log('📋 Captured Retweeters query ID');
            } else if ((m = /\/i\/api\/graphql\/([^/]+)\/TweetDetail/.exec(url))) {
                this.queryIds.tweetDetail = { id: m[1], feat: this.extractFeat(url) };
                console.log('📋 Captured TweetDetail query ID');
            } else if ((m = /\/i\/api\/graphql\/([^/]+)\/QuoteTweeters/.exec(url))) {
                this.queryIds.quoteTweeters = { id: m[1], feat: this.extractFeat(url) };
                console.log('📋 Captured QuoteTweeters query ID');
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
                console.log(`🚫 Attempting to block @${name} for: ${reason}`);
                
                // Check if we have the required query ID
                if (!this.queryIds.userByScreenName) {
                    console.log('❌ No userByScreenName query ID available, skipping auto-block');
                    eventLog(`Auto-block skipped for @${name}`, 'No GraphQL query ID available');
                    return;
                }

                const resp = await this.safeCall(
                    'userByScreenName',
                    this.buildGqlUrl('userByScreenName', { screen_name: name })
                );
                
                if (!resp.data?.data?.user?.result?.rest_id) {
                    console.log('❌ Could not get user ID from GraphQL response');
                    return;
                }
                
                const id = resp.data.data.user.result.rest_id;
                console.log(`📋 Got user ID: ${id} for @${name}`);
                
                await this.requestLimit(() => this.blockUser(id));
                eventLog(`✅ Blocked @${name}`, reason ? `Reason: ${reason}` : '');
                console.log(`✅ Auto-blocked user: @${name}`);
            } catch (e) {
                console.error(`❌ Auto-block failed for @${name}:`, e.message);
                if (e.response?.status === 400) {
                    console.log('💡 400 error - likely invalid request format or missing auth');
                } else if (e.response?.status === 401) {
                    console.log('💡 401 error - authentication issue');
                } else if (e.response?.status === 403) {
                    console.log('💡 403 error - forbidden (rate limited or permissions)');
                }
                eventLog(`❌ Auto-block failed for @${name}`, e.message);
            }
        }

        setupBlockingUI() {
            console.log('🎛️ Setting up blocking UI...');
            
            const checkForBlockingPages = () => {
                const url = window.location.href;
                console.log('🔍 Checking URL for blocking opportunities:', url);
                
                // Check for retweets page: /status/123456/retweets
                if (/\/status\/\d+\/retweets/.test(url)) {
                    console.log('✅ Detected retweets page');
                    this.injectBlockingControls('retweets');
                }
                
                // Check for quotes page: /status/123456/quotes  
                else if (/\/status\/\d+\/quotes/.test(url)) {
                    console.log('✅ Detected quotes page');
                    this.injectBlockingControls('quotes');
                }
                
                // Check for followers page: /username/followers
                else if (/\/[^/]+\/followers/.test(url)) {
                    console.log('✅ Detected followers page');
                    this.injectBlockingControls('followers');
                }
            };

            // Check immediately
            checkForBlockingPages();

            // Check on navigation changes
            let lastUrl = window.location.href;
            const observer = new MutationObserver(() => {
                if (window.location.href !== lastUrl) {
                    lastUrl = window.location.href;
                    console.log('🔄 Navigation detected, checking for blocking pages...');
                    setTimeout(checkForBlockingPages, 1000); // Delay to let page load
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        injectBlockingControls(pageType) {
            console.log(`🎛️ Injecting blocking controls for ${pageType} page`);
            
            // Remove any existing controls
            $('.tbwl-blocking-controls').remove();
            
            // Wait for page to load
            setTimeout(() => {
                // Create a subtle floating panel in the bottom right
                const controls = $(`
                    <div class="tbwl-blocking-controls" style="
                        position: fixed;
                        bottom: 20px;
                        right: 20px;
                        background: var(--color-background-primary, #000);
                        color: var(--color-text-primary, #fff);
                        border: 1px solid var(--color-border-primary, #2f3336);
                        border-radius: 12px;
                        padding: 12px;
                        font-family: system-ui;
                        z-index: 1000;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                        max-width: 280px;
                        font-size: 14px;
                    ">
                        <div style="font-weight: bold; margin-bottom: 8px; display: flex; align-items: center;">
                            🚫 <span style="margin-left: 6px;">Bulk Tools</span>
                            <button id="tbwl-close-${pageType}" style="
                                background: none;
                                border: none;
                                color: var(--color-text-primary, #fff);
                                margin-left: auto;
                                cursor: pointer;
                                font-size: 16px;
                                padding: 0;
                            ">×</button>
                        </div>
                        <div style="margin-bottom: 8px;">
                            <button id="tbwl-block-all-${pageType}" style="
                                background: #f4212e;
                                color: white;
                                border: none;
                                padding: 6px 12px;
                                border-radius: 6px;
                                margin-right: 6px;
                                cursor: pointer;
                                font-size: 12px;
                            ">Block All</button>
                            <button id="tbwl-mute-all-${pageType}" style="
                                background: #536471;
                                color: white;
                                border: none;
                                padding: 6px 12px;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 12px;
                            ">Mute All</button>
                        </div>
                        <div id="tbwl-status-${pageType}" style="
                            font-size: 12px; 
                            color: var(--color-text-secondary, #71767b);
                            min-height: 16px;
                        ">Ready to process ${pageType}</div>
                    </div>
                `);

                $('body').append(controls);

                // Add click handlers
                $(`#tbwl-block-all-${pageType}`).click(() => this.startBulkAction(pageType, 'block'));
                $(`#tbwl-mute-all-${pageType}`).click(() => this.startBulkAction(pageType, 'mute'));
                $(`#tbwl-close-${pageType}`).click(() => $('.tbwl-blocking-controls').remove());

                console.log(`✅ Blocking controls injected for ${pageType}`);
            }, 2000);
        }

        async startBulkAction(pageType, action) {
            console.log(`🚫 Starting bulk ${action} for ${pageType}`);
            const statusEl = $(`#tbwl-status-${pageType}`);
            statusEl.text(`Starting bulk ${action}...`);

            // Try multiple selectors to find user elements
            let userCells = $('div[data-testid="UserCell"]');
            console.log(`📊 Found ${userCells.length} UserCell elements`);

            if (userCells.length === 0) {
                // Try alternative selectors
                userCells = $('div[data-testid="cellInnerDiv"]').filter((i, el) => {
                    return $(el).find('a[href^="/"]').length > 0;
                });
                console.log(`📊 Found ${userCells.length} cellInnerDiv elements with profile links`);
            }

            if (userCells.length === 0) {
                // Try finding any divs with profile links
                userCells = $('div').filter((i, el) => {
                    const $el = $(el);
                    return $el.find('a[href^="/"][href*="/"]').length > 0 && 
                           !$el.find('a[href^="/"][href*="/"]').attr('href').includes('/status/') &&
                           $el.find('a[href^="/"][href*="/"]').attr('href').split('/').length === 2;
                });
                console.log(`📊 Found ${userCells.length} elements with user profile links`);
            }

            if (userCells.length === 0) {
                console.log('🔍 Debugging: Looking for any profile links on page...');
                const allLinks = $('a[href^="/"]');
                console.log(`🔍 Total links starting with /: ${allLinks.length}`);
                
                allLinks.each((i, link) => {
                    const href = $(link).attr('href');
                    if (i < 10) { // Log first 10 for debugging
                        console.log(`🔍 Link ${i}: ${href}`);
                    }
                });

                statusEl.text('No users found on this page. Check console for debugging info.');
                return;
            }

            let processed = 0;
            let succeeded = 0;

            for (let i = 0; i < userCells.length; i++) {
                const cell = $(userCells[i]);
                
                // Try multiple ways to find the username link
                let link = cell.find('a[href^="/"]').filter((j, el) => {
                    const href = $(el).attr('href');
                    return href && href.split('/').length === 2 && !href.includes('/status/');
                }).first();

                if (!link.length) {
                    // Fallback: find any profile link in the cell
                    link = cell.find('a').filter((j, el) => {
                        const href = $(el).attr('href');
                        return href && href.match(/^\/[^\/]+$/);
                    }).first();
                }

                if (!link.length) {
                    console.log(`⚠️ No profile link found in cell ${i}`);
                    continue;
                }

                const href = link.attr('href');
                const username = href.replace('/', '');
                
                if (!username || username.includes('/') || username.length < 1) {
                    console.log(`⚠️ Invalid username extracted: "${username}" from href: "${href}"`);
                    continue;
                }

                console.log(`👤 Processing user: @${username}`);

                // SAFETY CHECK: Skip if this is a mutual or follower
                const userInfo = await this.getUserInfo(username);
                if (userInfo && (userInfo.we_follow || userInfo.followed_by)) {
                    console.log(`🛡️ SAFETY: Skipping @${username} - they are a mutual/follower`);
                    statusEl.text(`Skipped @${username} (mutual/follower) - ${processed + 1}/${userCells.length}`);
                    processed++;
                    continue;
                }

                try {
                    statusEl.text(`${action === 'block' ? 'Blocking' : 'Muting'} ${processed + 1}/${userCells.length}: @${username}`);
                    
                    if (action === 'block') {
                        await this.blockByScreenName(username, `Bulk ${pageType} block`);
                    } else {
                        await this.muteByScreenName(username, `Bulk ${pageType} mute`);
                    }
                    
                    succeeded++;
                } catch (e) {
                    console.error(`Failed to ${action} @${username}:`, e);
                }

                processed++;
                
                // Rate limiting delay
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            statusEl.text(`✅ Complete! ${action === 'block' ? 'Blocked' : 'Muted'} ${succeeded}/${processed} users`);
            console.log(`✅ Bulk ${action} complete: ${succeeded}/${processed} users`);
        }

        setupBulkBlockingFromAPI() {
            console.log('🎛️ Setting up user collection for bulk blocking...');
            this.retweetersData = [];
            this.quoteTweetersData = [];

            // Monitor URL changes to show bulk controls
            let lastUrl = window.location.href;
            const checkForBulkPages = () => {
                const url = window.location.href;
                if (url !== lastUrl) {
                    lastUrl = url;
                    setTimeout(() => this.maybeShowBulkControls(), 2000);
                }
            };

            const observer = new MutationObserver(checkForBulkPages);
            observer.observe(document.body, { childList: true, subtree: true });
            
            // Check immediately
            this.maybeShowBulkControls();
        }

        processRetweetersAPIResponse(json) {
            console.log('🔄 Processing Retweeters API response - handling multiple calls...');
            
            const newUsers = this.extractUsersFromRetweetersAPI(json);
            
            // Initialize retweetersData if not exists
            if (!this.retweetersData) {
                this.retweetersData = [];
            }
            
            // Add new users, avoiding duplicates
            let addedCount = 0;
            newUsers.forEach(newUser => {
                if (!this.retweetersData.find(existingUser => existingUser.id === newUser.id)) {
                    this.retweetersData.push(newUser);
                    addedCount++;
                }
            });
            
            console.log(`➕ Added ${addedCount} new retweeters (total: ${this.retweetersData.length})`);
            this.updateBulkControlsStatus('retweets', this.retweetersData.length);
            
            return this.retweetersData;
        }

        extractUsersFromRetweetersAPI(json) {
            console.log('📋 Extracting users from Retweeters GraphQL API response...');
            
            const users = [];
            
            // For Retweeters GraphQL endpoint, users are in data.retweeters_timeline.timeline
            if (json.data?.retweeters_timeline?.timeline?.instructions) {
                const instructions = json.data.retweeters_timeline.timeline.instructions;
                console.log(`📋 Processing ${instructions.length} instructions...`);
                
                instructions.forEach(instruction => {
                    console.log(`📝 Instruction type: ${instruction.type}`);
                    if (instruction.type === 'TimelineAddEntries' && instruction.entries) {
                        console.log(`📊 Processing ${instruction.entries.length} entries...`);
                        instruction.entries.forEach((entry, i) => {
                            console.log(`📄 Entry ${i}: ${entry.content?.entryType}`);
                            const userData = this.extractUserFromRetweetEntry(entry);
                            if (userData) {
                                users.push(userData);
                                console.log(`👤 Found retweeter: @${userData.handle}`);
                            }
                        });
                    }
                });
            } else {
                console.log('❌ Expected data structure not found for Retweeters');
                console.log('🔍 Available keys:', Object.keys(json.data || {}));
            }

            console.log(`✅ Extracted ${users.length} retweeters from this API call`);
            return users;
        }

        extractUsersFromQuoteTweetsAPI(json) {
            console.log('📋 Extracting users from Quote Tweets SearchTimeline API response...');
            
            const users = [];
            
            // For SearchTimeline (quotes), tweets are in data.search_by_raw_query.search_timeline.timeline
            if (json.data?.search_by_raw_query?.search_timeline?.timeline?.instructions) {
                const instructions = json.data.search_by_raw_query.search_timeline.timeline.instructions;
                console.log(`📋 Processing ${instructions.length} search instructions...`);
                
                instructions.forEach(instruction => {
                    console.log(`📝 Search instruction type: ${instruction.type}`);
                    if (instruction.type === 'TimelineAddEntries' && instruction.entries) {
                        console.log(`📊 Processing ${instruction.entries.length} search entries...`);
                        instruction.entries.forEach((entry, i) => {
                            console.log(`📄 Search Entry ${i}: ${entry.content?.entryType} - ${entry.entryId}`);
                            
                            // Based on your example, quotes are TimelineTweet entries
                            if (entry.content?.entryType === 'TimelineTimelineItem' && 
                                entry.content.itemContent?.itemType === 'TimelineTweet' &&
                                entry.content.itemContent.tweet_results?.result) {
                                
                                const tweetResult = entry.content.itemContent.tweet_results.result;
                                const userData = this.extractUserData(tweetResult);
                                if (userData && userData.handle !== 'unknown') {
                                    users.push(userData);
                                    console.log(`👤 Found quote tweeter: @${userData.handle} (${userData.followers} followers)`);
                                } else {
                                    console.log(`⚠️ Could not extract user data from tweet ${entry.entryId}`);
                                }
                            }
                        });
                    }
                });
            } else {
                console.log('❌ Expected search data structure not found for Quote Tweets');
                if (json.data) {
                    console.log('🔍 Available data keys:', Object.keys(json.data));
                    if (json.data.search_by_raw_query) {
                        console.log('🔍 search_by_raw_query keys:', Object.keys(json.data.search_by_raw_query));
                    }
                }
            }

            this.quoteTweetersData = users;
            console.log(`✅ Extracted ${users.length} quote tweeters total`);
            this.updateBulkControlsStatus('quotes', users.length);
            return users;
        }

        extractUserFromRetweetEntry(entry) {
            if (!entry.content) return null;
            
            // For retweeters, we get user entries directly
            if (entry.content.entryType === 'TimelineTimelineItem') {
                const itemContent = entry.content.itemContent;
                if (itemContent?.itemType === 'TimelineUser' && itemContent.user_results?.result) {
                    const userResult = itemContent.user_results.result;
                    
                    // Extract user data using the same method as the filter module
                    const userData = this.extractUserDataFromRetweetResult(userResult);
                    return userData;
                }
            }
            
            return null;
        }
        
        extractUserDataFromRetweetResult(userResult) {
            if (!userResult) return null;
            
            const legacyData = userResult.legacy;
            const coreData = userResult.core;
            
            if (!legacyData && !coreData) {
                console.log('❌ No legacy or core data found in user result');
                return null;
            }

            // Extract relationship data
            let we_follow = false;
            let followed_by = false;
            
            if (legacyData?.following !== undefined) {
                we_follow = Boolean(legacyData.following);
            }
            if (legacyData?.followed_by !== undefined) {
                followed_by = Boolean(legacyData.followed_by);
            }
            
            // Check relationship_perspectives if legacy doesn't have it
            if (userResult?.relationship_perspectives) {
                if (userResult.relationship_perspectives.following !== undefined) {
                    we_follow = Boolean(userResult.relationship_perspectives.following);
                }
                if (userResult.relationship_perspectives.followed_by !== undefined) {
                    followed_by = Boolean(userResult.relationship_perspectives.followed_by);
                }
            }

            const userData = {
                id: userResult.rest_id || userResult.id_str || 'unknown',
                handle: legacyData?.screen_name || coreData?.screen_name || 'unknown',
                name: legacyData?.name || coreData?.name || 'unknown',
                followers: parseInt(legacyData?.followers_count || legacyData?.normal_followers_count) || 0,
                friends_count: parseInt(legacyData?.friends_count) || 0,
                we_follow: we_follow,
                followed_by: followed_by,
                description: legacyData?.description || ''
            };

            console.log('✅ Extracted retweeter data:', userData);
            return userData;
        }

        extractUserFromQuoteEntry(entry) {
            if (!entry.content) return null;
            
            // For quote tweets, we get tweet entries and need to extract the tweet author
            if (entry.content.entryType === 'TimelineTimelineItem') {
                const itemContent = entry.content.itemContent;
                if (itemContent?.itemType === 'TimelineTweet' && itemContent.tweet_results?.result) {
                    return this.extractUserData(itemContent.tweet_results.result);
                }
            }
            
            return null;
        }

        extractUserFromEntry(entry) {
            if (!entry.content) return null;
            
            // Handle different entry types
            if (entry.content.entryType === 'TimelineTimelineItem') {
                const itemContent = entry.content.itemContent;
                if (itemContent && itemContent.itemType === 'TimelineUser') {
                    // Direct user entry
                    const userResults = itemContent.user_results;
                    if (userResults && userResults.result) {
                        return this.extractUserDataFromResult(userResults.result);
                    }
                } else if (itemContent && itemContent.itemType === 'TimelineTweet') {
                    // Tweet entry - extract the user who tweeted
                    const tweetResults = itemContent.tweet_results;
                    if (tweetResults && tweetResults.result) {
                        return this.extractUserData(tweetResults.result);
                    }
                }
            }
            
            return null;
        }

        updateBulkControlsStatus(pageType, userCount, customMessage = null) {
            const statusEl = $('.tbwl-status');
            if (statusEl.length > 0) {
                if (customMessage) {
                    statusEl.text(customMessage);
                } else {
                    statusEl.text(`Ready! Found ${userCount} ${pageType === 'retweets' ? 'retweeters' : 'quote tweeters'}`);
                }
            }
        }

        maybeShowBulkControls() {
            const url = window.location.href;
            let pageType = null;
            
            if (/\/status\/\d+\/retweets/.test(url)) {
                pageType = 'retweets';
                // Clear retweeters data when navigating to a new retweets page
                this.retweetersData = [];
                console.log('🔄 Cleared retweeters data for new retweets page');
            } else if (/\/status\/\d+\/quotes/.test(url)) {
                pageType = 'quotes';
                // Clear quote tweeters data when navigating to a new quotes page  
                this.quoteTweetersData = [];
                console.log('🔄 Cleared quote tweeters data for new quotes page');
            }

            if (pageType) {
                console.log(`✅ Detected ${pageType} page, showing controls...`);
                this.showBulkControls(pageType);
                
                // Show initial status based on page type
                setTimeout(() => {
                    const userCount = pageType === 'retweets' ? 
                        (this.retweetersData ? this.retweetersData.length : 0) :
                        (this.quoteTweetersData ? this.quoteTweetersData.length : 0);
                        
                    if (userCount === 0) {
                        this.updateBulkControlsStatus(pageType, 0, 'Waiting for API data...');
                    }
                }, 500);
            } else {
                $('.tbwl-bulk-controls').remove();
            }
        }

        showBulkControls(pageType) {
            $('.tbwl-bulk-controls').remove();
            
            const controls = $(`
                <div class="tbwl-bulk-controls" style="
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    background: var(--color-background-primary, #000);
                    color: var(--color-text-primary, #fff);
                    border: 1px solid var(--color-border-primary, #2f3336);
                    border-radius: 12px;
                    padding: 12px;
                    font-family: system-ui;
                    z-index: 1000;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                    max-width: 280px;
                    font-size: 14px;
                ">
                    <div style="font-weight: bold; margin-bottom: 8px; display: flex; align-items: center;">
                        🚫 <span style="margin-left: 6px;">Bulk Tools (API)</span>
                        <button class="tbwl-close" style="
                            background: none;
                            border: none;
                            color: var(--color-text-primary, #fff);
                            margin-left: auto;
                            cursor: pointer;
                            font-size: 16px;
                            padding: 0;
                        ">×</button>
                    </div>
                    
                    <div style="margin-bottom: 8px; font-size: 12px;">
                        <label style="display: block; margin-bottom: 4px; cursor: pointer;">
                            <input type="checkbox" class="tbwl-dry-run" checked style="margin-right: 6px;">
                            🔍 Dry Run (safe preview mode)
                        </label>
                        <label style="display: block; margin-bottom: 4px; cursor: pointer;">
                            <input type="checkbox" class="tbwl-enable-block" style="margin-right: 6px;">
                            🚫 Enable Block
                        </label>
                        <label style="display: block; margin-bottom: 8px; cursor: pointer;">
                            <input type="checkbox" class="tbwl-enable-mute" style="margin-right: 6px;">
                            🔇 Enable Mute
                        </label>
                    </div>
                    
                    <div style="margin-bottom: 8px;">
                        <button class="tbwl-run-action" style="
                            background: #1d9bf0;
                            color: white;
                            border: none;
                            padding: 8px 16px;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 12px;
                            width: 100%;
                        ">Run Action</button>
                    </div>
                    
                    <div class="tbwl-status" style="
                        font-size: 12px; 
                        color: var(--color-text-secondary, #71767b);
                        min-height: 16px;
                    ">Waiting for API data...</div>
                </div>
            `);

            $('body').append(controls);

            // Add event handlers
            controls.find('.tbwl-close').click(() => controls.remove());
            
            // Update button text based on checkboxes
            const updateButton = () => {
                const dryRun = controls.find('.tbwl-dry-run').is(':checked');
                const enableBlock = controls.find('.tbwl-enable-block').is(':checked');
                const enableMute = controls.find('.tbwl-enable-mute').is(':checked');
                const button = controls.find('.tbwl-run-action');
                
                if (dryRun) {
                    button.text('🔍 Preview (Dry Run)');
                    button.css('background', '#1d9bf0');
                } else if (enableBlock && enableMute) {
                    button.text('🚫 Block & Mute All');
                    button.css('background', '#f4212e');
                } else if (enableBlock) {
                    button.text('🚫 Block All');
                    button.css('background', '#f4212e');
                } else if (enableMute) {
                    button.text('🔇 Mute All');
                    button.css('background', '#536471');
                } else {
                    button.text('⚠️ Select Action');
                    button.css('background', '#657786');
                }
            };
            
            // Update button on checkbox change
            controls.find('input[type="checkbox"]').change(updateButton);
            updateButton(); // Initial update
            
            // Run action handler
            controls.find('.tbwl-run-action').click(() => {
                const dryRun = controls.find('.tbwl-dry-run').is(':checked');
                const enableBlock = controls.find('.tbwl-enable-block').is(':checked');
                const enableMute = controls.find('.tbwl-enable-mute').is(':checked');
                
                this.bulkActionFromAPI(pageType, {
                    dryRun: dryRun,
                    block: enableBlock,
                    mute: enableMute
                });
            });
        }

        async bulkActionFromAPI(pageType, options) {
            const statusEl = $('.tbwl-status');
            const users = pageType === 'retweets' ? this.retweetersData : this.quoteTweetersData;
            
            if (!users || users.length === 0) {
                statusEl.text('No API data available yet. Try refreshing the page.');
                return;
            }

            const { dryRun, block, mute } = options;
            
            if (!dryRun && !block && !mute) {
                statusEl.text('⚠️ Please select Block or Mute (or enable Dry Run)');
                return;
            }

            const actionText = dryRun ? 'previewing' : 
                             block && mute ? 'blocking & muting' :
                             block ? 'blocking' : 'muting';

            console.log(`🚫 Starting ${dryRun ? 'DRY RUN' : 'LIVE'} bulk ${actionText} for ${users.length} ${pageType}`);
            statusEl.text(`${dryRun ? '🔍 Previewing' : 'Processing'} ${users.length} users...`);

            let processed = 0;
            let succeeded = 0;
            let skipped = 0;
            let wouldProcess = 0;

            for (const user of users) {
                // SAFETY CHECK: Skip mutuals and followers
                if (user.we_follow || user.followed_by) {
                    console.log(`🛡️ SAFETY: Skipping @${user.handle} - mutual/follower`);
                    skipped++;
                    processed++;
                    statusEl.text(`Skipped @${user.handle} (mutual) - ${processed}/${users.length}`);
                    continue;
                }

                if (dryRun) {
                    // DRY RUN MODE - just log what would happen
                    wouldProcess++;
                    const actions = [];
                    if (block) actions.push('BLOCK');
                    if (mute) actions.push('MUTE');
                    console.log(`🔍 DRY RUN: Would ${actions.join(' & ')} @${user.handle} (${user.followers} followers)`);
                    statusEl.text(`Preview: Would ${actions.join(' & ').toLowerCase()} @${user.handle} (${processed + 1}/${users.length})`);
                    processed++;
                    continue;
                }

                // LIVE MODE - actually perform actions
                try {
                    const actions = [];
                    if (block) actions.push('blocking');
                    if (mute) actions.push('muting');
                    
                    statusEl.text(`${actions.join(' & ')} @${user.handle} (${processed + 1}/${users.length})`);
                    
                    if (block) {
                        await this.requestLimit(() => this.blockUser(user.id));
                        console.log(`✅ Blocked @${user.handle}`);
                    }
                    
                    if (mute) {
                        await this.requestLimit(() => this.muteUser(user.id));
                        console.log(`✅ Muted @${user.handle}`);
                    }
                    
                    succeeded++;
                } catch (e) {
                    console.error(`❌ Failed to process @${user.handle}:`, e);
                }

                processed++;
                await new Promise(resolve => setTimeout(resolve, 500)); // Rate limiting
            }

            if (dryRun) {
                statusEl.text(`🔍 Preview complete! Would process ${wouldProcess} users, ${skipped} skipped (mutuals)`);
                console.log(`🔍 DRY RUN complete: Would process ${wouldProcess} users, ${skipped} skipped`);
            } else {
                statusEl.text(`✅ Complete! Processed ${succeeded} users, ${skipped} skipped (mutuals)`);
                console.log(`✅ Live action complete: ${succeeded} processed, ${skipped} skipped`);
            }
        }

        collectUserForBulkBlocking(userData) {
            const url = window.location.href;
            
            // Only collect users when on retweets or quotes pages
            if (url.includes('/retweets')) {
                if (!this.retweetersData.find(u => u.id === userData.id)) {
                    this.retweetersData.push(userData);
                    console.log(`📝 Collected retweeter: @${userData.handle} (total: ${this.retweetersData.length})`);
                    this.updateBulkControlsStatus('retweets', this.retweetersData.length);
                }
            } else if (url.includes('/quotes')) {
                if (!this.quoteTweetersData.find(u => u.id === userData.id)) {
                    this.quoteTweetersData.push(userData);
                    console.log(`📝 Collected quote tweeter: @${userData.handle} (total: ${this.quoteTweetersData.length})`);
                    this.updateBulkControlsStatus('quotes', this.quoteTweetersData.length);
                }
            }
        }

        async getUserInfo(username) {
            try {
                if (!this.queryIds.userByScreenName) {
                    console.log('❌ No userByScreenName query ID for safety check');
                    return null;
                }

                const resp = await this.safeCall(
                    'userByScreenName',
                    this.buildGqlUrl('userByScreenName', { screen_name: username })
                );
                
                if (!resp.data?.data?.user?.result) {
                    return null;
                }

                const userData = this.extractUserDataFromResult(resp.data.data.user.result);
                return userData;
            } catch (e) {
                console.log(`❌ Safety check failed for @${username}:`, e.message);
                return null;
            }
        }

        extractUserDataFromResult(userResult) {
            const legacyData = userResult.legacy;
            if (!legacyData) return null;

            let we_follow = false;
            let followed_by = false;
            
            if (legacyData?.following !== undefined) {
                we_follow = Boolean(legacyData.following);
            }
            if (legacyData?.followed_by !== undefined) {
                followed_by = Boolean(legacyData.followed_by);
            }
            
            if (userResult?.relationship_perspectives) {
                if (userResult.relationship_perspectives.following !== undefined) {
                    we_follow = Boolean(userResult.relationship_perspectives.following);
                }
                if (userResult.relationship_perspectives.followed_by !== undefined) {
                    followed_by = Boolean(userResult.relationship_perspectives.followed_by);
                }
            }

            return {
                handle: legacyData.screen_name,
                we_follow: we_follow,
                followed_by: followed_by
            };
        }

        async muteByScreenName(name, reason) {
            try {
                console.log(`🔇 Attempting to mute @${name} for: ${reason}`);
                
                if (!this.queryIds.userByScreenName) {
                    console.log('❌ No userByScreenName query ID available');
                    return;
                }

                const resp = await this.safeCall(
                    'userByScreenName',
                    this.buildGqlUrl('userByScreenName', { screen_name: name })
                );
                
                if (!resp.data?.data?.user?.result?.rest_id) {
                    console.log('❌ Could not get user ID from GraphQL response');
                    return;
                }
                
                const id = resp.data.data.user.result.rest_id;
                await this.requestLimit(() => this.muteUser(id));
                console.log(`✅ Muted user: @${name}`);
            } catch (e) {
                console.error(`❌ Mute failed for @${name}:`, e.message);
                throw e;
            }
        }

        blockUser(id) {
            eventLog('Blocking user ID', id);
            console.log(`🚫 Blocking user ID: ${id}`);
            return this.ajax.post('/i/api/1.1/blocks/create.json', Qs.stringify({
                user_id: id
            }));
        }

        muteUser(id) {
            eventLog('Muting user ID', id);
            console.log(`🔇 Muting user ID: ${id}`);
            return this.ajax.post('/i/api/1.1/mutes/users/create.json', Qs.stringify({
                user_id: id
            }));
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

    console.log('🚀 TWITTER ULTIMATE TOOL - SCRIPT LOADED');
    console.log('📍 Current URL:', window.location.href);
    console.log('📍 Document ready state:', document.readyState);

    function initializeModules() {
        console.log('🔧 INITIALIZING MODULES...');
        loadSettings();
        console.log('⚙️ Settings loaded:', settings);

        const start = () => {
            console.log('🎯 STARTING MODULES...');
            
            // Initialize UI first
            settingsUI = new SettingsUI();
            console.log('✅ Settings UI initialized');

            // Initialize modules based on settings
            if (settings.filterEnabled) {
                console.log('🔍 Initializing Filter Module...');
                filterModule = new TwitterFilterModule();
                console.log('✅ Filter Module initialized');
            } else {
                console.log('❌ Filter module disabled via settings');
            }

            /*
            if (settings.notInterestedEnabled) {
                notInterestedModule = new NotInterestedModule();
            } else {
                info('Not Interested module disabled via settings');
            }
            */

            if (settings.blockToolsEnabled) {
                console.log('🚫 Initializing Block Module...');
                blockModule = new BlockWithLoveModule();
                window.blockModule = blockModule; // Expose globally for user collection
                console.log('✅ Block Module initialized and exposed globally');
            } else {
                console.log('❌ Block With Love module disabled via settings');
            }

            console.log('🎉 TWITTER ULTIMATE TOOL FULLY INITIALIZED');
            console.log(`📊 Settings - Follower limit: ${settings.followLimit}, ratio limit: ${settings.ratioLimit}`);
            console.log(`🐛 Debug mode is ${settings.debugMode ? 'ON' : 'OFF'}`);
            console.log('👀 Watch the console for filtering activity...');
        };

        if (document.readyState === 'loading') {
            console.log('⏳ Waiting for DOM to load...');
            document.addEventListener('DOMContentLoaded', start);
        } else {
            console.log('✅ DOM already loaded, starting immediately');
            start();
        }
    }

    // Wait for dependencies and start the tool
    function waitForDependencies() {
        console.log('⏳ Checking dependencies...');
        if (typeof $ !== 'undefined' && typeof axios !== 'undefined' && typeof Qs !== 'undefined') {
            console.log('✅ All dependencies loaded, starting tool...');
            addStyles();
            initializeModules();
            console.log('🎉 Twitter Ultimate Filter & Block Tool loaded successfully!');
        } else {
            console.log('❌ Dependencies not ready, retrying in 1 second...');
            console.log('jQuery:', typeof $, 'Axios:', typeof axios, 'Qs:', typeof Qs);
            setTimeout(waitForDependencies, 1000);
        }
    }
    
    function addStyles() {
        console.log('🎨 Adding CSS styles...');
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
    }

    waitForDependencies();
})();
