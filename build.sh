#!/bin/bash

# Build with esbuild
yarn esbuild

# Copy static files
cp -r src/server/static dist/

# Copy GCP service account key to dist (if needed)
cp gcp-key.json dist/