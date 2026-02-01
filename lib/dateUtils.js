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

export function isDateInCurrentPeriod(dateString, period, now) {
    if (!dateString) {
        return false;
    }

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
        return false;
    }

    const periodStart = getPeriodStart(now, period);
    const nextStart = getNextPeriodStart(periodStart, period);
    return date >= periodStart && date < nextStart;
}
