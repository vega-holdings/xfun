# Twitter Ultimate Filter & Block Tool

A comprehensive userscript that combines multiple Twitter/X enhancement tools into one unified, configurable solution. This tool helps you filter unwanted content, add missing UI features, and manage blocking/muting at scale.

## 🚀 Features

### 🔍 **Content Filter**
- **Keyword Filtering**: Hide tweets containing specific banned words in usernames, display names, or descriptions
- **Emoji Filtering**: Filter accounts using specific emojis (including flag combinations like 🇺🇸🇮🇱)
- **Ratio Filtering**: Hide accounts with suspicious following/follower ratios (e.g., following 10x more than followers)
- **Minimum Followers**: Filter out accounts below a follower threshold
- **Whitelist Support**: CSV-based whitelist to exempt specific accounts from filtering
- **Mutual Protection**: Never filters accounts you follow or that follow you

### 👎 **Not Interested Button**
- **Quick Access**: Adds a "Not Interested" button directly to tweets
- **Smart Integration**: Automatically clicks through Twitter's menu system
- **Feed-Specific**: Option to only show on "For You" feed
- **Non-Intrusive**: Seamlessly integrates with Twitter's existing UI

### 🚫 **Block Tools**
- **Auto-Block**: Automatically block accounts based on keywords or emojis in usernames/display names
- **Bulk Blocking**: Block or mute all users who retweeted or quote tweeted specific posts
- **Multi-API Support**: Handles Twitter's multiple API calls for long retweeter lists
- **List Management**: Block all members of a Twitter list
- **Follower Management**: Block all followers of a specific account
- **Rate Limited**: Smart request limiting to avoid API throttling

### ⚙️ **Configuration**
- **Visual Settings Panel**: Easy-to-use configuration interface
- **Persistent Settings**: Automatically saves your preferences
- **Granular Control**: Enable/disable individual modules
- **Debug Mode**: Detailed logging for troubleshooting

## 📦 Installation

