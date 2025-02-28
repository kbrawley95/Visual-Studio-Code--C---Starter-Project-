'use strict';
var path = require('path');
var fs = require("fs");
var vscode = require('vscode');
var vscode_languageclient_1 = require('vscode-languageclient');
var defaultSettingsJson = "// Place your settings in this file to overwrite default and user settings.\n{\n}";
var defaultSettings = "{\n    \"configurations\": [\n        {\n            \"name\": \"Mac\",\n            \"includePath\": [\"/usr/include\"],\n            \"browse\" : {\n                \"limitSymbolsToIncludedHeaders\" : true,\n                \"databaseFilename\" : \"\"\n            }\n        },\n        {\n            \"name\": \"Linux\",\n            \"includePath\": [\"/usr/include\"],\n            \"browse\" : {\n                \"limitSymbolsToIncludedHeaders\" : true,\n                \"databaseFilename\" : \"\"\n            }\n        },\n        {\n            \"name\": \"Win32\",\n            \"includePath\": [\"c:/Program Files (x86)/Microsoft Visual Studio 14.0/VC/include\"],\n            \"browse\" : {\n                \"limitSymbolsToIncludedHeaders\" : true,\n                \"databaseFilename\" : \"\"\n            }\n        }\n    ]\n}\n";
var ReportStatus_type = {
    get method() { return 'C_Cpp/ReportStatus'; }
};
var ReportNavigation_type = {
    get method() { return 'C_Cpp/ReportNavigation'; }
};
var RequestNavigationList_type = {
    get method() { return 'C_Cpp/requestNavigationList'; }
};
var ChangeFolderSettings_type = {
    get method() { return 'C_Cpp/didChangeFolderSettings'; }
};
var ChangeSelectedSetting_type = {
    get method() { return 'C_Cpp/didChangeSelectedSetting'; }
};
var SwitchHeaderSource_type = {
    get method() { return 'C_Cpp/didSwitchHeaderSource'; }
};
var FileCreated_type = {
    get method() { return 'C_Cpp/fileCreated'; }
};
var FileDeleted_type = {
    get method() { return 'C_Cpp/fileDeleted'; }
};
var ConfigurationProperties = (function () {
    function ConfigurationProperties(context, client) {
        var _this = this;
        this.languageClient = client;
        this.registeredCommands = [];
        this.registeredCommands.push(vscode.commands.registerCommand('C_Cpp.SwitchHeaderSource', function () {
            _this.handleSwitchHeaderSource();
        }));
        if (!vscode.workspace.rootPath) {
            this.registeredCommands.push(vscode.commands.registerCommand('C_Cpp.ConfigurationSelect', function () {
                vscode.window.showInformationMessage('Open a folder first to select a configuration');
            }));
            this.registeredCommands.push(vscode.commands.registerCommand('C_Cpp.ConfigurationEdit', function () {
                vscode.window.showInformationMessage('Open a folder first to edit configurations');
            }));
            return;
        }
        this.parseStatus = "";
        this.currentNavigation = "";
        this.configurationFileName = "**/c_cpp_properties.json";
        var configFilePath = path.join(vscode.workspace.rootPath, ".vscode", "c_cpp_properties.json");
        this.quickPickOptions = {};
        this.currentConfigurationIndex = 0;
        this.quickPickNavigationOptions = {};
        this.currentNavigationIndex = 0;
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
        this.statusBarNavigator = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
        this.registeredCommands.push(vscode.commands.registerCommand('C_Cpp.ConfigurationSelect', function () {
            _this.handleConfigurationSelect();
        }));
        this.registeredCommands.push(vscode.commands.registerCommand('C_Cpp.ConfigurationEdit', function () {
            _this.handleConfigurationEdit();
        }));
        this.registeredCommands.push(vscode.commands.registerCommand('C_Cpp.Navigate', function () {
            _this.handleNavigation();
        }));
        if (fs.existsSync(configFilePath)) {
            this.propertiesFile = vscode.Uri.file(configFilePath);
            this.parsePropertiesFile();
            this.getConfigIndexForPlatform(this.configurationJson);
            this.UpdateStatusBar();
            this.updateServerOnFolderSettingsChange();
        }
        else {
            this.handleConfigurationChange();
        }
        this.configFileWatcher = vscode.workspace.createFileSystemWatcher(this.configurationFileName);
        this.configFileWatcher.onDidCreate(function (uri) {
            _this.propertiesFile = uri;
            _this.handleConfigurationChange();
        });
        this.configFileWatcher.onDidDelete(function () {
            _this.propertiesFile = null;
            _this.handleConfigurationChange();
        });
        this.configFileWatcher.onDidChange(function () {
            _this.handleConfigurationChange();
        });
        this.rootPathFileWatcher = vscode.workspace.createFileSystemWatcher(path.join(vscode.workspace.rootPath, "*"), false, true, false);
        this.rootPathFileWatcher.onDidCreate(function (uri) {
            _this.languageClient.sendNotification(FileCreated_type, { uri: uri.toString() });
        });
        this.rootPathFileWatcher.onDidDelete(function (uri) {
            _this.languageClient.sendNotification(FileDeleted_type, { uri: uri.toString() });
        });
        vscode.window.onDidChangeActiveTextEditor(function (e) {
            _this.UpdateStatusBar();
            _this.UpdateNavigationStatusBar();
        });
        client.onNotification(ReportStatus_type, function (notificationBody) {
            var message = notificationBody.status;
            if (message.endsWith("...")) {
                _this.parseStatus = "$(flame)";
            }
            else {
                _this.parseStatus = "";
            }
            _this.UpdateStatusBar();
        });
        client.onNotification(ReportNavigation_type, function (notificationBody) {
            if (notificationBody.navigation.startsWith("<def>;")) {
                _this.addFileAssociations(notificationBody.navigation.substr(6));
                return;
            }
            _this.currentNavigation = notificationBody.navigation;
            var maxLength = 100;
            if (_this.currentNavigation.length > maxLength)
                _this.currentNavigation = _this.currentNavigation.substring(0, maxLength - 3).concat("...");
            _this.UpdateNavigationStatusBar();
        });
    }
    ConfigurationProperties.prototype.UpdateStatusBar = function () {
        var activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            this.statusBarItem.hide();
            return;
        }
        if (activeEditor.document.languageId != "cpp" && activeEditor.document.languageId != "c") {
            this.statusBarItem.hide();
            return;
        }
        this.statusBarItem.text = this.parseStatus + this.configurationJson.configurations[this.currentConfigurationIndex].name;
        if (this.parseStatus == "") {
            this.statusBarItem.color = '';
        }
        else {
            this.statusBarItem.color = 'DarkRed';
        }
        this.statusBarItem.command = "C_Cpp.ConfigurationSelect";
        this.statusBarItem.show();
    };
    ConfigurationProperties.prototype.UpdateNavigationStatusBar = function () {
        var activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            this.statusBarNavigator.hide();
            return;
        }
        if (activeEditor.document.languageId != "cpp" && activeEditor.document.languageId != "c") {
            this.statusBarNavigator.hide();
            return;
        }
        this.statusBarNavigator.text = this.currentNavigation;
        this.statusBarNavigator.command = "C_Cpp.Navigate";
        this.statusBarNavigator.show();
    };
    ConfigurationProperties.prototype.getConfigIndexForPlatform = function (config) {
        this.currentConfigurationIndex = this.configurationJson.configurations.length - 1;
        if (this.configurationJson.configurations.length > 3)
            return;
        var plat = process.platform;
        if (plat == 'linux') {
            plat = "Linux";
        }
        else if (plat == 'darwin') {
            plat = "Mac";
        }
        else if (plat == 'win32') {
            plat = "Win32";
        }
        for (var i = 0; i < this.configurationJson.configurations.length; i++) {
            if (config.configurations[i].name == plat) {
                this.currentConfigurationIndex = i;
                return;
            }
        }
    };
    ConfigurationProperties.prototype.addFileAssociations = function (fileAssociations) {
        var con = vscode.workspace.getConfiguration("files");
        var assoc = con.get("associations");
        var files = fileAssociations.split(";");
        for (var i = 0; i < files.length - 1; ++i) {
            var file = files[i];
            if (!(file in assoc))
                assoc[file] = "cpp";
        }
        con.update("associations", assoc);
    };
    ConfigurationProperties.prototype.resolveVariables = function (input) {
        var regexp = /\$\{(.*?)\}/g;
        var ret = input.replace(regexp, function (match, name) {
            var newValue = process.env[name];
            return (newValue != null) ? newValue : match;
        });
        regexp = /^\~/g;
        ret = ret.replace(regexp, function (match, name) {
            var newValue = process.env.HOME;
            return (newValue != null) ? newValue : match;
        });
        return ret;
    };
    ConfigurationProperties.prototype.updateServerOnFolderSettingsChange = function () {
        for (var i = 0; i < this.configurationJson.configurations.length; i++) {
            if (typeof this.configurationJson.configurations[i].includePath != 'undefined') {
                for (var j = 0; j < this.configurationJson.configurations[i].includePath.length; j++) {
                    this.configurationJson.configurations[i].includePath[j] = this.resolveVariables(this.configurationJson.configurations[i].includePath[j]);
                }
                this.configurationJson.configurations[i].includePath.splice(0, 0, "$\{workspaceRoot\}");
            }
            else {
                this.configurationJson.configurations[i].includePath = ["$\{workspaceRoot\}"];
            }
        }
        this.languageClient.sendNotification(ChangeFolderSettings_type, {
            currentConfiguration: this.currentConfigurationIndex,
            configurations: this.configurationJson.configurations
        });
    };
    ConfigurationProperties.prototype.updateServerOnCurrentConfigurationChange = function () {
        this.languageClient.sendNotification(ChangeSelectedSetting_type, {
            currentConfiguration: this.currentConfigurationIndex
        });
    };
    ConfigurationProperties.prototype.updateServerOnSwitchHeaderSourceChange = function (rootPath_, fileName_) {
        if (rootPath_ == undefined)
            rootPath_ = path.dirname(fileName_);
        this.languageClient.sendRequest(SwitchHeaderSource_type, { rootPath: rootPath_, switchHeaderSourceFileName: fileName_, }).then(function (targetFileName) {
            vscode.workspace.openTextDocument(targetFileName).then(function (document) {
                var foundEditor = false;
                vscode.window.visibleTextEditors.forEach(function (editor, index, array) {
                    if (editor.document == document) {
                        if (!foundEditor) {
                            foundEditor = true;
                            vscode.window.showTextDocument(document, editor.viewColumn);
                        }
                    }
                });
                if (!foundEditor) {
                    if (vscode.window.activeTextEditor != undefined) {
                        vscode.window.showTextDocument(document, vscode.window.activeTextEditor.viewColumn);
                    }
                    else {
                        vscode.window.showTextDocument(document);
                    }
                }
            });
        });
    };
    ConfigurationProperties.prototype.parsePropertiesFile = function () {
        try {
            this.configurationJson = JSON.parse(fs.readFileSync(this.propertiesFile.fsPath, 'utf8'));
        }
        catch (err) {
            vscode.window.showErrorMessage('Failed to parse "' + this.propertiesFile.fsPath + '": ' + err.message);
            throw err;
        }
    };
    ConfigurationProperties.prototype.handleConfigurationChange = function () {
        if (this.propertiesFile) {
            this.parsePropertiesFile();
            if (this.configurationJson.configurations.length <= this.currentConfigurationIndex) {
                this.currentConfigurationIndex = 0;
            }
        }
        else {
            this.configurationJson = JSON.parse(defaultSettings);
            this.getConfigIndexForPlatform(this.configurationJson);
        }
        this.UpdateStatusBar();
        this.updateServerOnFolderSettingsChange();
    };
    ConfigurationProperties.prototype.handleConfigurationEdit = function () {
        if (this.propertiesFile) {
            vscode.workspace.openTextDocument(this.propertiesFile).then(function (document) {
                vscode.window.showTextDocument(document);
            });
        }
        else {
            var dirPath_1 = path.join(vscode.workspace.rootPath, ".vscode");
            fs.mkdir(dirPath_1, function (e) {
                if (!e || e.code === 'EEXIST') {
                    var fullPathToFile_1 = path.join(dirPath_1, "c_cpp_properties.json");
                    var filePath_1 = vscode.Uri.parse("untitled:" + fullPathToFile_1);
                    vscode.workspace.openTextDocument(filePath_1).then(function (document) {
                        var edit = new vscode.WorkspaceEdit;
                        edit.insert(document.uri, new vscode.Position(0, 0), defaultSettings);
                        vscode.workspace.applyEdit(edit).then(function (status) {
                            document.save().then(function () {
                                filePath_1 = vscode.Uri.file(fullPathToFile_1);
                                vscode.workspace.openTextDocument(filePath_1).then(function (document) {
                                    vscode.window.showTextDocument(document);
                                });
                            });
                        });
                    });
                }
            });
        }
    };
    ConfigurationProperties.prototype.handleConfigurationSelect = function () {
        var _this = this;
        this.quickPickOptions.placeHolder = "Select a Configuration";
        var items;
        items = [];
        for (var i = 0; i < this.configurationJson.configurations.length; i++) {
            items.push({ label: this.configurationJson.configurations[i].name, description: "", index: i });
        }
        var result = vscode.window.showQuickPick(items, this.quickPickOptions);
        result.then(function (selection) {
            if (!selection) {
                return;
            }
            _this.currentConfigurationIndex = selection.index;
            _this.UpdateStatusBar();
            _this.updateServerOnCurrentConfigurationChange();
        });
    };
    ConfigurationProperties.prototype.handleNavigation = function () {
        var _this = this;
        var activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor)
            return;
        this.languageClient.sendRequest(RequestNavigationList_type, vscode_languageclient_1.Code2Protocol.asTextDocumentIdentifier(activeEditor.document)).then(function (navigationList) {
            _this.quickPickNavigationOptions.placeHolder = "Select where to navigate to";
            var items;
            var navlist = navigationList.split(";");
            items = [];
            for (var i = 0; i < navlist.length - 1; i += 2) {
                items.push({ label: navlist[i], description: "", index: Number(navlist[i + 1]) });
            }
            var result = vscode.window.showQuickPick(items, _this.quickPickNavigationOptions);
            result.then(function (selection) {
                if (!selection) {
                    return;
                }
                vscode.window.activeTextEditor.revealRange(new vscode.Range(selection.index, 0, selection.index, 0));
                vscode.window.activeTextEditor.selection = new vscode.Selection(new vscode.Position(selection.index, 0), new vscode.Position(selection.index, 0));
                _this.UpdateNavigationStatusBar();
            });
        });
    };
    ConfigurationProperties.prototype.handleSwitchHeaderSource = function () {
        var activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || !activeEditor.document) {
            return;
        }
        if (activeEditor.document.languageId != "cpp" && activeEditor.document.languageId != "c") {
            return;
        }
        this.updateServerOnSwitchHeaderSourceChange(vscode.workspace.rootPath, activeEditor.document.fileName);
    };
    ConfigurationProperties.prototype.dispose = function () {
        this.configFileWatcher.dispose();
        this.rootPathFileWatcher.dispose();
        this.statusBarItem.dispose();
        for (var i = 0; i < this.registeredCommands.length; i++) {
            this.registeredCommands[i].dispose();
        }
    };
    return ConfigurationProperties;
}());
function setupConfigurationProperties(context, client) {
    var ret = new ConfigurationProperties(context, client);
    return ret;
}
exports.setupConfigurationProperties = setupConfigurationProperties;
//# sourceMappingURL=C_Cpp_ConfigurationProperties.js.map