import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {getRefreshIntervalMinutes} from './refreshInterval.js';
import {getDependencyStatus} from './dependencyChecker.js';
import {loadCredentials} from './credentialStore.js';
import {
    getPeriodKey,
    getPreviousPeriodReferenceDateString,
    isDateInCurrentPeriod,
} from './dateUtils.js';
import {SETTINGS_KEYS} from './constants.js';

export class DataScheduler {
    constructor(settings, gaClient, notificationManager, logger) {
        this._settings = settings;
        this._gaClient = gaClient;
        this._notificationManager = notificationManager;
        this._logger = logger;
        
        this._timeoutId = null;
        this._isRefreshing = false;
        this._networkMonitor = Gio.NetworkMonitor.get_default();
    }

    start() {
        this.stop();
        
        const intervalMinutes = this._getRefreshIntervalMinutes();
        const intervalMs = intervalMinutes * 60 * 1000; // Convert to milliseconds
        
        this._logger.info(`Starting data scheduler (interval: ${intervalMinutes}m)`);
        
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

            this._commitPendingLiveRecord();
            
            // Check if API is configured
            const credentials = loadCredentials(this._settings);
            const propertyId = this._settings.get_string(SETTINGS_KEYS.GA_PROPERTY_ID);
            
            if (!credentials || !propertyId) {
                this._logger.debug('API not configured yet, keeping last known data');
                // Mark as not connected but keep previously fetched values.
                // This allows stats to resume seamlessly when configuration returns.
                this._settings.set_boolean(SETTINGS_KEYS.API_CONNECTED, false);
                return;
            }
            
            // Check network availability
            const networkAvailable = this._networkMonitor.get_network_available();
            if (!networkAvailable) {
                this._logger.info('Network unavailable, keeping last known data');
                this._settings.set_boolean(SETTINGS_KEYS.API_CONNECTED, false);
                return;
            }

            const dependencyStatus = getDependencyStatus();
            if (!dependencyStatus.ok) {
                this._logger.error(`Missing dependency: ${dependencyStatus.message}`);
                this._settings.set_boolean(SETTINGS_KEYS.API_CONNECTED, false);
                return;
            }
            
            // Fetch data from Google Analytics
            const data = await this._gaClient.fetchStats();
            
            if (data && data.success) {
                const { live, daily, weekly, monthly, seed, timeZone } = data;
                if (timeZone) {
                    this._settings.set_string(SETTINGS_KEYS.ANALYTICS_TIMEZONE, timeZone);
                }

                const now = new Date();
                const analyticsTimeZone = this._getAnalyticsTimeZone();
                const previousDaily = this._settings.get_int(SETTINGS_KEYS.CURRENT_DAILY);
                const previousWeekly = this._settings.get_int(SETTINGS_KEYS.CURRENT_WEEKLY);
                const previousMonthly = this._settings.get_int(SETTINGS_KEYS.CURRENT_MONTHLY);
                
                // Mark as successfully connected
                this._settings.set_boolean(SETTINGS_KEYS.API_CONNECTED, true);

                const dailyRollover = this._handlePeriodRollover('daily', now, previousDaily, analyticsTimeZone);
                const weeklyRollover = this._handlePeriodRollover('weekly', now, previousWeekly, analyticsTimeZone);
                const monthlyRollover = this._handlePeriodRollover('monthly', now, previousMonthly, analyticsTimeZone);

                const resolvedDaily = this._resolveCurrentValue('daily', daily, previousDaily, dailyRollover);
                const resolvedWeekly = this._resolveCurrentValue('weekly', weekly, previousWeekly, weeklyRollover);
                const resolvedMonthly = this._resolveCurrentValue('monthly', monthly, previousMonthly, monthlyRollover);

                this._updateTodayLivePeak(live, dailyRollover);
                
                // Update current stats
                this._settings.set_int(SETTINGS_KEYS.CURRENT_LIVE, live);
                this._settings.set_int(SETTINGS_KEYS.CURRENT_DAILY, resolvedDaily);
                this._settings.set_int(SETTINGS_KEYS.CURRENT_WEEKLY, resolvedWeekly);
                this._settings.set_int(SETTINGS_KEYS.CURRENT_MONTHLY, resolvedMonthly);

                if (dailyRollover) {
                    this._settings.set_int(SETTINGS_KEYS.LAST_NOTIFIED_DAILY, 0);
                }
                if (weeklyRollover) {
                    this._settings.set_int(SETTINGS_KEYS.LAST_NOTIFIED_WEEKLY, 0);
                }
                if (monthlyRollover) {
                    this._settings.set_int(SETTINGS_KEYS.LAST_NOTIFIED_MONTHLY, 0);
                }

                this._updateLiveRecord(live);
                this._updatePeriodRecordAndNotify('daily', resolvedDaily, now, analyticsTimeZone);
                this._updatePeriodRecordAndNotify('weekly', resolvedWeekly, now, analyticsTimeZone);
                this._updatePeriodRecordAndNotify('monthly', resolvedMonthly, now, analyticsTimeZone);

                const previousDailyRef = getPreviousPeriodReferenceDateString(now, 'daily', analyticsTimeZone);
                if (seed?.daily !== null && this._settings.get_int(SETTINGS_KEYS.RECORD_DAILY) === 0 && seed.daily > 0) {
                    this._settings.set_int(SETTINGS_KEYS.RECORD_DAILY, seed.daily);
                    this._settings.set_string(SETTINGS_KEYS.LAST_RECORD_DAILY, previousDailyRef);
                    this._logger.info(`Seeded daily record from previous day: ${seed.daily}`);
                }
                const previousWeeklyRef = getPreviousPeriodReferenceDateString(now, 'weekly', analyticsTimeZone);
                if (seed?.weekly !== null && this._settings.get_int(SETTINGS_KEYS.RECORD_WEEKLY) === 0 && seed.weekly > 0) {
                    this._settings.set_int(SETTINGS_KEYS.RECORD_WEEKLY, seed.weekly);
                    this._settings.set_string(SETTINGS_KEYS.LAST_RECORD_WEEKLY, previousWeeklyRef);
                    this._logger.info(`Seeded weekly record from previous week: ${seed.weekly}`);
                }
                const previousMonthlyRef = getPreviousPeriodReferenceDateString(now, 'monthly', analyticsTimeZone);
                if (seed?.monthly !== null && this._settings.get_int(SETTINGS_KEYS.RECORD_MONTHLY) === 0 && seed.monthly > 0) {
                    this._settings.set_int(SETTINGS_KEYS.RECORD_MONTHLY, seed.monthly);
                    this._settings.set_string(SETTINGS_KEYS.LAST_RECORD_MONTHLY, previousMonthlyRef);
                    this._logger.info(`Seeded monthly record from previous month: ${seed.monthly}`);
                }
                
                // Update last refresh time
                this._settings.set_string(SETTINGS_KEYS.LAST_UPDATE, new Date().toISOString());
                
                this._logger.info(`Data refreshed successfully: L=${live} D=${resolvedDaily} W=${resolvedWeekly} M=${resolvedMonthly}`);
            } else {
                // Failed to fetch data, keep last known values
                this._logger.info('Failed to fetch data, keeping last known values');
                this._settings.set_boolean(SETTINGS_KEYS.API_CONNECTED, false);
            }
        } catch (e) {
            this._logger.error('Error during refresh:', e);
            this._settings.set_boolean(SETTINGS_KEYS.API_CONNECTED, false);
        } finally {
            this._isRefreshing = false;
        }
    }

    destroy() {
        this.stop();
    }

    _getRefreshIntervalMinutes() {
        return getRefreshIntervalMinutes(this._settings);
    }

    _updateLiveRecord(currentLive) {
        if (currentLive <= 0) {
            return;
        }

        const recordKey = SETTINGS_KEYS.RECORD_LIVE;
        const lastNotifiedKey = SETTINGS_KEYS.LAST_NOTIFIED_LIVE;
        const lastRecordDateKey = SETTINGS_KEYS.LAST_RECORD_LIVE;

        const previousRecord = this._settings.get_int(recordKey);
        if (currentLive > previousRecord) {
            const previousRecordDate = this._settings.get_string(lastRecordDateKey);
            const lastNotifiedValue = this._settings.get_int(lastNotifiedKey);
            if (currentLive > lastNotifiedValue) {
                if (previousRecord > 0) {
                    this._notificationManager.notifyNewRecord(
                        'live',
                        currentLive,
                        previousRecord,
                        previousRecordDate
                    );
                }
                // Store the record time now; value will be committed on next refresh.
                this._settings.set_string(lastRecordDateKey, new Date().toISOString());
                this._settings.set_int(lastNotifiedKey, currentLive);
            }
        }
    }

    _commitPendingLiveRecord() {
        const recordKey = SETTINGS_KEYS.RECORD_LIVE;
        const lastNotifiedKey = SETTINGS_KEYS.LAST_NOTIFIED_LIVE;

        const previousRecord = this._settings.get_int(recordKey);
        const lastNotifiedValue = this._settings.get_int(lastNotifiedKey);

        if (lastNotifiedValue > previousRecord) {
            this._settings.set_int(recordKey, lastNotifiedValue);
        }
    }

    _updateTodayLivePeak(currentLive, dailyRollover) {
        let todayPeak = this._settings.get_int(SETTINGS_KEYS.TODAY_LIVE_PEAK);

        if (dailyRollover) {
            todayPeak = 0;
        }

        if (currentLive > todayPeak) {
            todayPeak = currentLive;
        }

        this._settings.set_int(SETTINGS_KEYS.TODAY_LIVE_PEAK, todayPeak);
    }

    _updatePeriodRecordAndNotify(period, currentValue, now, timeZone) {
        if (currentValue <= 0) {
            return;
        }

        const recordKey = `record-${period}`;
        const lastNotifiedKey = `last-notified-${period}`;
        const lastRecordDateKey = `last-record-${period}`;

        const previousRecord = this._settings.get_int(recordKey);
        if (currentValue <= previousRecord) {
            return;
        }

        const previousRecordDate = this._settings.get_string(lastRecordDateKey);
        const recordInCurrentPeriod = isDateInCurrentPeriod(previousRecordDate, period, now, timeZone);
        if (recordInCurrentPeriod) {
            return;
        }

        const lastNotifiedValue = this._settings.get_int(lastNotifiedKey);
        if (lastNotifiedValue !== 0) {
            return;
        }

        if (previousRecord > 0) {
            this._notificationManager.notifyNewRecord(
                period,
                currentValue,
                previousRecord,
                previousRecordDate
            );
        }

        this._settings.set_int(lastNotifiedKey, currentValue);
    }

    _getAnalyticsTimeZone() {
        const value = this._settings.get_string(SETTINGS_KEYS.ANALYTICS_TIMEZONE);
        return value || null;
    }

    _handlePeriodRollover(period, now, previousCurrent, timeZone) {
        const currentPeriodKey = getPeriodKey(now, period, timeZone);
        const key = `last-period-${period}`;
        const storedValue = this._settings.get_string(key);
        const storedPeriodKey = this._normalizeStoredPeriodKey(storedValue, period, timeZone);

        if (!storedPeriodKey) {
            this._settings.set_string(key, currentPeriodKey);
            return false;
        }

        if (storedPeriodKey === currentPeriodKey) {
            if (storedValue !== storedPeriodKey) {
                this._settings.set_string(key, storedPeriodKey);
            }
            return false;
        }

        const recordKey = `record-${period}`;
        const previousRecord = this._settings.get_int(recordKey);

        if (previousCurrent > previousRecord) {
            this._settings.set_int(recordKey, previousCurrent);
            this._settings.set_string(`last-record-${period}`, new Date(now.getTime() - 1).toISOString());
        }

        this._settings.set_string(key, currentPeriodKey);
        return true;
    }

    _resolveCurrentValue(period, fetchedValue, previousCurrent, rolledOver) {
        if (fetchedValue > 0) {
            return fetchedValue;
        }

        if (rolledOver && previousCurrent > 0) {
            this._logger.debug(
                `No ${period} data for new period, resetting current value to 0`
            );
            return 0;
        }

        return fetchedValue;
    }

    _normalizeStoredPeriodKey(value, period, timeZone) {
        if (!value) {
            return null;
        }

        const monthPattern = /^\d{4}-\d{2}$/;
        const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

        if (period === 'monthly' && monthPattern.test(value)) {
            return value;
        }

        if ((period === 'daily' || period === 'weekly') && dayPattern.test(value)) {
            return value;
        }

        const parsedDate = new Date(value);
        if (Number.isNaN(parsedDate.getTime())) {
            return null;
        }

        return getPeriodKey(parsedDate, period, timeZone);
    }
}
