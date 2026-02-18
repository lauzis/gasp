import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
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
        this._pieIconCache = new Map();
        this._pieIconDir = GLib.build_filenamev([GLib.get_tmp_dir(), 'gasp-pie-icons']);

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
                key === SETTINGS_KEYS.TODAY_LIVE_PEAK ||
                key === SETTINGS_KEYS.CURRENT_DAILY ||
                key === SETTINGS_KEYS.CURRENT_WEEKLY ||
                key === SETTINGS_KEYS.CURRENT_MONTHLY ||
                key === SETTINGS_KEYS.RECORD_LIVE ||
                key === SETTINGS_KEYS.RECORD_DAILY ||
                key === SETTINGS_KEYS.RECORD_WEEKLY ||
                key === SETTINGS_KEYS.RECORD_MONTHLY ||
                key === SETTINGS_KEYS.LAST_NOTIFIED_LIVE ||
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

        let displayText = '';
        switch (displayMode) {
            case 'live':
                displayText = `${currentLive}`;
                break;
            case 'daily':
                displayText = `${currentDaily}`;
                break;
            case 'weekly':
                displayText = `${currentWeekly}`;
                break;
            case 'monthly':
                displayText = `${currentMonthly}`;
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
        const storedTodayLivePeak = this._settings.get_int(SETTINGS_KEYS.TODAY_LIVE_PEAK);
        const lastNotifiedLive = this._settings.get_int('last-notified-live');
        const todayLivePeak = Math.max(storedTodayLivePeak, currentLive);
        const totalLivePeak = Math.max(recordLive, lastNotifiedLive, todayLivePeak);

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

        const isLiveRecord = currentLive > 0 && currentLive >= totalLivePeak;
        const isDailyRecord = currentDaily > 0 && currentDaily >= recordDaily;
        const isWeeklyRecord = currentWeekly > 0 && currentWeekly >= recordWeekly;
        const isMonthlyRecord = currentMonthly > 0 && currentMonthly >= recordMonthly;

        // Update icons and text for each item
        this._liveItem.setIcon(isLiveRecord ? trophyIcon : areaChartIcon);
        this._setMenuItemIconSize(this._liveItem);
        this._liveItem.label.set_text(
            `Live: ${totalLivePeak} / ${todayLivePeak} / ${currentLive}`
        );

        this._dailyItem.setIcon(
            isDailyRecord ? trophyIcon : this._getProgressIcon('daily', currentDaily, recordDaily)
        );
        this._setMenuItemIconSize(this._dailyItem);
        this._dailyItem.label.set_text(
            `Daily: ${recordDaily} / ${currentDaily}`
        );

        this._weeklyItem.setIcon(
            isWeeklyRecord ? trophyIcon : this._getProgressIcon('weekly', currentWeekly, recordWeekly)
        );
        this._setMenuItemIconSize(this._weeklyItem);
        this._weeklyItem.label.set_text(
            `Weekly: ${recordWeekly} / ${currentWeekly}`
        );

        this._monthlyItem.setIcon(
            isMonthlyRecord ? trophyIcon : this._getProgressIcon('monthly', currentMonthly, recordMonthly)
        );
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

    _getProgressIcon(period, visitCount, peakVisitCount) {
        const periodProgress = this._calculatePeriodProgressPercentage(period);
        const visitProgress = this._calculateVisitPerformancePercentage(visitCount, peakVisitCount);
        const pieColor = this._getProgressColor(visitProgress, periodProgress);
        const roundedVisitProgress = Math.round(visitProgress);
        const cacheKey = `${roundedVisitProgress}-${pieColor}`;

        if (this._pieIconCache.has(cacheKey)) {
            return this._pieIconCache.get(cacheKey);
        }

        try {
            GLib.mkdir_with_parents(this._pieIconDir, 0o700);
            const colorToken = pieColor.replace('#', '');
            const iconPath = GLib.build_filenamev([this._pieIconDir, `pie-${roundedVisitProgress}-${colorToken}.svg`]);
            const iconFile = Gio.File.new_for_path(iconPath);

            if (!iconFile.query_exists(null)) {
                GLib.file_set_contents(iconPath, this._buildPieSvg(roundedVisitProgress, pieColor));
            }

            const icon = this._createIcon(iconPath);
            this._pieIconCache.set(cacheKey, icon);
            return icon;
        } catch (e) {
            this._logger.warn(`Failed to generate pie progress icon: ${e.message}`);
            return this._createIcon(`${this._extensionPath}/icons/area_chart_24dp_E3E3E3_FILL0_wght100_GRAD0_opsz24.svg`);
        }
    }

    _calculatePeriodProgressPercentage(period) {
        const now = new Date();

        if (period === 'daily') {
            return (now.getHours() / 24) * 100;
        }

        if (period === 'weekly') {
            const dayOfWeek = now.getDay();
            const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;
            return (isoDay / 7) * 100;
        }

        if (period === 'monthly') {
            const currentDay = now.getDate();
            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            if (daysInMonth <= 0) {
                return 0;
            }
            return (currentDay / daysInMonth) * 100;
        }

        return 0;
    }

    _calculateVisitPerformancePercentage(visitCount, peakVisitCount) {
        const safeVisitCount = Math.max(0, visitCount);
        const safePeak = Math.max(0, peakVisitCount);

        if (safePeak === 0) {
            return safeVisitCount > 0 ? 100 : 0;
        }

        return Math.max(0, Math.min(100, (safeVisitCount / safePeak) * 100));
    }

    _getProgressColor(visitProgress, periodProgress) {
        if (visitProgress < 40) {
            return '#D93025';
        }

        if (visitProgress >= periodProgress) {
            return '#188038';
        }

        return '#F9AB00';
    }

    _buildPieSvg(percentage, color) {
        const pct = Math.max(0, Math.min(100, percentage));
        const normalizedColor = color || '#E3E3E3';
        const backgroundColor = '#E3E3E3';
        const fillOpacity = 0.95;
        const trackOpacity = 0.2;
        const strokeOpacity = 0.75;
        const cx = 12;
        const cy = 12;
        const radius = 9;
        let fillSector = '';

        if (pct >= 100) {
            fillSector = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${normalizedColor}" fill-opacity="${fillOpacity}"/>`;
        } else if (pct > 0) {
            const angle = (pct / 100) * 360;
            const radians = (angle - 90) * (Math.PI / 180);
            const x = cx + radius * Math.cos(radians);
            const y = cy + radius * Math.sin(radians);
            const largeArcFlag = angle > 180 ? 1 : 0;
            fillSector = `<path d="M ${cx} ${cy} L ${cx} ${cy - radius} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x.toFixed(3)} ${y.toFixed(3)} Z" fill="${normalizedColor}" fill-opacity="${fillOpacity}"/>`;
        }

        return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <circle cx="${cx}" cy="${cy}" r="${radius}" fill="${backgroundColor}" fill-opacity="${trackOpacity}"/>
  ${fillSector}
  <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${normalizedColor}" stroke-opacity="${strokeOpacity}" stroke-width="1"/>
</svg>`;
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
        this._pieIconCache.clear();
        super.destroy();
    }
});

export function addIndicator(uuid, name, settings, onSettingsClick, onForceRefresh, logger, extensionPath) {
    const indicator = new PanelIndicator(uuid, name, settings, onSettingsClick, onForceRefresh, logger, extensionPath);
    Main.panel.addToStatusArea(uuid, indicator);
    return indicator;
}
