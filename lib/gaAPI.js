import Soup from 'gi://Soup';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GLibUnix from 'gi://GLibUnix';
import {getRefreshIntervalMinutes} from './refreshInterval.js';
import {hasOpenSSL} from './dependencyChecker.js';
import {loadCredentials} from './credentialStore.js';

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
    }

    async fetchStats() {
        let credentials = loadCredentials(this._settings);
        const propertyId = this._settings.get_string('ga-property-id');
        
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
            const weekStart = this._getIsoWeekStart(now);
            const monthStart = this._getMonthStart(now);

            let [liveStats, dailyStats, weeklyStats, monthlyStats] = await Promise.all([
                this._fetchLiveStats(propertyId, token),
                this._fetchPeriodStats(propertyId, token, 'today', 'today'),
                this._fetchPeriodStats(propertyId, token, this._formatDate(weekStart), 'today'),
                this._fetchPeriodStats(propertyId, token, this._formatDate(monthStart), 'today')
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

            if (dailyStats === 0) {
                const previousDay = this._getPreviousDay(now);
                dailyStats = await this._fetchPeriodStats(
                    propertyId,
                    token,
                    this._formatDate(previousDay),
                    this._formatDate(previousDay)
                );
                dailyFallback = dailyStats !== null;
            }

            if (weeklyStats === 0) {
                const previousWeek = this._getPreviousIsoWeekRange(now);
                weeklyStats = await this._fetchPeriodStats(
                    propertyId,
                    token,
                    this._formatDate(previousWeek.start),
                    this._formatDate(previousWeek.end)
                );
                weeklyFallback = weeklyStats !== null;
            }

            if (monthlyStats === 0) {
                const previousMonth = this._getPreviousMonthRange(now);
                monthlyStats = await this._fetchPeriodStats(
                    propertyId,
                    token,
                    this._formatDate(previousMonth.start),
                    this._formatDate(previousMonth.end)
                );
                monthlyFallback = monthlyStats !== null;
            }

            if (this._settings.get_int('record-daily') === 0 && !this._recordSeeded.daily) {
                this._logger.info('Record daily is 0; fetching previous day to seed record');
                const previousDay = this._getPreviousDay(now);
                seededDailyRecord = await this._fetchPeriodStats(
                    propertyId,
                    token,
                    this._formatDate(previousDay),
                    this._formatDate(previousDay)
                );
                this._recordSeeded.daily = true;
            }

            if (this._settings.get_int('record-weekly') === 0 && !this._recordSeeded.weekly) {
                this._logger.info('Record weekly is 0; fetching previous week to seed record');
                const previousWeek = this._getPreviousIsoWeekRange(now);
                seededWeeklyRecord = await this._fetchPeriodStats(
                    propertyId,
                    token,
                    this._formatDate(previousWeek.start),
                    this._formatDate(previousWeek.end)
                );
                this._recordSeeded.weekly = true;
            }

            if (this._settings.get_int('record-monthly') === 0 && !this._recordSeeded.monthly) {
                this._logger.info('Record monthly is 0; fetching previous month to seed record');
                const previousMonth = this._getPreviousMonthRange(now);
                seededMonthlyRecord = await this._fetchPeriodStats(
                    propertyId,
                    token,
                    this._formatDate(previousMonth.start),
                    this._formatDate(previousMonth.end)
                );
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

    _formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    _getIsoWeekStart(date) {
        const start = new Date(date);
        const dayOfWeek = start.getDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        start.setDate(start.getDate() - daysToMonday);
        start.setHours(0, 0, 0, 0);
        return start;
    }

    _getMonthStart(date) {
        const start = new Date(date.getFullYear(), date.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        return start;
    }

    _getPreviousDay(date) {
        const previous = new Date(date);
        previous.setDate(previous.getDate() - 1);
        previous.setHours(0, 0, 0, 0);
        return previous;
    }

    _getPreviousIsoWeekRange(date) {
        const currentWeekStart = this._getIsoWeekStart(date);
        const start = new Date(currentWeekStart);
        start.setDate(start.getDate() - 7);
        start.setHours(0, 0, 0, 0);

        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        end.setHours(23, 59, 59, 999);

        return {start, end};
    }

    _getPreviousMonthRange(date) {
        const start = new Date(date.getFullYear(), date.getMonth() - 1, 1);
        start.setHours(0, 0, 0, 0);

        const end = new Date(date.getFullYear(), date.getMonth(), 0);
        end.setHours(23, 59, 59, 999);

        return {start, end};
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
            // Convert escaped newlines to actual newlines
            const privateKeyFixed = privateKeyPem.replace(/\\n/g, '\n');

            // In-memory signing via pipe + openssl
            let pipeFds = null;
            try {
                pipeFds = GLibUnix.open_pipe(0, null);
            } catch (e) {
                pipeFds = null;
            }

            if (pipeFds) {
                const [readFd, writeFd] = pipeFds;

                const keyStream = new Gio.UnixOutputStream({fd: writeFd, close_fd: true});
                const keyBytes = new TextEncoder().encode(privateKeyFixed);
                keyStream.write_all(keyBytes, null);
                keyStream.close(null);

                const launcher = new Gio.SubprocessLauncher({
                    flags: Gio.SubprocessFlags.STDIN_PIPE |
                        Gio.SubprocessFlags.STDOUT_PIPE |
                        Gio.SubprocessFlags.STDERR_PIPE,
                });
                launcher.take_fd(readFd, 3);

                const proc = launcher.spawnv([
                    'openssl',
                    'dgst',
                    '-sha256',
                    '-sign',
                    '/proc/self/fd/3',
                    '-binary',
                ]);

                const dataBytes = new TextEncoder().encode(data);
                const [ok, stdout, stderr] = proc.communicate(new GLib.Bytes(dataBytes), null);
                const exitStatus = proc.get_exit_status();

                if (!ok || exitStatus !== 0) {
                    const errText = stderr ? new TextDecoder().decode(stderr.get_data()) : '';
                    this._logger.error(`OpenSSL signing failed: ${errText}`);
                    return null;
                }

                const outBytes = stdout ? new Uint8Array(stdout.get_data()) : null;
                if (!outBytes || outBytes.length === 0) {
                    this._logger.error('OpenSSL signing failed: empty signature');
                    return null;
                }

                return this._base64UrlEncodeBytes(outBytes);
            }

            // Fallback to temp files if pipes are unavailable
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

            if (intervalMinutes > maxRealtimeMinutes) {
                this._logger.debug(`Live window capped to last ${maxRealtimeMinutes} minutes`);
            }

            const requestBody = {
                metrics: [
                    { name: 'activeUsers' }
                ],
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

            const minutesLabel = intervalMinutes < 60
                ? `${intervalMinutes}m`
                : `${intervalMinutes / 60}h`;

            const totalValue = response.totals?.[0]?.metricValues?.[0]?.value;
            if (totalValue !== undefined) {
                const total = parseInt(totalValue);
                this._logger.debug(`Live active users for last ${minutesLabel}: ${total}`);
                return total;
            }

            if (response.rows && response.rows.length > 0) {
                const value = response.rows[0].metricValues?.[0]?.value;
                if (value !== undefined) {
                    const total = parseInt(value);
                    this._logger.debug(`Live active users for last ${minutesLabel}: ${total}`);
                    return total;
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
