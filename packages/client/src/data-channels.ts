/**
 * Recommended `data` message channel for mission / scene JSON that mirrors a typical `/api/tracker`
 * snapshot. Servers send via {@link TexturaServer.broadcastData}; clients receive via `onData`.
 */
export const GEOM_DATA_CHANNEL_TRACKER_SNAPSHOT = 'geom.tracker.snapshot'
