# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [2.25.0] - 2021-09-14
### Added
- Using "esModuleInterop": true, changed all import statements
- Configured Jest for unit tests
- Written Unit tests for utils, logger and commands_handler

## [2.24.0] - 2021-08-24
### Added
- Creating separate socket connection per repo in buffer handler

## [2.23.0] - 2021-08-23
(Cannot unpublish a specific version)

## [2.22.0] - 2021-08-23
### Added
- Optimised walk.walker by adding filter to skip specific repos

## [2.21.0] - 2021-08-13
### Added
- View File Playback on CodeSync option added in right click menu

## [2.20.0] - 2021-08-13
### Added
- Updated status bar msg if repo is not connected. Clicking on it triggers Init process
- Applied limit on retry putLogEvent
- Non-IDE events i.e. file create/updated/deleted are now part of daemon

## [2.19.0] - 2021-08-07
### Added
- Option to Unsync the repo

## [2.18.0] - 2021-08-05
### Added
- Logout and connect to some other account

## [2.17.0] - 2021-07-31
### Added
- onSave listener added to .syncignore file to continue init process

## [2.16.0] - 2021-07-30
### Fixed
- Fixed fluctuating status bar messages

## [2.15.0] - 2021-07-29
### Added
- Status bar messages from daemon for sending diffs, service down, auth failed etc 
- Auth Flow with server based redirection

## [2.14.0] - 2021-07-27
### Added
- Couple improvements
- Ask To Login if token is invalid in following cases:
	- If is syncing branch
	- Sending diffs

## [2.13.0] - 2021-07-26
### Added
- View added if no repo is opened

## [2.12.0] - 2021-07-19
### Added
- Button added in notifications to Track your repo (Playback)

## [2.11.0] - 2021-07-16
### Changed
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
