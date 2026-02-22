/**
 * Date utility functions for period calculations.
 * Shared across multiple modules to maintain DRY principle.
 */

export function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateParts({year, month, day}) {
    const monthStr = String(month).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    return `${year}-${monthStr}-${dayStr}`;
}

function getDateParts(date, timeZone = null) {
    if (!timeZone) {
        return {
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            day: date.getDate(),
        };
    }

    try {
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });

        const parts = formatter.formatToParts(date);
        let year = null;
        let month = null;
        let day = null;

        for (const part of parts) {
            if (part.type === 'year') {
                year = parseInt(part.value, 10);
            } else if (part.type === 'month') {
                month = parseInt(part.value, 10);
            } else if (part.type === 'day') {
                day = parseInt(part.value, 10);
            }
        }

        if (year && month && day) {
            return {year, month, day};
        }
    } catch {
        // Fall back to local time if timezone parsing fails.
    }

    return {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
    };
}

function partsToUtcDate(parts) {
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function utcDateToParts(date) {
    return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
    };
}

function addDaysToParts(parts, dayDelta) {
    const utcDate = partsToUtcDate(parts);
    utcDate.setUTCDate(utcDate.getUTCDate() + dayDelta);
    return utcDateToParts(utcDate);
}

function getIsoWeekStartParts(parts) {
    const utcDate = partsToUtcDate(parts);
    const dayOfWeek = utcDate.getUTCDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    utcDate.setUTCDate(utcDate.getUTCDate() - daysToMonday);
    return utcDateToParts(utcDate);
}

function getMonthStartParts(parts) {
    return {
        year: parts.year,
        month: parts.month,
        day: 1,
    };
}

export function getDateString(date, timeZone = null) {
    return formatDateParts(getDateParts(date, timeZone));
}

export function getIsoWeekStartDateString(date, timeZone = null) {
    const parts = getDateParts(date, timeZone);
    return formatDateParts(getIsoWeekStartParts(parts));
}

export function getMonthStartDateString(date, timeZone = null) {
    const parts = getDateParts(date, timeZone);
    return formatDateParts(getMonthStartParts(parts));
}

export function getPreviousDayDateString(date, timeZone = null) {
    const parts = getDateParts(date, timeZone);
    return formatDateParts(addDaysToParts(parts, -1));
}

export function getPreviousIsoWeekRangeDateStrings(date, timeZone = null) {
    const parts = getDateParts(date, timeZone);
    const currentWeekStart = getIsoWeekStartParts(parts);
    const start = addDaysToParts(currentWeekStart, -7);
    const end = addDaysToParts(start, 6);
    return {
        start: formatDateParts(start),
        end: formatDateParts(end),
    };
}

export function getPreviousMonthRangeDateStrings(date, timeZone = null) {
    const parts = getDateParts(date, timeZone);
    const startUtc = new Date(Date.UTC(parts.year, parts.month - 2, 1));
    const endUtc = new Date(Date.UTC(parts.year, parts.month - 1, 0));

    return {
        start: formatDateParts(utcDateToParts(startUtc)),
        end: formatDateParts(utcDateToParts(endUtc)),
    };
}

export function getIsoWeekStart(date) {
    const start = new Date(date);
    const dayOfWeek = start.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    start.setDate(start.getDate() - daysToMonday);
    start.setHours(0, 0, 0, 0);
    return start;
}

export function getMonthStart(date) {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    start.setHours(0, 0, 0, 0);
    return start;
}

export function getPreviousDay(date) {
    const previous = new Date(date);
    previous.setDate(previous.getDate() - 1);
    previous.setHours(0, 0, 0, 0);
    return previous;
}

export function getPreviousIsoWeekRange(date) {
    const currentWeekStart = getIsoWeekStart(date);
    const start = new Date(currentWeekStart);
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return {start, end};
}

export function getPreviousMonthRange(date) {
    const start = new Date(date.getFullYear(), date.getMonth() - 1, 1);
    start.setHours(0, 0, 0, 0);

    const end = new Date(date.getFullYear(), date.getMonth(), 0);
    end.setHours(23, 59, 59, 999);

    return {start, end};
}

export function getPeriodKey(now, period, timeZone = null) {
    if (period === 'daily') {
        return getDateString(now, timeZone);
    }

    if (period === 'weekly') {
        return getIsoWeekStartDateString(now, timeZone);
    }

    if (period === 'monthly') {
        const parts = getDateParts(now, timeZone);
        return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
    }

    return getDateString(now, timeZone);
}

export function getPreviousPeriodReferenceDateString(now, period, timeZone = null) {
    if (period === 'daily') {
        return getPreviousDayDateString(now, timeZone);
    }

    if (period === 'weekly') {
        const previousWeek = getPreviousIsoWeekRangeDateStrings(now, timeZone);
        return previousWeek.start;
    }

    if (period === 'monthly') {
        const previousMonth = getPreviousMonthRangeDateStrings(now, timeZone);
        return previousMonth.start;
    }

    return getDateString(now, timeZone);
}

export function getPeriodStart(now, period) {
    if (period === 'daily') {
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        return start;
    }

    if (period === 'weekly') {
        return getIsoWeekStart(now);
    }

    if (period === 'monthly') {
        return getMonthStart(now);
    }

    return new Date(now);
}

export function getNextPeriodStart(periodStart, period) {
    const next = new Date(periodStart);
    if (period === 'daily') {
        next.setDate(next.getDate() + 1);
        return next;
    }

    if (period === 'weekly') {
        next.setDate(next.getDate() + 7);
        return next;
    }

    if (period === 'monthly') {
        next.setMonth(next.getMonth() + 1, 1);
        next.setHours(0, 0, 0, 0);
        return next;
    }

    return next;
}

export function isDateInCurrentPeriod(dateString, period, now, timeZone = null) {
    if (!dateString) {
        return false;
    }

    const currentPeriodKey = getPeriodKey(now, period, timeZone);

    // Handle date-only values without JS UTC parsing side effects.
    const dayOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
    const monthOnlyPattern = /^(\d{4})-(\d{2})$/;
    const dayMatch = dateString.match(dayOnlyPattern);
    if (dayMatch) {
        const year = parseInt(dayMatch[1], 10);
        const month = parseInt(dayMatch[2], 10);
        const day = parseInt(dayMatch[3], 10);

        if (period === 'daily') {
            return currentPeriodKey === formatDateParts({year, month, day});
        }

        if (period === 'weekly') {
            const weekStart = getIsoWeekStartParts({year, month, day});
            return currentPeriodKey === formatDateParts(weekStart);
        }

        if (period === 'monthly') {
            const monthKey = `${year}-${String(month).padStart(2, '0')}`;
            return currentPeriodKey === monthKey;
        }
    }

    const monthMatch = dateString.match(monthOnlyPattern);
    if (monthMatch && period === 'monthly') {
        const monthKey = `${monthMatch[1]}-${monthMatch[2]}`;
        return currentPeriodKey === monthKey;
    }

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
        return false;
    }
    const datePeriodKey = getPeriodKey(date, period, timeZone);
    return currentPeriodKey === datePeriodKey;
}
