/*
 * Copyright (c) 2013 Joseph Pender
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, $, Mustache, brackets, window */


define(function (require, exports, module) {
    "use strict";
    
    var nodeConnection;
    
    var CommandManager = brackets.getModule("command/CommandManager"),
        Menus = brackets.getModule("command/Menus"),
        Commands = brackets.getModule("command/Commands"),
        Dialogs = brackets.getModule("widgets/Dialogs"),
        StatusBar = brackets.getModule("widgets/StatusBar"),
        PanelManager = brackets.getModule("view/PanelManager"),
        Resizer = brackets.getModule("utils/Resizer"),
        NodeConnection = brackets.getModule("utils/NodeConnection"),
        ExtensionUtils = brackets.getModule("utils/ExtensionUtils"),
        AppInit = brackets.getModule("utils/AppInit"),
        DocumentManager = brackets.getModule("document/DocumentManager"),
        ProjectManager = brackets.getModule("project/ProjectManager"),
        FileSystem = brackets.getModule("file/NativeFileSystem").NativeFileSystem,
        FileUtils = brackets.getModule("file/FileUtils"),
        Strings = brackets.getModule("strings"),
        BracketsFTPToolbar = require("text!htmlContent/bracketsftp-toolbar.html"),
        BracketsFTPTemplate = require("text!htmlContent/bottom-panel.html"),
        BracketsFTPDialogs = require("text!htmlContent/bracketsftp-dialogs.html"),
        FileBrowserTemplate = require("text!htmlContent/file-browser.html");
        
    
    var projectFtpDetails = {
        server: "",
        protocol: "",
        port: 21,
        username: "",
        password: "",
        localpath: "",
        remotepath: "",
        uploadOnSave: false
    };
    
    var currentRemoteDirectory;
    
    var INDICATOR_ID = "bracketftp-status",
        defaultPrefs = {
            enabled: true,
            collapsed: false
        };
    
    var $fileBrowserResults;
        
    function chain() {
        var functions = Array.prototype.slice.call(arguments, 0);
        if (functions.length > 0) {
            var firstFunction = functions.shift();
            var firstPromise = firstFunction.call();
            firstPromise.done(function () {
                chain.apply(null, functions);
            });
        }
    }
    
    function saveRemoteSettings() {
        var deferred = $.Deferred();
        var destinationDir = ProjectManager.getProjectRoot().fullPath;
        
        if (projectFtpDetails.localpath === "") {
            projectFtpDetails.localpath = ProjectManager.getProjectRoot().fullPath;
        }
        
        if(projectFtpDetails.protocol === "sftp"){
            toggleRemoteBrowserAvailability(false);    
        }else{
            toggleRemoteBrowserAvailability(true);    
        }
        
        var fileEntry = new FileSystem.FileEntry(destinationDir + ".remotesettings");
        var projectsData = JSON.stringify(projectFtpDetails);
        FileUtils.writeText(fileEntry, projectsData).done(function () {
            
        });
    }
    
    function toggleRemoteBrowserAvailability(enable) {
        if(enable){
            $("#bracketftp-status").text("browse remote directory");
            $("#bracketftp-status").attr("data-enabled", true);
        }else{
            $("#bracketftp-status").text("no remote server set");
            $("#bracketftp-status").attr("data-enabled", false);
        }
    }
    
    function readRemoteSettings() {
        var destinationDir = ProjectManager.getProjectRoot().fullPath;
        var fileEntry = new FileSystem.FileEntry(destinationDir + ".remotesettings");
        if (fileEntry) {
            var readSettingsPromise = FileUtils.readAsText(fileEntry);
        
            readSettingsPromise.done(function (result) {
                //remotesettings file does exist, read in JSON into object                
                if (result) {
                    toggleRemoteBrowserAvailability(true);
                    projectFtpDetails = $.parseJSON(result);
                    if(projectFtpDetails.protocol === "sftp"){
                        toggleRemoteBrowserAvailability(false);    
                    }else{
                        toggleRemoteBrowserAvailability(true);    
                    }                        
                }
            });
            readSettingsPromise.fail(function (err) {
                //remotesettings file does not exist
                projectFtpDetails.server = "";
                projectFtpDetails.protocol = "";
                projectFtpDetails.port = 21;
                projectFtpDetails.username = "";
                projectFtpDetails.password = "";
                projectFtpDetails.localpath = "";
                projectFtpDetails.remotepath = "";
                projectFtpDetails.uploadOnSave = false;
                
                toggleRemoteBrowserAvailability(false);
            });
        }
    }
    
    function showSettingsDialog() {
        Dialogs.showModalDialogUsingTemplate(BracketsFTPDialogs, true).done(function (id) {
            if (id === "save") {
                saveRemoteSettings();
            }
        });
        
        $("#bftp-server").val(projectFtpDetails.server);
        $("#bftp-serverport").val(projectFtpDetails.port);
        $("#bftp-username").val(projectFtpDetails.username);
        $("#bftp-password").val(projectFtpDetails.password);
        $("#bftp-remoteroot").val(projectFtpDetails.remotepath);
        $("#bftp-protocol option").attr('selected', false);
        $("#bftp-protocol option[value=" + projectFtpDetails.protocol + "]").attr('selected', 'selected');
        if (projectFtpDetails.uploadOnSave) {
            $("#bftp-uploadonsave").attr("checked", true);
        } else {
            $("#bftp-uploadonsave").attr("checked", false);
        }
    }
    
    function changeDirectory(newPath) {
        console.log("[brackets-ftp] Changing directory...");    
        $("#bracketsftp-filebrowser .table-container").toggleClass("loading");
        $("#bracketsftp-filebrowser .table-container table").fadeOut(100);
        if (newPath === undefined || newPath === "") {
            currentRemoteDirectory = projectFtpDetails.remotepath;                 
        } else {
            if (newPath === "..") {
                var pathArray = currentRemoteDirectory.split("/");                
                pathArray.pop();                
                currentRemoteDirectory = "";
                $.each(pathArray, function (index, value) {
                    if (value !== "") {
                        currentRemoteDirectory = currentRemoteDirectory + "/" + value;
                    }
                });                
            } else {
                currentRemoteDirectory = currentRemoteDirectory + "/" + newPath;    
            }
        }        
        
        if(currentRemoteDirectory === "") {
            currentRemoteDirectory = "/";   
        }
        
        if (projectFtpDetails.protocol === "sftp") {
            //var ftpPromise = nodeConnection.domains.bracketsftp.getDirectorySFTP(currentRemoteDirectory, projectFtpDetails);
        } else {
            var ftpPromise = nodeConnection.domains.bracketsftp.getDirectory(currentRemoteDirectory, projectFtpDetails);
        }
    }
    
    function uploadFile(fileToUpload) {
        console.log("[brackets-ftp] Uploading file...");
        $("#toolbar-bracketsftp").toggleClass("working");
        
        var docPath = fileToUpload.fullPath;
        var docName = fileToUpload.name;
        var pathArray = ProjectManager.makeProjectRelativeIfPossible(docPath).split("/");
        
        var i = 0;
        var pathArrayString = projectFtpDetails.remotepath;
        
        for (i; i < (pathArray.length - 1); i++) {
            pathArrayString = pathArrayString + "/" + pathArray[i];
        }
        
        pathArrayString = pathArrayString + "/" + docName;
        
        if (projectFtpDetails.protocol === "sftp") {
            var sftpPromise = nodeConnection.domains.bracketsftp.uploadFileSFTP(docPath, docName, projectFtpDetails, pathArray);
            sftpPromise.fail(function (err) {
                console.error("[brackets-ftp] Secure file upload failed for: " + docName, err);
                $("#toolbar-bracketsftp").toggleClass("working");
                $("#toolbar-bracketsftp").toggleClass("error");
                $("#toolbar-bracketsftp").delay(2000).toggleClass("error");
            });
        } else {
            var ftpPromise = nodeConnection.domains.bracketsftp.uploadFile(docPath, docName, projectFtpDetails, pathArray);
            ftpPromise.fail(function (err) {
                console.error("[brackets-ftp] File upload failed for: " + docName, err);
                $("#toolbar-bracketsftp").toggleClass("working");
                $("#toolbar-bracketsftp").toggleClass("error");
                $("#toolbar-bracketsftp").delay(2000).toggleClass("error");
            });
        }
    }
    
    function uploadContextFile() {
        var fileEntry = ProjectManager.getSelectedItem();
        if (fileEntry.isDirectory) {
            alert("Cannot upload whole directories");
        } else {
            uploadFile(fileEntry);
        }
    }
    
    function toggleFTPFileBrowser() {
        if ($("#bracketsftp-filebrowser").is(":visible")) {
            Resizer.hide($fileBrowserResults);
        } else {
            changeDirectory("");
            Resizer.show($fileBrowserResults);
        }
    }
    
    AppInit.htmlReady(function () {
        ExtensionUtils.loadStyleSheet(module, "styles/bracketsftp-styles.css");
        
        //********************************
        //****** Set Up UI Elements ******
        //********************************
        
        var ftpBottomPanelHtml = Mustache.render(BracketsFTPTemplate, Strings);
        var ftpFileBrowser = PanelManager.createBottomPanel("bracketsftp.filebrowser", $(ftpBottomPanelHtml), 200);
        $fileBrowserResults = $("#bracketsftp-filebrowser");
        
        var ftpStatusHtml = "<div data-enabled=\"true\" id=\"bracketsftp-status\" title=\"browse remote directory\">browse remote directory</div>";
        $(ftpStatusHtml).insertBefore("#status-language");
        StatusBar.addIndicator(INDICATOR_ID, $("#bracketsftp-status"), true);
        
        $("#main-toolbar .buttons").append(BracketsFTPToolbar);
        
        var BFTP_UPLOADCONTEXTFILE_ID = "bracketsftp.uploadcontextfile";
        CommandManager.register("Upload File", BFTP_UPLOADCONTEXTFILE_ID, uploadContextFile);
        
        var project_contextMenu = Menus.getContextMenu(Menus.ContextMenuIds.PROJECT_MENU);
        project_contextMenu.addMenuDivider();
        project_contextMenu.addMenuItem(BFTP_UPLOADCONTEXTFILE_ID, null, Menus.LAST);
        
        $("#toolbar-bracketsftp").on('click', function () {
            showSettingsDialog();
        });      
        
        $("#bracketsftp-filebrowser .close").click(function () {
            toggleFTPFileBrowser();
        });
        
        $("#bracketftp-status").click(function () {
            if($(this).attr('data-enabled')){
                toggleFTPFileBrowser();
            }
        });
        
         $("body").on('dblclick', ".bracketsftp-folder", function () {            
             changeDirectory($(this).attr("data-path"));
        });
        
    });
    
    AppInit.appReady(function () {
        console.log("Brackets FTP Loaded");
        nodeConnection = new NodeConnection();
        
        function connectNode() {
            var connectionPromise = nodeConnection.connect(true);
            connectionPromise.fail(function (err) {
                
            });
            return connectionPromise;
        }
        
        function loadNodeFtp() {
            var path = ExtensionUtils.getModulePath(module, "node/ftpDomain");
            var loadPromise = nodeConnection.loadDomains([path], true);
            loadPromise.fail(function (err) {
                    
            });
            return loadPromise;
        }
        
        chain(connectNode, loadNodeFtp);
        
        $(nodeConnection).on("bracketsftp.getDirectorySFTP", function (event, result) {
            console.log(result);
        });
        
        $(nodeConnection).on("bracketsftp.getDirectory", function (event, result) {
            var files = JSON.parse(result);
            var sanitizedFolders = new Array();
            var sanitizedFiles = new Array();
            
            //Get all files
            $.each(files, function (index, value) {
                if (value !== null) {
                    if (value.type === 0) {
                        var fileObject = {
                            name: value.name,
                            lastupdated: new Date(value.time),
                            size: value.size,
                            type: "file"
                        };
                        
                        sanitizedFiles.push(fileObject);
                    }
                }
            });
            
            var upFolder = {
                name: "..",
                lastupdated: "--",
                size: "--",
                type: "folder"
            };
            
            sanitizedFolders.push(upFolder);
            
            //Get all folders
            $.each(files, function (index, value) {
                if (value !== null) {
                    if (value.type === 1) {                        
                        var fileObject = {
                            name: value.name,
                            lastupdated: new Date(value.time),
                            size: "--",
                            type: "folder"
                        };
                        
                        sanitizedFolders.push(fileObject);
                    }
                }
            });
            var html = Mustache.render(FileBrowserTemplate, {ftpFileList: sanitizedFolders.concat(sanitizedFiles)});
            $fileBrowserResults.find(".table-container")
                .empty()
                .append(html)
                .scrollTop(0)
                .hide()
                .fadeIn(50);
            $("#bracketsftp-filebrowser .currentDirectory").text(currentRemoteDirectory);
            $("#bracketsftp-filebrowser .table-container").toggleClass("loading");
            
        });
        
        $("body").on('change', "#bftp-server", function () {
            projectFtpDetails.server = $(this).val();
        });
        
        $("body").on('change', "#bftp-protocol", function () {
            projectFtpDetails.protocol = $(this).val();
        });
        
        $("body").on('change', "#bftp-serverport", function () {
            projectFtpDetails.port = $(this).val();
        });
        
        $("body").on('change', "#bftp-username", function () {
            projectFtpDetails.username = $(this).val();
        });
        
        $("body").on('change', "#bftp-password", function () {
            projectFtpDetails.password = $(this).val();
        });
        
        $("body").on('change', "#bftp-remoteroot", function () {
            projectFtpDetails.remotepath = $(this).val();
        });
        
        $("body").on('change', "#bftp-uploadonsave", function () {
            if ($(this).is(":checked")) {
                projectFtpDetails.uploadOnSave = true;
            } else {
                projectFtpDetails.uploadOnSave = false;
            }
        });
        
        $(nodeConnection).on("bracketsftp.uploadResult", function (event, param) {
            var toolbarResetTimeout;
            
            if (param === "complete") {
                console.log("[brackets-ftp] Upload complete", param);
                $("#toolbar-bracketsftp").toggleClass("working");
                $("#toolbar-bracketsftp").toggleClass("complete");
                toolbarResetTimeout = window.setTimeout(function () {
                    $("#toolbar-bracketsftp").toggleClass("complete");
                    window.clearTimeout(toolbarResetTimeout);
                }, 2000);
            }
            
            if (param === "uploaderror") {
                console.error("[brackets-ftp] Upload failed");
                $("#toolbar-bracketsftp").toggleClass("working");
                $("#toolbar-bracketsftp").toggleClass("error");
                toolbarResetTimeout = window.setTimeout(function () {
                    $("#toolbar-bracketsftp").toggleClass("error");
                    window.clearTimeout(toolbarResetTimeout);
                }, 2000);
            }
            
            if (param === "autherror") {
                console.error("[brackets-ftp] FTP authetication failed");
                $("#toolbar-bracketsftp").toggleClass("working");
                $("#toolbar-bracketsftp").toggleClass("error");
                toolbarResetTimeout = window.setTimeout(function () {
                    $("#toolbar-bracketsftp").toggleClass("error");
                    window.clearTimeout(toolbarResetTimeout);
                }, 2000);
            }
        });
        
    });
    
    $(DocumentManager).on("documentSaved", function (event, doc) {        
        if (projectFtpDetails.uploadOnSave === true) {
            if (projectFtpDetails.server !== "") {
                var document = DocumentManager.getCurrentDocument();
                if (ProjectManager.isWithinProject(document.file.fullPath)) {
                    uploadFile(document.file);
                }
            } else {
                console.log("[brackets-ftp] No server defined, will not upload");
            }
        }
    });
    
    $(ProjectManager).on("projectOpen", function () {
        readRemoteSettings();
    });
    
    var BFTP_SETTINGSDIALOG_ID = "bracketsftp.settingsdialog";
    CommandManager.register("FTP Settings...", BFTP_SETTINGSDIALOG_ID, showSettingsDialog);
    
    var menu = Menus.getMenu(Menus.AppMenuBar.FILE_MENU);
    menu.addMenuItem(BFTP_SETTINGSDIALOG_ID);
    
    
});