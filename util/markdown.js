function processInline(text) {
    // Process inline elements: **bold**, *italic*, and `code`
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
}

export function md2html(md) {
    if (typeof md !== 'string') {
        throw new TypeError(`Expected a string. Got ${md} (${typeof md})`);
    }

    // A simple Markdown to HTML converter.
    // This is not a comprehensive or secure parser and is for demonstration purposes.
    // For production use, a robust library like 'marked' or 'showdown' is recommended.

    // Process paragraphs separated by double newlines
    const blocks = md.split('\n\n');
    let inList = false;
    let html = '';

    for (let i = 0; i < blocks.length; i++) {
        let processed = blocks[i].trim();
        if (!processed) continue;

        const isListItem = processed.startsWith('- ') || processed.startsWith('* ');

        if (isListItem) {
            if (!inList) {
                html += '<ul>';
                inList = true;
            }
            // Remove the bullet point, process inline markdown, and wrap in <li>
            const listItemContent = processInline(processed.substring(2).trim());
            html += `<li>${listItemContent}</li>`;
        } else {
            if (inList) {
                html += '</ul>';
                inList = false;
            }

            if (processed === '---') {
                html += '<hr>';
            } else {
                html += `<p>${processInline(processed)}</p>`;
            }
        }
    }

    if (inList) {
        html += '</ul>';
    }

    return html;
}