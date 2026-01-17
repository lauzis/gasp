# GASP - Google Analytics Stats Peak

📊 Congratulate yourself on reaching new peaks!

A GNOME Shell extension that displays Google Analytics visitor statistics in your panel and notifies you when you break peaks. Track daily, weekly, and monthly visitor counts at a glance.

![GASP Icon](icon.png)

## Features

### Panel Display
- **📊 Chart Icon** in the top panel
- **Real-time Stats** - Shows current visitor count next to icon
- **Flexible Display** - Choose to show Daily, Weekly, Monthly, or no stats in panel
- **Click to View** - Dropdown menu with detailed statistics

### Statistics Tracking
- **Daily Visitors** - Track today's visitor count vs. all-time peak
- **Weekly Visitors** - Track this week's count vs. peak
- **Monthly Visitors** - Track this month's count vs. peak
- **Historical Peaks** - JSON database stores all peaks with timestamps
- **Multiple Projects** - Support for tracking different Google Analytics properties (ready)

### Notifications
- **🎉 Peak Alerts** - Get notified when you break a peak
- **Smart Messages** - Shows how long ago the previous peak was set
- **Random Celebration** - Alternates between 🎉 and 🥳 emojis

### Settings
- **Google Analytics API** - Configure credentials and connect to GA
- **Project Selection** - Choose which GA property to track
- **Auto-refresh** - Set update interval (1h, 2h, 4h, 8h, 12h, 24h)
- **Panel Display Options** - Choose what stats to display
- **Clear Peaks** - Reset peak history when needed
- **Force Refresh** - Manually trigger data update

## Installation

The extension is already installed in:
```
~/.local/share/gnome-shell/extensions/gasp@gudlenieks.lv/
```

**To enable:**

1. **Compile the settings schema (if not done):**
   ```bash
   cd ~/.local/share/gnome-shell/extensions/gasp@gudlenieks.lv/schemas
   glib-compile-schemas .
   ```

2. **Restart GNOME Shell (if needed):**
   - **X11**: Press `Alt+F2`, type `r`, press Enter
   - **Wayland**: Log out and log back in

3. **Enable the extension:**
   ```bash
   gnome-extensions enable gasp@gudlenieks.lv
   ```
   
   Or use the Extensions app to toggle it on.

## Setup

### First Run (Not Configured)

On first enable without credentials:
- 📊 icon appears in your panel
- Stats show zeros (no data yet)
- Menu displays "⚙️ Not configured"
- Click Settings to configure

### Configuring Google Analytics

1. **Set up Google Analytics API:**
   - Follow the complete guide: [GOOGLE_ANALYTICS_SETUP.md](GOOGLE_ANALYTICS_SETUP.md)
   - Create a Service Account in Google Cloud Console
   - Download the JSON credentials file
   - Grant the service account "Viewer" access to your GA4 property

2. **Configure the Extension:**
   - Click the 📊 icon in the panel → Settings
   - Paste your Service Account JSON in the credentials field
   - Enter your GA4 Property ID (numbers only)
   - Click "Test" to verify the connection
   - ✅ Green checkmark = Success!

3. **Choose Display Options:**
   - Select what to show in panel (Daily/Weekly/Monthly/Nothing)
   - Set your preferred refresh interval (1h to 24h)
   - Click "Force Refresh" to get initial data

4. **Track Your Stats:**
   - Stats will automatically refresh at your chosen interval
   - Click panel icon to view detailed statistics
   - Get notified when you break peaks! 🎉

**Note:** The extension requires valid Google Analytics credentials. Without them, it will show zeros. See [GOOGLE_ANALYTICS_SETUP.md](GOOGLE_ANALYTICS_SETUP.md) for detailed setup instructions.

## How It Works

1. **Authentication**: Extension uses OAuth 2.0 JWT with Service Account credentials
2. **Data Collection**: Fetches real visitor data from Google Analytics Data API v1
3. **Peak Storage**: Stats saved to JSON database with timestamps (`~/.local/share/gasp/stats.json`)
4. **Comparison**: Current stats compared against historical peaks
5. **Notifications**: When a new peak is detected, you get a celebration notification (🎉/🥳)
6. **Display**: Panel shows your chosen metric (daily/weekly/monthly) with current count

### Dropdown Menu Format

Each line shows: `[emoji] Period: Peak / Current`

- **🏆 Trophy**: Current value equals or exceeds peak
- **📈 Chart**: Current value is below peak
- **Example**: `🏆 Daily: 150 / 150` (at peak!)
- **Example**: `📈 Weekly: 950 / 847` (below peak)

## Database Schema

The extension stores data in a local JSON file (`~/.local/share/gasp/stats.json`):

