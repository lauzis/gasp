import Secret from 'gi://Secret';

const SECRET_SCHEMA = new Secret.Schema(
    'org.gnome.shell.extensions.gasp',
    Secret.SchemaFlags.NONE,
    {
        type: Secret.SchemaAttributeType.STRING,
    }
);

const SECRET_ATTRIBUTES = { type: 'ga-service-account' };

export function getCredentialStorageMode(settings) {
    const mode = settings.get_string('credential-storage');
    return mode === 'keyring' ? 'keyring' : 'gsettings';
}

export function parseStoredCredentials(jsonText) {
    const trimmed = jsonText.trim();
    if (!trimmed) {
        return null;
    }
    try {
        const parsed = JSON.parse(trimmed);
        if (!parsed.client_email || !parsed.private_key) {
            return null;
        }
        return {
            client_email: parsed.client_email,
            private_key: parsed.private_key,
        };
    } catch (e) {
        return null;
    }
}

export function buildCredentialJson(clientEmail, privateKey) {
    const email = clientEmail.trim();
    const key = privateKey.trim();
    if (!email || !key) {
        return '';
    }
    return JSON.stringify({
        client_email: email,
        private_key: key,
    });
}

export function getCredentialsFromSettings(settings) {
    const raw = settings.get_string('ga-api-key');
    return parseStoredCredentials(raw);
}

export function storeCredentialsInSettings(settings, clientEmail, privateKey) {
    const json = buildCredentialJson(clientEmail, privateKey);
    settings.set_string('ga-api-key', json);
}

export function clearCredentialsInSettings(settings) {
    settings.set_string('ga-api-key', '');
}

export function getCredentialsFromKeyring() {
    try {
        const secret = Secret.password_lookup_sync(
            SECRET_SCHEMA,
            SECRET_ATTRIBUTES,
            null
        );
        if (!secret) {
            return null;
        }
        return parseStoredCredentials(secret);
    } catch (e) {
        return null;
    }
}

export function storeCredentialsInKeyring(clientEmail, privateKey) {
    const json = buildCredentialJson(clientEmail, privateKey);
    if (!json) {
        clearCredentialsInKeyring();
        return;
    }
    try {
        Secret.password_store_sync(
            SECRET_SCHEMA,
            SECRET_ATTRIBUTES,
            Secret.COLLECTION_DEFAULT,
            'GASP Service Account',
            json,
            null
        );
    } catch (e) {
        throw e;
    }
}

export function clearCredentialsInKeyring() {
    try {
        Secret.password_clear_sync(
            SECRET_SCHEMA,
            SECRET_ATTRIBUTES,
            null
        );
    } catch (e) {
        // Ignore missing keyring service
    }
}

export function isKeyringAvailable() {
    try {
        return Secret.Service.get_sync(Secret.ServiceFlags.OPEN_SESSION, null) !== null;
    } catch (e) {
        return false;
    }
}

export function loadCredentials(settings) {
    const mode = getCredentialStorageMode(settings);
    if (mode === 'keyring') {
        return getCredentialsFromKeyring();
    }
    return getCredentialsFromSettings(settings);
}
