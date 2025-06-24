#!/bin/bash

# Build with esbuild
yarn esbuild

# Copy static files
cp -r src/server/static dist/
