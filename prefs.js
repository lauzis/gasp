import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {GAClient} from './lib/gaAPI.js';
import {Logger} from './lib/logger.js';

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
        
        apiKeyRow.connect('apply', () => {
            settings.set_string('ga-api-key', apiKeyRow.get_text());
        });
        
        settings.bind(
            'ga-api-key',
            apiKeyRow,
            'text',
            0
        );
        
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
                                    
                                    // Validate it's valid JSON
                                    try {
                                        JSON.parse(jsonContent);
                                        settings.set_string('ga-api-key', jsonContent);
                                        apiKeyRow.set_text(jsonContent);
                                    } catch (e) {
                                        const errorDialog = new Adw.MessageDialog({
                                            transient_for: window,
                                            modal: true,
                                            heading: 'Invalid JSON File',
                                            body: 'The selected file does not contain valid JSON.',
                                        });
                                        errorDialog.add_response('ok', 'OK');
                                        errorDialog.present();
                                    }
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
            subtitle: 'Paste or upload the entire content of your service account JSON file above',
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
            const serviceAccountJson = settings.get_string('ga-api-key');
            const propertyId = settings.get_string('ga-property-id');
            
            if (!serviceAccountJson || !propertyId) {
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
            
            // Check if it's an API key (which won't work)
            if (serviceAccountJson.startsWith('AIza')) {
                testStatusIcon.set_from_icon_name('dialog-warning-symbolic');
                testStatusIcon.visible = true;
                testConnectionRow.set_subtitle('⚠️  API keys are not supported. Need Service Account JSON.');
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5000, () => {
                    testStatusIcon.visible = false;
                    testConnectionRow.set_subtitle('Verify your Google Analytics credentials');
                    return GLib.SOURCE_REMOVE;
                });
                return;
            }
            
            // Validate JSON format
            try {
                const parsed = JSON.parse(serviceAccountJson);
                if (!parsed.private_key || !parsed.client_email) {
                    testStatusIcon.set_from_icon_name('dialog-error-symbolic');
                    testStatusIcon.visible = true;
                    testConnectionRow.set_subtitle('Invalid JSON: missing private_key or client_email');
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
                        testStatusIcon.visible = false;
                        testConnectionRow.set_subtitle('Verify your Google Analytics credentials');
                        return GLib.SOURCE_REMOVE;
                    });
                    return;
                }
            } catch (e) {
                testStatusIcon.set_from_icon_name('dialog-error-symbolic');
                testStatusIcon.visible = true;
                testConnectionRow.set_subtitle('Invalid JSON format - paste the entire JSON file content');
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
                    testConnectionRow.set_subtitle(`✓ Success! Daily: ${stats.daily}, Weekly: ${stats.weekly}, Monthly: ${stats.monthly}`);
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
        
        page.add(apiGroup);
        
        // Display Options Group
        const displayGroup = new Adw.PreferencesGroup({
            title: 'Display Options',
            description: 'Configure what to show in the panel',
        });
        
        const panelDisplayRow = new Adw.ComboRow({
            title: 'Panel Display',
            subtitle: 'What stats to show next to the 📊 icon',
        });
        
        const displayModel = new Gtk.StringList();
        displayModel.append('Daily');
        displayModel.append('Weekly');
        displayModel.append('Monthly');
        displayModel.append('Nothing');
        panelDisplayRow.set_model(displayModel);
        
        // Map current setting to index
        const currentDisplay = settings.get_string('panel-display');
        const displayMap = {'daily': 0, 'weekly': 1, 'monthly': 2, 'nothing': 3};
        panelDisplayRow.set_selected(displayMap[currentDisplay] || 0);
        
        panelDisplayRow.connect('notify::selected', () => {
            const selected = panelDisplayRow.get_selected();
            const valueMap = ['daily', 'weekly', 'monthly', 'nothing'];
            settings.set_string('panel-display', valueMap[selected]);
        });
        
        displayGroup.add(panelDisplayRow);
        
        page.add(displayGroup);
        
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
        intervalModel.append('Every Hour');
        intervalModel.append('Every 2 Hours');
        intervalModel.append('Every 4 Hours');
        intervalModel.append('Every 8 Hours');
        intervalModel.append('Every 12 Hours');
        intervalModel.append('Every 24 Hours');
        refreshIntervalRow.set_model(intervalModel);
        
        // Map current setting to index
        const currentInterval = settings.get_int('refresh-interval');
        const intervalMap = {1: 0, 2: 1, 4: 2, 8: 3, 12: 4, 24: 5};
        refreshIntervalRow.set_selected(intervalMap[currentInterval] || 0);
        
        refreshIntervalRow.connect('notify::selected', () => {
            const selected = refreshIntervalRow.get_selected();
            const valueMap = [1, 2, 4, 8, 12, 24];
            settings.set_int('refresh-interval', valueMap[selected]);
        });
        
        refreshGroup.add(refreshIntervalRow);
        
        page.add(refreshGroup);
        
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
                    settings.set_int('current-weekly', 0);
                    settings.set_int('current-monthly', 0);
                    settings.set_int('record-daily', 0);
                    settings.set_int('record-weekly', 0);
                    settings.set_int('record-monthly', 0);
                    settings.set_string('last-update', '');
                    
                    // Signal the extension to clear the database file
                    // We'll use a timestamp to trigger the clear
                    settings.set_string('db-path', ''); // This will trigger db recreation
                }
            });
            
            dialog.present();
        });
        
        clearRecordsRow.add_suffix(clearButton);
        clearRecordsRow.set_activatable_widget(clearButton);
        
        recordsGroup.add(clearRecordsRow);
        
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
