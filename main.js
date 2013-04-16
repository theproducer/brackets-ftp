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
    
    var dialogHtml = require("text!htmlContent/bracketsftp-dialogs.html");
    var toolbarHtml = require("text!htmlContent/bracketsftp-toolbar.html");
    var nodeConnection;
    
    var CommandManager = brackets.getModule("command/CommandManager"),
        Menus = brackets.getModule("command/Menus"),
        Commands = brackets.getModule("command/Commands"),
        Dialogs = brackets.getModule("widgets/Dialogs"),
        NodeConnection = brackets.getModule("utils/NodeConnection"),
        ExtensionUtils = brackets.getModule("utils/ExtensionUtils"),
        AppInit = brackets.getModule("utils/AppInit"),
        DocumentManager = brackets.getModule("document/DocumentManager"),
        ProjectManager = brackets.getModule("project/ProjectManager"),
        FileSystem = brackets.getModule("file/NativeFileSystem").NativeFileSystem,
        FileUtils = brackets.getModule("file/FileUtils");
    
    var projectFtpDetails = {};
    projectFtpDetails.server = "";
    projectFtpDetails.protocol = "";
    projectFtpDetails.port = 21;
    projectFtpDetails.username = "";
    projectFtpDetails.password = "";
    projectFtpDetails.localpath = "";
    projectFtpDetails.remotepath = "";
    projectFtpDetails.uploadOnSave = "";
    
    
    //Functions
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
        
        var fileEntry = new FileSystem.FileEntry(destinationDir + ".remotesettings");
        var projectsData = JSON.stringify(projectFtpDetails);
        FileUtils.writeText(fileEntry, projectsData).done(function () {
            console.log("file written");
        });
        
    }
    
    function readRemoteSettings() {
        var destinationDir = ProjectManager.getProjectRoot().fullPath;
        var fileEntry = new FileSystem.FileEntry(destinationDir + ".remotesettings");
        if (fileEntry) {
            var readSettingsPromise = FileUtils.readAsText(fileEntry);
        
            readSettingsPromise.done(function (result) {
                //remotesettings file does exist, read in JSON into object
                if (result) {
                    projectFtpDetails = $.parseJSON(result);
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
            });
        }
    }
    
    function showSettingsDialog() {
        if ($("#bftp-project-dialog").length === 0) {
            $("body").append(dialogHtml);
        }
        
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
        
        Dialogs.showModalDialog("bftp-settings").done(function (id) {
            if (id === "save") {
                saveRemoteSettings();
            }
        });
    }
    
    AppInit.appReady(function () {
        nodeConnection = new NodeConnection();
        
        function connectNode() {
            var connectionPromise = nodeConnection.connect(true);
            connectionPromise.fail(function (err) {
                console.error("[brackets-ftp] failed to connect to node", err);
            });
            return connectionPromise;
        }
        
        function loadNodeFtp() {
            var path = ExtensionUtils.getModulePath(module, "node/ftpDomain");
            var loadPromise = nodeConnection.loadDomains([path], true);
            loadPromise.fail(function (err) {
                console.log("failed to load ftpDomain", err);
            });
            
            return loadPromise;
        }
        
        chain(connectNode, loadNodeFtp);
        
        ExtensionUtils.loadStyleSheet(module, "styles/bracketsftp-styles.css");
        
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
            
            console.log(param);
            
        });
                
        $("#main-toolbar .buttons").append(toolbarHtml);
            
        $("#toolbar-bracketsftp").on('click', function () {
            showSettingsDialog();
        });
        
        console.log("app ready");
    });
    
    $(DocumentManager).on("documentSaved", function (event, doc) {
        if (projectFtpDetails.uploadOnSave === true) {
            if (projectFtpDetails.server !== "") {
                var document = DocumentManager.getCurrentDocument();
                if (ProjectManager.isWithinProject(document.file.fullPath)) {
                    console.log("[brackets-ftp] Uploading file...");
                    $("#toolbar-bracketsftp").toggleClass("working");
                    
                    var docPath = document.file.fullPath;
                    var docName = document.file.name;
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
            } else {
                console.log("[brackets-ftp] No server defined, will not upload");
            }
        }
    });
    
    $(ProjectManager).on("projectOpen", function () {
        readRemoteSettings();
    });
    
    
    var BFTP_SETTINGSDIALOG_ID = "bftp.settingsdialog";
    CommandManager.register("Remote Project Settings...", BFTP_SETTINGSDIALOG_ID, showSettingsDialog);
    
    var menu = Menus.getMenu(Menus.AppMenuBar.FILE_MENU);
    menu.addMenuItem(BFTP_SETTINGSDIALOG_ID);
    
});