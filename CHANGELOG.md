# Changelog

All notable changes to the Hadocommun Plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Support for multiple heading levels (H1, H2, etc.)
- Custom label templates
- Graph view style customization

## [1.0.0] - 2025-12-30

### Added
- Display H1 headings as graph node labels
- Toggle setting to enable/disable H1 display
- Metadata cache optimization for performance
- Test-Driven Development (TDD) infrastructure with Jest
- GraphLabelManager class for testable business logic
- Automatic label updates on graph view changes
- Immediate label switching when toggling settings

### Features
- Works with both global and local graph views
- Automatically updates on file changes
- Preserves original file name labels when disabled
- Uses metadata cache for fast H1 retrieval with file content fallback
- UTF-8 encoding support for Japanese and other languages

### Technical
- TypeScript + esbuild build system
- Jest test suite with 7 test cases
- Separation of business logic from Obsidian API dependencies
- Continuous integration ready

### Documentation
- Comprehensive development guide in Japanese and English
- TDD workflow documentation
- Release preparation guide
- Contributing guidelines
