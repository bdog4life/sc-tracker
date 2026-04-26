#!/usr/bin/env node
// Flips the PE subsystem byte from CONSOLE (3) to WINDOWS (2)
// so the bundled exe doesn't open a cmd window on launch.
const fs = require('fs');
const path = require('path');

const exePath = path.resolve(__dirname, '../dist/SCTrackerAgent.exe');
const buf = fs.readFileSync(exePath);

const peOffset = buf.readUInt32LE(0x3c);
const subsystemOffset = peOffset + 4 + 20 + 68; // PE sig + COFF header + optional header subsystem field

const current = buf.readUInt16LE(subsystemOffset);
if (current === 3) {
  buf.writeUInt16LE(2, subsystemOffset);
  fs.writeFileSync(exePath, buf);
  console.log('Subsystem patched: CONSOLE → WINDOWS (no cmd window)');
} else if (current === 2) {
  console.log('Already WINDOWS subsystem, nothing to do.');
} else {
  console.warn(`Unexpected subsystem value: ${current}, skipping.`);
}
