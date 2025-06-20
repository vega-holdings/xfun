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

    // ==================== SETTINGS MANAGEMENT ====================
    const DEFAULT_SETTINGS = {
        // Keyword/Ratio Filter Settings
        filterEnabled: true,
        bannedWords: '',
        whitelistedHandles: '',
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
        autoBlockWords: '',

        // UI Settings
        showSettingsPanel: true,
        debugMode: true,
        eventLogging: true,
        badgesEnabled: true
    };

    let settings = { ...DEFAULT_SETTINGS };

    function         loadSettings() {
            try {
                const saved = GM_getValue('twitterUltimateSettings', '{}');
                console.log('🔧 Loaded saved settings:', saved);
                settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
                if (settings.debugMode) {
                    console.log('🔧 Final bannedWords after merge:', settings.bannedWords);
                }
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
            this.userCache = new Map(); // User cache for badge reapplication
            this.sharedFollowersCache = new Map(); // In-memory cache for current session
            this.CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
            this.init();
        }

        init() {
            log('TwitterFilterModule.init() called');
            if (!settings.filterEnabled) {
                info('Filter disabled in settings, aborting init');
                return;
            }

            log('Initializing filter settings...');
            this.updateBannedWords();
            this.updateWhitelistedHandles();
            log('Setting up XHR hooks...');
            this.hookXHR();
            
            // Start cache reapplication for badges
            this.startCacheReapplication();
            
            // Clean up expired persistent cache entries
            this.clearExpiredPersistentCache();
            
            info('FILTER MODULE FULLY INITIALIZED');
            info(`Banned words: ${this.bannedWords.join(', ') || 'none'}`);
            info(`Whitelisted handles: ${Array.from(this.whitelistedHandles).join(', ') || 'none'}`);
            info(`Follower limit: ${settings.followLimit}, ratio limit: ${settings.ratioLimit}`);
            info('Ready to filter Twitter content!');
        }

        updateBannedWords() {
            log('Raw bannedWords setting:', settings.bannedWords);
            this.bannedWords = settings.bannedWords.split(',')
                .map(w => w.trim().toLowerCase())
                .filter(Boolean);
            log('Processed bannedWords array:', this.bannedWords);
            log('bannedWords count:', this.bannedWords.length);
        }

        updateWhitelistedHandles() {
            this.whitelistedHandles = new Set(
                settings.whitelistedHandles.split(',')
                    .map(h => h.trim().toLowerCase())
                    .filter(Boolean)
            );
        }

        hookXHR() {
            log('Setting up XHR hooks for Twitter API interception...');
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
                        url.includes('home.json') ||
                        url.includes('/Followers?')
                    );
                    
                    if (isTargetUrl) {
                        log('INTERCEPTING REQUEST:', url);
                        if (!this._hooked) {
                            this._hooked = true;
                            this.hookResponse(self);
                            log('Response hook attached');
                        }
                    } else {
                        // Only log non-target URLs occasionally to avoid spam
                        if (Math.random() < 0.1) {
                            log('Non-target request:', url.substring(0, 100));
                        }
                    }
                }
                return oldXHROpen.apply(this, arguments);
            };

            XMLHttpRequest.prototype.hookResponse = function(filterInstance) {
                log('Setting up response interceptor...');
                const xhr = this;
                const getter = function() {
                    log('PROCESSING RESPONSE...');
                    delete xhr.responseText;
                    let response = xhr.responseText;

                    try {
                        log('Parsing JSON response...');
                        let json = JSON.parse(response);
                        log('JSON parsed successfully, filtering content...');
                        filterInstance.filterContent(json);
                        response = JSON.stringify(json);
                        log('Response processed and modified');
                    } catch (e) {
                        log('Error processing response:', e.message);
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
            log(`Checking banned words for @${user.handle}:`);
            log(`handleDesc: "${handleDesc}"`);
            log(`bannedWords:`, this.bannedWords);
            
            for (const w of this.bannedWords) {
                if (w && handleDesc.includes(w.toLowerCase())) {
                    log(`MATCHED banned word: "${w}" in "${handleDesc}"`);
                    reasons.push(`matched banned keyword: "${w}"`);
                }
            }

            // Enhanced filtering using sus score for non-followers/non-mutuals
            const followers = Number(user.followers) || 0;
            const friends = Number(user.friends_count) || 0;
            
            if (!user.we_follow) {
                // Use sus score for more nuanced filtering (followers and strangers)
                const susScore = this.calculateSusScore(user, 0);
                
                // Auto-filter only the worst offenders
                if (susScore.score > 0.85) {
                    reasons.push(`very high sus score (${(susScore.score * 100).toFixed(0)}%) - ${susScore.tier.label}`);
                }
                
                // For moderate sus scores, check if they match other red flags
                else if (susScore.score > 0.6) {
                    if (followers < settings.followLimit) {
                        reasons.push(`moderate sus score (${(susScore.score * 100).toFixed(0)}%) + low followers (${followers})`);
                    }
                    
                    // Check banned words as additional flag
                    for (const w of this.bannedWords) {
                        const handleDesc = ((user.handle || '') + " " + (user.name || '') + " " + (user.description || '')).toLowerCase();
                        if (w && handleDesc.includes(w.toLowerCase())) {
                            reasons.push(`moderate sus score (${(susScore.score * 100).toFixed(0)}%) + banned keyword: "${w}"`);
                            break;
                        }
                    }
                }
            } else {
                // People I follow get a pass - no filtering
                log(`Skipping filter for followed user: @${user.handle}`);
            }

            if (reasons.length > 0) {
                log(`User @${user.handle} filtered:`, reasons);
            }

            return reasons;
        }

        filterContent(json) {
            log('FILTER CONTENT CALLED');
            if (!json || !json.data) {
                log('No data in response');
                return;
            }

            log('Response data keys:', Object.keys(json.data));

            // CHECK FOR BULK BLOCKING: Retweeters API response
            if (json.data.retweeters_timeline && window.location.href.includes('/retweets')) {
                info('RETWEETERS API DETECTED - Processing for bulk blocking!');
                if (window.blockModule) {
                    window.blockModule.processRetweetersAPIResponse(json);
                } else {
                    log('blockModule not available');
                }
            }
            let instructions = [];

            // Try different response structures
            if (json.data.home?.home_timeline_urt?.instructions) {
                instructions = json.data.home.home_timeline_urt.instructions;
                log('Found home timeline instructions:', instructions.length);
            } else if (json.data.threaded_conversation_with_injections_v2?.instructions) {
                instructions = json.data.threaded_conversation_with_injections_v2.instructions;
                log('Found threaded conversation instructions:', instructions.length);
            } else if (json.data.user?.result?.timeline?.timeline?.instructions) {
                instructions = json.data.user.result.timeline.timeline.instructions;
                log('Found user timeline instructions:', instructions.length);
            } else if (json.data.search_by_raw_query?.search_timeline?.timeline?.instructions) {
                instructions = json.data.search_by_raw_query.search_timeline.timeline.instructions;
                log('Found search timeline instructions:', instructions.length);
            }

            if (instructions.length === 0) {
                log('No timeline instructions found in response structure');
                log('Available data structure:', JSON.stringify(Object.keys(json.data), null, 2));
                return;
            }

            let processedCount = 0;
            let filteredCount = 0;
            instructions.forEach(instruction => {
                log('Processing instruction type:', instruction.type);
                if (instruction.type === 'TimelineAddEntries' && instruction.entries) {
                    log('Processing', instruction.entries.length, 'entries');
                    instruction.entries.forEach(entry => {
                        const wasFiltered = this.processEntry(entry);
                        processedCount++;
                        if (wasFiltered) filteredCount++;
                    });
                }
            });

            if (filteredCount > 0) {
                info(`FILTERING COMPLETE: Processed ${processedCount} entries, filtered ${filteredCount}`);
            } else {
                log(`FILTERING COMPLETE: Processed ${processedCount} entries, filtered ${filteredCount}`);
            }
        }

        processEntry(entry) {
            if (!entry.content) {
                log('Entry has no content, skipping');
                return false;
            }

            log('Processing entry type:', entry.content.entryType);
            let wasFiltered = false;

            if (entry.content.entryType === 'TimelineTimelineItem') {
                wasFiltered = this.processTimelineItem(entry.content.itemContent);
            } else if (entry.content.entryType === 'TimelineTimelineModule') {
                if (entry.content.items) {
                    log('Processing module with', entry.content.items.length, 'items');
                    entry.content.items?.forEach(item => {
                        if (this.processTimelineItem(item.item.itemContent)) {
                            wasFiltered = true;
                        }
                    });
                }
            } else {
                log('Skipping entry type:', entry.content.entryType);
            }

            return wasFiltered;
        }

        processTimelineItem(itemContent) {
            if (!itemContent) {
                log('No item content');
                return false;
            }

            log('Item content type:', itemContent.itemType);
            log('Item content keys:', Object.keys(itemContent));

            if (itemContent.itemType === 'TimelineTweet') {
                return this.processTweetItem(itemContent);
            } else if (itemContent.itemType === 'TimelineUser') {
                return this.processUserItem(itemContent);
            } else {
                log('Skipping unknown item type:', itemContent.itemType);
                return false;
            }
        }

        processTweetItem(itemContent) {
            const tweetResults = itemContent.tweet_results;
            if (!tweetResults?.result) {
                log('No tweet results found in item');
                log('Available itemContent keys:', Object.keys(itemContent));
                return false;
            }

            log('Processing tweet...');
            log('Tweet result typename:', tweetResults.result.__typename);
            log('Tweet result keys:', Object.keys(tweetResults.result));
            
            const userData = this.extractUserData(tweetResults.result);
            if (!userData) {
                log('Could not extract user data from tweet');
                return false;
            }

            // INJECT USER STATS BADGE
            this.injectUserStatsBadge(userData);

            // COLLECT USERS FOR BULK BLOCKING (if BlockWithLoveModule exists)
            if (window.blockModule && window.blockModule.collectUserForBulkBlocking) {
                window.blockModule.collectUserForBulkBlocking(userData);
            }

            // AUTO-BLOCKING CHECK (using existing user data with rest_id)
            if (window.blockModule && settings.autoBlockEnabled) {
                window.blockModule.checkAutoBlockWithUserData(userData);
            }

            log('Checking user:', userData.handle, 'followers:', userData.followers);
            
            // DON'T FILTER ON BULK BLOCKING PAGES - we need to see the users to block them
            const url = window.location.href;
            if (url.includes('/retweets') || url.includes('/quotes')) {
                log('Skipping filter on bulk blocking page - need to see users to block them');
                return false;
            }
            
            const reasons = this.getHideReasons(userData);
            if (reasons.length > 0) {
                info(`🚫 HIDING TWEET from @${userData.handle} - Reasons: ${reasons.join('; ')}`);
                this.hideTweet(tweetResults);
                this.filteredCount++;
                eventLog(`Hidden @${userData.handle}`, `Reasons: ${reasons.join('; ')}`);
                return true;
            } else {
                log('Tweet from @' + userData.handle + ' passed all filters');
                return false;
            }
        }

        processUserItem(itemContent) {
            const userResults = itemContent.user_results;
            if (!userResults?.result) {
                log('No user results found in item');
                log('Available itemContent keys:', Object.keys(itemContent));
                return false;
            }

            log('Processing user item...');
            log('User result typename:', userResults.result.__typename);
            log('User result keys:', Object.keys(userResults.result));
            
            const userData = this.extractUserDataFromUserResult(userResults.result);
            if (!userData) {
                log('Could not extract user data from user item');
                return false;
            }

            log('Extracted user data for followers page:', userData);

            // INJECT USER STATS BADGE for followers page
            this.injectUserStatsBadge(userData);

            // COLLECT USERS FOR BULK BLOCKING (if BlockWithLoveModule exists)
            if (window.blockModule && window.blockModule.collectUserForBulkBlocking) {
                window.blockModule.collectUserForBulkBlocking(userData);
            }

            log(`Processed user: @${userData.handle} (${userData.followers} followers)`);
            
            // Don't filter users on followers pages - just add badges
            return false;
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
                log('Found user data via Path 1: core.user_results.result');
            }
            
            // Path 2: Alternative structure
            if (!legacyData && tweetData.core?.user?.legacy) {
                userObj = tweetData.core.user;
                legacyData = userObj.legacy;
                log('Found user data via Path 2: core.user.legacy');
            }
            
            // Path 3: Direct legacy data
            if (!legacyData && tweetData.legacy) {
                legacyData = tweetData.legacy;
                userObj = tweetData;
                log('Found user data via Path 3: direct legacy');
            }

            // Path 4: Check if it's a retweet or quoted tweet
            if (!legacyData && tweetData.quoted_status_result?.result?.core?.user_results?.result) {
                userObj = tweetData.quoted_status_result.result.core.user_results.result;
                legacyData = userObj.legacy;
                log('Found user data via Path 4: quoted_status_result');
            }

            // Path 5: Check retweeted status
            if (!legacyData && tweetData.legacy?.retweeted_status_result?.result?.core?.user_results?.result) {
                userObj = tweetData.legacy.retweeted_status_result.result.core.user_results.result;
                legacyData = userObj.legacy;
                log('Found user data via Path 5: retweeted_status_result');
            }

            if (!legacyData) {
                log('Could not extract user data from tweet');
                log('Available top-level keys:', Object.keys(tweetData));
                if (tweetData.core) {
                    log('Core keys:', Object.keys(tweetData.core));
                }
                return null;
            }

            log('Raw legacy data:', legacyData);

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
                description: legacyData?.description || '',
                // NEW FIELDS:
                statuses_count: parseInt(legacyData?.statuses_count) || 0,
                created_at: legacyData?.created_at || userObj?.core?.created_at || '',
                verified: legacyData?.verified || false
            };

            log('Extracted user data:', userData);
            return userData;
        }

        extractUserDataFromUserResult(userResult) {
            if (!userResult) {
                log('No user result provided');
                return null;
            }

            const legacyData = userResult.legacy;
            const coreData = userResult.core;

            if (!legacyData && !coreData) {
                log('No legacy or core data found in user result');
                log('Available userResult keys:', Object.keys(userResult));
                return null;
            }

            log('Raw legacy data for user:', legacyData);
            log('Raw core data for user:', coreData);

            // Extract relationship data
            let we_follow = false;
            let followed_by = false;

            // Check legacy data first
            if (legacyData?.following !== undefined) {
                we_follow = Boolean(legacyData.following);
            }
            if (legacyData?.followed_by !== undefined) {
                followed_by = Boolean(legacyData.followed_by);
            }

            // Check relationship_perspectives if available
            if (userResult.relationship_perspectives) {
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
                description: legacyData?.description || '',
                statuses_count: parseInt(legacyData?.statuses_count) || 0,
                created_at: legacyData?.created_at || coreData?.created_at || '',
                verified: legacyData?.verified || false
            };

            log('Extracted user data from followers API:', userData);
            return userData;
        }

        async fetchSharedFollowersCount(userId) {
            if (!userId || userId === 'unknown') {
                return null;
            }

            // Check in-memory cache first
            if (this.sharedFollowersCache.has(userId)) {
                log(`Using in-memory cached shared followers for user ${userId}:`, this.sharedFollowersCache.get(userId));
                return this.sharedFollowersCache.get(userId);
            }

            // Check persistent cache
            const cachedData = this.getFromPersistentCache(userId);
            if (cachedData !== null) {
                log(`Using persistent cached shared followers for user ${userId}:`, cachedData);
                // Also store in memory for faster access
                this.sharedFollowersCache.set(userId, cachedData);
                return cachedData;
            }

            try {
                log(`Fetching shared followers count for user ${userId}...`);
                
                // Use the same authentication setup as BlockWithLoveModule
                const bearerToken = this.getBearerToken();
                const csrfToken = this.getCookie('ct0');

                if (!bearerToken || !csrfToken) {
                    log('Missing auth tokens for shared followers API');
                    return null;
                }

                const url = `/i/api/1.1/friends/following/list.json?include_profile_interstitial_type=1&include_blocking=1&include_blocked_by=1&include_followed_by=1&include_want_retweets=1&include_mute_edge=1&include_can_dm=1&include_can_media_tag=1&include_ext_is_blue_verified=1&include_ext_verified_type=1&include_ext_profile_image_shape=1&skip_status=1&cursor=-1&user_id=${userId}&count=3&with_total_count=true`;
                
                const response = await fetch(`https://x.com${url}`, {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                        'Accept': '*/*',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Authorization': `Bearer ${bearerToken}`,
                        'X-Csrf-Token': csrfToken,
                        'X-Twitter-Active-User': 'yes',
                        'X-Twitter-Auth-Type': 'OAuth2Session',
                        'X-Twitter-Client-Language': 'en'
                    }
                });

                if (!response.ok) {
                    log(`Shared followers API failed: ${response.status} ${response.statusText}`);
                    return null;
                }

                const data = await response.json();
                const sharedCount = data.total_count || 0;
                
                log(`Fetched shared followers count for user ${userId}: ${sharedCount}`);
                
                // Cache the result in both memory and persistent storage
                this.sharedFollowersCache.set(userId, sharedCount);
                this.saveToPersistentCache(userId, sharedCount);
                
                return sharedCount;
            } catch (e) {
                log(`Error fetching shared followers for user ${userId}:`, e.message);
                return null;
            }
        }

        getFromPersistentCache(userId) {
            try {
                const cacheKey = `sharedFollowers_${userId}`;
                const cachedEntry = GM_getValue(cacheKey, null);
                
                if (!cachedEntry) {
                    log(`No persistent cache entry for user ${userId}`);
                    return null;
                }

                const parsed = JSON.parse(cachedEntry);
                const now = Date.now();
                const age = now - parsed.timestamp;

                if (age > this.CACHE_DURATION) {
                    log(`Persistent cache expired for user ${userId} (age: ${Math.round(age / (60 * 60 * 1000))}h)`);
                    // Clean up expired cache entry
                    GM_setValue(cacheKey, '');
                    return null;
                }

                log(`Found valid persistent cache for user ${userId} (age: ${Math.round(age / (60 * 60 * 1000))}h)`);
                return parsed.count;
            } catch (e) {
                log(`Error reading persistent cache for user ${userId}:`, e.message);
                return null;
            }
        }

        saveToPersistentCache(userId, count) {
            try {
                const cacheKey = `sharedFollowers_${userId}`;
                const entry = {
                    count: count,
                    timestamp: Date.now()
                };
                GM_setValue(cacheKey, JSON.stringify(entry));
                log(`Saved to persistent cache for user ${userId}: ${count} shared followers`);
            } catch (e) {
                log(`Error saving to persistent cache for user ${userId}:`, e.message);
            }
        }

        clearExpiredPersistentCache() {
            // Clean up expired cache entries periodically
            try {
                // This is a basic cleanup - GM doesn't provide a way to list all keys
                // so we rely on the getFromPersistentCache method to clean up entries as they're accessed
                log('Persistent cache cleanup completed (lazy cleanup on access)');
            } catch (e) {
                log('Error during cache cleanup:', e.message);
            }
        }

        getCacheStats() {
            const memoryCount = this.sharedFollowersCache.size;
            
            // Try to estimate persistent cache size (this is approximate)
            let persistentCount = 0;
            let validCount = 0;
            let expiredCount = 0;
            
            // We can't iterate through GM storage, so this is just for the current session
            // Users can call filterModule.getCacheStats() in console to see stats
            
            return {
                memoryCache: memoryCount,
                estimated: 'Call from console for detailed stats',
                cacheHours: this.CACHE_DURATION / (60 * 60 * 1000)
            };
        }

        getBearerToken() {
            // Try to find bearer token in script tags
            for (const script of document.querySelectorAll('script')) {
                const m = script.textContent.match(/Bearer\s+([A-Za-z0-9%-]+)/);
                if (m) {
                    return m[1];
                }
            }
            
            // Fallback to known token
            return 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
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

        // Sus Score System - New Quality Assessment



        getAccountAgeMonths(created_at) {
            if (!created_at) return 1;
            try {
                const createdDate = new Date(created_at);
                const now = new Date();
                const diffTime = Math.abs(now - createdDate);
                const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30));
                return Math.max(1, diffMonths);
            } catch (e) {
                return 1;
            }
        }

        checkBioToxicity(description) {
            if (!description) return 0;
            const toxicWords = this.bannedWords || [];
            const desc = description.toLowerCase();
            let toxicMatches = 0;
            
            for (const word of toxicWords) {
                if (desc.includes(word.toLowerCase())) {
                    toxicMatches++;
                }
            }
            
            return Math.min(1, toxicMatches / 3); // Scale based on number of matches
        }

        calculateSusScore(userData, sharedFollowers = 0) {
            const scores = {};
            const accountAgeMonths = this.getAccountAgeMonths(userData.created_at);
            const followers = userData.followers || 0;
            const following = userData.friends_count || 0;
            
            // 1. Shared Followers Score (30%) - HUGE weight
            if (sharedFollowers === 0) {
                scores.sharedFollowers = 0.30; // Big penalty for 0 shared
            } else if (sharedFollowers < 3) {
                scores.sharedFollowers = 0.20; // Still bad
            } else if (sharedFollowers < 10) {
                scores.sharedFollowers = 0.10; // Okay
            } else {
                scores.sharedFollowers = 0.0; // Good, many shared followers
            }
            
            // 2. Age vs Followers Expectation (25%)
            // Old accounts with low followers = very sus
            const expectedFollowers = Math.max(50, accountAgeMonths * 5); // 5 followers per month minimum
            if (followers < expectedFollowers * 0.2) {
                scores.ageVsFollowers = 0.25; // Way below expectation
            } else if (followers < expectedFollowers * 0.5) {
                scores.ageVsFollowers = 0.15; // Below expectation
            } else if (followers < expectedFollowers) {
                scores.ageVsFollowers = 0.08; // Slightly below
            } else {
                scores.ageVsFollowers = 0.0; // Meeting or exceeding expectation
            }
            
            // 3. Following vs Followers Ratio (20%) - Fixed logic
            const ratio = following / (followers + 1);
            if (ratio > 20) {
                scores.ratio = 0.20; // Following way too many
            } else if (ratio > 10) {
                scores.ratio = 0.15;
            } else if (ratio > 5) {
                scores.ratio = 0.10;
            } else if (ratio > 2) {
                scores.ratio = 0.05;
            } else {
                scores.ratio = 0.0; // Good ratio (more followers than following)
            }
            
            // 4. Activity Quality (15%) - High posts but low followers = spam
            const postsPerFollower = userData.statuses_count / (followers + 1);
            if (postsPerFollower > 100) {
                scores.activityQuality = 0.15; // Posting too much vs followers
            } else if (postsPerFollower > 50) {
                scores.activityQuality = 0.10;
            } else if (postsPerFollower > 20) {
                scores.activityQuality = 0.05;
            } else {
                scores.activityQuality = 0.0; // Reasonable post ratio
            }
            
            // 5. Verification Bonus (5%)
            scores.verification = userData.verified ? 0.0 : 0.05;
            
            // 6. Bio Toxicity (5%) - Reduced weight
            scores.toxicity = this.checkBioToxicity(userData.description) * 0.05;
            
            // Total score
            const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
            
            return {
                score: totalScore,
                components: scores,
                tier: this.getScoreTier(totalScore)
            };
        }

        getScoreTier(score) {
            if (score <= 0.15) return { emoji: '🟢', label: 'Chill', color: '#22c55e' };
            if (score <= 0.30) return { emoji: '🟡', label: 'Meh', color: '#eab308' };
            if (score <= 0.50) return { emoji: '🟠', label: 'Sketch', color: '#f97316' };
            return { emoji: '🔴', label: 'Dumpster fire', color: '#ef4444' };
        }

        createUserStatsBadge(userData, sharedFollowersCount = null) {
            const { friends_count, followers, statuses_count, created_at, we_follow, followed_by } = userData;
            
            // Calculate ratio
            const ratio = followers > 0 ? (friends_count / followers).toFixed(1) : '∞';
            
            // Format creation date to MM/YY
            let createdFormatted = '';
            if (created_at) {
                try {
                    const date = new Date(created_at);
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const year = String(date.getFullYear()).slice(-2);
                    createdFormatted = `${month}/${year}`;
                } catch (e) {
                    createdFormatted = 'N/A';
                }
            }
            
            // ADD RELATIONSHIP EMOJI
            let relationshipEmoji = '';
            let badgeColor = '';
            if (followed_by && we_follow) {
                relationshipEmoji = ' 🧑‍🤝‍🧑'; // Mutual
                badgeColor = '#22c55e'; // Green - best relationship
            } else if (followed_by) {
                relationshipEmoji = ' 🧍'; // Follows me
                badgeColor = '#a855f7'; // Purple - they're interested in me
            } else if (we_follow) {
                relationshipEmoji = ' 🚶'; // I follow them
                badgeColor = '#f59e0b'; // Amber - I'm interested in them
            } else {
                relationshipEmoji = ' 🤷'; // No relationship
                badgeColor = '#6b7280'; // Gray - neutral/minimal
            }
            
            // Format numbers for display
            const formatNumber = (num) => {
                if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
                if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
                return num.toString();
            };
            
            const followingFormatted = formatNumber(friends_count);
            const followersFormatted = formatNumber(followers);
            const postsFormatted = formatNumber(statuses_count);
            
            // Badge text with emoji and optional shared followers
            let badgeText = `${followingFormatted}:${followersFormatted}, ${ratio} | ${postsFormatted} | ${createdFormatted}${relationshipEmoji}`;
            
            // Add shared followers count if available (in bold)
            if (sharedFollowersCount !== null && sharedFollowersCount !== undefined) {
                badgeText += ` | `;
            }
            
            // Create badge element
            const badge = document.createElement('div');
            badge.className = 'user-stats-badge';
            badge.style.cssText = `
                display: inline-block;
                background: ${badgeColor};
                color: white;
                font-size: 11px;
                padding: 2px 6px;
                border-radius: 4px;
                margin-left: 6px;
                font-family: system-ui;
                font-weight: 500;
                white-space: nowrap;
            `;
            
            // Set initial text
            badge.innerHTML = badgeText;
            
            // Add shared followers if available
            if (sharedFollowersCount !== null && sharedFollowersCount !== undefined) {
                const sharedElement = document.createElement('strong');
                sharedElement.style.fontWeight = 'bold';
                const emoji = sharedFollowersCount === 0 ? '🙅‍♂️' : '🤝';
                sharedElement.textContent = `${sharedFollowersCount} ${emoji}`;
                badge.appendChild(sharedElement);
            }
            
            // Add sus score pill (everyone except people I follow)
            if (!we_follow) {
                const susScore = this.calculateSusScore(userData, sharedFollowersCount || 0);
                
                // Add separator
                const separator = document.createTextNode(' | ');
                badge.appendChild(separator);
                
                const pill = document.createElement('span');
                pill.style.cssText = `
                    display: inline-block;
                    padding: 1px 4px;
                    border-radius: 8px;
                    font-size: 10px;
                    font-weight: bold;
                    background: ${susScore.tier.color};
                    color: white;
                `;
                pill.textContent = susScore.tier.emoji;
                pill.title = `Sus Score: ${(susScore.score * 100).toFixed(0)}% - ${susScore.tier.label}`;
                
                badge.appendChild(pill);
            }
            
            let tooltipText = `Following: ${friends_count} | Followers: ${followers} | Ratio: ${ratio} | Posts: ${statuses_count} | Joined: ${createdFormatted}`;
            if (sharedFollowersCount !== null && sharedFollowersCount !== undefined) {
                tooltipText += ` | Shared Followers: ${sharedFollowersCount}`;
            }
            badge.title = tooltipText;
            
            return badge;
        }

        async injectUserStatsBadge(userData) {
            if (!userData || userData.handle === 'unknown') return;
            
            // Check if badges are enabled
            if (!settings.badgesEnabled) {
                return;
            }
            
            // Store in cache
            this.userCache.set(userData.handle, userData);
            
            // Apply badge immediately (without shared followers count initially)
            this.applyBadgeToUser(userData);
            
            // Also apply with a small delay for newly loaded content
            setTimeout(() => {
                this.applyBadgeToUser(userData);
            }, 200);
            
            // Fetch shared followers count asynchronously and update badge
            this.fetchAndUpdateSharedFollowers(userData);
            
            // Schedule another application attempt for lazy-loaded content
            setTimeout(() => {
                this.applyBadgeToUser(userData);
            }, 1000);
        }

        async fetchAndUpdateSharedFollowers(userData) {
            try {
                const sharedCount = await this.fetchSharedFollowersCount(userData.id);
                if (sharedCount !== null) {
                    // Update userData with shared followers count
                    const updatedUserData = { ...userData, sharedFollowersCount: sharedCount };
                    this.userCache.set(userData.handle, updatedUserData);
                    
                    // Reapply badge with shared followers count
                    setTimeout(() => {
                        this.applyBadgeToUserWithShared(updatedUserData);
                    }, 100);
                    
                    log(`Updated cache for @${userData.handle} with ${sharedCount} shared followers`);
                }
            } catch (e) {
                log(`Failed to fetch shared followers for @${userData.handle}:`, e.message);
            }
        }

        applyBadgeToUser(userData) {
            // Skip badges for your own account
            if (this.isCurrentUser(userData.handle)) {
                return;
            }

            // Simple approach: find user links and add badges, excluding navigation
            setTimeout(() => {
                const userLinks = document.querySelectorAll(`a[href="/${userData.handle}"]`);
                
                userLinks.forEach(link => {
                    // Skip navigation elements specifically
                    if (this.isNavigationElement(link)) {
                        return;
                    }
                    
                    // Find the container for this link
                    const container = link.closest('[data-testid="UserCell"]') || 
                                    link.closest('article') ||
                                    link.closest('[data-testid="User-Name"]') ||
                                    link.parentElement?.parentElement ||
                                    link.parentElement;
                    
                    // Skip if badge already exists in this container
                    if (container && container.querySelector('.user-stats-badge')) {
                        return;
                    }
                    
                    // Find the @username text and add badge after it
                    this.addBadgeNearUsername(link, userData);
                });
            }, 100);
        }

        isCurrentUser(handle) {
            // Simple check - get current user handle from profile link
            if (!this._currentUserHandle) {
                const profileLink = document.querySelector('[data-testid="AppTabBar_Profile_Link"]');
                if (profileLink) {
                    this._currentUserHandle = profileLink.getAttribute('href')?.replace('/', '');
                }
            }
            return this._currentUserHandle === handle;
        }

        isNavigationElement(link) {
            // Check if this link is in navigation/tab context
            return (
                link.getAttribute('role') === 'tab' ||
                link.closest('[role="navigation"]') ||
                link.closest('nav') ||
                link.closest('[data-testid*="Tab"]') ||
                link.closest('[data-testid*="Nav"]') ||
                link.closest('[data-testid="AppTabBar"]') ||
                link.textContent === 'Home' ||
                link.textContent === 'Tweets'
            );
        }

        addBadgeNearUsername(userLink, userData) {
            // Look for @username text near this link
            const container = userLink.closest('[data-testid="UserCell"]') || 
                            userLink.closest('article') ||
                            userLink.closest('[data-testid="User-Name"]') ||
                            userLink.parentElement?.parentElement ||
                            userLink.parentElement;
            
            if (!container) return;
            
            // Remove any existing badges for this user in this container
            const existingBadges = container.querySelectorAll(`[data-user-handle="${userData.handle}"]`);
            existingBadges.forEach(badge => badge.remove());
            
            // Always use the cached userData which might have sharedFollowersCount
            const cachedUserData = this.userCache.get(userData.handle) || userData;
            
            const usernameText = `@${userData.handle}`;
            
            // Strategy 1: Find element with exact @username text
            const allElements = container.querySelectorAll('*');
            for (const element of allElements) {
                if (element.textContent === usernameText && element.tagName !== 'A') {
                    const parent = element.parentElement;
                    if (parent) {
                        const badge = this.createUserStatsBadge(cachedUserData, cachedUserData.sharedFollowersCount);
                        badge.setAttribute('data-user-handle', userData.handle);
                        parent.insertBefore(badge, element.nextSibling);
                        return;
                    }
                }
            }
            
            // Strategy 2: Look for grey text containing @username (common Twitter styling)
            const greyElements = container.querySelectorAll('[style*="color: rgb(113, 118, 123)"]');
            for (const element of greyElements) {
                if (element.textContent.includes(usernameText)) {
                    const parent = element.parentElement;
                    if (parent) {
                        const badge = this.createUserStatsBadge(cachedUserData, cachedUserData.sharedFollowersCount);
                        badge.setAttribute('data-user-handle', userData.handle);
                        parent.insertBefore(badge, element.nextSibling);
                        return;
                    }
                }
            }
            
            // Strategy 3: Look for any text element containing @username
            for (const element of allElements) {
                if (element.textContent.trim() === usernameText && 
                    element.tagName !== 'A' && 
                    !element.querySelector('a')) {
                    const parent = element.parentElement;
                    if (parent) {
                        const badge = this.createUserStatsBadge(cachedUserData, cachedUserData.sharedFollowersCount);
                        badge.setAttribute('data-user-handle', userData.handle);
                        parent.insertBefore(badge, element.nextSibling);
                        return;
                    }
                }
            }
            
            // Strategy 4: Fallback - add after the user link if we found a suitable parent
            if (userLink.parentElement) {
                const parentDiv = userLink.parentElement;
                // Check if there's a next sibling where we can insert
                if (parentDiv.parentElement) {
                    const badge = this.createUserStatsBadge(cachedUserData, cachedUserData.sharedFollowersCount);
                    badge.setAttribute('data-user-handle', userData.handle);
                    parentDiv.parentElement.insertBefore(badge, parentDiv.nextSibling);
                }
            }
        }



        applyBadgeToUserWithShared(userData) {
            // Skip badges for your own account
            if (this.isCurrentUser(userData.handle)) {
                return;
            }

            // Find and replace existing badges for this user using data attribute
            setTimeout(() => {
                const existingBadges = document.querySelectorAll(`[data-user-handle="${userData.handle}"]`);
                
                existingBadges.forEach(badge => {
                    // Create new badge with shared followers count
                    const newStatsBadge = this.createUserStatsBadge(userData, userData.sharedFollowersCount);
                    newStatsBadge.setAttribute('data-user-handle', userData.handle);
                    
                    // Replace the existing badge
                    badge.parentNode.insertBefore(newStatsBadge, badge);
                    badge.remove();
                });
            }, 100);
        }

        startCacheReapplication() {
            log('Starting badge reapplication system...');
            
            // Periodic reapplication for cached users
            setInterval(() => {
                if (!settings.badgesEnabled || this.userCache.size === 0) return;
                
                this.userCache.forEach((userData, handle) => {
                    // Skip current user
                    if (this.isCurrentUser(handle)) return;
                    
                    // Always use applyBadgeToUser since it now checks cache automatically
                    this.applyBadgeToUser(userData);
                });
            }, 4000);
            
            // Enhanced scroll-based reapplication for new content
            let scrollTimeout;
            let lastScrollPosition = 0;
            
            window.addEventListener('scroll', () => {
                if (!settings.badgesEnabled || this.userCache.size === 0) return;
                
                const currentScrollPosition = window.scrollY;
                const scrolledDown = currentScrollPosition > lastScrollPosition;
                lastScrollPosition = currentScrollPosition;
                
                clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(() => {
                    // Apply badges to all cached users when new content loads
                    this.userCache.forEach((userData, handle) => {
                        if (this.isCurrentUser(handle)) return;
                        this.applyBadgeToUser(userData);
                    });
                    
                    // Also trigger badge application for any visible user links without badges
                    this.applyBadgesToVisibleContent();
                }, 500);
            });
            
            // Mutation observer for new content (lightweight version)
            const observer = new MutationObserver((mutations) => {
                if (!settings.badgesEnabled || this.userCache.size === 0) return;
                
                let hasNewContent = false;
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                // Check if new content contains user links
                                if (node.querySelector && node.querySelector('a[href^="/"]')) {
                                    hasNewContent = true;
                                    break;
                                }
                            }
                        }
                    }
                });
                
                if (hasNewContent) {
                    // Small delay to let DOM settle, then apply badges
                    setTimeout(() => {
                        this.userCache.forEach((userData, handle) => {
                            if (this.isCurrentUser(handle)) return;
                            this.applyBadgeToUser(userData);
                        });
                    }, 200);
                }
            });
            
            // Start observing with minimal config to reduce overhead
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            
            log('Badge reapplication system started');
        }
        
        applyBadgesToVisibleContent() {
            // Apply badges to any visible user links that don't have badges yet
            if (!settings.badgesEnabled || this.userCache.size === 0) return;
            
            this.userCache.forEach((userData, handle) => {
                if (this.isCurrentUser(handle)) return;
                
                // Find user links in the current viewport that don't have badges
                const userLinks = document.querySelectorAll(`a[href="/${handle}"]`);
                userLinks.forEach(link => {
                    if (this.isNavigationElement(link)) return;
                    
                    // Check if link is roughly in viewport and doesn't have nearby badge
                    const rect = link.getBoundingClientRect();
                    const isVisible = rect.top >= -100 && rect.top <= window.innerHeight + 100;
                    
                    if (isVisible) {
                        const container = link.closest('[data-testid="UserCell"]') || 
                                        link.closest('article') ||
                                        link.closest('[data-testid="User-Name"]') ||
                                        link.parentElement?.parentElement;
                        
                        if (container && !container.querySelector('.user-stats-badge')) {
                            this.addBadgeNearUsername(link, userData);
                        }
                    }
                });
            });
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
            this.deferredBlocks = new Set(); // Track users with pending deferred blocks
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
            
            log('Setting up AJAX with auth tokens...');
            log('Bearer token:', bearerToken ? bearerToken.substring(0, 50) + '...' : 'none');
            log('CSRF token:', csrfToken ? csrfToken.substring(0, 20) + '...' : 'none');
            log('All cookies:', document.cookie.split(';').map(c => c.trim().split('=')[0]));
            
            if (!csrfToken) {
                log('Missing CSRF token - checking for alternative names...');
                const altCsrf = this.getCookie('csrf_token') || this.getCookie('x-csrf-token') || this.getCookie('_csrf');
                if (altCsrf) {
                    log('Found alternative CSRF token');
                } else {
                    info('No CSRF token found - blocking disabled');
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
            
            log('AJAX client configured for blocking');
            
            // Test the configuration
            this.testAuth();
            
            // Try to capture query IDs early by triggering a small request
            this.earlyQueryIdCapture();
        }
        
        async testAuth() {
            try {
                log('Testing authentication...');
                // Use a simpler endpoint that's more likely to work
                const response = await this.ajax.get('/i/api/1.1/account/settings.json');
                info('Block module auth test successful');
            } catch (e) {
                // Don't show auth test failures unless in debug mode - they're not critical
                log('Block module auth test failed:', e.response?.status, e.response?.statusText);
                if (e.response?.status === 401) {
                    log('401 = Invalid/expired tokens. Try refreshing the page.');
                } else if (e.response?.status === 404) {
                    log('404 = Endpoint not found. Auth may still work for blocking.');
                }
            }
        }

        earlyQueryIdCapture() {
            // Try to capture query IDs early by monitoring for common GraphQL requests
            setTimeout(() => {
                if (!this.queryIds.userByScreenName) {
                    log('UserByScreenName query ID not captured yet. Auto-blocking will use fallback method.');
                    log('💡 Visit a user profile or browse Twitter to trigger query ID capture for faster blocking.');
                    // The query ID will be captured when any UserByScreenName request is made
                    // This happens naturally when users visit profiles or when the system looks up users
                }
            }, 2000);
        }

        async getUserIdByScreenName(screenName) {
            try {
                log(`Attempting to get user ID for @${screenName} via fallback method...`);
                
                // Try the Twitter 1.1 API users/show endpoint
                const response = await this.ajax.get(`/i/api/1.1/users/show.json?screen_name=${screenName}`);
                
                if (response.data && response.data.id_str) {
                    log(`✅ Got user ID via REST API: ${response.data.id_str}`);
                    return response.data.id_str;
                }
                
                log('❌ Failed to get user ID via REST API');
                return null;
            } catch (e) {
                log(`❌ Fallback user lookup failed for @${screenName}:`, e.message);
                return null;
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
                    log('Found Bearer token in script');
                    return m[1];
                }
            }
            
            // Try to find it in localStorage
            try {
                const stored = localStorage.getItem('twitter_bearer_token');
                if (stored) {
                    log('Found Bearer token in localStorage');
                    return stored;
                }
            } catch (e) {}
            
            // Fallback to known token
            log('Using fallback Bearer token');
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
                    log('FETCH INTERCEPTED:', url.split('/').pop().split('?')[0]);
                }
                
                // Intercept Retweeters API responses for bulk blocking
                if (url.includes('/Retweeters?')) {
                    log('RETWEETERS FETCH DETECTED!');
                    log('Current URL:', window.location.href);
                    
                    if (window.location.href.includes('/retweets')) {
                        try {
                            const clonedResponse = response.clone();
                            const json = await clonedResponse.json();
                            log('Processing Retweeters for bulk blocking...');
                            self.processRetweetersAPIResponse(json);
                        } catch (e) {
                            log('Failed to process Retweeters:', e);
                        }
                    }
                }
                
                return response;
            };
            log('Fetch hook installed for bulk blocking');
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
                log('Captured Followers query ID');
            } else if ((m = /\/i\/api\/graphql\/([^/]+)\/UserByScreenName/.exec(url))) {
                if (!this.queryIds.userByScreenName) {
                    info('✅ UserByScreenName query ID captured - Auto-blocking now available!');
                }
                this.queryIds.userByScreenName = { id: m[1], feat: this.extractFeat(url) };
                log('Captured UserByScreenName query ID');
            } else if ((m = /\/i\/api\/graphql\/([^/]+)\/Favoriters/.exec(url))) {
                this.queryIds.favoriters = { id: m[1], feat: this.extractFeat(url) };
                log('Captured Favoriters query ID');
            } else if ((m = /\/i\/api\/graphql\/([^/]+)\/Retweeters/.exec(url))) {
                this.queryIds.retweeters = { id: m[1], feat: this.extractFeat(url) };
                log('Captured Retweeters query ID');
            } else if ((m = /\/i\/api\/graphql\/([^/]+)\/TweetDetail/.exec(url))) {
                this.queryIds.tweetDetail = { id: m[1], feat: this.extractFeat(url) };
                log('Captured TweetDetail query ID');
            } else if ((m = /\/i\/api\/graphql\/([^/]+)\/QuoteTweeters/.exec(url))) {
                this.queryIds.quoteTweeters = { id: m[1], feat: this.extractFeat(url) };
                log('Captured QuoteTweeters query ID');
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

            // Auto-blocking is now handled directly during tweet processing
            // when we already have the user data with rest_id
            log('Auto-blocking enabled - will trigger during tweet processing');
        }

        checkAutoBlockWithUserData(userData) {
            if (!settings.autoBlockEnabled || !userData || !userData.id || userData.id === 'unknown') return;

            const autoBlockWords = settings.autoBlockWords.split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
            if (autoBlockWords.length === 0) return;

            // Check if already blocked
            if (this.auto_blocked.has(userData.handle)) return;

            // SAFETY CHECK: Don't auto-block followers or people we follow
            if (userData.followed_by || userData.we_follow) {
                log(`SAFETY: Skipping auto-block for @${userData.handle} - they are ${userData.followed_by ? 'a follower' : 'someone we follow'}`);
                return;
            }

            // Get reason for blocking
            const reason = this.getAutoBlockReason(userData.handle, userData.name + ' ' + userData.description, autoBlockWords);
            
            if (reason) {
                this.auto_blocked.add(userData.handle);
                eventLog(`Auto-blocking @${userData.handle}`, `Matched word: "${reason}"`);
                
                // Use the user ID we already have instead of looking it up
                this.blockUserDirectly(userData.id, userData.handle, reason);
            }
        }

        async blockUserDirectly(userId, handle, reason) {
            try {
                info(`🚫 BLOCKING @${handle} - Reason: ${reason}`);
                log(`Using existing user ID: ${userId} for @${handle}`);
                
                await this.requestLimit(() => this.blockUser(userId));
                eventLog(`✅ Blocked @${handle}`, reason ? `Reason: ${reason}` : '');
                info(`✅ BLOCKED @${handle} successfully`);
            } catch (e) {
                info(`❌ BLOCK FAILED for @${handle}: ${e.message}`);
                eventLog(`❌ Auto-block failed for @${handle}`, e.message);
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
                info(`🚫 BLOCKING @${name} - Reason: ${reason}`);
                
                // Try direct username-based blocking first (fallback method)
                const userId = await this.getUserIdByScreenName(name);
                if (userId) {
                    log(`Got user ID via fallback method: ${userId} for @${name}`);
                    await this.requestLimit(() => this.blockUser(userId));
                    eventLog(`✅ Blocked @${name}`, reason ? `Reason: ${reason}` : '');
                    info(`✅ BLOCKED @${name} successfully`);
                    return;
                }
                
                // Check if we have the required query ID for GraphQL method
                if (!this.queryIds.userByScreenName) {
                    // Check if we already have a deferred block for this user
                    if (this.deferredBlocks.has(name)) {
                        log(`Deferred block already pending for @${name}, skipping duplicate`);
                        return;
                    }
                    
                    log('No GraphQL query ID available yet, deferring auto-block...');
                    this.deferredBlocks.add(name);
                    
                    // Defer the block attempt - try again in 5 seconds
                    setTimeout(() => {
                        this.deferredBlocks.delete(name); // Clean up tracking
                        
                        if (this.queryIds.userByScreenName) {
                            log(`Retrying deferred block for @${name}`);
                            this.blockByScreenName(name, reason);
                        } else {
                            info(`Auto-block still not possible for @${name} - missing GraphQL query ID`);
                            eventLog(`Auto-block skipped for @${name}`, 'GraphQL query ID not captured yet');
                        }
                    }, 5000);
                    return;
                }

                const resp = await this.safeCall(
                    'userByScreenName',
                    this.buildGqlUrl('userByScreenName', { screen_name: name })
                );
                
                if (!resp.data?.data?.user?.result?.rest_id) {
                    log('Could not get user ID from GraphQL response');
                    return;
                }
                
                const id = resp.data.data.user.result.rest_id;
                log(`Got user ID: ${id} for @${name}`);
                
                await this.requestLimit(() => this.blockUser(id));
                eventLog(`✅ Blocked @${name}`, reason ? `Reason: ${reason}` : '');
                info(`✅ BLOCKED @${name} successfully`);
            } catch (e) {
                info(`❌ BLOCK FAILED for @${name}: ${e.message}`);
                if (e.response?.status === 400) {
                    log('400 error - GraphQL request failed, possibly stale query ID');
                } else if (e.response?.status === 401) {
                    log('401 error - authentication issue');
                } else if (e.response?.status === 403) {
                    log('403 error - forbidden (rate limited or permissions)');
                }
                eventLog(`❌ Auto-block failed for @${name}`, e.message);
            }
        }

        setupBlockingUI() {
            log('Setting up blocking UI...');
            
            const checkForBlockingPages = () => {
                const url = window.location.href;
                log('Checking URL for blocking opportunities:', url);
                
                // Check for retweets page: /status/123456/retweets
                if (/\/status\/\d+\/retweets/.test(url)) {
                    log('Detected retweets page');
                    this.injectBlockingControls('retweets');
                }
                
                // Check for quotes page: /status/123456/quotes  
                else if (/\/status\/\d+\/quotes/.test(url)) {
                    log('Detected quotes page');
                    this.injectBlockingControls('quotes');
                }
                
                // Check for followers page: /username/followers
                else if (/\/[^/]+\/followers/.test(url)) {
                    log('Detected followers page');
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
                    log('Navigation detected, checking for blocking pages...');
                    setTimeout(checkForBlockingPages, 1000); // Delay to let page load
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        injectBlockingControls(pageType) {
            log(`Injecting blocking controls for ${pageType} page`);
            
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

                log(`Blocking controls injected for ${pageType}`);
            }, 2000);
        }

        async startBulkAction(pageType, action) {
            log(`Starting bulk ${action} for ${pageType}`);
            const statusEl = $(`#tbwl-status-${pageType}`);
            statusEl.text(`Starting bulk ${action}...`);

            // Try multiple selectors to find user elements
            let userCells = $('div[data-testid="UserCell"]');
            log(`Found ${userCells.length} UserCell elements`);

            if (userCells.length === 0) {
                // Try alternative selectors
                userCells = $('div[data-testid="cellInnerDiv"]').filter((i, el) => {
                    return $(el).find('a[href^="/"]').length > 0;
                });
                log(`Found ${userCells.length} cellInnerDiv elements with profile links`);
            }

            if (userCells.length === 0) {
                // Try finding any divs with profile links
                userCells = $('div').filter((i, el) => {
                    const $el = $(el);
                    return $el.find('a[href^="/"][href*="/"]').length > 0 && 
                           !$el.find('a[href^="/"][href*="/"]').attr('href').includes('/status/') &&
                           $el.find('a[href^="/"][href*="/"]').attr('href').split('/').length === 2;
                });
                log(`Found ${userCells.length} elements with user profile links`);
            }

            if (userCells.length === 0) {
                log('Debugging: Looking for any profile links on page...');
                const allLinks = $('a[href^="/"]');
                log(`Total links starting with /: ${allLinks.length}`);
                
                allLinks.each((i, link) => {
                    const href = $(link).attr('href');
                    if (i < 10) { // Log first 10 for debugging
                        log(`Link ${i}: ${href}`);
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
                    log(`No profile link found in cell ${i}`);
                    continue;
                }

                const href = link.attr('href');
                const username = href.replace('/', '');
                
                if (!username || username.includes('/') || username.length < 1) {
                    log(`Invalid username extracted: "${username}" from href: "${href}"`);
                    continue;
                }

                log(`Processing user: @${username}`);

                // SAFETY CHECK: Skip if this is a mutual or follower
                const userInfo = await this.getUserInfo(username);
                if (userInfo && (userInfo.we_follow || userInfo.followed_by)) {
                    log(`SAFETY: Skipping @${username} - they are a mutual/follower`);
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
                    log(`Failed to ${action} @${username}:`, e.message);
                }

                processed++;
                
                // Rate limiting delay
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            statusEl.text(`✅ Complete! ${action === 'block' ? 'Blocked' : 'Muted'} ${succeeded}/${processed} users`);
            log(`Bulk ${action} complete: ${succeeded}/${processed} users`);
        }

        setupBulkBlockingFromAPI() {
            log('Setting up user collection for bulk blocking...');
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
            log('Processing Retweeters API response - handling multiple calls...');
            
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
            
            log(`Added ${addedCount} new retweeters (total: ${this.retweetersData.length})`);
            this.updateBulkControlsStatus('retweets', this.retweetersData.length);
            
            return this.retweetersData;
        }

        extractUsersFromRetweetersAPI(json) {
            log('Extracting users from Retweeters GraphQL API response...');
            
            const users = [];
            
            // For Retweeters GraphQL endpoint, users are in data.retweeters_timeline.timeline
            if (json.data?.retweeters_timeline?.timeline?.instructions) {
                const instructions = json.data.retweeters_timeline.timeline.instructions;
                log(`Processing ${instructions.length} instructions...`);
                
                instructions.forEach(instruction => {
                    log(`Instruction type: ${instruction.type}`);
                    if (instruction.type === 'TimelineAddEntries' && instruction.entries) {
                        log(`Processing ${instruction.entries.length} entries...`);
                        instruction.entries.forEach((entry, i) => {
                            log(`Entry ${i}: ${entry.content?.entryType}`);
                            const userData = this.extractUserFromRetweetEntry(entry);
                            if (userData) {
                                users.push(userData);
                                log(`Found retweeter: @${userData.handle}`);
                            }
                        });
                    }
                });
            } else {
                log('Expected data structure not found for Retweeters');
                log('Available keys:', Object.keys(json.data || {}));
            }

            log(`Extracted ${users.length} retweeters from this API call`);
            return users;
        }

        extractUsersFromQuoteTweetsAPI(json) {
            log('Extracting users from Quote Tweets SearchTimeline API response...');
            
            const users = [];
            
            // For SearchTimeline (quotes), tweets are in data.search_by_raw_query.search_timeline.timeline
            if (json.data?.search_by_raw_query?.search_timeline?.timeline?.instructions) {
                const instructions = json.data.search_by_raw_query.search_timeline.timeline.instructions;
                log(`Processing ${instructions.length} search instructions...`);
                
                instructions.forEach(instruction => {
                    log(`Search instruction type: ${instruction.type}`);
                    if (instruction.type === 'TimelineAddEntries' && instruction.entries) {
                        log(`Processing ${instruction.entries.length} search entries...`);
                        instruction.entries.forEach((entry, i) => {
                            log(`Search Entry ${i}: ${entry.content?.entryType} - ${entry.entryId}`);
                            
                            // Based on your example, quotes are TimelineTweet entries
                            if (entry.content?.entryType === 'TimelineTimelineItem' && 
                                entry.content.itemContent?.itemType === 'TimelineTweet' &&
                                entry.content.itemContent.tweet_results?.result) {
                                
                                const tweetResult = entry.content.itemContent.tweet_results.result;
                                const userData = this.extractUserData(tweetResult);
                                if (userData && userData.handle !== 'unknown') {
                                    users.push(userData);
                                    log(`Found quote tweeter: @${userData.handle} (${userData.followers} followers)`);
                                } else {
                                    log(`Could not extract user data from tweet ${entry.entryId}`);
                                }
                            }
                        });
                    }
                });
            } else {
                log('Expected search data structure not found for Quote Tweets');
                if (json.data) {
                    log('Available data keys:', Object.keys(json.data));
                    if (json.data.search_by_raw_query) {
                        log('search_by_raw_query keys:', Object.keys(json.data.search_by_raw_query));
                    }
                }
            }

            this.quoteTweetersData = users;
            log(`Extracted ${users.length} quote tweeters total`);
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
                    
                    // INJECT USER STATS BADGE
                    if (window.filterModule && userData) {
                        window.filterModule.injectUserStatsBadge(userData);
                    }
                    
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
                log('No legacy or core data found in user result');
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
                description: legacyData?.description || '',
                // NEW FIELDS:
                statuses_count: parseInt(legacyData?.statuses_count) || 0,
                created_at: legacyData?.created_at || coreData?.created_at || '',
                verified: legacyData?.verified || false
            };

            log('Extracted retweeter data:', userData);
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
                log('Cleared retweeters data for new retweets page');
            } else if (/\/status\/\d+\/quotes/.test(url)) {
                pageType = 'quotes';
                // Clear quote tweeters data when navigating to a new quotes page  
                this.quoteTweetersData = [];
                log('Cleared quote tweeters data for new quotes page');
            }

            if (pageType) {
                log(`Detected ${pageType} page, showing controls...`);
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

            log(`Starting ${dryRun ? 'DRY RUN' : 'LIVE'} bulk ${actionText} for ${users.length} ${pageType}`);
            statusEl.text(`${dryRun ? '🔍 Previewing' : 'Processing'} ${users.length} users...`);

            let processed = 0;
            let succeeded = 0;
            let skipped = 0;
            let wouldProcess = 0;

            for (const user of users) {
                // SAFETY CHECK: Skip mutuals and followers
                if (user.we_follow || user.followed_by) {
                    log(`SAFETY: Skipping @${user.handle} - mutual/follower`);
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
                    log(`DRY RUN: Would ${actions.join(' & ')} @${user.handle} (${user.followers} followers)`);
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
                        log(`Blocked @${user.handle}`);
                    }
                    
                    if (mute) {
                        await this.requestLimit(() => this.muteUser(user.id));
                        log(`Muted @${user.handle}`);
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
                log(`DRY RUN complete: Would process ${wouldProcess} users, ${skipped} skipped`);
            } else {
                statusEl.text(`✅ Complete! Processed ${succeeded} users, ${skipped} skipped (mutuals)`);
                log(`Live action complete: ${succeeded} processed, ${skipped} skipped`);
            }
        }

        collectUserForBulkBlocking(userData) {
            const url = window.location.href;
            
            // Only collect users when on retweets or quotes pages
            if (url.includes('/retweets')) {
                if (!this.retweetersData.find(u => u.id === userData.id)) {
                    this.retweetersData.push(userData);
                    log(`Collected retweeter: @${userData.handle} (total: ${this.retweetersData.length})`);
                    this.updateBulkControlsStatus('retweets', this.retweetersData.length);
                }
            } else if (url.includes('/quotes')) {
                if (!this.quoteTweetersData.find(u => u.id === userData.id)) {
                    this.quoteTweetersData.push(userData);
                    log(`Collected quote tweeter: @${userData.handle} (total: ${this.quoteTweetersData.length})`);
                    this.updateBulkControlsStatus('quotes', this.quoteTweetersData.length);
                }
            }
        }

        async getUserInfo(username) {
            try {
                if (!this.queryIds.userByScreenName) {
                    log('No userByScreenName query ID for safety check');
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
                log(`Safety check failed for @${username}:`, e.message);
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
                info(`🔇 MUTING @${name} - Reason: ${reason}`);
                
                // Try direct username-based muting first (fallback method)
                const userId = await this.getUserIdByScreenName(name);
                if (userId) {
                    log(`Got user ID via fallback method: ${userId} for @${name}`);
                    await this.requestLimit(() => this.muteUser(userId));
                    eventLog(`✅ Muted @${name}`, reason ? `Reason: ${reason}` : '');
                    info(`✅ MUTED @${name} successfully`);
                    return;
                }
                
                if (!this.queryIds.userByScreenName) {
                    info(`❌ No userByScreenName query ID available and fallback failed for @${name}`);
                    return;
                }

                const resp = await this.safeCall(
                    'userByScreenName',
                    this.buildGqlUrl('userByScreenName', { screen_name: name })
                );
                
                if (!resp.data?.data?.user?.result?.rest_id) {
                    log('Could not get user ID from GraphQL response');
                    return;
                }
                
                const id = resp.data.data.user.result.rest_id;
                await this.requestLimit(() => this.muteUser(id));
                eventLog(`✅ Muted @${name}`, reason ? `Reason: ${reason}` : '');
                info(`✅ MUTED @${name} successfully`);
            } catch (e) {
                info(`❌ MUTE FAILED for @${name}: ${e.message}`);
                eventLog(`❌ Mute failed for @${name}`, e.message);
                throw e;
            }
        }

        blockUser(id) {
            eventLog('Blocking user ID', id);
            log(`Blocking user ID: ${id}`);
            return this.ajax.post('/i/api/1.1/blocks/create.json', Qs.stringify({
                user_id: id
            }));
        }

        muteUser(id) {
            eventLog('Muting user ID', id);
            log(`Muting user ID: ${id}`);
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
            
            // For UserByScreenName, ensure we have minimal required features to avoid 400 errors
            if (key === 'userByScreenName') {
                const minimalFeatures = {
                    "hidden_profile_subscriptions_enabled": true,
                    "rweb_tipjar_consumption_enabled": true,
                    "responsive_web_graphql_skip_user_profile_image_extensions_enabled": false,
                    "responsive_web_graphql_timeline_navigation_enabled": true
                };
                
                const variables = encodeURIComponent(JSON.stringify(vars));
                const features = encodeURIComponent(JSON.stringify(minimalFeatures));
                return `/i/api/graphql/${id}/${opName}?variables=${variables}&features=${features}`;
            }
            
            const variables = encodeURIComponent(JSON.stringify(vars));
            return `/i/api/graphql/${id}/${opName}?variables=${variables}${feat ? '&' + feat : ''}`;
        }

        async safeCall(opKey, url) {
            try {
                return await this.ajax.get(url);
            } catch (e) {
                if (e.response?.status === 404 && this.queryIds[opKey]) {
                    log(`404 error for ${opKey}, clearing stale query ID`);
                    delete this.queryIds[opKey];
                    // Retry logic would go here
                } else if (e.response?.status === 400 && this.queryIds[opKey]) {
                    log(`400 error for ${opKey}, possibly stale query ID or bad parameters`);
                    // Don't delete the query ID for 400 errors as it might still be valid
                    // The problem could be with parameters or rate limiting
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
                this.createSettingsGear();
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

        createSettingsGear() {
            // Remove existing gear if it exists
            $('#twitter-ultimate-gear').remove();
            
            const gear = $(`
                <button id="twitter-ultimate-gear" title="Twitter Ultimate Settings">
                    <svg viewBox="0 0 24 24">
                        <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
                    </svg>
                </button>
            `);
            
            gear.click((e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showSettingsPanel();
            });
            $('body').append(gear);
            log('Settings gear button added to bottom left');
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
                        <label><input type="checkbox" id="badgesEnabled"> Show User Stats Badges</label><br>
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

            // Close panel when clicking outside (but not on the gear button)
            $(document).click((e) => {
                if ($(e.target).closest('#twitter-ultimate-settings').length === 0 && 
                    $(e.target).closest('#twitter-ultimate-gear').length === 0 &&
                    !$(e.target).is('#twitter-ultimate-settings') &&
                    !$(e.target).is('#twitter-ultimate-gear')) {
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
            $('#badgesEnabled').prop('checked', settings.badgesEnabled);
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
            settings.badgesEnabled = $('#badgesEnabled').is(':checked');
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

    info('🚀 TWITTER ULTIMATE TOOL - SCRIPT LOADED');
    log('Current URL:', window.location.href);
    log('Document ready state:', document.readyState);

    function initializeModules() {
        info('INITIALIZING MODULES...');
        loadSettings();
        log('Settings loaded:', settings);
        
        // Show environment info if debug mode is enabled
        if (settings.debugMode) {
            console.log('URL:', window.location.href);
            console.log('User Agent:', navigator.userAgent);
            console.log('Tampermonkey available:', typeof GM_setValue !== 'undefined');
            console.log('jQuery available:', typeof $ !== 'undefined');
            console.log('Axios available:', typeof axios !== 'undefined');
            console.log('Qs available:', typeof Qs !== 'undefined');
        }

        const start = () => {
            info('STARTING MODULES...');
            
            // Initialize UI first
            settingsUI = new SettingsUI();
            log('Settings UI initialized');

            // Initialize modules based on settings
            if (settings.filterEnabled) {
                log('Initializing Filter Module...');
                filterModule = new TwitterFilterModule();
                window.filterModule = filterModule; // Make globally accessible for badge injection
                log('Filter Module initialized');
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
                log('Initializing Block Module...');
                blockModule = new BlockWithLoveModule();
                window.blockModule = blockModule; // Expose globally for user collection
                log('Block Module initialized and exposed globally');
            } else {
                info('Block With Love module disabled via settings');
            }

            info('🎉 TWITTER ULTIMATE TOOL FULLY INITIALIZED');
            info(`Settings - Follower limit: ${settings.followLimit}, ratio limit: ${settings.ratioLimit}`);
            info(`Debug mode is ${settings.debugMode ? 'ON' : 'OFF'}`);
            if (settings.debugMode) {
                info('Watch the console for detailed filtering activity...');
                info('💡 Tip: Use filterModule.getCacheStats() in console to see cache statistics');
            }
        };

        if (document.readyState === 'loading') {
            log('Waiting for DOM to load...');
            document.addEventListener('DOMContentLoaded', start);
        } else {
            log('DOM already loaded, starting immediately');
            start();
        }
    }

    // Wait for dependencies and start the tool
    function waitForDependencies() {
        log('Checking dependencies...');
        if (typeof $ !== 'undefined' && typeof axios !== 'undefined' && typeof Qs !== 'undefined') {
            info('All dependencies loaded, starting tool...');
            addStyles();
            initializeModules();
            info('🎉 Twitter Ultimate Filter & Block Tool loaded successfully!');
        } else {
            log('Dependencies not ready, retrying in 1 second...');
            log('jQuery:', typeof $, 'Axios:', typeof axios, 'Qs:', typeof Qs);
            setTimeout(waitForDependencies, 1000);
        }
    }
    
    function addStyles() {
        log('Adding CSS styles...');
        // Add styles for settings panel
        $('head').append(`
            <style>
                /* Settings Panel - Force Dark Mode */
                #twitter-ultimate-settings {
                    background: #15202b !important;
                    color: #ffffff !important;
                    border: 1px solid #38444d !important;
                }
                #twitter-ultimate-settings .setting-section {
                    margin-bottom: 20px;
                    padding: 15px;
                    background: #192734 !important;
                    border: 1px solid #38444d !important;
                    border-radius: 8px;
                }
                #twitter-ultimate-settings .setting-section h3 {
                    margin: 0 0 10px 0;
                    color: #ffffff !important;
                }
                #twitter-ultimate-settings label {
                    display: block;
                    margin: 8px 0;
                    color: #ffffff !important;
                }
                #twitter-ultimate-settings input[type="text"], 
                #twitter-ultimate-settings input[type="number"],
                #twitter-ultimate-settings textarea {
                    padding: 6px;
                    border: 1px solid #38444d !important;
                    border-radius: 4px;
                    background: #253341 !important;
                    color: #ffffff !important;
                    width: 100%;
                    box-sizing: border-box;
                }
                #twitter-ultimate-settings input[type="checkbox"] {
                    margin-right: 8px;
                }
                #twitter-ultimate-settings button {
                    background: #1d9bf0 !important;
                    color: #ffffff !important;
                    border: none !important;
                    padding: 10px 20px;
                    border-radius: 20px;
                    cursor: pointer;
                    margin: 5px;
                }
                #twitter-ultimate-settings button:hover {
                    background: #1a8cd8 !important;
                }
                
                /* Settings Gear Button */
                #twitter-ultimate-gear {
                    position: fixed;
                    bottom: 20px;
                    left: 20px;
                    width: 50px;
                    height: 50px;
                    background: #1d9bf0;
                    border: none;
                    border-radius: 50%;
                    cursor: pointer;
                    z-index: 9999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                    transition: all 0.2s ease;
                }
                #twitter-ultimate-gear:hover {
                    background: #1a8cd8;
                    transform: rotate(90deg);
                }
                #twitter-ultimate-gear svg {
                    width: 24px;
                    height: 24px;
                    fill: white;
                }
            </style>
        `);
    }

        waitForDependencies();
})();
