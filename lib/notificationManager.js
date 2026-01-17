import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

export class NotificationManager {
    constructor(logger) {
        this._logger = logger;
        this._lastNotificationTime = {};
        this._notificationCooldown = 60 * 60 * 1000; // 1 hour in milliseconds
    }

    notifyNewRecord(period, currentCount, previousRecord, previousDate) {
        const now = Date.now();
        const lastTime = this._lastNotificationTime[period] || 0;

        if (now - lastTime < this._notificationCooldown) {
            this._logger.debug(`Notification throttled for ${period} (last sent ${Math.floor((now - lastTime) / 1000)}s ago)`);
            return;
        }

        const emoji = Math.random() > 0.5 ? '🎉' : '🥳';
        const timeAgo = this._formatTimeAgo(previousDate);
        
        const title = `${emoji} New ${this._capitalizeFirst(period)} Peak!`;
        const message = `Congrats! You have ${currentCount} visitors. ${emoji}\nYou took over last peak of ${previousRecord} that was ${timeAgo}.`;

        this._sendNotification(title, message);
        this._lastNotificationTime[period] = now;
        
        this._logger.info(`New ${period} peak notification sent: ${currentCount} (previous: ${previousRecord})`);
    }

    _sendNotification(title, message) {
        const source = new MessageTray.Source({
            title: 'GASP',
            iconName: 'dialog-information'
        });
        Main.messageTray.add(source);

        const notification = new MessageTray.Notification({
            source: source,
            title: title,
            body: message
        });
        notification.setTransient(false);
        source.addNotification(notification);
    }

    _formatTimeAgo(dateString) {
        if (!dateString) {
            return 'some time ago';
        }

        try {
            const then = new Date(dateString);
            const now = new Date();
            const diffMs = now - then;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const diffWeeks = Math.floor(diffDays / 7);
            const diffMonths = Math.floor(diffDays / 30);

            if (diffDays === 0) {
                return 'earlier today';
            } else if (diffDays === 1) {
                return 'yesterday';
            } else if (diffDays < 7) {
                return `${diffDays} days ago`;
            } else if (diffWeeks === 1) {
                return '1 week ago';
            } else if (diffWeeks < 4) {
                return `${diffWeeks} weeks ago`;
            } else if (diffMonths === 1) {
                return '1 month ago';
            } else {
                return `${diffMonths} months ago`;
            }
        } catch (e) {
            this._logger.error('Error formatting time ago:', e);
            return 'some time ago';
        }
    }

    _capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    destroy() {
        this._lastNotificationTime = {};
    }
}
