import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export class StatsDB {
    constructor(settings, logger) {
        this._settings = settings;
        this._logger = logger;
        this._db = null;
        this._dbPath = null;
        
        this._initDatabase();
    }

    _initDatabase() {
        // Get or create database path
        let dbPath = this._settings.get_string('db-path');
        if (!dbPath) {
            const dataDir = GLib.get_user_data_dir();
            const extensionDir = GLib.build_filenamev([dataDir, 'gasp']);
            
            // Create directory if it doesn't exist
            const dir = Gio.File.new_for_path(extensionDir);
            if (!dir.query_exists(null)) {
                dir.make_directory_with_parents(null);
            }
            
            dbPath = GLib.build_filenamev([extensionDir, 'stats.db']);
            this._settings.set_string('db-path', dbPath);
        }
        
        this._dbPath = dbPath;
        this._logger.info(`Database path: ${this._dbPath}`);
        
        // Note: GJS doesn't have native SQLite support
        // We'll use a JSON file instead for simplicity
        this._useJsonStorage = true;
        this._jsonPath = this._dbPath.replace('.db', '.json');
        
        this._loadOrCreateJson();
    }

    _loadOrCreateJson() {
        const file = Gio.File.new_for_path(this._jsonPath);
        
        if (file.query_exists(null)) {
            try {
                const [success, contents] = file.load_contents(null);
                if (success) {
                    const decoder = new TextDecoder('utf-8');
                    const text = decoder.decode(contents);
                    this._db = JSON.parse(text);
                    this._logger.debug('Loaded existing database');
                    return;
                }
            } catch (e) {
                this._logger.error('Error loading database:', e);
            }
        }
        
        // Create new database structure
        this._db = {
            records: [],
            metadata: {
                created: new Date().toISOString(),
                version: 1
            }
        };
        this._saveJson();
        this._logger.info('Created new database');
    }

    _saveJson() {
        try {
            const file = Gio.File.new_for_path(this._jsonPath);
            const json = JSON.stringify(this._db, null, 2);
            file.replace_contents(
                json,
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );
        } catch (e) {
            this._logger.error('Error saving database:', e);
        }
    }

    saveStats(daily, weekly, monthly, projectId) {
        const timestamp = new Date().toISOString();
        
        // Get current records
        const records = this.getRecords(projectId);
        
        const isDailyRecord = daily > (records.daily?.count || 0);
        const isWeeklyRecord = weekly > (records.weekly?.count || 0);
        const isMonthlyRecord = monthly > (records.monthly?.count || 0);
        
        const entry = {
            timestamp,
            daily_count: daily,
            weekly_count: weekly,
            monthly_count: monthly,
            project_id: projectId || 'default',
            is_daily_record: isDailyRecord,
            is_weekly_record: isWeeklyRecord,
            is_monthly_record: isMonthlyRecord
        };
        
        this._db.records.push(entry);
        
        // Keep only last 1000 records to prevent database bloat
        if (this._db.records.length > 1000) {
            this._db.records = this._db.records.slice(-1000);
        }
        
        this._saveJson();
        
        // Update cached records in settings
        if (isDailyRecord) {
            this._settings.set_int('record-daily', daily);
        }
        if (isWeeklyRecord) {
            this._settings.set_int('record-weekly', weekly);
        }
        if (isMonthlyRecord) {
            this._settings.set_int('record-monthly', monthly);
        }
        
        this._logger.info(`Saved stats: D=${daily} W=${weekly} M=${monthly} (Records: D=${isDailyRecord} W=${isWeeklyRecord} M=${isMonthlyRecord})`);
        
        return {
            isDailyRecord,
            isWeeklyRecord,
            isMonthlyRecord,
            previousDaily: records.daily,
            previousWeekly: records.weekly,
            previousMonthly: records.monthly
        };
    }

    getRecords(projectId = 'default') {
        const projectRecords = this._db.records.filter(r => r.project_id === projectId);
        
        if (projectRecords.length === 0) {
            return {
                daily: null,
                weekly: null,
                monthly: null
            };
        }
        
        // Find max values
        const dailyRecord = projectRecords.reduce((max, r) => 
            r.daily_count > (max?.daily_count || 0) ? r : max, null);
        const weeklyRecord = projectRecords.reduce((max, r) => 
            r.weekly_count > (max?.weekly_count || 0) ? r : max, null);
        const monthlyRecord = projectRecords.reduce((max, r) => 
            r.monthly_count > (max?.monthly_count || 0) ? r : max, null);
        
        return {
            daily: dailyRecord ? { count: dailyRecord.daily_count, date: dailyRecord.timestamp } : null,
            weekly: weeklyRecord ? { count: weeklyRecord.weekly_count, date: weeklyRecord.timestamp } : null,
            monthly: monthlyRecord ? { count: monthlyRecord.monthly_count, date: monthlyRecord.timestamp } : null
        };
    }

    getLatestStats(projectId = 'default') {
        const projectRecords = this._db.records.filter(r => r.project_id === projectId);
        
        if (projectRecords.length === 0) {
            return null;
        }
        
        return projectRecords[projectRecords.length - 1];
    }

    clearAllRecords() {
        this._db.records = [];
        this._db.metadata.cleared = new Date().toISOString();
        this._saveJson();
        
        // Clear cached records in settings
        this._settings.set_int('record-daily', 0);
        this._settings.set_int('record-weekly', 0);
        this._settings.set_int('record-monthly', 0);
        this._settings.set_int('current-daily', 0);
        this._settings.set_int('current-weekly', 0);
        this._settings.set_int('current-monthly', 0);
        
        this._logger.info('All records cleared');
    }

    destroy() {
        this._db = null;
    }
}
