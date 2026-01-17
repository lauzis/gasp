export class RecordTracker {
    constructor(settings, statsDB, notificationManager, logger) {
        this._settings = settings;
        this._statsDB = statsDB;
        this._notificationManager = notificationManager;
        this._logger = logger;
    }

    checkAndNotifyRecords(daily, weekly, monthly) {
        const projectId = this._settings.get_string('ga-property-id') || 'default';
        
        // Save stats and check for records
        const result = this._statsDB.saveStats(daily, weekly, monthly, projectId);
        
        // Send notifications for new records
        if (result.isDailyRecord && result.previousDaily) {
            this._notificationManager.notifyNewRecord(
                'daily',
                daily,
                result.previousDaily.count,
                result.previousDaily.date
            );
        }
        
        if (result.isWeeklyRecord && result.previousWeekly) {
            this._notificationManager.notifyNewRecord(
                'weekly',
                weekly,
                result.previousWeekly.count,
                result.previousWeekly.date
            );
        }
        
        if (result.isMonthlyRecord && result.previousMonthly) {
            this._notificationManager.notifyNewRecord(
                'monthly',
                monthly,
                result.previousMonthly.count,
                result.previousMonthly.date
            );
        }
        
        return result;
    }

    destroy() {
        // Cleanup if needed
    }
}
