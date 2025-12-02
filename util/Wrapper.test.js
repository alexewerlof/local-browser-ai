import { describe, it } from 'node:test'
import assert from 'node:assert'
import { pas2keb, keb2pas, keb2cam } from './Wrapper.js'

describe('pas2keb()', () => {
    it('throws for non-string input', () => {
        assert.throws(() => pas2keb(123), TypeError, 'Should throw for a number')
        assert.throws(() => pas2keb(true), TypeError, 'Should throw for a boolean')
        assert.throws(() => pas2keb(null), TypeError, 'Should throw for null')
        assert.throws(() => pas2keb(undefined), TypeError, 'Should throw for undefined')
    })

    it('converts PascalCase or camelCase to kebab-case', () => {
        assert.strictEqual(pas2keb('PascalCase'), 'pascal-case')
        assert.strictEqual(pas2keb('camelCase'), 'camel-case')
        assert.strictEqual(pas2keb('Hello'), 'hello')
    })

    it('handles consecutive uppercase letters', () => {
        assert.strictEqual(pas2keb('MyHTMLElement'), 'my-html-element')
        assert.strictEqual(pas2keb('isURL'), 'is-url')
        assert.strictEqual(pas2keb('isURLShortener'), 'is-url-shortener')
    })

    it('handles edge cases', () => {
        assert.strictEqual(pas2keb(''), '', 'Should handle empty string')
        assert.strictEqual(pas2keb('A'), 'a')
        assert.strictEqual(pas2keb('I'), 'i')
    })

    it('converts snake_case to kebab-case', () => {
        assert.strictEqual(pas2keb('snake_case'), 'snake-case')
        assert.strictEqual(pas2keb('Snake_Case'), 'snake-case')
    })
})

describe('keb2pas()', () => {
    it('throws for non-string input', () => {
        assert.throws(() => keb2pas(123), TypeError, 'Should throw for a number')
        assert.throws(() => keb2pas(true), TypeError, 'Should throw for a boolean')
        assert.throws(() => keb2pas(null), TypeError, 'Should throw for null')
        assert.throws(() => keb2pas(undefined), TypeError, 'Should throw for undefined')
    })

    it('converts kebab-case to PascalCase', () => {
        assert.strictEqual(keb2pas('kebab-case'), 'KebabCase')
        assert.strictEqual(keb2pas('a-b-c'), 'ABC')
        assert.strictEqual(keb2pas('single'), 'Single')
        assert.strictEqual(keb2pas('a'), 'A')
    })

    it('handles edge cases correctly', () => {
        assert.strictEqual(keb2pas(''), '', 'Should handle empty string')
        assert.strictEqual(keb2pas('foo--bar'), 'FooBar', 'Should handle multiple hyphens')
        assert.strictEqual(keb2pas('-foo-bar'), 'FooBar', 'Should handle leading hyphen')
        assert.strictEqual(keb2pas('foo-bar-'), 'FooBar', 'Should handle trailing hyphen')
    })

    it('does not convert other cases', () => {
        assert.strictEqual(keb2pas('camelCase'), 'CamelCase', 'Should only capitalize first letter for camelCase')
        assert.strictEqual(keb2pas('snake_case'), 'Snake_case', 'Should not convert snake_case')
    })
})

describe('keb2cam()', () => {
    it('throws for non-string input', () => {
        assert.throws(() => keb2cam(123), TypeError, 'Should throw for a number')
        assert.throws(() => keb2cam(true), TypeError, 'Should throw for a boolean')
        assert.throws(() => keb2cam(null), TypeError, 'Should throw for null')
        assert.throws(() => keb2cam(undefined), TypeError, 'Should throw for undefined')
    })

    it('converts kebab-case to camelCase', () => {
        assert.strictEqual(keb2cam('kebab-case'), 'kebabCase')
        assert.strictEqual(keb2cam('a-b-c'), 'aBC')
        assert.strictEqual(keb2cam('background-color'), 'backgroundColor')
    })

    it('handles edge cases correctly', () => {
        assert.strictEqual(keb2cam(''), '', 'Should handle empty string')
        assert.strictEqual(keb2cam('single'), 'single', 'Should handle a single word')
        assert.strictEqual(keb2cam('-foo-bar'), 'fooBar', 'Should handle leading hyphen')
        assert.strictEqual(keb2cam('baz-quux-'), 'bazQuux', 'Should handle trailing hyphen')
        assert.strictEqual(keb2cam('car--tux'), 'carTux', 'Should handle multiple hyphens')
    })

    it('does not convert other cases', () => {
        assert.strictEqual(keb2cam('camelCase'), 'camelCase', 'Should not change camelCase')
        assert.strictEqual(keb2cam('snake_case'), 'snake_case', 'Should not convert snake_case')
    })
})
