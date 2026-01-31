import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {GAClient} from './lib/gaAPI.js';
import {Logger} from './lib/logger.js';
import {getDependencyStatus} from './lib/dependencyChecker.js';
import {
    getCredentialStorageMode,
    loadCredentials,
    storeCredentialsInSettings,
    storeCredentialsInKeyring,
    clearCredentialsInSettings,
    clearCredentialsInKeyring,
    getCredentialsFromSettings,
    getCredentialsFromKeyring,
    isKeyringAvailable,
} from './lib/credentialStore.js';

export default class GASPPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        
        const page = new Adw.PreferencesPage();
        
        // Google Analytics API Group
        const apiGroup = new Adw.PreferencesGroup({
            title: 'Google Analytics API',
            description: 'Configure your Google Analytics connection',
        });
        
        const apiKeyRow = new Adw.EntryRow({
            title: 'Service Account JSON',
            show_apply_button: true,
        });
        apiKeyRow.set_text('');

        const clientEmailRow = new Adw.EntryRow({
            title: 'Client Email',
            show_apply_button: true,
        });

        const privateKeyRow = new Adw.PasswordEntryRow({
            title: 'Private Key',
            show_apply_button: true,
        });

        const saveMinimalCredentials = (clientEmail, privateKey) => {
            const email = clientEmail.trim();
            const key = privateKey.trim();
            if (!email && !key) {
                clearCredentialsInSettings(settings);
                clearCredentialsInKeyring();
                apiKeyRow.set_text('');
                return true;
            }
            if (!email || !key) {
                this._showError(window, 'Both client_email and private_key are required.');
                return false;
            }
            const mode = getCredentialStorageMode(settings);
            if (mode === 'keyring') {
                try {
                    storeCredentialsInKeyring(email, key);
                    clearCredentialsInSettings(settings);
                } catch (e) {
                    this._showError(window, 'Failed to store credentials in keyring.');
                    return false;
                }
            } else {
                storeCredentialsInSettings(settings, email, key);
                clearCredentialsInKeyring();
            }
            apiKeyRow.set_text('');
            return true;
        };

        const saveServiceAccountJson = (jsonText) => {
            const trimmed = jsonText.trim();
            if (!trimmed) {
                clearCredentialsInSettings(settings);
                clearCredentialsInKeyring();
                return true;
            }

            if (trimmed.startsWith('AIza')) {
                this._showError(window, 'API keys are not supported. Use Service Account JSON.');
                return false;
            }

            try {
                const parsed = JSON.parse(trimmed);
                if (!parsed.private_key || !parsed.client_email) {
                    this._showError(window, 'JSON is missing private_key or client_email.');
                    return false;
                }
                const saved = saveMinimalCredentials(parsed.client_email, parsed.private_key);
                if (saved) {
                    clientEmailRow.set_text(parsed.client_email);
                    privateKeyRow.set_text(parsed.private_key);
                }
                return saved;
            } catch (e) {
                this._showError(window, 'Invalid JSON. Paste the full Service Account JSON file.');
                return false;
            }
        };

        apiKeyRow.connect('apply', () => {
            saveServiceAccountJson(apiKeyRow.get_text());
        });
        
        // Add file chooser button
        const uploadButton = new Gtk.Button({
            icon_name: 'document-open-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: 'Upload JSON file',
        });
        
        uploadButton.connect('clicked', () => {
            const fileChooser = new Gtk.FileChooserDialog({
                title: 'Select Service Account JSON File',
                action: Gtk.FileChooserAction.OPEN,
                transient_for: window,
                modal: true,
            });
            
            fileChooser.add_button('Cancel', Gtk.ResponseType.CANCEL);
            fileChooser.add_button('Open', Gtk.ResponseType.ACCEPT);
            
            // Add JSON file filter
            const jsonFilter = new Gtk.FileFilter();
            jsonFilter.set_name('JSON files');
            jsonFilter.add_mime_type('application/json');
            jsonFilter.add_pattern('*.json');
            fileChooser.add_filter(jsonFilter);
            
            // Add all files filter
            const allFilter = new Gtk.FileFilter();
            allFilter.set_name('All files');
            allFilter.add_pattern('*');
            fileChooser.add_filter(allFilter);
            
            fileChooser.connect('response', (dialog, response) => {
                if (response === Gtk.ResponseType.ACCEPT) {
                    const file = dialog.get_file();
                    if (file) {
                        file.load_contents_async(null, (source, result) => {
                            try {
                                const [success, contents] = source.load_contents_finish(result);
                                if (success) {
                                    const decoder = new TextDecoder('utf-8');
                                    const jsonContent = decoder.decode(contents);
                                    
                                    saveServiceAccountJson(jsonContent);
                                }
                            } catch (e) {
                                const errorDialog = new Adw.MessageDialog({
                                    transient_for: window,
                                    modal: true,
                                    heading: 'Error Reading File',
                                    body: `Could not read file: ${e.message}`,
                                });
                                errorDialog.add_response('ok', 'OK');
                                errorDialog.present();
                            }
                        });
                    }
                }
                dialog.destroy();
            });
            
            fileChooser.show();
        });
        
        apiKeyRow.add_suffix(uploadButton);
        
        apiGroup.add(apiKeyRow);
        
        const apiHelpRow = new Adw.ActionRow({
            title: 'How to get credentials',
            subtitle: 'Paste/upload JSON above, or fill client email and private key below',
        });
        
        const apiHelpButton = new Gtk.Button({
            label: 'View Guide',
            valign: Gtk.Align.CENTER,
        });
        
        apiHelpButton.connect('clicked', () => {
            const dialog = new Adw.MessageDialog({
                transient_for: window,
                modal: true,
                heading: 'Google Analytics Credentials',
                body: 'Google Analytics Data API requires Service Account JSON, NOT an API key.\n\n' +
                      '❌ API keys (AIza...) are NOT supported\n' +
                      '✅ Service Account JSON IS required\n\n' +
                      'Quick Setup:\n' +
                      '1. Go to console.cloud.google.com\n' +
                      '2. Create Service Account\n' +
                      '3. Download JSON file\n' +
                      '4. Grant "Viewer" access to GA4\n' +
                      '5. Upload JSON file or paste content above\n\n' +
                      'For detailed step-by-step instructions, download the full guide.',
                body_use_markup: false,
            });
            
            dialog.add_response('download', 'Download Full Guide');
            dialog.add_response('ok', 'OK');
            dialog.set_response_appearance('download', Adw.ResponseAppearance.SUGGESTED);
            dialog.set_default_response('ok');
            dialog.set_close_response('ok');
            
            dialog.connect('response', (_, response) => {
                if (response === 'download') {
                    this._downloadInstructions(window);
                }
            });
            
            dialog.present();
        });
        
        apiHelpRow.add_suffix(apiHelpButton);
        apiHelpRow.set_activatable_widget(apiHelpButton);
        
        apiGroup.add(apiHelpRow);

        clientEmailRow.connect('apply', () => {
            saveMinimalCredentials(clientEmailRow.get_text(), privateKeyRow.get_text());
        });

        apiGroup.add(clientEmailRow);

        privateKeyRow.connect('apply', () => {
            saveMinimalCredentials(clientEmailRow.get_text(), privateKeyRow.get_text());
        });

        apiGroup.add(privateKeyRow);

        const storedCredentials = loadCredentials(settings);
        if (storedCredentials) {
            clientEmailRow.set_text(storedCredentials.client_email);
            privateKeyRow.set_text(storedCredentials.private_key);
        }

        const migrateToKeyringIfNeeded = () => {
            if (getCredentialStorageMode(settings) !== 'keyring') {
                return;
            }
            if (!isKeyringAvailable()) {
                settings.set_string('credential-storage', 'gsettings');
                return;
            }
            const fromSettings = getCredentialsFromSettings(settings);
            const fromKeyring = getCredentialsFromKeyring();
            if (!fromKeyring && fromSettings) {
                try {
                    storeCredentialsInKeyring(fromSettings.client_email, fromSettings.private_key);
                    clearCredentialsInSettings(settings);
                } catch (e) {
                    settings.set_string('credential-storage', 'gsettings');
                }
            }
        };

        migrateToKeyringIfNeeded();
        
        const propertyIdRow = new Adw.EntryRow({
            title: 'Property ID',
            show_apply_button: true,
        });
        
        propertyIdRow.connect('apply', () => {
            settings.set_string('ga-property-id', propertyIdRow.get_text());
        });
        
        settings.bind(
            'ga-property-id',
            propertyIdRow,
            'text',
            0
        );
        
        apiGroup.add(propertyIdRow);
        
        const testConnectionRow = new Adw.ActionRow({
            title: 'Test Connection',
            subtitle: 'Verify your Google Analytics credentials',
        });
        
        const testButton = new Gtk.Button({
            label: 'Test',
            valign: Gtk.Align.CENTER,
        });
        testButton.add_css_class('suggested-action');
        
        const testSpinner = new Gtk.Spinner({
            valign: Gtk.Align.CENTER,
            visible: false,
        });
        
        const testStatusIcon = new Gtk.Image({
            valign: Gtk.Align.CENTER,
            visible: false,
        });
        
        testButton.connect('clicked', async () => {
            const credentials = loadCredentials(settings);
            const propertyId = settings.get_string('ga-property-id');
            
            if (!credentials || !propertyId) {
                testStatusIcon.set_from_icon_name('dialog-error-symbolic');
                testStatusIcon.visible = true;
                testConnectionRow.set_subtitle('Please enter both credentials and Property ID');
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
                    testStatusIcon.visible = false;
                    testConnectionRow.set_subtitle('Verify your Google Analytics credentials');
                    return GLib.SOURCE_REMOVE;
                });
                return;
            }
            
            if (!credentials.private_key || !credentials.client_email) {
                testStatusIcon.set_from_icon_name('dialog-error-symbolic');
                testStatusIcon.visible = true;
                testConnectionRow.set_subtitle('Missing client_email or private_key');
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
                    testStatusIcon.visible = false;
                    testConnectionRow.set_subtitle('Verify your Google Analytics credentials');
                    return GLib.SOURCE_REMOVE;
                });
                return;
            }
            
            testButton.sensitive = false;
            testButton.visible = false;
            testSpinner.visible = true;
            testSpinner.start();
            testConnectionRow.set_subtitle('Testing connection...');
            
            try {
                const logger = new Logger('gastats-prefs');
                const gaClient = new GAClient(settings, logger);
                
                const stats = await gaClient.fetchStats();
                
                testSpinner.stop();
                testSpinner.visible = false;
                testStatusIcon.visible = true;
                
                if (stats && stats.daily !== undefined && stats.daily >= 0) {
                    testStatusIcon.set_from_icon_name('emblem-ok-symbolic');
                    testConnectionRow.set_subtitle(`✓ Success! Live: ${stats.live}, Daily: ${stats.daily}, Weekly: ${stats.weekly}, Monthly: ${stats.monthly}`);
                    // Mark API as connected on successful test
                    settings.set_boolean('api-connected', true);
                } else {
                    testStatusIcon.set_from_icon_name('dialog-error-symbolic');
                    testConnectionRow.set_subtitle('Connection failed. Check logs: journalctl -f | grep gastats');
                    settings.set_boolean('api-connected', false);
                }
                
                gaClient.destroy();
                
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5000, () => {
                    testStatusIcon.visible = false;
                    testButton.visible = true;
                    testButton.sensitive = true;
                    testConnectionRow.set_subtitle('Verify your Google Analytics credentials');
                    return GLib.SOURCE_REMOVE;
                });
                
            } catch (e) {
                testSpinner.stop();
                testSpinner.visible = false;
                testStatusIcon.visible = true;
                testStatusIcon.set_from_icon_name('dialog-error-symbolic');
                testConnectionRow.set_subtitle(`Error: ${e.message}`);
                testButton.visible = true;
                testButton.sensitive = true;
                
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
                    testStatusIcon.visible = false;
                    testConnectionRow.set_subtitle('Verify your Google Analytics credentials');
                    return GLib.SOURCE_REMOVE;
                });
            }
        });
        
        testConnectionRow.add_suffix(testSpinner);
        testConnectionRow.add_suffix(testStatusIcon);
        testConnectionRow.add_suffix(testButton);
        testConnectionRow.set_activatable_widget(testButton);
        
        apiGroup.add(testConnectionRow);
        
        // TODO: Add project selector dropdown (fetch from GA API)

        // Dependencies Group
        const dependenciesGroup = new Adw.PreferencesGroup({
            title: 'Dependencies',
            description: 'Verify required system tools',
        });

        const dependenciesRow = new Adw.ActionRow({
            title: 'OpenSSL',
        });

        const dependenciesStatusIcon = new Gtk.Image({
            valign: Gtk.Align.CENTER,
            visible: false,
        });

        const updateDependencyStatus = () => {
            const status = getDependencyStatus();
            dependenciesRow.set_subtitle(status.message);
            dependenciesStatusIcon.set_from_icon_name(
                status.ok ? 'emblem-ok-symbolic' : 'dialog-error-symbolic'
            );
            dependenciesStatusIcon.visible = true;
        };

        dependenciesRow.add_suffix(dependenciesStatusIcon);
        dependenciesGroup.add(dependenciesRow);

        updateDependencyStatus();
        
        // Display Options Group
        const displayGroup = new Adw.PreferencesGroup({
            title: 'Display Options',
            description: 'Configure what to show in the panel',
        });
        
        const panelDisplayRow = new Adw.ComboRow({
            title: 'Panel Display',
            subtitle: 'What stats to show next to the panel icon',
        });
        
        const displayModel = new Gtk.StringList();
        displayModel.append('Live');
        displayModel.append('Daily');
        displayModel.append('Weekly');
        displayModel.append('Monthly');
        displayModel.append('Nothing');
        panelDisplayRow.set_model(displayModel);
        
        // Map current setting to index
        const currentDisplay = settings.get_string('panel-display');
        const displayMap = {'live': 0, 'daily': 1, 'weekly': 2, 'monthly': 3, 'nothing': 4};
        panelDisplayRow.set_selected(displayMap[currentDisplay] || 0);
        
        panelDisplayRow.connect('notify::selected', () => {
            const selected = panelDisplayRow.get_selected();
            const valueMap = ['live', 'daily', 'weekly', 'monthly', 'nothing'];
            settings.set_string('panel-display', valueMap[selected]);
        });
        
        displayGroup.add(panelDisplayRow);

        const iconSizeRow = new Adw.SpinRow({
            title: 'Icon Size',
            subtitle: 'Size in pixels for panel and menu icons',
        });
        const iconSizeAdjustment = new Gtk.Adjustment({
            lower: 16,
            upper: 64,
            step_increment: 1,
            page_increment: 4,
            value: settings.get_int('icon-size') || 24,
        });
        iconSizeRow.set_adjustment(iconSizeAdjustment);
        iconSizeRow.connect('notify::value', () => {
            settings.set_int('icon-size', iconSizeRow.get_value());
        });
        settings.connect('changed::icon-size', () => {
            const value = settings.get_int('icon-size') || 24;
            iconSizeRow.set_value(value);
        });
        displayGroup.add(iconSizeRow);
        
        
        // Refresh Interval Group
        const refreshGroup = new Adw.PreferencesGroup({
            title: 'Refresh Interval',
            description: 'How often to fetch new data from Google Analytics',
        });
        
        const refreshIntervalRow = new Adw.ComboRow({
            title: 'Update Frequency',
            subtitle: 'Automatic data refresh interval',
        });
        
        const intervalModel = new Gtk.StringList();
        intervalModel.append('Every 30 Minutes');
        intervalModel.append('Every Hour');
        intervalModel.append('Every 2 Hours');
        intervalModel.append('Every 4 Hours');
        intervalModel.append('Every 8 Hours');
        intervalModel.append('Every 12 Hours');
        intervalModel.append('Every 24 Hours');
        refreshIntervalRow.set_model(intervalModel);
        
        // Map current setting to index
        let currentInterval = settings.get_int('refresh-interval');
        if (currentInterval > 0 && currentInterval < 30) {
            currentInterval *= 60;
            settings.set_int('refresh-interval', currentInterval);
        }
        const intervalMap = {30: 0, 60: 1, 120: 2, 240: 3, 480: 4, 720: 5, 1440: 6};
        refreshIntervalRow.set_selected(intervalMap[currentInterval] || 0);
        
        refreshIntervalRow.connect('notify::selected', () => {
            const selected = refreshIntervalRow.get_selected();
            const valueMap = [30, 60, 120, 240, 480, 720, 1440];
            settings.set_int('refresh-interval', valueMap[selected]);
        });
        
        refreshGroup.add(refreshIntervalRow);
        
        
        // Peaks Management Group
        const recordsGroup = new Adw.PreferencesGroup({
            title: 'Peaks Management',
            description: 'Manage your statistics peaks',
        });
        
        const clearRecordsRow = new Adw.ActionRow({
            title: 'Clear All Peaks',
            subtitle: 'Reset all statistics and peaks',
        });
        
        const clearButton = new Gtk.Button({
            label: 'Clear',
            valign: Gtk.Align.CENTER,
        });
        clearButton.add_css_class('destructive-action');
        
        clearButton.connect('clicked', () => {
            const dialog = new Adw.MessageDialog({
                transient_for: window,
                modal: true,
                heading: 'Clear All Statistics?',
                body: 'This will permanently delete all your statistics peaks. This action cannot be undone.',
            });
            
            dialog.add_response('cancel', 'Cancel');
            dialog.add_response('clear', 'Clear');
            dialog.set_response_appearance('clear', Adw.ResponseAppearance.DESTRUCTIVE);
            dialog.set_default_response('cancel');
            dialog.set_close_response('cancel');
            
            dialog.connect('response', (_, response) => {
                if (response === 'clear') {
                    // Clear database - we need to trigger this via a setting that the extension watches
                    settings.set_int('current-daily', 0);
                    settings.set_int('current-live', 0);
                    settings.set_int('current-weekly', 0);
                    settings.set_int('current-monthly', 0);
                    settings.set_int('record-daily', 0);
                    settings.set_int('record-live', 0);
                    settings.set_int('record-weekly', 0);
                    settings.set_int('record-monthly', 0);
                    settings.set_int('last-notified-daily', 0);
                    settings.set_int('last-notified-live', 0);
                    settings.set_int('last-notified-weekly', 0);
                    settings.set_int('last-notified-monthly', 0);
                    settings.set_string('last-update', '');
                    settings.set_string('last-period-daily', '');
                    settings.set_string('last-period-weekly', '');
                    settings.set_string('last-period-monthly', '');
                    settings.set_string('last-record-daily', '');
                    settings.set_string('last-record-live', '');
                    settings.set_string('last-record-weekly', '');
                    settings.set_string('last-record-monthly', '');
                }
            });
            
            dialog.present();
        });
        
        clearRecordsRow.add_suffix(clearButton);
        clearRecordsRow.set_activatable_widget(clearButton);
        
        recordsGroup.add(clearRecordsRow);
        
        page.add(displayGroup);
        page.add(refreshGroup);

        // Credential Storage Group
        const storageGroup = new Adw.PreferencesGroup({
            title: 'Credential Storage',
            description: 'Choose where to store your credentials',
        });

        const storageRow = new Adw.ComboRow({
            title: 'Storage',
            subtitle: 'GSettings (plain) or Keyring',
        });

        const storageModel = new Gtk.StringList();
        storageModel.append('GSettings (plain)');
        storageModel.append('Keyring');
        storageRow.set_model(storageModel);

        const storageMap = { gsettings: 0, keyring: 1 };
        const currentStorage = getCredentialStorageMode(settings);
        storageRow.set_selected(storageMap[currentStorage] ?? 0);

        storageRow.connect('notify::selected', () => {
            const selected = storageRow.get_selected();
            const mode = selected === 1 ? 'keyring' : 'gsettings';
            const previousCredentials =
                getCredentialsFromSettings(settings) || getCredentialsFromKeyring();

            if (mode === 'keyring' && !isKeyringAvailable()) {
                this._showError(window, 'Keyring is not available. Keeping GSettings.');
                storageRow.set_selected(0);
                settings.set_string('credential-storage', 'gsettings');
                if (previousCredentials) {
                    saveMinimalCredentials(
                        previousCredentials.client_email,
                        previousCredentials.private_key
                    );
                }
                return;
            }

            settings.set_string('credential-storage', mode);

            if (previousCredentials) {
                const saved = saveMinimalCredentials(
                    previousCredentials.client_email,
                    previousCredentials.private_key
                );
                if (!saved && mode === 'keyring') {
                    this._showError(window, 'Failed to store in keyring. Keeping GSettings.');
                    storageRow.set_selected(0);
                    settings.set_string('credential-storage', 'gsettings');
                    saveMinimalCredentials(
                        previousCredentials.client_email,
                        previousCredentials.private_key
                    );
                }
            }
        });

        storageGroup.add(storageRow);
        page.add(storageGroup);
        page.add(apiGroup);
        page.add(dependenciesGroup);
        page.add(recordsGroup);
        
        window.add(page);
    }

    _downloadInstructions(window) {
        try {
            const sourceFile = Gio.File.new_for_path(`${this.path}/GOOGLE_ANALYTICS_SETUP.md`);
            
            if (!sourceFile.query_exists(null)) {
                this._showError(window, 'Instructions file not found');
                return;
            }
            
            // Get Downloads directory
            const downloadsPath = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD);
            const destPath = `${downloadsPath}/GASP_Setup_Instructions.md`;
            const destFile = Gio.File.new_for_path(destPath);
            
            // Copy file
            sourceFile.copy(destFile, Gio.FileCopyFlags.OVERWRITE, null, null);
            
            // Show success message
            const successDialog = new Adw.MessageDialog({
                transient_for: window,
                modal: true,
                heading: 'Instructions Downloaded',
                body: `Full setup guide saved to:\n${destPath}`,
            });
            
            successDialog.add_response('open', 'Open File');
            successDialog.add_response('ok', 'OK');
            successDialog.set_response_appearance('open', Adw.ResponseAppearance.SUGGESTED);
            successDialog.set_default_response('open');
            successDialog.set_close_response('ok');
            
            successDialog.connect('response', (_, response) => {
                if (response === 'open') {
                    Gio.AppInfo.launch_default_for_uri(`file://${destPath}`, null);
                }
            });
            
            successDialog.present();
            
        } catch (e) {
            this._showError(window, `Failed to download instructions: ${e.message}`);
        }
    }

    _showError(window, message) {
        const errorDialog = new Adw.MessageDialog({
            transient_for: window,
            modal: true,
            heading: 'Error',
            body: message,
        });
        errorDialog.add_response('ok', 'OK');
        errorDialog.present();
    }
}
