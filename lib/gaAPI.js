import Soup from 'gi://Soup';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {getRefreshIntervalMinutes} from './refreshInterval.js';
import {hasOpenSSL} from './dependencyChecker.js';
import {loadCredentials} from './credentialStore.js';
import {formatDate, getIsoWeekStart, getMonthStart, getPreviousDay, getPreviousIsoWeekRange, getPreviousMonthRange} from './dateUtils.js';
import {SETTINGS_KEYS} from './constants.js';

export class GAClient {
    constructor(settings, logger) {
        this._settings = settings;
        this._logger = logger;
        this._session = new Soup.Session();
        this._session.timeout = 30;
        this._apiEndpoint = 'https://analyticsdata.googleapis.com/v1beta';
        this._tokenEndpoint = 'https://oauth2.googleapis.com/token';
        this._accessToken = null;
        this._tokenExpiry = null;
        this._recordSeedPropertyId = null;
        this._recordSeeded = { daily: false, weekly: false, monthly: false };

        const stalePath = this._settings.get_string(SETTINGS_KEYS.TMP_SIGN_DATA_PATH);
        if (stalePath) {
            if (stalePath.includes('/gasp_data_')) {
                this._cleanupTempFiles([stalePath]);
            }
            this._settings.set_string(SETTINGS_KEYS.TMP_SIGN_DATA_PATH, '');
        }
    }

    async fetchStats() {
        let credentials = loadCredentials(this._settings);
        const propertyId = this._settings.get_string(SETTINGS_KEYS.GA_PROPERTY_ID);
        
        if (!credentials || !propertyId) {
            this._logger.info('API credentials not configured');
            return null;
        }
        credentials = null;
        
        if (propertyId !== this._recordSeedPropertyId) {
            this._recordSeedPropertyId = propertyId;
            this._recordSeeded = { daily: false, weekly: false, monthly: false };
        }
        
        try {
            this._logger.debug('Fetching stats from Google Analytics API');
            
            // Get access token
            const token = await this._getAccessToken();
            if (!token) {
                this._logger.error('Failed to obtain access token - check credentials');
                return null;
            }
            
            // Fetch stats for different time periods in parallel
            const now = new Date();
            const weekStart = getIsoWeekStart(now);
            const monthStart = getMonthStart(now);

            let [liveStats, dailyStats, weeklyStats, monthlyStats] = await Promise.all([
                this._fetchLiveStats(propertyId, token),
                this._fetchPeriodStats(propertyId, token, 'today', 'today'),
                this._fetchPeriodStats(propertyId, token, formatDate(weekStart), 'today'),
                this._fetchPeriodStats(propertyId, token, formatDate(monthStart), 'today')
            ]);

            if (liveStats === null) {
                this._logger.error('Failed to fetch live stats from API, falling back to 0');
                liveStats = 0;
            }

            let dailyFallback = false;
            let weeklyFallback = false;
            let monthlyFallback = false;
            let seededDailyRecord = null;
            let seededWeeklyRecord = null;
            let seededMonthlyRecord = null;

            // Fetch previous period data if current is 0 (DRY: extracted to helper)
            if (dailyStats === 0) {
                dailyStats = await this._fetchPreviousPeriod('daily', propertyId, token, now);
                dailyFallback = dailyStats !== null;
            }

            if (weeklyStats === 0) {
                weeklyStats = await this._fetchPreviousPeriod('weekly', propertyId, token, now);
                weeklyFallback = weeklyStats !== null;
            }

            if (monthlyStats === 0) {
                monthlyStats = await this._fetchPreviousPeriod('monthly', propertyId, token, now);
                monthlyFallback = monthlyStats !== null;
            }

            // Seed records if needed (DRY: extracted to helper)
            if (this._settings.get_int(SETTINGS_KEYS.RECORD_DAILY) === 0 && !this._recordSeeded.daily) {
                this._logger.info('Record daily is 0; fetching previous day to seed record');
                seededDailyRecord = await this._fetchPreviousPeriod('daily', propertyId, token, now);
                this._recordSeeded.daily = true;
            }

            if (this._settings.get_int(SETTINGS_KEYS.RECORD_WEEKLY) === 0 && !this._recordSeeded.weekly) {
                this._logger.info('Record weekly is 0; fetching previous week to seed record');
                seededWeeklyRecord = await this._fetchPreviousPeriod('weekly', propertyId, token, now);
                this._recordSeeded.weekly = true;
            }

            if (this._settings.get_int(SETTINGS_KEYS.RECORD_MONTHLY) === 0 && !this._recordSeeded.monthly) {
                this._logger.info('Record monthly is 0; fetching previous month to seed record');
                seededMonthlyRecord = await this._fetchPreviousPeriod('monthly', propertyId, token, now);
                this._recordSeeded.monthly = true;
            }
            if (seededDailyRecord === null || seededWeeklyRecord === null || seededMonthlyRecord === null) {
                this._logger.warn(
                    `Record seeding results (daily=${seededDailyRecord}, weekly=${seededWeeklyRecord}, monthly=${seededMonthlyRecord})`
                );
            }
            
            const dailyFailed = dailyStats === null;
            const weeklyFailed = weeklyStats === null;
            const monthlyFailed = monthlyStats === null;

            if (dailyFailed && weeklyFailed && monthlyFailed) {
                this._logger.error('Failed to fetch stats from API');
                return null;
            }

            if (dailyFailed || weeklyFailed || monthlyFailed) {
                this._logger.warn(
                    `Partial stats failure (daily=${dailyFailed}, weekly=${weeklyFailed}, monthly=${monthlyFailed}), using last known values`
                );
                if (dailyFailed) {
                    dailyStats = this._settings.get_int('current-daily');
                }
                if (weeklyFailed) {
                    weeklyStats = this._settings.get_int('current-weekly');
                }
                if (monthlyFailed) {
                    monthlyStats = this._settings.get_int('current-monthly');
                }
            }
            
            return {
                success: true,
                live: liveStats,
                daily: dailyStats,
                weekly: weeklyStats,
                monthly: monthlyStats,
                fallback: {
                    daily: dailyFallback,
                    weekly: weeklyFallback,
                    monthly: monthlyFallback,
                }
                ,
                seed: {
                    daily: seededDailyRecord,
                    weekly: seededWeeklyRecord,
                    monthly: seededMonthlyRecord,
                }
            };
            
        } catch (e) {
            this._logger.error('Error fetching stats from GA:', e);
            return null;
        }
    }

