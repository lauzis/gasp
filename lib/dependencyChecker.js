import GLib from 'gi://GLib';
import {isKeyringAvailable} from './credentialStore.js';

export function hasOpenSSL() {
    return Boolean(GLib.find_program_in_path('openssl'));
}

export function getDependencyStatus() {
    if (!hasOpenSSL()) {
        return {
            ok: false,
            message: 'OpenSSL not found in PATH (required for Service Account auth)',
        };
    }

    return {
        ok: true,
        message: 'All required dependencies are available',
    };
}

export function getDependencyStatusList() {
    return [
        {
            name: 'OpenSSL',
            ok: hasOpenSSL(),
            message: hasOpenSSL()
                ? 'Available'
                : 'Not found in PATH',
        },
        {
            name: 'Keyring',
            ok: isKeyringAvailable(),
            message: isKeyringAvailable()
                ? 'Available'
                : 'Not available',
        },
    ];
}