### Prerequisites
- [Tampermonkey](https://www.tampermonkey.net/) browser extension
- Works on Chrome, Firefox, Safari, Edge, and other browsers

### Steps
1. **Install Tampermonkey** if you haven't already
2. **Copy the userscript code** from the provided file
3. **Open Tampermonkey Dashboard** (click the Tampermonkey icon → Dashboard)
4. **Create New Script** (click the "+" icon)
5. **Replace the default code** with the Twitter Ultimate tool code
6. **Save** (Ctrl+S or Cmd+S)
7. **Visit Twitter/X** - the script will automatically load

## 🎯 Usage

### Initial Setup
1. Visit [twitter.com](https://twitter.com) or [x.com](https://x.com)
2. Click **Tampermonkey menu** → **"Open Settings"**
3. Configure your preferences in the settings panel
4. Click **"Save Settings"** (page will refresh automatically)

### Settings Configuration

#### 🔍 Content Filter Settings
- **Enable Content Filter**: Toggle the entire filtering system
- **Banned Words**: Comma-separated list supporting text and emojis (e.g., `spam,bot,crypto,🇺🇸🇮🇱,🤖`)
- **Whitelisted Handles**: Comma-separated list (e.g., `verified_news,trusted_source`)
- **Minimum Followers**: Accounts below this number get filtered (default: 100)
- **Ratio Limit**: Hide accounts following X times more than their followers (default: 10)

#### 👎 Not Interested Button Settings
- **Show Not Interested Button**: Enable the quick access button
- **Only on For You Feed**: Restrict to algorithmic timeline only

#### 🚫 Block Tools Settings
- **Enable Block Tools**: Activate bulk blocking/muting features
- **Enable Auto-Block**: Automatically block accounts with specific keywords or emojis
- **Auto-Block Words**: Keywords and emojis that trigger automatic blocking

#### ⚙️ General Settings
- **Debug Mode**: Enable detailed console logging

### Using Block Tools

#### Block Tweet Interactions
1. Navigate to a tweet's **quotes** (`/status/123/quotes`) or **retweets** (`/status/123/retweets`) page
2. Wait for the API data to load - bulk controls will appear showing user count
3. Choose **"Block all"** or **"Mute all"** (or both)
4. Use **"Preview (Dry Run)"** to see who would be affected without actually blocking
5. The system automatically protects mutual followers from being blocked

#### Block Followers
1. Visit someone's **followers page** (`/username/followers`)
2. Use the block controls that appear

#### Block List Members
1. Go to a **Twitter list members page** (`/lists/123/members`)
2. Use the provided block/mute options

## 🛠️ Configuration Examples

### Aggressive Filtering Setup
```
Content Filter: ✅ Enabled
Banned Words: crypto,nft,web3,airdrop,giveaway,bot,spam,🇺🇸🇮🇱,🤖,💰
Minimum Followers: 500
Ratio Limit: 5
Auto-Block: ✅ Enabled
Auto-Block Words: scam,fake,impersonator,🇺🇸🇮🇱,🤖
```

### Light Filtering Setup
```
Content Filter: ✅ Enabled
Banned Words: obvious_spam_term
Minimum Followers: 50
Ratio Limit: 20
Auto-Block: ❌ Disabled
```

### UI-Only Setup
```
Content Filter: ❌ Disabled
Not Interested Button: ✅ Enabled
Block Tools: ✅ Enabled (for manual use)
Auto-Block: ❌ Disabled
```

## 🔧 Advanced Features

### Whitelist Management
Add trusted accounts to bypass all filtering:
```
verified_news,breaking_news,official_account,trusted_friend
```

### Keyword Strategy
- **Broad terms**: Catch variations (`crypto` catches `cryptocurrency`)
- **Specific phrases**: Target exact matches (`100% guaranteed`)
- **Handle patterns**: Include common spam patterns (`_official`, `real_`)
- **Emoji combinations**: Use flag combinations (`🇺🇸🇮🇱`, `🇮🇱🇺🇸`) and single flags (`🇺🇸`, `🇮🇱`)
- **Symbol filtering**: Target crypto/bot indicators (`🤖`, `💰`, `🚀`)

### Auto-Block Safety
- Auto-block only triggers on new accounts you encounter
- Existing follows/followers are never auto-blocked
- Whitelist overrides auto-block rules

## 🐛 Troubleshooting

### Common Issues

**Script not loading:**
- Ensure Tampermonkey is enabled
- Check that the script matches `*.twitter.com/*` and `*.x.com/*`
- Refresh the page after installation

**Settings not saving:**
- Verify Tampermonkey has storage permissions
- Try disabling other Twitter userscripts temporarily
- Check browser console for errors

**Filter not working:**
- Enable Debug Mode to see filtering activity
- Check if accounts are whitelisted or mutuals
- Verify banned words are properly formatted (comma-separated)

**Block tools failing:**
- Ensure you're logged into Twitter
- Check rate limiting (wait a few minutes)
- Verify CSRF tokens are valid (refresh page)

### Debug Information
Enable Debug Mode in settings to see:
- Filtering decisions and reasons
- API call successes/failures
- Button injection status
- Auto-block activities

## ⚠️ Important Notes

### Rate Limiting
- Block/mute operations are rate-limited to avoid API restrictions
- Large lists may take several minutes to process
- If operations fail, wait 15-30 minutes before retrying

### Privacy & Safety
- All processing happens locally in your browser
- No data is sent to external servers
- Auto-block operates conservatively to avoid false positives
- Always review auto-block words carefully

### Twitter Changes
- Twitter frequently updates their interface and API
- Some features may temporarily break after Twitter updates
- The script is designed to fail gracefully and log errors

## 🔄 Updates

The script automatically adapts to many Twitter changes, but major updates may require manual updates to the userscript code.

## 📝 License

This project is provided as-is for personal use. Use responsibly and in accordance with Twitter's Terms of Service.

## 🤝 Contributing

Found a bug or have a feature request? Please:
1. Enable Debug Mode
2. Check browser console for errors
3. Report issues with specific error messages
4. Include your browser and Tampermonkey versions

## ⭐ Credits

This tool combines and enhances functionality from multiple existing Twitter userscripts:
- Twitter Ratio & Keyword Filter
- Twitter Always Show Not Interested  
- Twitter Block With Love

---

**Made with ❤️ for a better Twitter experience**
