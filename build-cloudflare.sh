#!/bin/bash
# Cloudflare Pages build script
# Fixes rollup optional dependency issue

set -e

echo "🔧 Installing rollup platform package..."
npm install --no-save --force @rollup/rollup-linux-x64-gnu || echo "⚠️ Warning: Platform package install had issues"

echo "📦 Building project..."
npm run build
