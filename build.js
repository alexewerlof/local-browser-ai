import fs from 'node:fs';
import archiver from 'archiver';
import manifest from './manifest.json' with { type: 'json' };

// Read manifest to get name and version for the output filename.
const name = manifest.name.toLowerCase().replace(/\s+/g, '-');
const version = manifest.version;
const OUTPUT_FILENAME = `${name}-${version}.zip`;

// Define the files and directories to be included in the zip archive.
const FILES_TO_INCLUDE = [
    'manifest.json',
    'background.js',
    'side-panel.html',
    'side-panel.css',
    'side-panel.js',
    'privacy.txt',
];

const DIRS_TO_INCLUDE = [
    'util', // This will include all files inside the util directory
];

console.log(`Creating extension package: ${OUTPUT_FILENAME}`);

const output = fs.createWriteStream(OUTPUT_FILENAME);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
    console.log(`Package created successfully. Total size: ${archive.pointer()} bytes.`);
});

archive.on('error', (err) => { throw err; });
archive.pipe(output);

FILES_TO_INCLUDE.forEach(file => archive.file(file, { name: file }));
DIRS_TO_INCLUDE.forEach(dir => archive.directory(dir, dir, {
    globOptions: { ignore: ['**/*.test.js'] }
}));

archive.finalize();