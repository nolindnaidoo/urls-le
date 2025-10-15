# Changelog

All notable changes to URLs-LE will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.5] - 2025-10-15

### Changed

- **Documentation streamlined** - Reduced from 14 to 4 core docs (Architecture, Commands, I18N, Performance) for easier maintenance
- **Performance transparency** - Corrected inflated metrics to verified benchmarks (HTML: 8.3K+/sec, JSON: 8.9K+/sec) with real test environment
- **Language visibility** - Enhanced README to clearly show all 13 supported languages with flags and native names
- **Governance compliance** - Implemented FALSE_CLAIMS_GOVERNANCE and CHANGELOG_GOVERNANCE for accuracy and consistency

## [1.4.0] - 2025-10-10

### Added

- **13 language translations** - Full localization for German, Spanish, French, Indonesian, Italian, Japanese, Korean, Portuguese (Brazil), Russian, Ukrainian, Vietnamese, and Chinese (Simplified)
- **CSV streaming** - Process large CSV files without memory issues
- **Configuration presets** - Pre-configured settings for different use cases (minimal, balanced, comprehensive, performance)
- **Advanced sorting** - Sort URLs by domain, length, and type with interactive selection
- **Smart error handling** - User-friendly error messages with recovery suggestions

### Changed

- **Default behavior** - Results now open side-by-side by default for better workflow
- **Performance** - Improved extraction speed for large files
- **Help system** - Upgraded to interactive WebView with examples and troubleshooting

### Fixed

- Fixed memory leaks in service disposal
- Fixed TypeScript compilation errors
- Fixed inaccurate performance claims in documentation

## [1.2.1] - 2025-10-10

### Fixed

- **Command palette completeness** - Added missing dedupe and sort commands to command palette
- **User experience** - All post-processing commands now accessible via command palette

## [1.2.0] - 2025-10-14

### Added

- **4 new file formats** - Added support for .properties, .toml, .ini, and .xml files
- **Sample files** - Added example files for all new formats
- **Dependencies** - Added TOML and INI parsers for reliable extraction

### Changed

- **Activation events** - Extended to support new file types
- **Context menus** - Added support for new file extensions
- **Keywords** - Enhanced marketplace discoverability

## [1.1.0] - 2025-10-14

### Added

- **Deduplicate command** - Remove duplicate URLs while preserving order
- **Sort command** - Sort URLs with 5 interactive modes (alphabetical, domain, length)
- **Help command** - Comprehensive documentation and troubleshooting

### Changed

- **Command count** - Increased from 2 to 5 commands
- **Infrastructure** - Fixed activation events and command registry

## [1.0.6] - 2025-10-14

### Added

- **Help command** - Comprehensive help and troubleshooting documentation
- **Command palette entry** - "URLs-LE: Help & Troubleshooting" accessible from command palette

## [1.0.5] - 2025-10-14

### Fixed

- **VSCode compatibility** - Changed engine requirement from `^1.105.0` to `^1.70.0`

## [1.0.4] - 2025-10-14

### Fixed

- **Package security** - Excluded sample folder from VSIX package

## [1.0.3] - 2025-10-14

### Fixed

- **Notification settings** - Notifier now respects notificationsLevel setting
- **Memory leaks** - Fixed service disposal and subscription management
- **Configuration cleanup** - Removed unused config properties
- **Error handling** - Added cancellation token support and better error recovery

### Added

- **Complete i18n support** - Added 30+ runtime localization strings
- **Enhanced error messages** - Added localized error suggestions

## [1.0.2] - 2025-10-14

### Changed

- **Streamlined commands** - Simplified to 2 core commands: Extract URLs and Open Settings
- **Focus** - Removed validation, analysis, and help commands for production-ready v1.0

### Added

- **Sample files** - Added test files for HTML, Markdown, and JavaScript

## [1.0.1] - 2025-10-14

### Fixed

- **Duplicate extraction** - Fixed duplicate URL extraction in HTML, Markdown, and JavaScript parsers
- **Global deduplication** - Added global deduplication to prevent same URL from being extracted multiple times
- **Test stability** - Fixed failing tests and improved test reliability

## [1.0.0] - 2025-08-17

### Added

- **Multi-format support** - Extract URLs from HTML, CSS, JavaScript, TypeScript, JSON, YAML, and Markdown
- **One-command extraction** - `Ctrl+Alt+U` (`Cmd+Alt+U` on macOS) or Command Palette
- **Multiple access methods** - Context menu, status bar, Quick Fix (Code Actions)
- **Smart analysis** - Detailed reports on URL usage patterns and domain analysis
- **Safety guardrails** - Warnings for large files and operations
- **Internationalization** - Full localization support
- **Virtual workspace support** - Compatible with GitHub Codespaces, Gitpod
