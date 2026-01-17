import Soup from 'gi://Soup';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

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
    }

    async fetchStats() {
        const serviceAccountJson = this._settings.get_string('ga-api-key');
        const propertyId = this._settings.get_string('ga-property-id');
        
        if (!serviceAccountJson || !propertyId) {
            this._logger.info('API credentials not configured - returning zeros');
            return { daily: 0, weekly: 0, monthly: 0 };
        }
        
        try {
            this._logger.debug('Fetching stats from Google Analytics API');
            
            // Get access token
            const token = await this._getAccessToken();
            if (!token) {
                this._logger.error('Failed to obtain access token - check credentials');
                return { daily: 0, weekly: 0, monthly: 0 };
            }
            
            // Fetch stats for different time periods in parallel
            const [dailyStats, weeklyStats, monthlyStats] = await Promise.all([
                this._fetchPeriodStats(propertyId, token, 'today', 'today'),
                this._fetchPeriodStats(propertyId, token, '7daysAgo', 'today'),
                this._fetchPeriodStats(propertyId, token, '30daysAgo', 'today')
            ]);
            
            if (dailyStats === null || weeklyStats === null || monthlyStats === null) {
                this._logger.error('Failed to fetch stats from API');
                return { daily: 0, weekly: 0, monthly: 0 };
            }
            
            return {
                daily: dailyStats,
                weekly: weeklyStats,
                monthly: monthlyStats
            };
            
        } catch (e) {
            this._logger.error('Error fetching stats from GA:', e);
            return { daily: 0, weekly: 0, monthly: 0 };
        }
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
        let serviceAccountJson = this._settings.get_string('ga-api-key');
        
        // Check if it's a simple API key (starts with AIza)
        if (serviceAccountJson.startsWith('AIza')) {
            this._logger.info('API Key detected, but Google Analytics Data API requires Service Account credentials');
            this._logger.info('API keys are not supported by Google Analytics Data API');
            this._logger.info('Please use Service Account JSON credentials instead');
            return null;
        }
        
        // Check if we have a valid cached token
        if (this._accessToken && this._tokenExpiry && Date.now() < this._tokenExpiry) {
            this._logger.debug('Using cached access token');
            return this._accessToken;
        }
        
        try {
            // Check if it's base64 encoded (to avoid gsettings escaping issues)
            if (serviceAccountJson.startsWith('BASE64:')) {
                this._logger.debug('Decoding base64-encoded credentials');
                const base64Data = serviceAccountJson.substring(7); // Remove 'BASE64:' prefix
                const decoded = GLib.base64_decode(base64Data);
                const decoder = new TextDecoder('utf-8');
                serviceAccountJson = decoder.decode(decoded);
            } else {
                // Try to handle gsettings escaping
                serviceAccountJson = serviceAccountJson
                    .replace(/\\\\n/g, '\\n')
                    .replace(/\\\\"/g, '\\"');
            }
            
            const credentials = JSON.parse(serviceAccountJson);
            
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
            
            // Use openssl command to sign
            const tempDir = GLib.get_tmp_dir();
            const keyFile = `${tempDir}/gasp_key_${Date.now()}.pem`;
            const dataFile = `${tempDir}/gasp_data_${Date.now()}.txt`;
            const sigFile = `${tempDir}/gasp_sig_${Date.now()}.bin`;

            // Write key and data to temp files
            GLib.file_set_contents(keyFile, privateKeyFixed);
            GLib.file_set_contents(dataFile, data);

            // Sign using openssl
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

            // Read signature
            const [sigSuccess, sigData] = GLib.file_get_contents(sigFile);
            if (!sigSuccess) {
                this._logger.error('Failed to read signature file');
                this._cleanupTempFiles([keyFile, dataFile, sigFile]);
                return null;
            }

            // Base64url encode signature
            const sigBytes = new Uint8Array(sigData);
            const signature = this._base64UrlEncodeBytes(sigBytes);

            // Cleanup
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
