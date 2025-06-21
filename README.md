# Twitter Ultimate Filter & Block Tool

WAY LESS JANKY THAN BEFORE!!!!!
WARNING THIS BITCH CAN BLOCK MFERS QUICK, I've tested it a bunch, accidentally blocking many mutuals. sowwy. use at your own risk as with any of my personal use vibe coded slop. its a super duper hevily modified fork of twitter block with love to make it something to make twitter suck less for me, but also for friends to use.

A comprehensive userscript that combines Twitter filtering, blocking, and enhancement tools into one unified solution.

## 🚀 Features

### 🔍 **Content Filter**
- **Keyword Filtering**: Hide tweets with banned words/emojis in usernames, names, or bios
- **Ratio Filtering**: Hide accounts with suspicious following/follower ratios
- **Minimum Followers**: Filter accounts below follower threshold
- **Whitelist Support**: CSV-based whitelist for trusted accounts
- **Mutual Protection**: Never filters accounts you follow or that follow you

### 📊 **User Stats Badges**
- **Smart Badges**: Shows following:followers ratio, post count, account age
- **Relationship Indicators**: 🧑‍🤝‍🧑 mutual, 🧍 follows you, 🚶 you follow, 🤷 no relationship
- **Sus Score System**: Color-coded quality assessment (🟢 chill, 🟡 meh, 🟠 sketch, 🔴 dumpster fire)
- **Shared Followers**: Shows mutual connections (cached for performance)

### 🚫 **Block Tools**
- **Auto-Block**: Automatically block accounts with specific keywords/emojis
- **Bulk Blocking**: Block/mute all retweeters or quote tweeters from API data
- **Quick Block Button**: One-click blocking directly on tweets
- **Safety Features**: Protects mutuals and followers from accidental blocking

### ⚡ **Quick Actions**
- **Quick Block**: Fast blocking button on tweets
- **Not Interested**: One-click "not interested" on home timeline
- **Smart Integration**: Works with Twitter's existing UI

### ⚙️ **Settings**
- **Visual Panel**: Easy settings interface with gear button (bottom left)
- **Granular Control**: Enable/disable individual features
- **Debug Mode**: Detailed logging for troubleshooting

## 📦 Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/)
2. Copy the userscript code from `twitter_all_in_one.js`
3. Open Tampermonkey Dashboard → Create New Script
4. Replace default code and save
5. Visit [twitter.com](https://twitter.com) or [x.com](https://x.com)

## 🎯 Usage

### Settings
Click the **gear button** (bottom left) to open settings:

#### Content Filter
- **Banned Words**: `crypto,nft,bot,spam,🤖,💰,giveaway` (supports emojis)
- **Minimum Followers**: Default 100
- **Ratio Limit**: Default 5 (following/followers)

#### Block Tools  
- **Auto-Block Words**: `scam,fake,impersonator,bot,spam`
- **Bulk Controls**: Appear on `/retweets` and `/quotes` pages

#### UI Features
- **User Stats Badges**: Shows account quality info
- **Quick Actions**: Block/not interested buttons on tweets

### Bulk Blocking
1. Go to `/status/123/retweets` or `/status/123/quotes` pages
2. Wait for API data to load
3. Use floating controls (bottom right) to block/mute users
4. **Dry Run** mode shows preview before actual blocking

## 🔧 Configuration Examples

### Aggressive Setup
```
Banned Words: crypto,nft,bot,spam,scam,🤖,💰,giveaway
Min Followers: 500
Ratio Limit: 3
Auto-Block: ON
```

### Light Setup  
```
Banned Words: spam,scam,bot
Min Followers: 50
Ratio Limit: 10
Auto-Block: OFF
```

## ⚠️ Safety Features

- **Mutual Protection**: Never blocks people you follow or who follow you
- **Whitelist**: Bypass all filtering for trusted accounts
- **Dry Run Mode**: Preview actions before executing
- **Rate Limiting**: Prevents API throttling

## 🐛 Troubleshooting

**Script not working?**
- Refresh page after installation
- Check browser console for errors
- Enable Debug Mode in settings

**Filtering not working?**
- Check if accounts are whitelisted or mutuals
- Verify banned words format (comma-separated)

**Blocking fails?**
- Ensure you're logged into Twitter
- Wait if rate limited (15-30 minutes)

## 📝 Notes

- All processing happens locally in your browser
- Auto-block operates conservatively to avoid false positives  
- Twitter API changes may temporarily break features
- Use responsibly and per Twitter's ToS

---

**Made with 🍆 for a better Twitter experience**
