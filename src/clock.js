// src/clock.js

export const DAY_CYCLE_DURATION_MS = 240 * 1000; // 4 Minutes = 1 In-Game Day (24 Hours)

export const worldTime = {
    hour: 12,
    minute: 0,
    isNight: false,
    dayProgress: 0.5 // 0.0 = Midnight, 0.25 = 6am (Dawn), 0.5 = Noon, 0.83 = 8pm (Dusk)
};

/**
 * Mathematically derives in-game time from any timestamp in 0ms.
 */
export function computeWorldTime(timestamp = Date.now()) {
    const timeInDayMs = timestamp % DAY_CYCLE_DURATION_MS;
    const dayProgress = timeInDayMs / DAY_CYCLE_DURATION_MS;

    const totalMinutesInDay = dayProgress * 24 * 60;
    const hour = Math.floor(totalMinutesInDay / 60);
    const minute = Math.floor(totalMinutesInDay % 60);
    
    // Night is 8:00 PM (20:00) to 6:00 AM
    const isNight = (hour >= 20 || hour < 6);

    const pad = (n) => n < 10 ? '0' + n : n;
    const timeString = `${pad(hour)}:${pad(minute)}`;

    return {
        hour,
        minute,
        isNight,
        dayProgress,
        timeString
    };
}