export function getRefreshIntervalMinutes(settings) {
    const rawValue = settings.get_int('refresh-interval');
    if (rawValue >= 30) {
        return rawValue;
    }

    if (rawValue > 0) {
        const minutes = rawValue * 60;
        settings.set_int('refresh-interval', minutes);
        return minutes;
    }

    return 60;
}
