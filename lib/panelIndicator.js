import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

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

        this._buildUI();
        this._connectSignals();
        this._updateDisplay();
    }

    _buildUI() {
        // Panel button content (icon + optional number)
        const box = new St.BoxLayout({
            style_class: 'panel-status-menu-box',
        });

        // Chart icon from SVG
        this._icon = new St.Icon({
            gicon: Gio.icon_new_for_string(`${this._extensionPath}/icons/insert_chart_24dp_E3E3E3_FILL0_wght100_GRAD0_opsz24.svg`),
            style_class: 'system-status-icon',
            icon_size: 24,
            style: 'color: white; -st-icon-style: symbolic;',
        });
        box.add_child(this._icon);
        
        // Add spacing
        const spacer = new St.Label({
            text: '  ',
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(spacer);

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

        // Stats items
        this._dailyItem = new PopupMenu.PopupMenuItem('Daily: -- / --', {
            reactive: false,
            can_focus: false,
        });
        this.menu.addMenuItem(this._dailyItem);

        this._weeklyItem = new PopupMenu.PopupMenuItem('Weekly: -- / --', {
            reactive: false,
            can_focus: false,
        });
        this.menu.addMenuItem(this._weeklyItem);

        this._monthlyItem = new PopupMenu.PopupMenuItem('Monthly: -- / --', {
            reactive: false,
            can_focus: false,
        });
        this.menu.addMenuItem(this._monthlyItem);

        // Separator
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Force Refresh
        const refreshItem = new PopupMenu.PopupMenuItem('Force Refresh');
        refreshItem.connect('activate', () => {
            this._logger.info('Force refresh triggered from menu');
            if (this._onForceRefresh) {
                this._onForceRefresh();
            }
        });
        this.menu.addMenuItem(refreshItem);

        // Settings
        const settingsItem = new PopupMenu.PopupMenuItem('Settings');
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
            if (key === 'panel-display' || 
                key === 'current-daily' || 
                key === 'current-weekly' || 
                key === 'current-monthly' ||
                key === 'record-daily' ||
                key === 'record-weekly' ||
                key === 'record-monthly' ||
                key === 'ga-api-key' ||
                key === 'ga-property-id' ||
                key === 'api-connected') {
                this._updateDisplay();
            }
        });
    }

    _updateDisplay() {
        // Update panel label based on panel-display setting
        const displayMode = this._settings.get_string('panel-display');
        const currentDaily = this._settings.get_int('current-daily');
        const currentWeekly = this._settings.get_int('current-weekly');
        const currentMonthly = this._settings.get_int('current-monthly');
        const apiConnected = this._settings.get_boolean('api-connected');

        let displayText = '';
        switch (displayMode) {
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
        const currentDaily = this._settings.get_int('current-daily');
        const currentWeekly = this._settings.get_int('current-weekly');
        const currentMonthly = this._settings.get_int('current-monthly');
        const recordDaily = this._settings.get_int('record-daily');
        const recordWeekly = this._settings.get_int('record-weekly');
        const recordMonthly = this._settings.get_int('record-monthly');

        // Check if credentials are configured
        const hasCredentials = this._settings.get_string('ga-api-key') && 
                              this._settings.get_string('ga-property-id');
        const apiConnected = this._settings.get_boolean('api-connected');
        
        if (!hasCredentials) {
            // Show setup message only if not configured at all
            this._dailyItem.label.set_text('⚙️  Not configured');
            this._weeklyItem.label.set_text('Click Settings to configure');
            this._monthlyItem.label.set_text('Google Analytics credentials');
            return;
        }
        
        if (!apiConnected && currentDaily === 0 && currentWeekly === 0 && currentMonthly === 0) {
            // API configured but not yet connected - show waiting message
            this._dailyItem.label.set_text('⏳ Connecting to API...');
            this._weeklyItem.label.set_text('Fetching data from');
            this._monthlyItem.label.set_text('Google Analytics');
            return;
        }

        // Format with emoji indicators
        const dailyEmoji = currentDaily >= recordDaily && recordDaily > 0 ? '🏆' : '📈';
        const weeklyEmoji = currentWeekly >= recordWeekly && recordWeekly > 0 ? '🏆' : '📈';
        const monthlyEmoji = currentMonthly >= recordMonthly && recordMonthly > 0 ? '🏆' : '📈';

        // Once connected, show actual values including 0
        this._dailyItem.label.set_text(
            `${dailyEmoji} Daily: ${recordDaily} / ${currentDaily}`
        );
        this._weeklyItem.label.set_text(
            `${weeklyEmoji} Weekly: ${recordWeekly} / ${currentWeekly}`
        );
        this._monthlyItem.label.set_text(
            `${monthlyEmoji} Monthly: ${recordMonthly} / ${currentMonthly}`
        );
    }

    updateStats(daily, weekly, monthly) {
        // Helper method to update stats from external source
        this._settings.set_int('current-daily', daily);
        this._settings.set_int('current-weekly', weekly);
        this._settings.set_int('current-monthly', monthly);
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
