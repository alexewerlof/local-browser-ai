/**
 * Formats a duration in milliseconds into a human-readable, localized string.
 * @param {number} milliseconds The duration in milliseconds.
 * @param {string} [locale] The locale to use for formatting. Defaults to the user's browser locale.
 * @param {Intl.DurationFormatOptions} [options] Options for the formatter.
 * @returns {string} The formatted duration string.
 */
export function formatDuration(milliseconds, locale, options = { style: 'long' }) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
        return ''; // Return empty for invalid input
    }

    // Intl.DurationFormat expects an object with duration parts.
    const totalSeconds = Math.round(milliseconds / 1000);

    const duration = {
        hours: Math.floor(totalSeconds / 3600),
        minutes: Math.floor((totalSeconds % 3600) / 60),
        seconds: totalSeconds % 60,
    };

    try {
        // Intl.DurationFormat is available in modern browsers, which is a safe
        // assumption for an extension using the new Prompt API.
        const formatter = new Intl.DurationFormat(locale, options);
        return formatter.format(duration);
    } catch (e) {
        // A simple fallback for environments where Intl.DurationFormat might not be supported.
        console.error("Intl.DurationFormat failed:", e);
        return `${duration.hours}h ${duration.minutes}m ${duration.seconds}s`;
    }
}
