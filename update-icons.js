import { join, dirname } from 'node:path'
import { promises as fs } from 'node:fs'

const VENDOR_DIR = 'vendor'
const ICON_FILE_NAME = 'icons.woff'
const ICON_FONT_REF_UNIX = [VENDOR_DIR, ICON_FILE_NAME].join('/')
const ICON_FONT_FILE = join(VENDOR_DIR, ICON_FILE_NAME)
const ICON_CSS_FILE = join(VENDOR_DIR, 'icons.css')

const ICON_NAMES = ['send', 'bolt', 'reset_wrench', 'stop', 'chat_add_on'].map((name) => name.toLowerCase()).sort()

async function main() {
    const url = new URL(
        'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200',
    )
    url.searchParams.set('icon_names', ICON_NAMES.join(','))
    console.log('Downloading font CSS from Google Fonts...')
    const response = await fetch(url, {
        headers: {
            // The user-agent is needed to get the woff2 file.
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
        },
    })
    if (!response.ok) {
        throw new Error(`Could not download the icon fonts: ${response.statusText}`)
    }
    let css = await response.text()

    const fontSrcUrlRegex = /src:\s*url\(([^\)\s]+)\)/
    const fontSrcUrlMatch = css.match(fontSrcUrlRegex)
    if (!fontSrcUrlMatch) {
        throw new Error('Could not find font URL in Google Fonts CSS response.')
    }

    const fontSrcUrl = fontSrcUrlMatch[1]
    console.log(`Downloading font file from ${fontSrcUrl}...`)

    const fontResponse = await fetch(fontSrcUrl)
    if (!fontResponse.ok) {
        throw new Error(`Could not download the font file: ${fontResponse.status}`)
    }

    const fontData = await fontResponse.arrayBuffer()
    await fs.mkdir(dirname(ICON_FONT_FILE), { recursive: true })
    await fs.writeFile(ICON_FONT_FILE, Buffer.from(fontData))
    console.log(`Saved font to ${ICON_FONT_FILE}`)

    css = css.replace(fontSrcUrlRegex, `src: url(${ICON_FILE_NAME})`)
    console.log(css)
    await fs.writeFile(ICON_CSS_FILE, css)
    console.log(`Saved CSS to ${ICON_CSS_FILE}`)
}

try {
    console.time('Font')
    await main()
    console.timeEnd('Font')
    console.log(`Updated font.`)
} catch (err) {
    console.error(err)
}
