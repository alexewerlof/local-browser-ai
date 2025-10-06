import { describe, it } from 'node:test';
import assert from 'node:assert';
import { _getAverageSpeed, Estimator } from './estimator.js';

describe('_getAverageSpeed()', () => {
    it('should throw a TypeError if the input is not an array', () => {
        assert.throws(() => _getAverageSpeed('not an array'), {
            name: 'TypeError',
            message: 'Expected an array. Got not an array (string)'
        });
        assert.throws(() => _getAverageSpeed(null), TypeError, "Should throw for null");
        assert.throws(() => _getAverageSpeed(undefined), TypeError, "Should throw for undefined");
        assert.throws(() => _getAverageSpeed(123), TypeError, "Should throw for a number");
        assert.throws(() => _getAverageSpeed({}), TypeError, "Should throw for an object");
    });

    it('should throw a TypeError if the input has less than 2 elements', () => {
        assert.throws(() => _getAverageSpeed([]), {
            name: 'Error',
            message: 'Not enough data points to calculate speed.'
        });
        const dataPoint1 = { progress: 0, timestamp: 10 };
        assert.throws(() => _getAverageSpeed([dataPoint1]), {
            name: 'Error',
            message: 'Not enough data points to calculate speed.'
        });
    });

    it('should calculate average speed', () => {
        const dp = (timestamp, progress) => ({ timestamp, progress })

        const data = [
            dp(1000, 0),
            dp(2000, 0.25),
            dp(3000, 0.5),
            // Follows by:
            // dp(4000, 0.75),
            // dp(5000, 1),
        ]

        assert.strictEqual(_getAverageSpeed(data), 0.25/1000);
    });
});

describe('Estimator', () => {
    it('should throw if invalid data is being pushed', () => {
        const estimator = new Estimator();
        assert.throws(() => estimator.report('1'), {
            name: 'TypeError',
            message: 'Expected a finite number for progress. Got 1 (string)'
        });
        assert.throws(() => estimator.report(100), {
            name: 'RangeError',
            message: 'Progress (100) must be between 0 and 1 (inclusive)'
        });
    });

    it('should calculate remaining time correctly', () => {
        const estimator = new Estimator();
        estimator.report(0, 1000);
        estimator.report(0.25, 2000);
        estimator.report(0.5, 3000);

        assert.strictEqual(estimator.remaining, 2000);
    });
});
