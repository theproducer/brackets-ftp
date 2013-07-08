brackets-ftp
============

FTP and SFTP integration for Adobe Brackets

Brackets FTP is an extension that brings extremely basic FTP/SFTP upload support to Adobe Brackets.
FTP support is provided by Brackets' Node.JS support via JSFTP (https://github.com/sergi/jsftp) and node-sftp (https://github.com/ajaxorg/node-sftp).

!! This extension has only been tested on OS X !!

Current Features
================
Brackets FTP currently only supports uploading changed files from the Brackets project working directory into a remote directory that is specified in settings, similar to Panic Coda and MacRabbit Espresso 2.  
It will overwrite any existing files, and will automatically create subfolders if they do not already exist.

Future Features
===============
As time allows (or if others would like to assist with development), I plan on adding the following:
*  Different profiles for FTP/SFTP connections
*  More integration into the Brackets UI
*  Queued file uploads - instead of uploading a changed file immediately on save, save a list of changed files and offer to upload them all at once on command
*  Binary file support
*  FTP directory browsing and file download support
*  Better error feedback      

License
=======
MIT-licensed -- see main.js for details.
