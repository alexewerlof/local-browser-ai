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
    'images',
];

console.log(`Creating extension package: ${OUTPUT_FILENAME}`);

async function createPackage() {
    const output = fs.createWriteStream(OUTPUT_FILENAME);
    const archive = archiver('zip', { zlib: { level: 9 } });

    // Handle errors on the output stream (the file system stream)
    output.on('error', (err) => {
        console.error(`Output stream error: ${err.message}`);
        throw err; // Re-throw to ensure the process exits with an error
    });

    output.on('close', () => {
        console.log(`Package created successfully. Total size: ${archive.pointer()} bytes.`);
    });

    archive.on('error', (err) => {
        console.error(`Archiver error: ${err.message}`);
        throw err;
    });
    archive.pipe(output);

    FILES_TO_INCLUDE.forEach(file => archive.file(file, { name: file }));
    DIRS_TO_INCLUDE.forEach(dir => archive.directory(dir, dir, {
        globOptions: { ignore: ['**/*.test.js'] }
    }));

    await archive.finalize();
}

createPackage();