    async _fetchPreviousPeriod(period, propertyId, token, now) {
        const ranges = {
            daily: () => {
                const prev = getPreviousDay(now);
                return [formatDate(prev), formatDate(prev)];
            },
            weekly: () => {
                const prev = getPreviousIsoWeekRange(now);
                return [formatDate(prev.start), formatDate(prev.end)];
            },
            monthly: () => {
                const prev = getPreviousMonthRange(now);
                return [formatDate(prev.start), formatDate(prev.end)];
            }
        };
        
        if (!ranges[period]) {
            this._logger.error(`Invalid period: ${period}`);
            return null;
        }
        
        const [start, end] = ranges[period]();
        return await this._fetchPeriodStats(propertyId, token, start, end);
    }

    async fetchProperties() {
        const serviceAccountJson = this._settings.get_string('ga-api-key');
        
        if (!serviceAccountJson) {
            this._logger.debug('API credentials not configured');
            return [];
        }
        
        try {
            this._logger.debug('Property listing requires Admin API access');
            this._logger.info('Please manually enter your Property ID from Google Analytics');
            
            return [];
            
        } catch (e) {
            this._logger.error('Error fetching properties from GA:', e);
            return [];
        }
    }

    async _getAccessToken() {
        if (!hasOpenSSL()) {
            this._logger.error('OpenSSL not found in PATH; cannot sign JWT');
            return null;
        }

        let credentials = loadCredentials(this._settings);
        if (!credentials) {
            this._logger.info('Service Account credentials not configured');
            return null;
        }
        
        // Check if we have a valid cached token
        if (this._accessToken && this._tokenExpiry && Date.now() < this._tokenExpiry) {
            this._logger.debug('Using cached access token');
            return this._accessToken;
        }
        
        try {
            if (!credentials.private_key || !credentials.client_email) {
                this._logger.error('Invalid service account JSON: missing private_key or client_email');
                return null;
            }

            this._logger.debug('Creating JWT for service account authentication');
            
            const jwt = await this._createJWT(credentials);
            if (!jwt) {
                this._logger.error('Failed to create JWT');
                return null;
            }

            this._logger.debug('Exchanging JWT for access token');
            
            const token = await this._exchangeJWTForToken(jwt);
            if (token) {
                this._accessToken = token.access_token;
                this._tokenExpiry = Date.now() + (token.expires_in * 1000) - 60000; // 1 min buffer
                this._logger.debug('Access token obtained successfully');
                return this._accessToken;
            }

            return null;
        } catch (e) {
            this._logger.error(`Error getting access token: ${e.message}`);
            return null;
        } finally {
            credentials = null;
        }
    }

