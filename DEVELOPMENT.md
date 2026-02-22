# GASP Development Documentation

## Current Status (Version 1.0.0)

### ✅ Completed Features

**Core Infrastructure:**
- [x] Project structure and configuration
- [x] Metadata with proper description
- [x] GSettings schema with all required fields
- [x] Complete documentation

**All Components Implemented:**
1. **PanelIndicator** (lib/panelIndicator.js) - Panel icon, stats display, dropdown menu with force refresh
2. **GAClient** (lib/gaAPI.js) - Google Analytics Data API v1beta integration with OAuth 2.0 JWT
3. **NotificationManager** (lib/notificationManager.js) - Celebration notifications with smart time formatting
4. **DataScheduler** (lib/dataScheduler.js) - Periodic data refresh, peak detection, and period rollover tracking
5. **CredentialStore** (lib/credentialStore.js) - Secure credential management (GSettings/Keyring)
6. **DependencyChecker** (lib/dependencyChecker.js) - System dependency validation
7. **Main Extension** (extension.js) - Component orchestration and lifecycle management
8. **Preferences UI** (prefs.js) - GTK4/Adwaita settings interface with test connection

**Additional Modules:**
- **Logger** (lib/logger.js) - Debug logging utilities
- **RefreshInterval** (lib/refreshInterval.js) - Interval conversion helpers
- **Constants** (lib/constants.js) - Shared settings keys and period constants
- **DateUtils** (lib/dateUtils.js) - Shared period/date helpers

**Google Analytics API Integration:**
- ✅ Service Account authentication with OAuth 2.0 JWT
- ✅ RSA-SHA256 signing using OpenSSL
- ✅ Token caching and automatic refresh
- ✅ Parallel data fetching (daily/weekly/monthly)
- ✅ Error handling with fallback to last known values when possible
- ✅ Test connection button with validation
- ✅ Confirmation dialog before clearing stats

### 🔜 Future Enhancements

- [ ] Pure JavaScript RSA (eliminate OpenSSL dependency)
- [ ] Property listing from Admin API
- [ ] Multiple project support
- [ ] Additional GA4 metrics (pageviews, sessions, etc.)
- [ ] Custom date ranges
- [ ] Export/import statistics
- [ ] Visual indicator for real vs zero data

## Architecture

### Component Structure

```
┌─────────────────┐
│   Extension     │  Main orchestrator
│   (extension.js)│  - Initializes all components
└────────┬────────┘  - Handles settings changes
         │           - Lifecycle management
         │
         ├──► PanelIndicator ──► UI in top panel
         │
        ├──► DataScheduler ──► Periodic refresh
        │         │
        │         └──► GAClient ──► Google Analytics API
        │                   │
        │                   └──► OAuth 2.0 JWT auth
        │
        └──► NotificationManager ──► GNOME notifications
```

### Data Flow

1. **Scheduler** triggers refresh at configured interval
2. **GAClient** authenticates and fetches data from Google Analytics
3. **DataScheduler** detects period rollover and updates stored peaks
4. **NotificationManager** sends celebration notifications for new records
5. **PanelIndicator** updates display with latest stats

**Record seeding:** If a peak is 0, fetch the previous day/week/month once and set it.
**Live peak tracking:** Scheduler keeps `today-live-peak` and resets it on daily rollover.
**Daily behavior:** Daily values follow the GA report directly and can decrease (including to 0).

## Google Analytics API Implementation

### Authentication Flow

1. **Load Credentials**: Read service account JSON from GSettings
2. **Create JWT**:
   - Header: `{ alg: "RS256", typ: "JWT" }`
   - Claims: issuer, scope, audience, expiry, issued-at
   - Signature: RSA-SHA256 with private key (via OpenSSL)
3. **Exchange JWT**: POST to `https://oauth2.googleapis.com/token`
4. **Cache Token**: Store access token with expiry timestamp
5. **API Requests**: Use Bearer token in Authorization header

### API Endpoints

**OAuth 2.0 Token:**
```
POST https://oauth2.googleapis.com/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion={JWT}
```

**Analytics Data:**
```
POST https://analyticsdata.googleapis.com/v1beta/properties/{propertyId}:runReport
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "dateRanges": [{ "startDate": "today", "endDate": "today" }],
  "metrics": [{ "name": "activeUsers" }]
}
```

**Realtime Data (Live):**
```
POST https://analyticsdata.googleapis.com/v1beta/properties/{propertyId}:runRealtimeReport
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "metrics": [{ "name": "activeUsers" }],
  "metricAggregations": ["TOTAL"],
  "minuteRanges": [{ "startMinutesAgo": 29, "endMinutesAgo": 0 }]
}
```
**Note:** Live data window is the refresh interval or 30 minutes, whichever is smaller.
If totals are missing in a response, the client falls back to the max row value.

### Date Ranges
- **Daily**: `today` to `today`
- **Weekly**: `week start` to `today` (calendar week)
- **Monthly**: `month start` to `today` (calendar month)
- **Live**: Realtime API window (up to last 30 minutes)

### Error Handling

Error handling:
1. **Invalid Credentials**: Validates JSON format and required fields
2. **Network Errors**: Catches and logs HTTP errors
3. **API Errors**: Parses Google API error messages
4. **Token Expiry**: Automatically refreshes expired tokens
5. **Fallback Mode**: Keeps last known values when possible; zeros when not configured
6. **Dependencies Missing**: Skips data fetch when OpenSSL is unavailable

## File Structure

