import GLib from 'gi://GLib';

export class DataScheduler {
    constructor(settings, gaClient, recordTracker, panelIndicator, logger) {
        this._settings = settings;
        this._gaClient = gaClient;
        this._recordTracker = recordTracker;
        this._panelIndicator = panelIndicator;
        this._logger = logger;
        
        this._timeoutId = null;
        this._isRefreshing = false;
    }

    start() {
        this.stop();
        
        const intervalHours = this._settings.get_int('refresh-interval');
        const intervalMs = intervalHours * 60 * 60 * 1000; // Convert to milliseconds
        
        this._logger.info(`Starting data scheduler (interval: ${intervalHours}h)`);
        
        // Do initial refresh
        this.forceRefresh();
        
        // Schedule periodic refresh
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, intervalMs, () => {
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        });
    }

    stop() {
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
            this._logger.debug('Scheduler stopped');
        }
    }

    forceRefresh() {
        this._logger.info('Force refresh requested');
        this._refresh();
    }

    async _refresh() {
        if (this._isRefreshing) {
            this._logger.debug('Refresh already in progress, skipping');
            return;
        }
        
        this._isRefreshing = true;
        
        try {
            this._logger.debug('Starting data refresh...');
            
            // Check if API is configured
            const apiKey = this._settings.get_string('ga-api-key');
            const propertyId = this._settings.get_string('ga-property-id');
            
            if (!apiKey || !propertyId) {
                this._logger.debug('API not configured yet, showing no data');
                // Mark as not connected
                this._settings.set_boolean('api-connected', false);
                // Reset to 0 to show "-" in UI
                this._settings.set_int('current-daily', 0);
                this._settings.set_int('current-weekly', 0);
                this._settings.set_int('current-monthly', 0);
                return;
            }
            
            // Fetch data from Google Analytics
            const data = await this._gaClient.fetchStats();
            
            if (data) {
                const { daily, weekly, monthly } = data;
                
                // Mark as successfully connected
                this._settings.set_boolean('api-connected', true);
                
                // Update current stats
                this._settings.set_int('current-daily', daily);
                this._settings.set_int('current-weekly', weekly);
                this._settings.set_int('current-monthly', monthly);
                
                // Check for records and notify
                this._recordTracker.checkAndNotifyRecords(daily, weekly, monthly);
                
                // Update last refresh time
                this._settings.set_string('last-update', new Date().toISOString());
                
                this._logger.info(`Data refreshed successfully: D=${daily} W=${weekly} M=${monthly}`);
            } else {
                // Failed to fetch data
                this._settings.set_boolean('api-connected', false);
            }
        } catch (e) {
            this._logger.error('Error during refresh:', e);
        } finally {
            this._isRefreshing = false;
        }
    }

    destroy() {
        this.stop();
    }
}