    async _createJWT(credentials) {
        try {
            const now = Math.floor(Date.now() / 1000);
            const expiry = now + 3600; // 1 hour

            const header = {
                alg: 'RS256',
                typ: 'JWT'
            };

            const claimSet = {
                iss: credentials.client_email,
                scope: 'https://www.googleapis.com/auth/analytics.readonly',
                aud: this._tokenEndpoint,
                exp: expiry,
                iat: now
            };

            const headerB64 = this._base64UrlEncode(JSON.stringify(header));
            const claimSetB64 = this._base64UrlEncode(JSON.stringify(claimSet));
            const signatureInput = `${headerB64}.${claimSetB64}`;

            // Sign with private key
            const signature = await this._signRSA(signatureInput, credentials.private_key);
            if (!signature) {
                return null;
            }

            const jwt = `${signatureInput}.${signature}`;
            return jwt;
            
        } catch (e) {
            this._logger.error(`Error creating JWT: ${e.message}`);
            return null;
        }
    }

    async _signRSA(data, privateKeyPem) {
        try {
            const tmpDataKey = SETTINGS_KEYS.TMP_SIGN_DATA_PATH;
            // Convert escaped newlines to actual newlines
            const privateKeyFixed = privateKeyPem.replace(/\\n/g, '\n');

            // In-memory key: pass the private key via stdin, data via temp file.
            let dataPath = null;
            const stalePath = this._settings.get_string(tmpDataKey);
            if (stalePath) {
                if (stalePath.includes('/gasp_data_')) {
                    this._cleanupTempFiles([stalePath]);
                }
                this._settings.set_string(tmpDataKey, '');
            }
            try {
                const [dataFd, tmpPath] = GLib.file_open_tmp('gasp_data_XXXXXX');
                dataPath = tmpPath;
                GLib.close(dataFd);
                GLib.file_set_contents(dataPath, data);
                this._settings.set_string(tmpDataKey, dataPath);

                const launcher = new Gio.SubprocessLauncher({
                    flags: Gio.SubprocessFlags.STDIN_PIPE |
                        Gio.SubprocessFlags.STDOUT_PIPE |
                        Gio.SubprocessFlags.STDERR_PIPE,
                });

                const proc = launcher.spawnv([
                    'openssl',
                    'dgst',
                    '-sha256',
                    '-sign',
                    '/dev/stdin',
                    '-binary',
                    dataPath,
                ]);

                const keyBytes = new TextEncoder().encode(privateKeyFixed);
                const [ok, stdout, stderr] = proc.communicate(new GLib.Bytes(keyBytes), null);
                const exitStatus = proc.get_exit_status();

                if (ok && exitStatus === 0) {
                    const outBytes = stdout ? new Uint8Array(stdout.get_data()) : null;
                    if (outBytes && outBytes.length > 0) {
                        return this._base64UrlEncodeBytes(outBytes);
                    }
                    this._logger.error('OpenSSL signing failed: empty signature');
                    return null;
                }

                const errText = stderr ? new TextDecoder().decode(stderr.get_data()) : '';
                this._logger.error(`OpenSSL signing failed: ${errText}`);
            } finally {
                if (dataPath) {
                    this._cleanupTempFiles([dataPath]);
                }
                this._settings.set_string(tmpDataKey, '');
            }

            // Fallback to temp files if stdin signing fails
            this._logger.warn('In-memory signing failed; falling back to temp-file signing');
            const tempDir = GLib.get_tmp_dir();
            const keyFile = `${tempDir}/gasp_key_${Date.now()}.pem`;
            const dataFile = `${tempDir}/gasp_data_${Date.now()}.txt`;
            const sigFile = `${tempDir}/gasp_sig_${Date.now()}.bin`;

            GLib.file_set_contents(keyFile, privateKeyFixed);
            GLib.file_set_contents(dataFile, data);

            const [success, stdout, stderr, exitStatus] = GLib.spawn_sync(
                null,
                ['openssl', 'dgst', '-sha256', '-sign', keyFile, '-out', sigFile, dataFile],
                null,
                GLib.SpawnFlags.SEARCH_PATH,
                null
            );

            if (!success || exitStatus !== 0) {
                this._logger.error(`OpenSSL signing failed: ${new TextDecoder().decode(stderr)}`);
                this._cleanupTempFiles([keyFile, dataFile, sigFile]);
                return null;
            }

            const [sigSuccess, sigData] = GLib.file_get_contents(sigFile);
            if (!sigSuccess) {
                this._logger.error('Failed to read signature file');
                this._cleanupTempFiles([keyFile, dataFile, sigFile]);
                return null;
            }

            const sigBytes = new Uint8Array(sigData);
            const signature = this._base64UrlEncodeBytes(sigBytes);

            this._cleanupTempFiles([keyFile, dataFile, sigFile]);

            return signature;
            
        } catch (e) {
            this._logger.error(`Error signing with RSA: ${e.message}`);
            return null;
        }
    }

