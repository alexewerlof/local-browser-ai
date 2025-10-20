/**
 * Creates a debounced function that delays invoking `func` until after `wait`
 * milliseconds have elapsed since the last time the debounced function was
 * invoked. This version is async-aware: it will not trigger a new call if a
 * previous async `func` has not yet resolved. If the debounced function is
 * called while `func` is executing, it will re-trigger `func` after the
 * current execution finishes and the `wait` period elapses.
 *
 * @param {Function} func The async function to debounce.
 * @param {number} wait The number of milliseconds to delay.
 * @returns {Function} Returns the new debounced function.
 */
export function debounce(func, wait) {
    let timeout
    let isExecuting = false
    let pendingCall = false

    const run = async () => {
        try {
            isExecuting = true
            await func()
        } catch (e) {
            console.error(e)
        }
        isExecuting = false
        if (pendingCall) {
            pendingCall = false
            timeout = setTimeout(run, wait)
        }
    }

    return function debouncedFunction() {
        clearTimeout(timeout)
        pendingCall = true
        if (!isExecuting) {
            timeout = setTimeout(run, wait)
        }
    }
}
