import { describe, it } from 'node:test'
import assert from 'node:assert'
import { md2html } from './markdown.js'

describe('md2html()', () => {
    it('should throw a TypeError if the input is not a string', () => {
        assert.throws(() => md2html(123), TypeError, "Should throw for a number");
        assert.throws(() => md2html({}), TypeError, "Should throw for an object");
        assert.throws(() => md2html(null), TypeError, "Should throw for null");
        assert.throws(() => md2html(undefined), TypeError, "Should throw for undefined");
    });

    it('can parse paragraphs', () => {
        const input = [
            'first paragraph',
            'second paragraph',
        ].join('\n\n');
        const expected = [
            '<p>first paragraph</p>',
            '<p>second paragraph</p>',
        ].join('');
        assert.strictEqual(md2html(input), expected);
    });

    it('can detect bold, italic and code', () => {
        const input = 'This is **bold**, *italic*, and `code`';
        const expected = '<p>This is <strong>bold</strong>, <em>italic</em>, and <code>code</code></p>';
        assert.strictEqual(md2html(input), expected);
    })

    it('supports horizontal line elements', () => {
        const input = [
            'First paragraph',
            '---',
            'Second paragraph',
        ].join('\n\n');
        const expected = [
            '<p>First paragraph</p>',
            '<hr>',
            '<p>Second paragraph</p>',
        ].join('');

        assert.strictEqual(md2html(input), expected);
    })

    it('supports dash bullet points', () => {
        const input = [
            '- First item',
            '- Second item',
        ].join('\n\n');

        const expected = [
            '<ul>',
            '<li>First item</li>',
            '<li>Second item</li>',
            '</ul>',
        ].join('');

        assert.strictEqual(md2html(input), expected);
    })

    it('supports star bullet points', () => {
        const input = [
            '* First item',
            '* Second item',
        ].join('\n\n');

        const expected = [
            '<ul>',
            '<li>First item</li>',
            '<li>Second item</li>',
            '</ul>',
        ].join('');

        assert.strictEqual(md2html(input), expected);
    })

    it('supports mixed bullet points', () => {
        const input = [
            'Okay, here we go! *Prepare* **yourself**:',
            '',
            '*   **Why did the scarecrow win an award?**',
            '*   **Because he was outstanding in his field!** ',
            '*   **(Picture him beaming, surrounded by corn stalks... it\'s a *field* of dreams!)**',
            '',
            'How\'s that for a bit of silliness? 😉'
        ].join('\n\n');

        const expected = [
            '<p>Okay, here we go! <em>Prepare</em> <strong>yourself</strong>:</p>',
            '<ul>',
            '<li><strong>Why did the scarecrow win an award?</strong></li>',
            '<li><strong>Because he was outstanding in his field!</strong></li>',
            '<li><strong>(Picture him beaming, surrounded by corn stalks... it\'s a <em>field</em> of dreams!)</strong></li>',
            '</ul>',
            '<p>How\'s that for a bit of silliness? 😉</p>',
        ].join('');
        
        assert.strictEqual(md2html(input), expected);
    })

})