```
gasp@gudlenieks.lv/
├── extension.js              - Main extension
├── prefs.js                  - Preferences UI
├── lib/
│   ├── logger.js            - Logging utility
│   ├── panelIndicator.js    - Panel UI
│   ├── gaAPI.js             - GA API client with OAuth
│   ├── notificationManager.js - Notifications
│   ├── dataScheduler.js     - Periodic refresh
│   ├── constants.js         - Shared keys/constants
│   ├── dateUtils.js         - Shared date helpers
│   ├── credentialStore.js   - Credential management
│   ├── dependencyChecker.js - Dependency validation
│   └── refreshInterval.js   - Interval utilities
├── schemas/
│   └── org.gnome.shell.extensions.gasp.gschema.xml
├── metadata.json
├── icons/
├── stylesheet.css
├── README.md
├── GOOGLE_ANALYTICS_SETUP.md
├── DEVELOPMENT.md (this file)
└── LICENSE

```

## Dependencies

### System Requirements
- **GNOME Shell**: 45, 46, 47, 48, 49
- **OpenSSL**: Required for RSA signing (usually pre-installed)
- **libsoup3**: HTTP client (provided by GNOME Shell)
- **Dependency Check**: Preferences UI can recheck availability (Settings → Dependencies)
- **Keyring (optional)**: Used if credential storage is set to Keyring

### JavaScript Modules
- `gi://Soup` - HTTP requests
- `gi://GLib` - Base64 encoding, file operations
- `gi://Gio` - File system operations
- `gi://St` - Shell Toolkit (UI)
- `gi://Clutter` - Graphics

## Development Workflow

### Testing the Extension

**View logs in real-time:**
```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep gasp
```

**Enable debug mode (verbose logging):**
```bash
G_MESSAGES_DEBUG=gasp gnome-shell --replace
```

**Check extension status:**
```bash
gnome-extensions info gasp@gudlenieks.lv
```

**View stored settings:**
```bash
gsettings list-recursively org.gnome.shell.extensions.gasp
```

### Making Changes

1. **Edit code** in extension directory
2. **Restart GNOME Shell**:
   - X11: `Alt+F2` → type `r` → Enter
   - Wayland: Log out and back in
3. **Check logs** for errors
4. **Test features** in preferences and panel

### Compiling Schema (after schema changes)

```bash
cd ~/.local/share/gnome-shell/extensions/gasp@gudlenieks.lv/schemas
glib-compile-schemas .
```

## Security Considerations

### Private Key Security
- Private keys stored in GSettings (user's home directory)
- Keys are never written to disk during signing operations
- In-memory signing via stdin keeps private key in memory only

### RSA Signing Implementation

**Current approach (Hybrid In-Memory):**
- **Private key**: Passed to OpenSSL via stdin ✓ (never touches disk)
- **Data to sign**: Written to temp file `/tmp/gasp_data_*` (non-sensitive JWT headers)

**Why this approach:**
1. **Security**: The private key (the actual secret) never touches disk
2. **Data sensitivity**: JWT data contains only public metadata (timestamps, email, OAuth scopes)
3. **Technical limitations**: OpenSSL's stdin can only accept one input (key OR data, not both)
4. **Stability**: This approach is reliable and uses well-tested APIs

**What data is being signed:**
- JWT header: `{ alg: "RS256", typ: "JWT" }`
- JWT claims: client email, scope, audience, expiration, issued-at timestamp
- Combined as: `base64url(header).base64url(claims)`
- This data is public and sent over HTTPS anyway

**Why not fully in-memory:**
- `GLibUnix.open_pipe()` has buggy/incomplete GJS bindings
- OpenSSL cannot read both key and data from stdin simultaneously
- Alternative approaches (memfd, multiple pipes) require FFI or complex fd management
- The security benefit would be minimal since JWT data contains no secrets

**Future alternatives:**
- Pure JavaScript RSA library (e.g., node-forge, WebCrypto polyfill) would eliminate OpenSSL dependency and temp files entirely

### Recommendations
1. **File Permissions**: Ensure GSettings are not world-readable
2. **Service Account**: Use dedicated service account with minimal permissions
3. **Property Access**: Grant only "Viewer" role to service account
4. **Key Rotation**: Periodically rotate service account keys
5. **Temp Files**: System automatically cleans up temp files; extension also handles cleanup on init

## Known Limitations

1. **OpenSSL Dependency**: RSA signing requires external `openssl` command
2. **Property Listing**: Admin API not implemented (requires additional OAuth scopes)
3. **GA4 Only**: Works only with Google Analytics 4, not Universal Analytics
4. **Single Property**: Can only track one GA4 property at a time
5. **No OAuth Flow**: User interactive OAuth not supported (would require browser)

## Changelog

### Version 1.0.0 (February 2026 updates)

- Added pie progress icons and pace-based icon coloring in `PanelIndicator`
- Added live triple-value menu format: `Peak / Today Peak / Latest`
- Added `today-live-peak` schema key and rollover/reset handling
- Improved realtime query handling with totals aggregation and fallback parsing
- Added metadata donation links (`github`, `paypal`)
- Refactored shared logic into `lib/constants.js` and `lib/dateUtils.js`

### Version 1.0.0 (January 2026)

**Initial Release:**
- Full Google Analytics Data API v1beta integration
- Service Account authentication (OAuth 2.0 JWT)
- Panel indicator with stats display
- Peak tracking and notifications
- Persistent GSettings storage
- Configurable refresh intervals (30m, 1h, 2h, 4h, 8h, 12h, 24h)
- GTK4 preferences UI
- Test connection functionality
- Comprehensive documentation

## Contributing

When contributing, please:
1. Follow existing code style
2. Test on GNOME Shell 45+
3. Update documentation for new features
4. Add error handling for edge cases
5. Keep component responsibilities clear

## Support

For issues or questions:
- Check logs: `journalctl -f | grep gasp`
- Review `GOOGLE_ANALYTICS_SETUP.md` for setup help
- Verify OpenSSL is installed: `which openssl`
- Test connection using preferences button
