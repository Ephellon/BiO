WebInspector.SnippetStorage = function (settingPrefix, namePrefix) {
  this._snippets = {};
  this._lastSnippetIdentifierSetting = WebInspector.settings.createSetting(settingPrefix + "Snippets_lastIdentifier", 0);
  this._snippetsSetting = WebInspector.settings.createSetting(settingPrefix + "Snippets", []);
  this._namePrefix = namePrefix;
  this._loadSettings();
}
WebInspector.SnippetStorage.prototype = {get namePrefix() {
    return this._namePrefix;
  },
  _saveSettings: function () {
    var savedSnippets = [];
    for (var id in this._snippets)
      savedSnippets.push(this._snippets[id].serializeToObject());
    this._snippetsSetting.set(savedSnippets);
  },
  snippets: function () {
    var result = [];
    for (var id in this._snippets)
      result.push(this._snippets[id]);
    return result;
  },
  snippetForId: function (id) {
    return this._snippets[id];
  },
  snippetForName: function (name) {
    var snippets = Object.values(this._snippets);
    for (var i = 0; i < snippets.length; ++i)
      if (snippets[i].name === name)
        return snippets[i];
    return null;
  },
  _loadSettings: function () {
    var savedSnippets = this._snippetsSetting.get();
    for (var i = 0; i < savedSnippets.length; ++i)
      this._snippetAdded(WebInspector.Snippet.fromObject(this, savedSnippets[i]));
  },
  deleteSnippet: function (snippet) {
    delete this._snippets[snippet.id];
    this._saveSettings();
  },
  createSnippet: function () {
    var nextId = this._lastSnippetIdentifierSetting.get() + 1;
    var snippetId = String(nextId);
    this._lastSnippetIdentifierSetting.set(nextId);
    var snippet = new WebInspector.Snippet(this, snippetId);
    this._snippetAdded(snippet);
    this._saveSettings();
    return snippet;
  },
  _snippetAdded: function (snippet) {
    this._snippets[snippet.id] = snippet;
  },
  __proto__: WebInspector.Object.prototype
}
WebInspector.Snippet = function (storage, id, name, content) {
  this._storage = storage;
  this._id = id;
  this._name = name || storage.namePrefix + id;
  this._content = content || "";
}
WebInspector.Snippet.fromObject = function (storage, serializedSnippet) {
  return new WebInspector.Snippet(storage, serializedSnippet.id, serializedSnippet.name, serializedSnippet.content);
}
WebInspector.Snippet.prototype = {get id() {
    return this._id;
  },
  get name() {
    return this._name;
  },
  set name(name) {
    if (this._name === name)
      return;
    this._name = name;
    this._storage._saveSettings();
  },
  get content() {
    return this._content;
  },
  set content(content) {
    if (this._content === content)
      return;
    this._content = content;
    this._storage._saveSettings();
  },
  serializeToObject: function () {
    var serializedSnippet = {};
    serializedSnippet.id = this.id;
    serializedSnippet.name = this.name;
    serializedSnippet.content = this.content;
    return serializedSnippet;
  },
  __proto__: WebInspector.Object.prototype
};
WebInspector.ScriptSnippetModel = function (workspace) {
  this._workspace = workspace;
  this._uiSourceCodeForSnippetId = {};
  this._snippetIdForUISourceCode = new Map();
  this._mappingForTarget = new Map();
  this._snippetStorage = new WebInspector.SnippetStorage("script", "Script snippet #");
  this._lastSnippetEvaluationIndexSetting = WebInspector.settings.createSetting("lastSnippetEvaluationIndex", 0);
  this._project = new WebInspector.SnippetsProject(workspace, this);
  this._loadSnippets();
  WebInspector.targetManager.observeTargets(this);
}
WebInspector.ScriptSnippetModel.snippetSourceURLPrefix = "snippets:///";
WebInspector.ScriptSnippetModel.prototype = {
  targetAdded: function (target) {
    var debuggerModel = WebInspector.DebuggerModel.fromTarget(target);
    if (debuggerModel)
      this._mappingForTarget.set(target, new WebInspector.SnippetScriptMapping(debuggerModel, this));
  },
  targetRemoved: function (target) {
    if (WebInspector.DebuggerModel.fromTarget(target))
      this._mappingForTarget.remove(target);
  },
  snippetScriptMapping: function (target) {
    return this._mappingForTarget.get(target);
  },
  project: function () {
    return this._project;
  },
  _loadSnippets: function () {
    var snippets = this._snippetStorage.snippets();
    for (var i = 0; i < snippets.length; ++i)
      this._addScriptSnippet(snippets[i]);
  },
  createScriptSnippet: function (content) {
    var snippet = this._snippetStorage.createSnippet();
    snippet.content = content;
    return this._addScriptSnippet(snippet);
  },
  _addScriptSnippet: function (snippet) {
    var uiSourceCode = this._project.addSnippet(snippet.name, new WebInspector.SnippetContentProvider(snippet));
    uiSourceCode.addEventListener(WebInspector.UISourceCode.Events.WorkingCopyChanged, this._workingCopyChanged, this);
    this._snippetIdForUISourceCode.set(uiSourceCode, snippet.id);
    var breakpointLocations = this._removeBreakpoints(uiSourceCode);
    this._restoreBreakpoints(uiSourceCode, breakpointLocations);
    this._uiSourceCodeForSnippetId[snippet.id] = uiSourceCode;
    return uiSourceCode;
  },
  _workingCopyChanged: function (event) {
    var uiSourceCode = (event.target);
    this._scriptSnippetEdited(uiSourceCode);
  },
  deleteScriptSnippet: function (url) {
    var uiSourceCode = this._project.uiSourceCodeForURL(url);
    if (!uiSourceCode)
      return;
    var snippetId = this._snippetIdForUISourceCode.get(uiSourceCode) || "";
    var snippet = this._snippetStorage.snippetForId(snippetId);
    this._snippetStorage.deleteSnippet(snippet);
    this._removeBreakpoints(uiSourceCode);
    this._releaseSnippetScript(uiSourceCode);
    delete this._uiSourceCodeForSnippetId[snippet.id];
    this._snippetIdForUISourceCode.remove(uiSourceCode);
    this._project.removeFile(snippet.name);
  },
  renameScriptSnippet: function (name, newName, callback) {
    newName = newName.trim();
    if (!newName || newName.indexOf("/") !== -1 || name === newName || this._snippetStorage.snippetForName(newName)) {
      callback(false);
      return;
    }
    var snippet = this._snippetStorage.snippetForName(name);
    console.assert(snippet, "Snippet '" + name + "' was not found.");
    var uiSourceCode = this._uiSourceCodeForSnippetId[snippet.id];
    console.assert(uiSourceCode, "No uiSourceCode was found for snippet '" + name + "'.");
    var breakpointLocations = this._removeBreakpoints(uiSourceCode);
    snippet.name = newName;
    this._restoreBreakpoints(uiSourceCode, breakpointLocations);
    callback(true, newName);
  },
  _setScriptSnippetContent: function (name, newContent) {
    var snippet = this._snippetStorage.snippetForName(name);
    snippet.content = newContent;
  },
  _scriptSnippetEdited: function (uiSourceCode) {
    var breakpointLocations = this._removeBreakpoints(uiSourceCode);
    this._releaseSnippetScript(uiSourceCode);
    this._restoreBreakpoints(uiSourceCode, breakpointLocations);
    this._mappingForTarget.valuesArray().forEach(function (mapping) {
      mapping._restoreBreakpoints(uiSourceCode, breakpointLocations);
    });
  },
  _nextEvaluationIndex: function () {
    var evaluationIndex = this._lastSnippetEvaluationIndexSetting.get() + 1;
    this._lastSnippetEvaluationIndexSetting.set(evaluationIndex);
    return evaluationIndex;
  },
  evaluateScriptSnippet: function (executionContext, uiSourceCode) {
    var breakpointLocations = this._removeBreakpoints(uiSourceCode);
    this._releaseSnippetScript(uiSourceCode);
    this._restoreBreakpoints(uiSourceCode, breakpointLocations);
    var target = executionContext.target();
    var runtimeModel = target.runtimeModel;
    var evaluationIndex = this._nextEvaluationIndex();
    var mapping = this._mappingForTarget.get(target);
    mapping._setEvaluationIndex(evaluationIndex, uiSourceCode);
    var evaluationUrl = mapping._evaluationSourceURL(uiSourceCode);
    var expression = uiSourceCode.workingCopy();
    WebInspector.console.show();
    runtimeModel.compileScript(expression, "", true, executionContext.id, compileCallback.bind(this));

    function compileCallback(scriptId, exceptionDetails) {
      var mapping = this._mappingForTarget.get(target);
      if (mapping.evaluationIndex(uiSourceCode) !== evaluationIndex)
        return;
      if (!scriptId) {
        this._printRunOrCompileScriptResultFailure(target, exceptionDetails, evaluationUrl);
        return;
      }
      mapping._addScript(executionContext.debuggerModel.scriptForId(scriptId), uiSourceCode);
      var breakpointLocations = this._removeBreakpoints(uiSourceCode);
      this._restoreBreakpoints(uiSourceCode, breakpointLocations);
      this._runScript(scriptId, executionContext, evaluationUrl);
    }
  },
  _runScript: function (scriptId, executionContext, sourceURL) {
    var target = executionContext.target();
    target.runtimeModel.runScript(scriptId, executionContext.id, "console", false, true, runCallback.bind(this, target));

    function runCallback(target, result, exceptionDetails) {
      if (!exceptionDetails)
        this._printRunScriptResult(target, result, sourceURL);
      else
        this._printRunOrCompileScriptResultFailure(target, exceptionDetails, sourceURL);
    }
  },
  _printRunScriptResult: function (target, result, sourceURL) {
    var consoleMessage = new WebInspector.ConsoleMessage(target, WebInspector.ConsoleMessage.MessageSource.JS, WebInspector.ConsoleMessage.MessageLevel.Log, "", undefined, sourceURL, undefined, undefined, undefined, [result], undefined);
    target.consoleModel.addMessage(consoleMessage);
  },
  _printRunOrCompileScriptResultFailure: function (target, exceptionDetails, sourceURL) {
    var consoleMessage = new WebInspector.ConsoleMessage(target, exceptionDetails.source, WebInspector.ConsoleMessage.MessageLevel.Error, exceptionDetails.text, undefined, sourceURL, exceptionDetails.line, exceptionDetails.column, undefined, undefined, exceptionDetails.stack);
    target.consoleModel.addMessage(consoleMessage);
  },
  _removeBreakpoints: function (uiSourceCode) {
    var breakpointLocations = WebInspector.breakpointManager.breakpointLocationsForUISourceCode(uiSourceCode);
    for (var i = 0; i < breakpointLocations.length; ++i)
      breakpointLocations[i].breakpoint.remove();
    return breakpointLocations;
  },
  _restoreBreakpoints: function (uiSourceCode, breakpointLocations) {
    for (var i = 0; i < breakpointLocations.length; ++i) {
      var uiLocation = breakpointLocations[i].uiLocation;
      var breakpoint = breakpointLocations[i].breakpoint;
      WebInspector.breakpointManager.setBreakpoint(uiSourceCode, uiLocation.lineNumber, uiLocation.columnNumber, breakpoint.condition(), breakpoint.enabled());
    }
  },
  _releaseSnippetScript: function (uiSourceCode) {
    this._mappingForTarget.valuesArray().forEach(function (mapping) {
      mapping._releaseSnippetScript(uiSourceCode);
    });
  },
  _snippetIdForSourceURL: function (sourceURL) {
    var snippetPrefix = WebInspector.ScriptSnippetModel.snippetSourceURLPrefix;
    if (!sourceURL.startsWith(snippetPrefix))
      return null;
    var splitURL = sourceURL.substring(snippetPrefix.length).split("_");
    var snippetId = splitURL[0];
    return snippetId;
  },
  __proto__: WebInspector.Object.prototype
}
WebInspector.SnippetScriptMapping = function (debuggerModel, scriptSnippetModel) {
  this._target = debuggerModel.target();
  this._debuggerModel = debuggerModel;
  this._scriptSnippetModel = scriptSnippetModel;
  this._uiSourceCodeForScriptId = {};
  this._scriptForUISourceCode = new Map();
  this._evaluationIndexForUISourceCode = new Map();
  debuggerModel.addEventListener(WebInspector.DebuggerModel.Events.GlobalObjectCleared, this._reset, this);
}
WebInspector.SnippetScriptMapping.prototype = {
  _releaseSnippetScript: function (uiSourceCode) {
    var script = this._scriptForUISourceCode.get(uiSourceCode);
    if (!script)
      return;
    delete this._uiSourceCodeForScriptId[script.scriptId];
    this._scriptForUISourceCode.remove(uiSourceCode);
    this._evaluationIndexForUISourceCode.remove(uiSourceCode);
  },
  _setEvaluationIndex: function (evaluationIndex, uiSourceCode) {
    this._evaluationIndexForUISourceCode.set(uiSourceCode, evaluationIndex);
  },
  evaluationIndex: function (uiSourceCode) {
    return this._evaluationIndexForUISourceCode.get(uiSourceCode);
  },
  _evaluationSourceURL: function (uiSourceCode) {
    var evaluationSuffix = "_" + this._evaluationIndexForUISourceCode.get(uiSourceCode);
    var snippetId = this._scriptSnippetModel._snippetIdForUISourceCode.get(uiSourceCode);
    return WebInspector.ScriptSnippetModel.snippetSourceURLPrefix + snippetId + evaluationSuffix;
  },
  _reset: function () {
    this._uiSourceCodeForScriptId = {};
    this._scriptForUISourceCode.clear();
    this._evaluationIndexForUISourceCode.clear();
  },
  rawLocationToUILocation: function (rawLocation) {
    var debuggerModelLocation = (rawLocation);
    var uiSourceCode = this._uiSourceCodeForScriptId[debuggerModelLocation.scriptId];
    if (!uiSourceCode)
      return null;
    return uiSourceCode.uiLocation(debuggerModelLocation.lineNumber, debuggerModelLocation.columnNumber || 0);
  },
  uiLocationToRawLocation: function (uiSourceCode, lineNumber, columnNumber) {
    var script = this._scriptForUISourceCode.get(uiSourceCode);
    if (!script)
      return null;
    return this._debuggerModel.createRawLocation(script, lineNumber, columnNumber);
  },
  _addScript: function (script, uiSourceCode) {
    console.assert(!this._scriptForUISourceCode.get(uiSourceCode));
    WebInspector.debuggerWorkspaceBinding.setSourceMapping(this._target, uiSourceCode, this);
    this._uiSourceCodeForScriptId[script.scriptId] = uiSourceCode;
    this._scriptForUISourceCode.set(uiSourceCode, script);
    WebInspector.debuggerWorkspaceBinding.pushSourceMapping(script, this);
  },
  _restoreBreakpoints: function (uiSourceCode, breakpointLocations) {
    var script = this._scriptForUISourceCode.get(uiSourceCode);
    if (!script)
      return;
    var rawLocation = (this._debuggerModel.createRawLocation(script, 0, 0));
    var scriptUISourceCode = WebInspector.debuggerWorkspaceBinding.rawLocationToUILocation(rawLocation).uiSourceCode;
    if (scriptUISourceCode)
      this._scriptSnippetModel._restoreBreakpoints(scriptUISourceCode, breakpointLocations);
  },
  isIdentity: function () {
    return false;
  },
  uiLineHasMapping: function (uiSourceCode, lineNumber) {
    return true;
  }
}
WebInspector.SnippetContentProvider = function (snippet) {
  this._snippet = snippet;
}
WebInspector.SnippetContentProvider.prototype = {
  contentURL: function () {
    return "";
  },
  contentType: function () {
    return WebInspector.resourceTypes.Script;
  },
  requestContent: function () {
    return Promise.resolve((this._snippet.content));
  },
  searchInContent: function (query, caseSensitive, isRegex, callback) {
    function performSearch() {
      callback(WebInspector.ContentProvider.performSearchInContent(this._snippet.content, query, caseSensitive, isRegex));
    }
    window.setTimeout(performSearch.bind(this), 0);
  }
}
WebInspector.SnippetsProject = function (workspace, model) {
  WebInspector.ContentProviderBasedProject.call(this, workspace, "snippets:", WebInspector.projectTypes.Snippets, "");
  this._model = model;
}
WebInspector.SnippetsProject.prototype = {
  addSnippet: function (name, contentProvider) {
    return this.addContentProvider(name, contentProvider);
  },
  canSetFileContent: function () {
    return true;
  },
  setFileContent: function (uiSourceCode, newContent, callback) {
    this._model._setScriptSnippetContent(uiSourceCode.url(), newContent);
    callback("");
  },
  canRename: function () {
    return true;
  },
  performRename: function (url, newName, callback) {
    this._model.renameScriptSnippet(url, newName, callback);
  },
  createFile: function (url, name, content, callback) {
    callback(this._model.createScriptSnippet(content));
  },
  deleteFile: function (url) {
    this._model.deleteScriptSnippet(url);
  },
  __proto__: WebInspector.ContentProviderBasedProject.prototype
}
WebInspector.scriptSnippetModel = new WebInspector.ScriptSnippetModel(WebInspector.workspace);;