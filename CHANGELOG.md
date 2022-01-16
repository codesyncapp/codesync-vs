# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.3.4] - 2022-01-16
### Added
- Using vscode.workspace.workspaceFolders instead of vscode.workspace.rootPath (deprecated)

## [3.3.3] - 2022-01-11
### Fixed
- Handling an error in splitting filePath to get relPath

## [3.3.2] - 2022-01-07
### Added
- Added error handles in VSCode API events
- Fixed recalling daemon upon an error

## [3.3.1] - 2022-01-04
### Added
- Logging e.stack

## [3.3.0] - 2022-01-04
### Added
- Logging added to debug async socket events

## [3.2.1] - 2021-12-17
### Added
- Logging extension version to CW

## [3.2.0] - 2021-12-16
### Added
- Points to v2 for uploading diffs
- Connects directly to socket instead of checking /healthcheck
- Auth is done via query params for socket connection

## [3.1.3] - 2021-12-13
### Added
- Diff created_at is set as soon as event is captured

## [3.1.2] - 2021-11-23
### Added
- Extension tags/keywords added

## [3.1.1] - 2021-11-16
### Added
- Extension category changed to SCM Providers

## [3.1.0] - 2021-11-11
### Added
- Removed jwt-decode package

## [3.0.3] - 2021-11-06
### Added
- Improved error logging while syncing repo

## [3.0.2] - 2021-11-04
### Added
- Disabling syncing changes when user is logged out

## [3.0.1] - 2021-10-24
### Updated
- Improved startup time by running populateBuffer asynchronously in activate()

## [3.0.0] - 2021-10-24
### Updated
- Refactored bufferHandler to diffsHandler, diffHandler, webSocketClient and webSocketEvents classes
- Added unit tests for above added classes

## [2.29.22] - 2021-10-22
### Updated
- Using random ports for Auth Server
- Updated events-tests to run in parallel with Daemon
- Sending IDE and Platform info to server for repo details and diffs.
- Using shadow mtime >= file mtime daemon for manipulating real time diffs

## [2.29.21] - 2021-10-21
### Fixed
- Build corrected

## [2.29.20] - 2021-10-21
### Fixed
- Fixed daemon for manipulating real time diffs

## [2.29.19] - 2021-10-14
### Fixed
- Fixes copy in delete event for windows

## [2.29.18] - 2021-10-13
### Fixed
- Fixes for rename to nested directory
- Renaming only if shadow exists
- fs.rmSync -> fs.unlinkSync

## [2.29.17] - 2021-10-13
### Added
- Added unit tests for detectBranchChange
- Refactored populateBuffer with event based approach
- Added tests for populateBuffer
- Simplified diff structure for rename event 
- Improved online/offline handling of rename

## [2.29.16] - 2021-10-07
### Changed
- Re ordered menu options

## [2.29.15] - 2021-10-06
### Changed
- Skipping InActive Editor's document

## [2.29.14] - 2021-10-06
### Fixed
- Fixed copyFilesTo from .shadow to .deleted for Windows

## [2.29.13] - 2021-10-06
### Changed
- initHandler class introduced
- Tests added for initHandler
- Fixed real time events for branch change

## [2.29.12] - 2021-10-03
### Changed
- eventHandler class introduced
- Improved shouldIgnoreFile

## [2.29.11] - 2021-09-31
### Changed
- Showing Welcome to CodeSync even if no repo is opened

## [2.29.10] - 2021-09-29
### Changed
- readYML returns null if files does not exists

## [2.29.9] - 2021-09-28
### Changed
- copyFilesTo reverted change for formatted Path

## [2.29.8] - 2021-09-28
### Changed
- copyFilesTo now uses Formatted repo path

## [2.29.7] - 2021-09-27
### Changed
- Removed UnSync from dialog,
- Updated private/public msg
- Skipping Update .syncignore step
### Added
- Normalizing file paths for windows

## [2.29.6] - 2021-09-27
### Changed
- Using --sourcemap instead of --minify in esbuild for easy debugging

## [2.29.5] - 2021-09-25
### Added
- Capitalizing drive name in windows path

## [2.29.4] - 2021-09-24
### Added
- Added a new test case saving IAM credentials

## [2.29.2] - 2021-09-24
### Added
- static/ added in dist

## [2.29.1] - 2021-09-24
### Added
- Correct build in dist/

## [2.29.0] - 2021-09-24
### Added
- Support for Windows

## [2.28.4] - 2021-09-21
### Added
- Tries to upload file first if file ID is not found in config

## [2.28.3] - 2021-09-21
### Fixed
- Fixed main script path for extension in package.json

## [2.28.2] - 2021-09-21
### Updated
- Fixed left panel Loading... when workspace is empty

## [2.28.1] - 2021-09-20
### Updated
- Using esbuild to bundle the extension

## [2.28.0] - 2021-09-20
### Changed
- Choosing first user account by default if there are multiple, not supporting multiple accounts for now

### Improved
- Notification msg updated from _Repo is in sync_ to _Repo XYZ is in sync_
- Refactored Express server using HTML/CSS for better UX
- Improved UX for asking if repo should be public or private
- Added Loading... view for left panel
- Menu options change on the fly

## [2.27.0] - 2021-09-14
### Fixed
- Fixed a bug in creating .syncignore from .gitignore
- Removed Clone Repository button from left panel
- Updated notification msg for .syncignore, removed Cancel button 
- Syncing everything if .syncignore is empty

## [2.26.0] - 2021-09-14
### Fixed
- Fixed CodeSync Left Panel if no editor is opened

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
