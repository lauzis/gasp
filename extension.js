import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {Logger} from './lib/logger.js';
import {addIndicator} from './lib/panelIndicator.js';
import {GAClient} from './lib/gaAPI.js';
import {NotificationManager} from './lib/notificationManager.js';
import {DataScheduler} from './lib/dataScheduler.js';

export default class GASPExtension extends Extension {
    enable() {
        this._logger = new Logger('gasp');
        this._settings = this.getSettings();

        // Initialize components
        this._gaClient = new GAClient(this._settings, this._logger);
        this._notificationManager = new NotificationManager(this._logger);
        
        this._panelIndicator = addIndicator(
            this.metadata.uuid,
            this.metadata.name,
            this._settings,
            () => this.openPreferences(),
            () => this._forceRefresh(),
            this._logger,
            this.path
        );
        
        this._dataScheduler = new DataScheduler(
            this._settings,
            this._gaClient,
            this._notificationManager,
            this._logger
        );

        // Connect to settings changes
        this._connectSignals();
        
        // Start data scheduler
        this._dataScheduler.start();

        this._logger.info('GASP - Google Analytics Stats Peak enabled');
    }

    disable() {
        // Cleanup components in reverse order
        if (this._dataScheduler) {
            this._dataScheduler.destroy();
            this._dataScheduler = null;
        }
        
        if (this._panelIndicator) {
            this._panelIndicator.destroy();
            this._panelIndicator = null;
        }
        
        if (this._notificationManager) {
            this._notificationManager.destroy();
            this._notificationManager = null;
        }
        
        if (this._gaClient) {
            this._gaClient.destroy();
            this._gaClient = null;
        }
        
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        
        this._logger.info('GASP disabled');
        
        this._settings = null;
        this._logger = null;
    }

    _connectSignals() {
        this._settingsChangedId = this._settings.connect('changed::refresh-interval', () => {
            const interval = this._settings.get_int('refresh-interval');
            this._logger.debug(`Refresh interval changed to ${interval}m, restarting scheduler`);
            this._dataScheduler.start();
        });
    }

    _forceRefresh() {
        if (this._dataScheduler) {
            this._dataScheduler.forceRefresh();
        }
    }
}


