# Changelog

All notable project changes are documented here.

## Post-release updates (February 2026)

- Added pie progress icons for below-peak states in dropdown metrics
- Added pace-based icon coloring (green/yellow/red) tied to period progress
- Live row now shows `Peak / Today Peak / Latest` values
- Added `today-live-peak` tracking and reset support in settings/clear action
- Improved realtime live query handling with `metricAggregations: TOTAL` and row fallback
- Added donation links in extension metadata (`github`, `paypal`)
- Refactored shared logic into `lib/constants.js` and `lib/dateUtils.js`

## Version 1.0.0 (January 2026)

Initial version.

### Core Features

- Panel indicator with live visitor count display
- Dropdown menu with daily/weekly/monthly `Peak / Current` stats
- Peak detection and celebration notifications
- Configurable refresh intervals (30m to 24h)
- Panel display modes (Live/Daily/Weekly/Monthly/Nothing)
- Force refresh action
- Clear peaks with confirmation
- GTK4 preferences UI

### Google Analytics Integration

- Service Account authentication (OAuth 2.0 JWT)
- RSA-SHA256 signing using OpenSSL
- Google Analytics Data API v1beta fetching
- Token caching and automatic refresh
- Connection test with validation and error handling
