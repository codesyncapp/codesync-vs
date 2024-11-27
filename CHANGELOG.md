# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.4.0] - 2024-11-27
- Updated package description

## [4.3.0] - 2024-10-23
- Supporting onPrem customers
- Introducing on_prem_config.json that will point to OnPrem resources (Routes and URLs etc)

## [4.2.1] - 2024-10-01
- Added a fix for some tabs not being sent

## [4.2.0] - 2024-09-18
- README updated for AI-summaries

## [4.1.0] - 2024-08-15
- Added a button for `Request a demo`

## [4.0.0] - 2024-07-12
- Added a new feature of capturing tabs data 
- Initial tabs state is captured automatically on IDE opening
- In addition to that, tab state is recorded for tab switches & tabs opening/closing

## [3.47.0] - 2024-05-02
- Handling callbacks for Login/Logout from Web
- Added access_token validation in logout callback
- Reordered Left Menu Buttons

## [3.46.0] - 2024-04-22
- Fetching canAvailTrial from Subscription API

## [3.45.1] - 2024-04-15
- Using codesync.com for Logout

## [3.45.0] - 2024-04-03
- Using codesync.com for Auth instead of localhost browser
- Showing waiting for login confirmation... message while auth is in process
- Hiding above message if auth callback is not received within 5 minutes
- Updated Logout Logic to redirect back to Web Login
- Upon Logout, closing Websocket connection so that no further diffs are processed

## [3.44.1] - 2024-03-26
- Fixed Logout URL redirection

## [3.44.0] - 2024-03-22
- "Data Privacy" section added in the README.md
- Added G4A tags when user clicks Join/Login button

## [3.42.0] - 2024-02-21
- Refactored checkSubDir, keeping SubDir State in global, fixed Nested SubDir view for left panel
- Fixed a bug in showing Upgrade Plan button with unit tests

## [3.41.0] - 2024-02-20
- Packages Upgraded
- Stop generating diffs for the deactivated accounts
- Team Activity alert skips deactivated accounts
- Dropping a log when we reset the config file
- Updated messages for a disconnected repository in menus, left panel and notifications
- Repo based plan limits implemented, improved button text to upgrade pricing plans, removed pricing_lock file
- Skipping Diffs for the repository for which limit is reached. We try sending diffs after allowed wait time
- Added 15m delay in showing Upgrade Plan Notification per repo
- Added error handling if PrivateRepoCountLimit is reached
- Managing user from State to avoid read/write in user config file

## [3.38.0] - 2024-01-12
- Sending commit_hash for new files 

## [3.37.0] - 2024-01-08
- Reactivating account via Webapp's callback instead of using API

## [3.36.0] - 2023-12-30
- Updated README content

## [3.35.1] - 2023-12-28
- Fixed Login from Deactivated account if user is logged-out
- Removed usage of GET /users API
- Improved logic of exiting s3Uploader by saving filesBeingProcessed in State

## [3.35.0] - 2023-12-23
- Reactivate Account functionality added if user has deactivated the account from webapp
- Improved logic for s3Uploader

## [3.34.2] - 2023-12-14
- Getting commit hashes for populate-buffer for each repo

## [3.34.1] - 2023-12-14
- Fix for Window path

## [3.34.0] - 2023-12-14
- Sending commit_hashes along with diffs to the server

## [3.33.0] - 2023-11-04
- Minor tweaks in Login Success and Failed HTML files

## [3.31.0] - 2023-08-16
- s3Uploader introduced to manage repo, branch and file upload to s3
- If internet is down, it retries after 5 minutes
- Error Handling: If some chunk is failed to upload successfully somehow, 
    we save that chunk in a separate file to retry later by reducing chunk size
- Shows a spinner loader in status bar while branch is being uploaded to the server

## [3.30.1] - 2023-08-08
- Fixed passing AWS Config to CloudWatchLogsClient
- Fixed checking sub directory by checking if parent repo belongs to current user

## [3.30.0] - 2023-07-31
- Removed sequence_token.yml, aws-sdk v3 takes care of that now

## [3.29.0] - 2023-07-26
- Handling 400, 403, 404 status codes for file upload endpoint and deleting diff in this case

## [3.28.2] - 2023-07-24
- Upgraded couple packagxes, downgraded glob to 9.3.5 since tests are unable to run due to ESM changes
- If branch sync is in progress, not running populateBuffer, including detectBranchChange

## [3.28.1] - 2023-07-21
- Upgraded couple packagxes, downgraded glob to 9.3.5 since tests are unable to run due to ESM changes
- If branch sync is in progress, not running populateBuffer. Using branch sync timeout to be 5 minutes.

## [3.28.0] - 2023-06-22
- Force uploading file only if it was created at least 1 day ago
- Keep track when socket connect is established so that we can try reconnecting right away if it was established like half an hour ago

## [3.27.0] - 2023-06-19
- Force uploading files from populateBuffer if fileID is not found in config
- Deleting diff file from diffsBeingProcessed when a file is successfully uploaded

## [3.26.1] - 2023-06-16
- Updated .gif link in README for Repo Playback

