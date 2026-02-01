import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {loadCredentials} from './credentialStore.js';
import {SETTINGS_KEYS} from './constants.js';

export const PanelIndicator = GObject.registerClass(
class PanelIndicator extends PanelMenu.Button {
    _init(uuid, name, settings, onSettingsClick, onForceRefresh, logger, extensionPath) {
        super._init(0.0, name, false);

        this._uuid = uuid;
        this._name = name;
        this._settings = settings;
        this._onSettingsClick = onSettingsClick;
        this._onForceRefresh = onForceRefresh;
        this._logger = logger;
        this._extensionPath = extensionPath;
        this._iconSize = this._getIconSize();

        this._buildUI();
        this._connectSignals();
        this._updateDisplay();
    }

    _buildUI() {
        // Panel button content (icon + optional number)
        const box = new St.BoxLayout({
            style_class: 'panel-status-menu-box',
            style: 'spacing: 3px;',
        });

        // Chart icon from SVG
        this._icon = new St.Icon({
            gicon: Gio.icon_new_for_string(`${this._extensionPath}/icons/insert_chart_24dp_E3E3E3_FILL0_wght100_GRAD0_opsz24.svg`),
            style_class: 'system-status-icon',
            icon_size: this._iconSize,
        });
        box.add_child(this._icon);

        // Stats label (shown based on panel-display setting)
        this._statsLabel = new St.Label({
            text: '',
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(this._statsLabel);

        this.add_child(box);

        // Build dropdown menu
        this._buildMenu();
    }

    _buildMenu() {
        // Clear existing menu items
        this.menu.removeAll();

        // Stats items - will set icons dynamically based on record status
        this._liveItem = new PopupMenu.PopupImageMenuItem('Live: -- / --', null, {
            reactive: false,
            can_focus: false,
        });
        this.menu.addMenuItem(this._liveItem);

        this._dailyItem = new PopupMenu.PopupImageMenuItem('Daily: -- / --', null, {
            reactive: false,
            can_focus: false,
        });
        this.menu.addMenuItem(this._dailyItem);

        this._weeklyItem = new PopupMenu.PopupImageMenuItem('Weekly: -- / --', null, {
            reactive: false,
            can_focus: false,
        });
        this.menu.addMenuItem(this._weeklyItem);

        this._monthlyItem = new PopupMenu.PopupImageMenuItem('Monthly: -- / --', null, {
            reactive: false,
            can_focus: false,
        });
        this.menu.addMenuItem(this._monthlyItem);

        // Separator
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Force Refresh
        const refreshItem = new PopupMenu.PopupImageMenuItem(
            'Force Refresh',
            this._createIcon(`${this._extensionPath}/icons/refresh_24dp_E3E3E3_FILL0_wght100_GRAD0_opsz24.svg`)
        );
        this._setMenuItemIconSize(refreshItem);
        refreshItem.connect('activate', () => {
            this._logger.info('Force refresh triggered from menu');
            if (this._onForceRefresh) {
                this._onForceRefresh();
            }
        });
        this.menu.addMenuItem(refreshItem);

        // Settings
        const settingsItem = new PopupMenu.PopupImageMenuItem(
            'Settings',
            this._createIcon(`${this._extensionPath}/icons/settings_24dp_E3E3E3_FILL0_wght100_GRAD0_opsz24.svg`)
        );
        this._setMenuItemIconSize(settingsItem);
        settingsItem.connect('activate', () => {
            this._logger.debug('Opening settings');
            if (this._onSettingsClick) {
                this._onSettingsClick();
            }
        });
        this.menu.addMenuItem(settingsItem);
    }

    _connectSignals() {
        // Watch for settings changes
        this._settingsChangedId = this._settings.connect('changed', (settings, key) => {
            if (key === SETTINGS_KEYS.PANEL_DISPLAY || 
                key === SETTINGS_KEYS.CURRENT_LIVE ||
                key === SETTINGS_KEYS.CURRENT_DAILY || 
                key === SETTINGS_KEYS.CURRENT_WEEKLY || 
                key === SETTINGS_KEYS.CURRENT_MONTHLY ||
                key === SETTINGS_KEYS.RECORD_LIVE ||
                key === SETTINGS_KEYS.RECORD_DAILY ||
                key === SETTINGS_KEYS.RECORD_WEEKLY ||
                key === SETTINGS_KEYS.RECORD_MONTHLY ||
                key === SETTINGS_KEYS.GA_API_KEY ||
                key === 'ga-property-id' ||
                key === SETTINGS_KEYS.API_CONNECTED) {
                this._updateDisplay();
            } else if (key === SETTINGS_KEYS.ICON_SIZE) {
                this._iconSize = this._getIconSize();
                this._icon.icon_size = this._iconSize;
                this._buildMenu();
                this._updateDisplay();
            }
        });
    }

    _updateDisplay() {
        // Update panel label based on panel-display setting
        const displayMode = this._settings.get_string(SETTINGS_KEYS.PANEL_DISPLAY);
        const currentLive = this._settings.get_int(SETTINGS_KEYS.CURRENT_LIVE);
        const currentDaily = this._settings.get_int(SETTINGS_KEYS.CURRENT_DAILY);
        const currentWeekly = this._settings.get_int(SETTINGS_KEYS.CURRENT_WEEKLY);
        const currentMonthly = this._settings.get_int(SETTINGS_KEYS.CURRENT_MONTHLY);
        const apiConnected = this._settings.get_boolean(SETTINGS_KEYS.API_CONNECTED);

        let displayText = '';
        switch (displayMode) {
            case 'live':
                displayText = apiConnected ? `${currentLive}` : '';
                break;
            case 'daily':
                displayText = apiConnected ? `${currentDaily}` : '';
                break;
            case 'weekly':
                displayText = apiConnected ? `${currentWeekly}` : '';
                break;
            case 'monthly':
                displayText = apiConnected ? `${currentMonthly}` : '';
                break;
            case 'nothing':
            default:
                displayText = '';
                break;
        }

        this._statsLabel.set_text(displayText);

        // Update menu items
        this._updateMenuItems();
    }

    _updateMenuItems() {
        const currentLive = this._settings.get_int(SETTINGS_KEYS.CURRENT_LIVE);
        const currentDaily = this._settings.get_int(SETTINGS_KEYS.CURRENT_DAILY);
        const currentWeekly = this._settings.get_int(SETTINGS_KEYS.CURRENT_WEEKLY);
        const currentMonthly = this._settings.get_int(SETTINGS_KEYS.CURRENT_MONTHLY);
        const recordLive = this._settings.get_int(SETTINGS_KEYS.RECORD_LIVE);
        const recordDaily = this._settings.get_int(SETTINGS_KEYS.RECORD_DAILY);
        const recordWeekly = this._settings.get_int(SETTINGS_KEYS.RECORD_WEEKLY);
        const recordMonthly = this._settings.get_int(SETTINGS_KEYS.RECORD_MONTHLY);
        const lastNotifiedLive = this._settings.get_int('last-notified-live');
        const lastNotifiedDaily = this._settings.get_int('last-notified-daily');
        const lastNotifiedWeekly = this._settings.get_int('last-notified-weekly');
        const lastNotifiedMonthly = this._settings.get_int('last-notified-monthly');

        // Check if credentials are configured
        const hasCredentials = loadCredentials(this._settings) &&
                              this._settings.get_string('ga-property-id');
        const apiConnected = this._settings.get_boolean(SETTINGS_KEYS.API_CONNECTED);
        
        if (!hasCredentials) {
            // Show setup message only if not configured at all
            this._liveItem.label.set_text('⚙️  Not configured');
            this._dailyItem.label.set_text('Click Settings to configure');
            this._weeklyItem.label.set_text('Google Analytics credentials');
            this._monthlyItem.label.set_text('');
            return;
        }
        
        if (!apiConnected && currentLive === 0 && currentDaily === 0 && currentWeekly === 0 && currentMonthly === 0) {
            // API configured but not yet connected - show waiting message
            this._liveItem.label.set_text('⏳ Connecting to API...');
            this._dailyItem.label.set_text('Fetching data from');
            this._weeklyItem.label.set_text('Google Analytics');
            this._monthlyItem.label.set_text('');
            return;
        }

        // Determine which icon to use for each metric
        const areaChartIcon = this._createIcon(`${this._extensionPath}/icons/area_chart_24dp_E3E3E3_FILL0_wght100_GRAD0_opsz24.svg`);
        const trophyIcon = this._createIcon(`${this._extensionPath}/icons/trophy_24dp_E3E3E3_FILL0_wght100_GRAD0_opsz24.svg`);
        
        const isLiveRecord = currentLive > recordLive;
        const isDailyRecord = currentDaily > recordDaily;
        const isWeeklyRecord = currentWeekly > recordWeekly;
        const isMonthlyRecord = currentMonthly > recordMonthly;

        // Update icons and text for each item
        this._liveItem.setIcon(isLiveRecord ? trophyIcon : areaChartIcon);
        this._setMenuItemIconSize(this._liveItem);
        this._liveItem.label.set_text(
            `Live: ${recordLive} / ${currentLive}`
        );
        
        this._dailyItem.setIcon(isDailyRecord ? trophyIcon : areaChartIcon);
        this._setMenuItemIconSize(this._dailyItem);
        this._dailyItem.label.set_text(
            `Daily: ${recordDaily} / ${currentDaily}`
        );
        
        this._weeklyItem.setIcon(isWeeklyRecord ? trophyIcon : areaChartIcon);
        this._setMenuItemIconSize(this._weeklyItem);
        this._weeklyItem.label.set_text(
            `Weekly: ${recordWeekly} / ${currentWeekly}`
        );
        
        this._monthlyItem.setIcon(isMonthlyRecord ? trophyIcon : areaChartIcon);
        this._setMenuItemIconSize(this._monthlyItem);
        this._monthlyItem.label.set_text(
            `Monthly: ${recordMonthly} / ${currentMonthly}`
        );
    }

    updateStats(live, daily, weekly, monthly) {
        // Helper method to update stats from external source
        this._settings.set_int(SETTINGS_KEYS.CURRENT_LIVE, live);
        this._settings.set_int(SETTINGS_KEYS.CURRENT_DAILY, daily);
        this._settings.set_int(SETTINGS_KEYS.CURRENT_WEEKLY, weekly);
        this._settings.set_int(SETTINGS_KEYS.CURRENT_MONTHLY, monthly);
    }

    _getIconSize() {
        const size = this._settings.get_int(SETTINGS_KEYS.ICON_SIZE);
        return size > 0 ? size : 24;
    }

    _createIcon(path) {
        return Gio.icon_new_for_string(path);
    }

    _setMenuItemIconSize(item) {
        if (item && item._icon) {
            item._icon.icon_size = this._iconSize;
        }
    }

    destroy() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        super.destroy();
    }
});

export function addIndicator(uuid, name, settings, onSettingsClick, onForceRefresh, logger, extensionPath) {
    const indicator = new PanelIndicator(uuid, name, settings, onSettingsClick, onForceRefresh, logger, extensionPath);
    Main.panel.addToStatusArea(uuid, indicator);
    return indicator;
}