    _cleanupTempFiles(files) {
        files.forEach(file => {
            try {
                const gfile = Gio.File.new_for_path(file);
                if (gfile.query_exists(null)) {
                    gfile.delete(null);
                }
            } catch (e) {
                // Ignore cleanup errors
            }
        });
    }

    async _exchangeJWTForToken(jwt) {
        try {
            const url = this._tokenEndpoint;
            const body = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`;

            const message = Soup.Message.new('POST', url);
            message.request_headers.append('Content-Type', 'application/x-www-form-urlencoded');
            message.set_request_body_from_bytes(
                'application/x-www-form-urlencoded',
                new GLib.Bytes(body)
            );

            const bytes = await this._sendRequest(message);
            if (!bytes) {
                return null;
            }

            const decoder = new TextDecoder('utf-8');
            const responseText = decoder.decode(bytes.get_data());
            const response = JSON.parse(responseText);

            if (response.error) {
                this._logger.error(`Token exchange error: ${response.error_description || response.error}`);
                return null;
            }

            return response;
            
        } catch (e) {
            this._logger.error(`Error exchanging JWT for token: ${e.message}`);
            return null;
        }
    }

    _base64UrlEncode(str) {
        const bytes = new TextEncoder().encode(str);
        return this._base64UrlEncodeBytes(bytes);
    }

    _base64UrlEncodeBytes(bytes) {
        // Convert to base64
        const base64 = GLib.base64_encode(bytes);
        // Convert to base64url
        return base64
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    async _fetchPeriodStats(propertyId, token, startDate, endDate) {
        try {
            const url = `${this._apiEndpoint}/properties/${propertyId}:runReport`;
            
            const requestBody = {
                dateRanges: [{
                    startDate: startDate,
                    endDate: endDate
                }],
                metrics: [
                    { name: 'activeUsers' }
                ],
                dimensions: []
            };
            
            const message = Soup.Message.new('POST', url);
            message.request_headers.append('Content-Type', 'application/json');
            message.request_headers.append('Authorization', `Bearer ${token}`);
            
            const requestBodyJson = JSON.stringify(requestBody);
            message.set_request_body_from_bytes(
                'application/json',
                new GLib.Bytes(requestBodyJson)
            );
            
            this._logger.debug(`Requesting GA data for ${startDate} to ${endDate}`);
            
            const bytes = await this._sendRequest(message);
            
            if (!bytes) {
                this._logger.debug('No response received from GA API');
                return null;
            }
            
            const decoder = new TextDecoder('utf-8');
            const responseText = decoder.decode(bytes.get_data());
            
            this._logger.debug(`GA API Response: ${responseText.substring(0, 200)}...`);
            
            const response = JSON.parse(responseText);
            
            // Check for API errors
            if (response.error) {
                this._logger.error(`GA API Error: ${response.error.message} (Code: ${response.error.code})`);
                return null;
            }
            
            // Extract active users from response
            if (response.rows && response.rows.length > 0 && response.rows[0].metricValues) {
                const activeUsers = parseInt(response.rows[0].metricValues[0].value);
                this._logger.debug(`Active users for ${startDate} to ${endDate}: ${activeUsers}`);
                return activeUsers;
            } else if (response.rowCount === 0) {
                this._logger.debug(`No data available for ${startDate} to ${endDate}`);
                return 0;
            } else {
                this._logger.debug('Unexpected response format from GA API');
                return null;
            }
            
        } catch (e) {
            this._logger.error(`Error fetching period stats: ${e.message}`);
            return null;
        }
    }

    async _fetchLiveStats(propertyId, token) {
        try {
            const url = `${this._apiEndpoint}/properties/${propertyId}:runRealtimeReport`;
            const intervalMinutes = this._getRefreshIntervalMinutes();
            const maxRealtimeMinutes = 30;
            const startMinutesAgo = Math.min(
                maxRealtimeMinutes - 1,
                Math.max(0, intervalMinutes - 1)
            );
            const effectiveWindowMinutes = startMinutesAgo + 1;

            if (intervalMinutes > maxRealtimeMinutes) {
                this._logger.debug(`Live window capped to last ${maxRealtimeMinutes} minutes`);
            }

            const requestBody = {
                metrics: [
                    { name: 'activeUsers' }
                ],
                metricAggregations: ['TOTAL'],
                minuteRanges: [{
                    name: 'last-window',
                    startMinutesAgo: startMinutesAgo,
                    endMinutesAgo: 0
                }]
            };

            const message = Soup.Message.new('POST', url);
            message.request_headers.append('Content-Type', 'application/json');
            message.request_headers.append('Authorization', `Bearer ${token}`);

            const requestBodyJson = JSON.stringify(requestBody);
            message.set_request_body_from_bytes(
                'application/json',
                new GLib.Bytes(requestBodyJson)
            );

            this._logger.debug(`Requesting live GA data for last ${startMinutesAgo + 1} minutes`);

            const bytes = await this._sendRequest(message);
            if (!bytes) {
                this._logger.debug('No response received from GA API for live stats');
                return null;
            }

            const decoder = new TextDecoder('utf-8');
            const responseText = decoder.decode(bytes.get_data());
            const response = JSON.parse(responseText);

            if (response.error) {
                this._logger.error(`GA API Error (live): ${response.error.message} (Code: ${response.error.code})`);
                return null;
            }

            const minutesLabel = effectiveWindowMinutes < 60
                ? `${effectiveWindowMinutes}m`
                : `${effectiveWindowMinutes / 60}h`;

            const totalValue = response.totals?.[0]?.metricValues?.[0]?.value;
            const parsedTotal = parseInt(totalValue, 10);
            if (totalValue !== undefined && !Number.isNaN(parsedTotal)) {
                const total = parsedTotal;
                this._logger.debug(`Live active users for last ${minutesLabel}: ${total}`);
                return total;
            }

            if (response.rows && response.rows.length > 0) {
                const rowValues = response.rows
                    .map(row => parseInt(row.metricValues?.[0]?.value, 10))
                    .filter(value => !Number.isNaN(value));

                if (rowValues.length > 0) {
                    const fallback = Math.max(...rowValues);
                    if (rowValues.length > 1) {
                        this._logger.warn(
                            `Live response returned ${rowValues.length} rows without totals; using max row value ${fallback}`
                        );
                    }
                    this._logger.debug(`Live active users for last ${minutesLabel}: ${fallback}`);
                    return fallback;
                }
            }

            this._logger.debug('No live data available');
            return 0;
        } catch (e) {
            this._logger.error(`Error fetching live stats: ${e.message}`);
            return null;
        }
    }

    _getRefreshIntervalMinutes() {
        return getRefreshIntervalMinutes(this._settings);
    }

    async _sendRequest(message) {
        return new Promise((resolve, reject) => {
            this._session.send_and_read_async(
                message,
                GLib.PRIORITY_DEFAULT,
                null,
                (session, result) => {
                    try {
                        const bytes = session.send_and_read_finish(result);
                        const statusCode = message.get_status();
                        
                        this._logger.debug(`HTTP Status: ${statusCode}`);
                        
                        if (statusCode !== 200) {
                            if (bytes) {
                                const decoder = new TextDecoder('utf-8');
                                const errorText = decoder.decode(bytes.get_data());
                                this._logger.error(`HTTP Error ${statusCode}: ${errorText.substring(0, 500)}`);
                            } else {
                                this._logger.error(`HTTP Error: ${statusCode}`);
                            }
                            resolve(null);
                            return;
                        }
                        
                        resolve(bytes);
                    } catch (e) {
                        this._logger.error(`Request error: ${e.message}`);
                        reject(e);
                    }
                }
            );
        });
    }

    _sleep(ms) {
        return new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            resolve();
            return GLib.SOURCE_REMOVE;
        }));
    }

    destroy() {
        this._session = null;
    }
}