## [3.26.0] - 2023-06-16
- Changed strategy to recall daemon, controlling through state variables

## [3.25.0] - 2023-06-15
- Using await glob instead of globSync in populateBuffer and init process. However it is still being used in eventHandler
- Using lock update time as 1000ms as default value was causing trouble if lock was checked before that time

## [3.24.0] - 2023-06-13
- Upgraded packages

## [3.23.0] - 2023-06-09
- Using globSync to read Diffs Repo instead of fs.readdirsync

## [3.22.5] - 2023-06-09
- Fixed a bug in deleting diff containing ignoreable path

## [3.22.4] - 2023-06-09
- Added logging to debug diffs not being sent

## [3.22.3] - 2023-06-02
- Fixed an edge case with Lock compromisation if onCompromised is called right after acquiring lock

## [3.22.2] - 2023-06-01
- Corrected command in package.json for "Disconnect parent repo"
- Fixed onCompromised callback

## [3.22.1] - 2023-06-01
- Added more logging if any lock is compromised

## [3.22.0] - 2023-06-01
- Using instance UUID to debug/verify if multiple instances are acquiring locks or same instance is running things multiple times
- Added logging when an instance acquires lock
- Added logging for populateBuffer for "Watching Repo" for debugging
- When lock is compromised, resetting the state variable

## [3.21.0] - 2023-05-22
- Using fs.unlink instead of fs.unlinkSync
- Running 1 instance of populateBuffer, waiting before previous iteration is completed
- Using .syncignore on system level to ignore default directories/files like .git, node_modules etc

## [3.20.2] - 2023-05-16
- Fixed skip patterns for Windows

## [3.20.1] - 2023-05-15
- Fixed glob patterns for Windows in reading a repo

## [3.20.0] - 2023-05-05
- Fixed duplicate sending of diffs in case diffs are not processed within 5s

## [3.19.2] - 2023-04-26
- Ignorning symlinks and other types. Only dealing with files in globSync
- Iterating only 1 repo in populateBuffer in one iteration
- For currently opened repo, waiting for 4 minutes and for other repos, waiting for 2 minutes to run populateBuffer
- try/catch added in populateBuffer so that it does not fail infinitely 

## [3.19.1] - 2023-04-19
- Upgraded few packages
- Skipping shadow files manually instead of using glob ignores
- Slowed down populateBuffer i.e. It now runs after 1 minute now instead of 5s