**Structure:**
```json
{
  "records": [
    {
      "timestamp": "2026-01-15T19:00:00.000Z",
      "daily_count": 125,
      "weekly_count": 847,
      "monthly_count": 3421,
      "project_id": "default",
      "is_daily_record": false,
      "is_weekly_record": true,
      "is_monthly_record": false
    }
  ],
  "metadata": {
    "created": "2026-01-15T18:00:00.000Z",
    "version": 1
  }
}
```

**Fields:**
- **timestamp** - When the data was recorded
- **daily_count** - Visitors for that day
- **weekly_count** - Visitors for that week  
- **monthly_count** - Visitors for that month
- **project_id** - Which GA property the data is from
- **is_daily_record** - Whether this was a daily peak
- **is_weekly_record** - Whether this was a weekly peak
- **is_monthly_record** - Whether this was a monthly peak

The database automatically keeps the most recent 1000 records to prevent bloat.

## Technical Details

### Architecture

- **Extension Type**: GNOME Shell Panel Extension
- **Language**: JavaScript (GJS)
- **Code Organization**: Modular architecture with `lib/` directory
- **Dependencies**: 
  - GNOME Shell 45+
  - GTK4 (Adwaita) for preferences
  - GSettings (for configuration storage)
  - GJS (GNOME JavaScript bindings)
  - libsoup3 (for Google Analytics API calls)
  - OpenSSL (for RSA signing of JWT tokens)

### Modules

- `extension.js` - Main extension class, orchestrates all components
- `lib/logger.js` - Logging utilities with debug mode support
- `lib/panelIndicator.js` - Panel UI and dropdown menu
- `lib/gaAPI.js` - Google Analytics API client with OAuth 2.0 JWT
- `lib/statsDB.js` - JSON database manager for statistics
- `lib/recordTracker.js` - Peak comparison and detection logic
- `lib/notificationManager.js` - Celebration notifications with throttling
- `lib/dataScheduler.js` - Periodic data refresh scheduler

**Total:** ~1,500+ lines of JavaScript code across 8 modules.

For detailed technical information, see [DEVELOPMENT.md](DEVELOPMENT.md).

## Development

### Testing the Extension

View logs in real-time:
```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep gasp
```

Enable debug mode (verbose logging):
```bash
G_MESSAGES_DEBUG=gasp gnome-shell --replace
```

### Debugging

Check extension status:
```bash
gnome-extensions info gasp@gudlenieks.lv
```

View stored settings:
```bash
gsettings list-recursively org.gnome.shell.extensions.gasp
```

Check database file:
```bash
cat ~/.local/share/gasp/stats.json | jq .
```

Force refresh from command line:
```bash
# Change any setting to trigger a refresh
gsettings set org.gnome.shell.extensions.gasp refresh-interval 1
```

## Privacy

- All data is stored locally on your machine
- No data is sent to third parties (only Google Analytics API for fetching your own data)
- API credentials are stored securely in GSettings
- You control what data is tracked and displayed

## Compatibility

- **GNOME Shell**: 45, 46, 47, 48, 49
- **Platform**: Linux (GNOME Desktop)
- **Tested on**: Ubuntu 24.04+, Fedora 40+ (theoretical - ready for testing)

## Current Status

**Version 1.0.0** - Fully functional with Google Analytics!

✅ **Working Features:**
- Panel indicator with stats display
- Real Google Analytics data via OAuth 2.0 JWT
- Peak tracking and notifications  
- Persistent storage
- Service Account authentication
- Test connection button
- All settings options
- Force refresh
- Clear peaks (with confirmation)

📚 **Documentation:**
- [GOOGLE_ANALYTICS_SETUP.md](GOOGLE_ANALYTICS_SETUP.md) - Setup guide
- [DEVELOPMENT.md](DEVELOPMENT.md) - Technical documentation

## Changelog

### Version 1.0.0 (January 2026)

**Initial Release:**

✅ **Core Features:**
- Panel indicator with 📊 icon and visitor count display
- Dropdown menu showing Daily/Weekly/Monthly stats (Peak / Current)
- Trophy 🏆 and chart 📈 emoji indicators
- Peak detection and tracking
- Celebration notifications (🎉/🥳) with smart time formatting
- JSON database for historical data storage
- Configurable refresh intervals (1h, 2h, 4h, 8h, 12h, 24h)
- Panel display options (Daily/Weekly/Monthly/Nothing)
- Force refresh capability
- Clear peaks with confirmation dialog
- Complete GTK4 preferences UI

✅ **Google Analytics Integration:**
- Service Account authentication (OAuth 2.0 JWT)
- RSA-SHA256 signing using OpenSSL
- Real-time data from Google Analytics Data API v1
- Token caching and automatic refresh
- Parallel data fetching for better performance
- Test connection button with validation
- Comprehensive error handling
- Falls back to zeros when not configured

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Author

Aivars Lauzis

---

**Version**: 1.0.0  
**Last Updated**: January 2026
