#!/usr/bin/env node

/**
 * OpenSourced Chrome Extension Packaging Script
 * Bundles apps/extension/dist into opensourced-extension.zip ready for GitHub Releases & testing.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const extensionDistDir = path.join(rootDir, 'apps', 'extension', 'dist');
const outputZip = path.join(rootDir, 'opensourced-extension.zip');

function packageExtension() {
  console.log('📦 Packaging OpenSourced Chrome Extension...');

  if (!fs.existsSync(extensionDistDir)) {
    console.error(`❌ Dist directory not found at: ${extensionDistDir}`);
    console.error('Run "npm run build" first before packaging.');
    process.exit(1);
  }

  const manifestPath = path.join(extensionDistDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`❌ manifest.json not found in ${extensionDistDir}. Build may have failed.`);
    process.exit(1);
  }

  // Remove existing zip if present
  if (fs.existsSync(outputZip)) {
    fs.unlinkSync(outputZip);
  }

  try {
    const isWindows = process.platform === 'win32';
    if (isWindows) {
      const psCommand = `powershell.exe -NoProfile -Command "Compress-Archive -Path '${extensionDistDir}\\*' -DestinationPath '${outputZip}' -Force"`;
      execSync(psCommand, { stdio: 'inherit' });
    } else {
      execSync(`cd "${extensionDistDir}" && zip -r "${outputZip}" .`, { stdio: 'inherit' });
    }

    const stats = fs.statSync(outputZip);
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`\n✅ Successfully generated: ${outputZip} (${sizeInMB} MB)`);
    console.log('🚀 Ready to attach to GitHub Releases or sideload in Chrome (chrome://extensions -> Load unpacked)!');
  } catch (error) {
    console.error('❌ Failed to create extension zip archive:', error.message);
    process.exit(1);
  }
}

packageExtension();

