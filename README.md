# GASP - Google Analytics Stats Peak

📊 Congratulate yourself on reaching new peaks!

A GNOME Shell extension that displays Google Analytics visitor statistics in your panel and notifies you when you break peaks. Track daily, weekly, and monthly visitor counts at a glance.

![GASP Screenshot](git-images/gasp.png)

## Features

### Panel Display
- **📊 Chart Icon** in the top panel
- **Live Stats** - Shows current visitor count next to icon
- **Flexible Display** - Choose to show Live, Daily, Weekly, Monthly, or no stats in panel
- **Click to View** - Dropdown menu with detailed statistics

### Statistics Tracking
- **Live Visitors** - Track visitors in the most recent refresh window (up to 30 minutes)
- **Daily Visitors** - Track today's visitor count vs. all-time peak
- **Weekly Visitors** - Track this week's count vs. peak
- **Monthly Visitors** - Track this month's count vs. peak
- **Historical Peaks** - Stored in GSettings from completed periods
- **Record Seeding** - If a peak is 0, use the previous day/week/month once to fill it

### Notifications
- **🎉 Peak Alerts** - Get notified when you break a peak
- **Smart Messages** - Shows how long ago the previous peak was set
- **Random Celebration** - Alternates between 🎉 and 🥳 emojis

### Settings
- **Google Analytics API** - Configure credentials and connect to GA
- **Dependencies** - Verify required system tools (OpenSSL)
- **Auto-refresh** - Set update interval (30m, 1h, 2h, 4h, 8h, 12h, 24h)
- **Panel Display Options** - Choose what stats to display
- **Icon Size** - Adjust the panel/menu icon size
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
   - Or fill **Client Email** and **Private Key** below
   - Enter your GA4 Property ID (numbers only)
   - Click "Test" to verify the connection
   - ✅ Green checkmark = Success!

3. **Choose Display Options:**
   - Select what to show in panel (Live/Daily/Weekly/Monthly/Nothing)
   - Set your preferred refresh interval (30m to 24h)
   - Click "Force Refresh" to get initial data

4. **Track Your Stats:**
   - Stats will automatically refresh at your chosen interval
   - Click panel icon to view detailed statistics
   - Get notified when you break peaks! 🎉

**Note:** The extension requires valid Google Analytics credentials. Without them, it will show zeros. See [GOOGLE_ANALYTICS_SETUP.md](GOOGLE_ANALYTICS_SETUP.md) for detailed setup instructions.

## How It Works

1. **Auth**: Service Account JSON + OAuth 2.0 JWT
2. **Fetch**: Pulls data from Google Analytics Data API v1beta
3. **Store Peaks**: GSettings keeps completed-period peaks
4. **Seed Peaks**: If a peak is 0, use the previous period once
5. **Compare**: Current stats vs stored peaks
6. **Notify**: Show a notification when a new peak happens
7. **Display**: Panel shows the selected metric

**Note:** If OpenSSL is missing, fetch is skipped.

### Dropdown Menu Format

Each line shows: `[emoji] Period: Peak / Current`

- **Trophy icon**: Current value equals or exceeds peak
- **Chart icon**: Current value is below peak
- **Example**: `Live: 12 / 12` (at peak)
- **Example**: `Weekly: 950 / 847` (below peak)

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
- `lib/notificationManager.js` - Celebration notifications with throttling
- `lib/dataScheduler.js` - Periodic data refresh scheduler

For detailed technical information, see [DEVELOPMENT.md](DEVELOPMENT.md).

## Development

Developer notes, troubleshooting, and commands live in [DEVELOPMENT.md](DEVELOPMENT.md).

## Privacy

- All data is stored locally on your machine
- No data is sent to third parties (only Google Analytics API for fetching your own data)
- API credentials are stored locally in GSettings (not encrypted). Only `client_email` and `private_key` are saved.
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
- GSettings-based peak storage for completed periods
- Configurable refresh intervals (30m, 1h, 2h, 4h, 8h, 12h, 24h)
- Panel display options (Live/Daily/Weekly/Monthly/Nothing)
- Force refresh capability
- Clear peaks with confirmation dialog
- Complete GTK4 preferences UI

✅ **Google Analytics Integration:**
- Service Account authentication (OAuth 2.0 JWT)
- RSA-SHA256 signing using OpenSSL
- Real-time data from Google Analytics Data API v1beta
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
