import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {getRefreshIntervalMinutes} from './refreshInterval.js';
import {getDependencyStatus} from './dependencyChecker.js';
import {loadCredentials} from './credentialStore.js';
import {getPeriodStart, isDateInCurrentPeriod} from './dateUtils.js';
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
                this._logger.debug('API not configured yet, showing no data');
                // Mark as not connected
                this._settings.set_boolean(SETTINGS_KEYS.API_CONNECTED, false);
                // Reset to 0 to show "-" in UI
                this._settings.set_int(SETTINGS_KEYS.CURRENT_LIVE, 0);
                this._settings.set_int(SETTINGS_KEYS.CURRENT_DAILY, 0);
                this._settings.set_int(SETTINGS_KEYS.CURRENT_WEEKLY, 0);
                this._settings.set_int(SETTINGS_KEYS.CURRENT_MONTHLY, 0);
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
                const { live, daily, weekly, monthly, fallback, seed } = data;
                const now = new Date();
                const previousDaily = this._settings.get_int(SETTINGS_KEYS.CURRENT_DAILY);
                const previousWeekly = this._settings.get_int(SETTINGS_KEYS.CURRENT_WEEKLY);
                const previousMonthly = this._settings.get_int(SETTINGS_KEYS.CURRENT_MONTHLY);
                
                // Mark as successfully connected
                this._settings.set_boolean(SETTINGS_KEYS.API_CONNECTED, true);

                const dailyRollover = this._handlePeriodRollover('daily', now, previousDaily);
                const weeklyRollover = this._handlePeriodRollover('weekly', now, previousWeekly);
                const monthlyRollover = this._handlePeriodRollover('monthly', now, previousMonthly);

                const resolvedDaily = this._resolveCurrentValue('daily', daily, previousDaily, dailyRollover);
                const resolvedWeekly = this._resolveCurrentValue('weekly', weekly, previousWeekly, weeklyRollover);
                const resolvedMonthly = this._resolveCurrentValue('monthly', monthly, previousMonthly, monthlyRollover);
                let normalizedDaily = resolvedDaily;

                if (live > normalizedDaily) {
                    this._logger.warn(
                        `Daily value (${resolvedDaily}) is below live value (${live}); clamping daily to live`
                    );
                    normalizedDaily = live;
                }

                this._updateTodayLivePeak(live, dailyRollover);
                
                // Update current stats
                this._settings.set_int(SETTINGS_KEYS.CURRENT_LIVE, live);
                this._settings.set_int(SETTINGS_KEYS.CURRENT_DAILY, normalizedDaily);
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
                this._updatePeriodRecordAndNotify('daily', normalizedDaily, now);
                this._updatePeriodRecordAndNotify('weekly', resolvedWeekly, now);
                this._updatePeriodRecordAndNotify('monthly', resolvedMonthly, now);

                const previousPeriodEnd = new Date(getPeriodStart(now, 'daily').getTime() - 1);
                if (fallback?.daily && this._settings.get_int(SETTINGS_KEYS.RECORD_DAILY) === 0 && normalizedDaily > 0) {
                    this._settings.set_int(SETTINGS_KEYS.RECORD_DAILY, normalizedDaily);
                    this._settings.set_string(SETTINGS_KEYS.LAST_RECORD_DAILY, previousPeriodEnd.toISOString());
                }
                if (seed?.daily !== null && this._settings.get_int(SETTINGS_KEYS.RECORD_DAILY) === 0 && seed.daily > 0) {
                    this._settings.set_int(SETTINGS_KEYS.RECORD_DAILY, seed.daily);
                    this._settings.set_string(SETTINGS_KEYS.LAST_RECORD_DAILY, previousPeriodEnd.toISOString());
                    this._logger.info(`Seeded daily record from previous day: ${seed.daily}`);
                }
                const previousWeekEnd = new Date(getPeriodStart(now, 'weekly').getTime() - 1);
                if (fallback?.weekly && this._settings.get_int(SETTINGS_KEYS.RECORD_WEEKLY) === 0 && resolvedWeekly > 0) {
                    this._settings.set_int(SETTINGS_KEYS.RECORD_WEEKLY, resolvedWeekly);
                    this._settings.set_string(SETTINGS_KEYS.LAST_RECORD_WEEKLY, previousWeekEnd.toISOString());
                }
                if (seed?.weekly !== null && this._settings.get_int(SETTINGS_KEYS.RECORD_WEEKLY) === 0 && seed.weekly > 0) {
                    this._settings.set_int(SETTINGS_KEYS.RECORD_WEEKLY, seed.weekly);
                    this._settings.set_string(SETTINGS_KEYS.LAST_RECORD_WEEKLY, previousWeekEnd.toISOString());
                    this._logger.info(`Seeded weekly record from previous week: ${seed.weekly}`);
                }
                const previousMonthEnd = new Date(getPeriodStart(now, 'monthly').getTime() - 1);
                if (fallback?.monthly && this._settings.get_int(SETTINGS_KEYS.RECORD_MONTHLY) === 0 && resolvedMonthly > 0) {
                    this._settings.set_int(SETTINGS_KEYS.RECORD_MONTHLY, resolvedMonthly);
                    this._settings.set_string(SETTINGS_KEYS.LAST_RECORD_MONTHLY, previousMonthEnd.toISOString());
                }
                if (seed?.monthly !== null && this._settings.get_int(SETTINGS_KEYS.RECORD_MONTHLY) === 0 && seed.monthly > 0) {
                    this._settings.set_int(SETTINGS_KEYS.RECORD_MONTHLY, seed.monthly);
                    this._settings.set_string(SETTINGS_KEYS.LAST_RECORD_MONTHLY, previousMonthEnd.toISOString());
                    this._logger.info(`Seeded monthly record from previous month: ${seed.monthly}`);
                }
                
                // Update last refresh time
                this._settings.set_string(SETTINGS_KEYS.LAST_UPDATE, new Date().toISOString());
                
                this._logger.info(`Data refreshed successfully: L=${live} D=${normalizedDaily} W=${resolvedWeekly} M=${resolvedMonthly}`);
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

    _updatePeriodRecordAndNotify(period, currentValue, now) {
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
        const recordInCurrentPeriod = isDateInCurrentPeriod(previousRecordDate, period, now);
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

    _handlePeriodRollover(period, now, previousCurrent) {
        const periodStart = getPeriodStart(now, period);
        const key = `last-period-${period}`;
        const storedStart = this._getStoredPeriodStart(key);

        if (!storedStart) {
            this._settings.set_string(key, periodStart.toISOString());
            return false;
        }

        if (storedStart.getTime() === periodStart.getTime()) {
            return false;
        }

        const recordKey = `record-${period}`;
        const previousRecord = this._settings.get_int(recordKey);

        if (previousCurrent > previousRecord) {
            this._settings.set_int(recordKey, previousCurrent);
            const previousPeriodEnd = new Date(periodStart.getTime() - 1);
            this._settings.set_string(`last-record-${period}`, previousPeriodEnd.toISOString());
        }

        this._settings.set_string(key, periodStart.toISOString());
        return true;
    }

    _resolveCurrentValue(period, fetchedValue, previousCurrent, rolledOver) {
        if (fetchedValue > 0) {
            return fetchedValue;
        }

        if (rolledOver && previousCurrent > 0) {
            this._logger.debug(
                `No ${period} data for new period, keeping previous period value (${previousCurrent})`
            );
            return previousCurrent;
        }

        return fetchedValue;
    }

    _getStoredPeriodStart(key) {
        const value = this._settings.get_string(key);
        if (!value) {
            return null;
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return null;
        }

        return date;
    }
}
