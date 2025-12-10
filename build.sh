#!/bin/bash
# Build script for Vercel deployment
# Installs Node.js and Python dependencies, then builds the Next.js app

set -e

echo "Installing Node.js dependencies..."
npm install

echo "Installing Python dependencies..."
cd apps/workflow-py
pip3 install -r requirements.txt || echo "Warning: Python dependencies installation failed, continuing..."
cd ../..

echo "Building Next.js app..."
npm run build

echo "Build complete!"