## [3.19.0] - 2023-04-19
- Upgraded node to v16.20.0
- Fixed a bug in showing _Diconnect Parent Repo_ button in left panel
- Optimized logic to checkForRename using [string-similarity](https://www.npmjs.com/package/string-similarity)
    - Earlier logic was taking ~15s for comparing text of files of ~50KB. With "string-similarity" it is in miliseconds
- Fixed a bug in getting `PotentialMatchingFiles` for rename
    - Earlier it was checking against every file of the repo. Now it considers only those files from shadow repo that possess following properties:
        - Shadow file should not be ignorable from .syncignore
        - Actual file is not present for the shadow file
        - Relative path of shadow file should be present in config file
        - Shadow file should not be a binary file since we are going to match the text of files
        - Shadow file should not be empty
    - Also getting `PotentialMatchingFiles` only once per repo instead of once per file
- Improved logic of ignoring a path from .syncignore
    - Using common function everywhere for "[ignores](https://www.npmjs.com/package/ignore)" which ignores path depending on content of .syncignore
    - Improved logic to ignore DEFAULT-SKIP-DIRECTORIES wherever they are present in the project e.g. `node_modules` etc
- Taking care of data size being sent to server, shouldn’t exceed 16MB
- Slowed down generateDiffForDeletedFiles() in populateBuffer as rename event takes some time and before that populateBuffer marks those files as deleted

## [3.18.0] - 2023-03-29
### Fixed
- Waiting before retrying socket connection if error occurs

## [3.17.3] - 2023-02-22
### Fixed
- Fixed query params for Login/Logout functionalities
- Using URL builder to generate Web URLs including GA4 params
- Fixed sync-repo-utils URLs

## [3.17.2] - 2023-02-15
### Fixed
- source=VSCODE&v=VERSION added in remaining 2 API requests
- Improved building URL using query params

## [3.17.1] - 2023-02-01
### Fixed
- Fixed a bug in hiding team-activity alert
- v=VERSION added in all API requests

## [3.17.0] - 2023-02-01
### Fixed
- Fixed an edge case of missing very first change in a file from bufferHandler
- bufferHandler updated to iterate new_files first before normal diffs

## [3.16.0] - 2023-01-30
### Updated
- Added source=vscode as query parameters in API calls

## [3.15.2] - 2023-01-27
### Updated
- Fixed a bug in reading alerts.yml with empty object

## [3.15.1] - 2023-01-25
### Updated
- Not running populateBuffer in first iteration to speed up extension startup
- Sending 50 diffs per iteration
- Using loading icon for Getting Ready

## [3.15.0] - 2023-01-04
### Updated
- Packages upgraded

## [3.14.1] - 2023-01-04
### Updated
- Picking random diff files from .diffs

## [3.14.0] - 2022-12-20
### Updated
- package.json and yarn.lock updated by dependabot

## [3.13.1] - 2022-12-09
### Updated
- Using DIFF_FILES_PER_ITERATION = 25 instead of 50

## [3.13.0] - 2022-12-01
### Added
- Show activity alert msg in the status bar if user does not click on the View Review Activity button
- Removing diff file if 404 is received from server during file upload
### Fixed
- Separate log messages for user/team activity

## [3.12.0] - 2022-11-28
### Added
- Upgrade Plan msg checks if user can avail trial period

## [3.11.0] - 2022-11-25
### Updated
- Updated npm packages to latest

## [3.10.0] - 2022-11-25
### Added
- Added GA4 Parameters to track stats for Web URLs

## [3.9.12] - 2022-11-19
### Updated
- README updated for Teams Collaboration 

## [3.9.11] - 2022-11-19
### Added
- Added another improvement in team-activity alert logic

## [3.9.10] - 2022-11-19
### Updated
- Added an improvement in team-activity alert logic

## [3.9.9] - 2022-11-15
### Added
- Different msgs for Reviewing Team Activity and User Activity

## [3.9.8] - 2022-10-21
### Fixed
- Handling null responses from the server
- Removing Lock file after plan is upgraded. Also updating status bar msg.

## [3.9.7] - 2022-10-12
### Fixed
- Fixed an errors from CW logs by rewriting config.yml if config.repos is undefined
- Logging response.text() in case response.json() breaks

## [3.9.6] - 2022-10-06
### Added
- Keeping track when team-activity was last checked, even when it had no activity data
- Recreating system-yml files if they have invalid data somehow
- Sending added_at from diffs in case of new files
- Removing diffs of non-synced branch if diff was created 5 days ago and plan limit is not reached. We want 
	to keep data in case plan limit is reached so that user can access it when plan is upgraded

## [3.9.5] - 2022-10-05
### Added
- Setting time when API request is sent to get team-activity to avoid multiple calls/notifications

## [3.9.4] - 2022-10-05
### Added
- Improved logic of showing team-activity-alert at any time of day if didn't open IDE around 4:30pm
- Keeping track of alert per user
### Fixed
- Fixed dependabot alerts

## [3.9.3] - 2022-10-03
### Fixed
- Fixed a bug in showing team-activity-alert
- If there is an error in getting team-activity, trying again after 5 minutes

## [3.9.2] - 2022-10-01
### Added
- Logging YAML error while reading file content

## [3.9.1] - 2022-10-01
### Added
- Fixed recalling daemon upon reaching plan limit

## [3.9.0] - 2022-09-27
### Added
- Common user added for sending logs before any Login
- Notify at 4:30PM if there's been a team-activity within past 24 hours

## [3.8.2] - 2022-09-06
### Updated
- Fixed showing pricing alert msg if non-synced repo is opened

## [3.8.1] - 2022-09-02
### Updated
- Intorduced different type of log messages

## [3.8.0] - 2022-09-01
### Updated
- Fixed multiple API calls for branch upload from daemon
- Handling server side Plan Limit errors upon repo/branch sync

## [3.6.3] - 2022-08-13
### Updated
- Using wss for secure websocket connection

## [3.6.2] - 2022-08-13
### Updated
- Server URL updated

## [3.6.1] - 2022-08-03
### Added
- Fixed a bug in left panel if user logouts/logs in for already connected repo

## [3.6.0] - 2022-08-03
### Added
- Notification alerts added if plan Limit is reached 
- Logging platform info to CW
- Improved menu options in left panel, right click menu

## [3.5.6] - 2022-07-13
## [3.5.5] - 2022-07-13
### Updated
- README updated for Orgs and Teams

## [3.5.4] - 2022-06-23
### Added
- Changed 2 tags, added Others in categoris
- Using proper-lockfile instead of lockfile now

## [3.5.3] - 2022-03-08
### Fixed
- Handled vscode.workspace.workspaceFolders case for undefine
- Removing Watcher for Pasted file, Daemon takes care of it

## [3.5.2] - 2022-02-15
### Fixed
- Force uploading file for rename-event if file_id is null in config
- Releasing locks synchronously in deactivate

## [3.5.1] - 2022-02-15
### Fixed
- Treating multiple socket connections from same user as separate channels to avoid duplicate prosessing of diffs

## [3.5.0] - 2022-02-14
### Added
- Locks introduced to avoid duplicate diffs send by multiple IDE instances
- Handled status bar msgs for above case, i.e. same msg should appear in all open instances

## [3.4.1] - 2022-02-02
### Added
- Improved logging of server errors

## [3.4.0] - 2022-01-27
### Added
- Checking if opened repo is a sub directory of already synced repo
- Different views and notification buttons for subDir and syncignored subDir
- Cannot treat sub directory as a separate repo

## [3.3.5] - 2022-01-16
### Added
- Using uri.fsPath instead of uri.path for WorkspaceFolder (For windows support)

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
- Improved shouldIgnorePath

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
- Removed Disconnect from dialog
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
- Option to Disconnect the repo

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
- Views added in activiy bar to sign up, sync a repo and disconnect a repo

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
