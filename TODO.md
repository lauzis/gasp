# TODO / Notes

## Simplification Work (completed 2026-01-29)

✅ **RecordTracker removed**
- Peak detection moved into `DataScheduler` with period rollover tracking.

✅ **JSON database removed**
- GSettings is now the single source of truth.
- Period tracking via `last-period-{daily,weekly,monthly}`.

✅ **Period logic simplified**
- Period boundaries handled with simple timestamp comparisons.

✅ **Dual state eliminated**
- No file I/O for stats; all records live in GSettings.

## Recent Feature Additions (2026-01-29)

- Live metric (Realtime API, last refresh-window minutes, capped at 30m)
- Icon size setting for panel + menu icons
- Refresh interval now supports 30 minutes (stored in minutes)
- Calendar week/month queries for GA

## Open Items / Ideas

- Consider adding Live peak notifications (currently tracked but not notified).
- Consider a Realtime vs. standard live toggle (last 30m vs. refresh window).
