export function _getAverageSpeed(dataPoints) {
    if (!Array.isArray(dataPoints)) {
        throw new TypeError(`Expected an array. Got ${dataPoints} (${typeof dataPoints})`)
    }
    if (dataPoints.length < 2) {
        throw new Error('Not enough data points to calculate speed.')
    }

    const speeds = []

    for (let i = 1; i < dataPoints.length; i++) {
        const curr = dataPoints[i]
        const prev = dataPoints[i - 1]

        const deltaTimestamp = curr.timestamp - prev.timestamp
        const deltaProgress = curr.progress - prev.progress

        if (deltaTimestamp > 0 && deltaProgress >= 0) {
            speeds.push(deltaProgress / deltaTimestamp) // progress per millisecond
        }
    }

    if (speeds.length === 0) {
        throw new Error('Not enough meaningful speed data.')
    }

    const speedSum = speeds.reduce((acc, speed) => acc + speed, 0)

    return speedSum / speeds.length
}

export class Estimator {
    #dataPoints

    constructor() {
        this.reset()
    }

    get lastDataPoint() {
        return this.#dataPoints[this.#dataPoints.length - 1]
    }

    reset(timestamp = Date.now()) {
        this.#dataPoints = []
        this.report(0, timestamp)
        return this
    }

    report(progress, timestamp = Date.now()) {
        if (!Number.isFinite(progress)) {
            throw new TypeError(`Expected a finite number for progress. Got ${progress} (${typeof progress})`)
        }
        if (progress < 0 || progress > 1) {
            throw new RangeError(`Progress (${progress}) must be between 0 and 1 (inclusive)`)
        }
        if (!Number.isFinite(timestamp)) {
            throw new TypeError(`Expected a finite number for timestamp. Got ${timestamp} (${typeof timestamp})`)
        }
        if (timestamp < 0) {
            throw new RangeError(`timestamp (${timestamp}) cannot be negative`)
        }

        if (this.lastDataPoint && this.lastDataPoint.progress === progress) {
            this.#dataPoints.pop()
        }

        this.#dataPoints.push({ progress, timestamp })
        return this
    }

    get remaining() {
        if (this.#dataPoints.length < 2) {
            throw new Error('Not enough data points to calculate remaining time.')
        }

        const averageSpeed = _getAverageSpeed(this.#dataPoints)

        if (averageSpeed <= 0) {
            throw new Error('Current data does not indicate any progress.')
        }

        const { progress } = this.lastDataPoint
        if (progress === 1) {
            return 0
        }

        return (1 - progress) / averageSpeed
    }
}
