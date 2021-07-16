# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [2.11.0] - 2021-07-16
- Daemon now detects the branch change and syncs it if server is up, handled offline case as well

## [2.10.0] - 2021-07-15
### Fixed
- Fixed a syntax in upload repo

## [2.9.0] - 2021-07-15
### Added
- Init Flow, Should be able to connect a repo with CodeSync
- Views added in activiy bar to sign up, sync a repo and unsync a repo

### Changed
- Updated README

## [2.6.0] - 2021-06-23
### Fixed
- Removing diff file only if it exists

## [2.5.0] - 2021-06-23
### Added
- Defined 10 ports to be used for Auth Server

## [2.4.0] - 2021-06-23
### Added
- Running a server in IDE to redirect after Auth 
- Refactored code, dynamic redirectUri for SignUp process

## [2.3.0] - 2021-06-18
### Added
- Basic Auth Flow

### Fixed
- Checking lstat after making sure file exists and is synable

## [2.2.0] - 2021-06-15
### Fixed
- Fixed non-empty file upload to s3
- Fixed non-empty file upload, using File Watcher for pasted file

## [2.1.0] - 2021-06-12
### Fixed
- Fixed new-file-upload by returning configJSON

## [2.0.0] - 2021-06-08
### Added
- Daemon with basic functionality of checking server availability, validating and grouping diffs
- Diffs are being uploaded to server via websocket
- Docs added for handleBuffer, Fixed order of uploading diffs after authentication
- utils/buffer_utils.ts added
- is_dir_rename & is_rename diffs handled, using walk package for os.walk
- Implemented New File Upload to server & s3, new package added isbinaryfile
- put_log_events replicated using aws-sdk
- Directory delete handled

### Changed
- Common function added to manage diffs
- Cleaned buffer_handler.ts

### Fixed
- File Deleted Diffs managed by computing diff with shadow
- Corrected basePath for file delete event

## [1.5.0] - 2021-05-01
### Changed
- Updated README: removing period causing extra bullet point

## [1.4.0] - 2021-05-01
### Changed
- Updated README for more fun and better marketing

## [1.3.0] - 2021-04-30
### Changed
- Added images/icon

## [1.2.0] - 2021-04-30
### Changed
- Icon URL added in package.json

## [1.1.0] - 2021-04-08
### Changed
- README Updated

## [1.0.0] - 2021-04-03
### Added
- Handling events for File Create/Update/Rename/Delete
- Directory level diffs implemented 
- Skipping events if directory is not synced
- Ignoring .git repo to be synced for all events
- Directory rename has been handled
- Skipping directory events for New/Deleted events
- DirRename diff introduced to manage nested renames from daemon side

### Fixed
- Fixed duplication for FileDeleted events 
- Fixed lodash vulnerability mentioned by Dependabot alert of github
