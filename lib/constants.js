export const SETTINGS_KEYS = {
    // API Configuration
    GA_PROPERTY_ID: 'ga-property-id',
    GA_API_KEY: 'ga-api-key',
    GA_CLIENT_EMAIL: 'ga-client-email',
    GA_PRIVATE_KEY: 'ga-private-key',
    ANALYTICS_TIMEZONE: 'analytics-timezone',

    // Credential Storage
    CREDENTIAL_STORAGE: 'credential-storage',

    // Current Stats
    CURRENT_LIVE: 'current-live',
    TODAY_LIVE_PEAK: 'today-live-peak',
    CURRENT_DAILY: 'current-daily',
    CURRENT_WEEKLY: 'current-weekly',
    CURRENT_MONTHLY: 'current-monthly',

    // Records (Peaks)
    RECORD_LIVE: 'record-live',
    RECORD_DAILY: 'record-daily',
    RECORD_WEEKLY: 'record-weekly',
    RECORD_MONTHLY: 'record-monthly',

    // Last Record Dates
    LAST_RECORD_LIVE: 'last-record-live',
    LAST_RECORD_DAILY: 'last-record-daily',
    LAST_RECORD_WEEKLY: 'last-record-weekly',
    LAST_RECORD_MONTHLY: 'last-record-monthly',

    // Last Notified Values
    LAST_NOTIFIED_LIVE: 'last-notified-live',
    LAST_NOTIFIED_DAILY: 'last-notified-daily',
    LAST_NOTIFIED_WEEKLY: 'last-notified-weekly',
    LAST_NOTIFIED_MONTHLY: 'last-notified-monthly',

    // Period Tracking
    LAST_PERIOD_DAILY: 'last-period-daily',
    LAST_PERIOD_WEEKLY: 'last-period-weekly',
    LAST_PERIOD_MONTHLY: 'last-period-monthly',

    // Other Settings
    REFRESH_INTERVAL: 'refresh-interval',
    PANEL_DISPLAY: 'panel-display',
    ICON_SIZE: 'icon-size',
    LAST_UPDATE: 'last-update',
    API_CONNECTED: 'api-connected',
    TMP_SIGN_DATA_PATH: 'tmp-sign-data-path',
    DB_PATH: 'db-path',
};

export const PERIODS = ['daily', 'weekly', 'monthly'];
export const PERIODS_WITH_LIVE = ['live', 'daily', 'weekly', 'monthly'];
