WebInspector.BlockedURLsPane = function () {
  WebInspector.VBox.call(this, true);
  this.registerRequiredCSS("network/blockedURLsPane.css");
  this.contentElement.classList.add("blocked-urls-pane");
  WebInspector.BlockedURLsPane._instance = this;
  this._blockedURLsSetting = WebInspector.moduleSetting("blockedURLs");
  this._blockedURLsSetting.addChangeListener(this._update, this);
  this._toolbar = new WebInspector.Toolbar("", this.contentElement);
  this._toolbar.element.addEventListener("click", consumeEvent);
  var addButton = new WebInspector.ToolbarButton(WebInspector.UIString("Add pattern"), "add-toolbar-item");
  addButton.addEventListener("click", this._addButtonClicked.bind(this));
  this._toolbar.appendToolbarItem(addButton);
  var clearButton = new WebInspector.ToolbarButton(WebInspector.UIString("Remove all"), "clear-toolbar-item");
  clearButton.addEventListener("click", this._removeAll.bind(this));
  this._toolbar.appendToolbarItem(clearButton);
  this._emptyElement = this.contentElement.createChild("div", "no-blocked-urls");
  this._emptyElement.createChild("span").textContent = WebInspector.UIString("Requests are not blocked. ");
  var addLink = this._emptyElement.createChild("span", "link");
  addLink.textContent = WebInspector.UIString("Add pattern.");
  addLink.href = "";
  addLink.addEventListener("click", this._addButtonClicked.bind(this), false);
  this._emptyElement.addEventListener("contextmenu", this._emptyElementContextMenu.bind(this), true);
  this._listElement = this.contentElement.createChild("div", "blocked-urls-list");
  this._blockedCountForUrl = new Map();
  WebInspector.targetManager.addModelListener(WebInspector.NetworkManager, WebInspector.NetworkManager.EventTypes.RequestFinished, this._onRequestFinished, this);
  this._updateThrottler = new WebInspector.Throttler(200);
  this._update();
}
WebInspector.BlockedURLsPane.prototype = {
  _emptyElementContextMenu: function (event) {
    var contextMenu = new WebInspector.ContextMenu(event);
    contextMenu.appendItem(WebInspector.UIString.capitalize("Add ^pattern"), this._addButtonClicked.bind(this));
    contextMenu.show();
  },
  _addButtonClicked: function () {
    this._emptyElement.classList.add("hidden");
    var element = this._createElement("", this._blockedURLsSetting.get().length);
    this._listElement.appendChild(element);
    element.scrollIntoViewIfNeeded();
    this._edit("", element, this._addBlockedURL.bind(this));
  },
  _edit: function (content, element, onAccept) {
    this._editing = true;
    element.classList.add("blocked-url-editing");
    var input = element.createChild("input");
    input.setAttribute("type", "text");
    input.value = content;
    input.placeholder = WebInspector.UIString("Text pattern to block matching requests; use * for wildcard");
    input.addEventListener("blur", commit.bind(this), false);
    input.addEventListener("keydown", keydown.bind(this), false);
    input.focus();

    function finish() {
      this._editing = false;
      element.removeChild(input);
      element.classList.remove("blocked-url-editing");
    }

    function commit() {
      if (!this._editing)
        return;
      var text = input.value.trim();
      finish.call(this);
      if (text)
        onAccept(text);
      else
        this._update();
    }

    function keydown(event) {
      if (isEnterKey(event)) {
        event.consume();
        commit.call(this);
      } else if (event.keyCode === WebInspector.KeyboardShortcut.Keys.Esc.code || event.key === "Escape") {
        event.consume();
        finish.call(this);
        this._update();
      }
    }
  },
  _addBlockedURL: function (url) {
    var blocked = this._blockedURLsSetting.get();
    blocked.push(url);
    this._blockedURLsSetting.set(blocked);
  },
  _removeBlockedURL: function (index) {
    var blocked = this._blockedURLsSetting.get();
    blocked.splice(index, 1);
    this._blockedURLsSetting.set(blocked);
  },
  _changeBlockedURL: function (index, url) {
    var blocked = this._blockedURLsSetting.get();
    blocked.splice(index, 1, url);
    this._blockedURLsSetting.set(blocked);
  },
  _removeAll: function () {
    this._blockedURLsSetting.set([]);
  },
  _contextMenu: function (index, event) {
    var contextMenu = new WebInspector.ContextMenu(event);
    contextMenu.appendItem(WebInspector.UIString.capitalize("Add ^pattern"), this._addButtonClicked.bind(this));
    contextMenu.appendItem(WebInspector.UIString.capitalize("Remove ^pattern"), this._removeBlockedURL.bind(this, index));
    contextMenu.appendItem(WebInspector.UIString.capitalize("Remove ^all"), this._removeAll.bind(this));
    contextMenu.show();
  },
  _update: function () {
    if (this._editing)
      return Promise.resolve();
    this._listElement.removeChildren();
    var blocked = this._blockedURLsSetting.get();
    for (var index = 0; index < blocked.length; index++)
      this._listElement.appendChild(this._createElement(blocked[index], index));
    this._emptyElement.classList.toggle("hidden", !!blocked.length);
    return Promise.resolve();
  },
  _createElement: function (url, index) {
    var element = createElementWithClass("div", "blocked-url");
    var label = element.createChild("div", "blocked-url-text");
    label.textContent = url;
    var count = this._blockedRequestsCount(url);
    var countElement = element.createChild("div", "blocked-count monospace");
    countElement.textContent = String.sprintf("[%d]", count);
    countElement.title = WebInspector.UIString(count === 1 ? "%d request blocked by this pattern" : "%d requests blocked by this pattern", count);
    var removeButton = element.createChild("div", "remove-button");
    removeButton.title = WebInspector.UIString("Remove");
    removeButton.addEventListener("click", this._removeBlockedURL.bind(this, index), false);
    element.addEventListener("contextmenu", this._contextMenu.bind(this, index), true);
    element.addEventListener("dblclick", this._edit.bind(this, url, element, this._changeBlockedURL.bind(this, index)), false);
    return element;
  },
  _blockedRequestsCount: function (url) {
    if (!url)
      return 0;
    var result = 0;
    for (var blockedUrl of this._blockedCountForUrl.keys()) {
      if (this._matches(url, blockedUrl))
        result += this._blockedCountForUrl.get(blockedUrl);
    }
    return result;
  },
  _matches: function (pattern, url) {
    var pos = 0;
    var parts = pattern.split("*");
    for (var index = 0; index < parts.length; index++) {
      var part = parts[index];
      if (!part.length)
        continue;
      pos = url.indexOf(part, pos);
      if (pos === -1)
        return false;
      pos += part.length;
    }
    return true;
  },
  reset: function () {
    this._blockedCountForUrl.clear();
  },
  _onRequestFinished: function (event) {
    var request = (event.data);
    if (request.wasBlocked()) {
      var count = this._blockedCountForUrl.get(request.url) || 0;
      this._blockedCountForUrl.set(request.url, count + 1);
      this._updateThrottler.schedule(this._update.bind(this));
    }
  },
  __proto__: WebInspector.VBox.prototype
}
WebInspector.BlockedURLsPane._instance = null;
WebInspector.BlockedURLsPane.reset = function () {
  if (WebInspector.BlockedURLsPane._instance)
    WebInspector.BlockedURLsPane._instance.reset();
}
WebInspector.BlockedURLsPane.ActionDelegate = function () {}
WebInspector.BlockedURLsPane.ActionDelegate.prototype = {
  handleAction: function (context, actionId) {
    WebInspector.inspectorView.showViewInDrawer("network.blocked-urls");
    return true;
  }
};
WebInspector.EventSourceMessagesView = function (request) {
  WebInspector.VBox.call(this);
  this.registerRequiredCSS("network/eventSourceMessagesView.css");
  this.element.classList.add("event-source-messages-view");
  this._request = request;
  var columns = [{
    id: "id",
    title: WebInspector.UIString("Id"),
    sortable: true,
    weight: 8
  }, {
    id: "type",
    title: WebInspector.UIString("Type"),
    sortable: true,
    weight: 8
  }, {
    id: "data",
    title: WebInspector.UIString("Data"),
    sortable: false,
    weight: 88
  }, {
    id: "time",
    title: WebInspector.UIString("Time"),
    sortable: true,
    weight: 8
  }];
  this._dataGrid = new WebInspector.SortableDataGrid(columns);
  this._dataGrid.setStickToBottom(true);
  this._dataGrid.markColumnAsSortedBy("time", WebInspector.DataGrid.Order.Ascending);
  this._sortItems();
  this._dataGrid.addEventListener(WebInspector.DataGrid.Events.SortingChanged, this._sortItems, this);
  this._dataGrid.setName("EventSourceMessagesView");
  this._dataGrid.asWidget().show(this.element);
}
WebInspector.EventSourceMessagesView.prototype = {
  wasShown: function () {
    this._dataGrid.rootNode().removeChildren();
    var messages = this._request.eventSourceMessages();
    for (var i = 0; i < messages.length; ++i)
      this._dataGrid.insertChild(new WebInspector.EventSourceMessageNode(messages[i]));
    this._request.addEventListener(WebInspector.NetworkRequest.Events.EventSourceMessageAdded, this._messageAdded, this);
  },
  willHide: function () {
    this._request.removeEventListener(WebInspector.NetworkRequest.Events.EventSourceMessageAdded, this._messageAdded, this);
  },
  _messageAdded: function (event) {
    var message = (event.data);
    this._dataGrid.insertChild(new WebInspector.EventSourceMessageNode(message));
  },
  _sortItems: function () {
    var sortColumnIdentifier = this._dataGrid.sortColumnIdentifier();
    if (!sortColumnIdentifier)
      return;
    var comparator = WebInspector.EventSourceMessageNode.Comparators[sortColumnIdentifier];
    if (!comparator)
      return;
    this._dataGrid.sortNodes(comparator, !this._dataGrid.isSortOrderAscending());
  },
  __proto__: WebInspector.VBox.prototype
}
WebInspector.EventSourceMessageNode = function (message) {
  this._message = message;
  var time = new Date(message.time * 1000);
  var timeText = ("0" + time.getHours()).substr(-2) + ":" + ("0" + time.getMinutes()).substr(-2) + ":" + ("0" + time.getSeconds()).substr(-2) + "." + ("00" + time.getMilliseconds()).substr(-3);
  var timeNode = createElement("div");
  timeNode.createTextChild(timeText);
  timeNode.title = time.toLocaleString();
  WebInspector.SortableDataGridNode.call(this, {
    id: message.eventId,
    type: message.eventName,
    data: message.data,
    time: timeNode
  });
}
WebInspector.EventSourceMessageNode.prototype = {
  __proto__: WebInspector.SortableDataGridNode.prototype
}
WebInspector.EventSourceMessageNodeComparator = function (field, a, b) {
  var aValue = a._message[field];
  var bValue = b._message[field];
  return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
}
WebInspector.EventSourceMessageNode.Comparators = {
  "id": WebInspector.EventSourceMessageNodeComparator.bind(null, "eventId"),
  "type": WebInspector.EventSourceMessageNodeComparator.bind(null, "eventName"),
  "time": WebInspector.EventSourceMessageNodeComparator.bind(null, "time")
};;
WebInspector.FilterSuggestionBuilder = function (keys) {
  this._keys = keys;
  this._valueSets = {};
  this._valueLists = {};
}
WebInspector.FilterSuggestionBuilder.Filter;
WebInspector.FilterSuggestionBuilder.prototype = {
  buildSuggestions: function (input) {
    var text = input.value;
    var end = input.selectionEnd;
    if (end !== text.length)
      return null;
    var start = input.selectionStart;
    text = text.substring(0, start);
    var prefixIndex = text.lastIndexOf(" ") + 1;
    var prefix = text.substring(prefixIndex);
    if (!prefix)
      return [];
    var negative = prefix.startsWith("-");
    if (negative)
      prefix = prefix.substring(1);
    var modifier = negative ? "-" : "";
    var valueDelimiterIndex = prefix.indexOf(":");
    var suggestions = [];
    if (valueDelimiterIndex === -1) {
      var matcher = new RegExp("^" + prefix.escapeForRegExp(), "i");
      for (var j = 0; j < this._keys.length; ++j) {
        if (this._keys[j].match(matcher))
          suggestions.push(modifier + this._keys[j] + ":");
      }
    } else {
      var key = prefix.substring(0, valueDelimiterIndex).toLowerCase();
      var value = prefix.substring(valueDelimiterIndex + 1);
      var matcher = new RegExp("^" + value.escapeForRegExp(), "i");
      var items = this._values(key);
      for (var i = 0; i < items.length; ++i) {
        if (items[i].match(matcher) && (items[i] !== value))
          suggestions.push(modifier + key + ":" + items[i]);
      }
    }
    return suggestions;
  },
  applySuggestion: function (input, suggestion, isIntermediate) {
    var text = input.value;
    var start = input.selectionStart;
    text = text.substring(0, start);
    var prefixIndex = text.lastIndexOf(" ") + 1;
    if (isIntermediate) {
      text = text + suggestion.substring(text.length - prefixIndex);
      input.value = text;
    } else {
      text = text.substring(0, prefixIndex) + suggestion;
      input.value = text;
      start = text.length;
    }
    input.setSelectionRange(start, text.length);
  },
  unapplySuggestion: function (input) {
    var start = input.selectionStart;
    var end = input.selectionEnd;
    var text = input.value;
    if (start !== end && end === text.length)
      input.value = text.substring(0, start);
  },
  _values: function (key) {
    var result = this._valueLists[key];
    if (!result)
      return [];
    result.sort();
    return result;
  },
  addItem: function (key, value) {
    if (!value)
      return;
    var set = this._valueSets[key];
    var list = this._valueLists[key];
    if (!set) {
      set = {};
      this._valueSets[key] = set;
      list = [];
      this._valueLists[key] = list;
    }
    if (set[value])
      return;
    set[value] = true;
    list.push(value);
  },
  parseQuery: function (query) {
    var filters = [];
    var text = [];
    var parts = query.split(/\s+/);
    for (var i = 0; i < parts.length; ++i) {
      var part = parts[i];
      if (!part)
        continue;
      var colonIndex = part.indexOf(":");
      if (colonIndex === -1) {
        text.push(part);
        continue;
      }
      var key = part.substring(0, colonIndex);
      var negative = key.startsWith("-");
      if (negative)
        key = key.substring(1);
      if (this._keys.indexOf(key) === -1) {
        text.push(part);
        continue;
      }
      var value = part.substring(colonIndex + 1);
      filters.push({
        type: key,
        data: value,
        negative: negative
      });
    }
    return {
      text: text,
      filters: filters
    };
  }
};;
WebInspector.HARWriter = function () {}
WebInspector.HARWriter.prototype = {
  write: function (stream, requests, progress) {
    this._stream = stream;
    this._harLog = (new WebInspector.HARLog(requests)).build();
    this._pendingRequests = 1;
    var entries = this._harLog.entries;
    for (var i = 0; i < entries.length; ++i) {
      var content = requests[i].content;
      if (typeof content === "undefined" && requests[i].finished) {
        ++this._pendingRequests;
        requests[i].requestContent().then(this._onContentAvailable.bind(this, entries[i], requests[i]));
      } else if (content !== null)
        this._setEntryContent(entries[i], requests[i]);
    }
    var compositeProgress = new WebInspector.CompositeProgress(progress);
    this._writeProgress = compositeProgress.createSubProgress();
    if (--this._pendingRequests) {
      this._requestsProgress = compositeProgress.createSubProgress();
      this._requestsProgress.setTitle(WebInspector.UIString("Collecting contentâ€¦"));
      this._requestsProgress.setTotalWork(this._pendingRequests);
    } else
      this._beginWrite();
  },
  _setEntryContent: function (entry, request) {
    if (request.content !== null)
      entry.response.content.text = request.content;
    if (request.contentEncoded)
      entry.response.content.encoding = "base64";
  },
  _onContentAvailable: function (entry, request, content) {
    this._setEntryContent(entry, request);
    if (this._requestsProgress)
      this._requestsProgress.worked();
    if (!--this._pendingRequests) {
      this._requestsProgress.done();
      this._beginWrite();
    }
  },
  _beginWrite: function () {
    const jsonIndent = 2;
    this._text = JSON.stringify({
      log: this._harLog
    }, null, jsonIndent);
    this._writeProgress.setTitle(WebInspector.UIString("Writing fileâ€¦"));
    this._writeProgress.setTotalWork(this._text.length);
    this._bytesWritten = 0;
    this._writeNextChunk(this._stream);
  },
  _writeNextChunk: function (stream, error) {
    if (this._bytesWritten >= this._text.length || error) {
      stream.close();
      this._writeProgress.done();
      return;
    }
    const chunkSize = 100000;
    var text = this._text.substring(this._bytesWritten, this._bytesWritten + chunkSize);
    this._bytesWritten += text.length;
    stream.write(text, this._writeNextChunk.bind(this));
    this._writeProgress.setWorked(this._bytesWritten);
  }
};
WebInspector.JSONView = function (parsedJSON) {
  WebInspector.VBox.call(this);
  this._parsedJSON = parsedJSON;
  this.element.classList.add("json-view");
  this._searchableView;
  this._treeOutline;
  this._currentSearchFocusIndex = 0;
  this._currentSearchTreeElements = [];
  this._searchRegex = null;
}
WebInspector.JSONView.createSearchableView = function (parsedJSON) {
  var jsonView = new WebInspector.JSONView(parsedJSON);
  var searchableView = new WebInspector.SearchableView(jsonView);
  searchableView.setPlaceholder(WebInspector.UIString("Find"));
  jsonView._searchableView = searchableView;
  jsonView.show(searchableView.element);
  jsonView.element.setAttribute("tabIndex", 0);
  return searchableView;
}
WebInspector.JSONView.parseJSON = function (text) {
  var returnObj = null;
  if (text)
    returnObj = WebInspector.JSONView._extractJSON((text));
  if (!returnObj)
    return Promise.resolve((null));
  return WebInspector.formatterWorkerPool.runTask("relaxedJSONParser", {
    content: returnObj.data
  }).then(handleReturnedJSON)

  function handleReturnedJSON(event) {
    if (!event || !event.data)
      return null;
    returnObj.data = event.data;
    return returnObj;
  }
}
WebInspector.JSONView._extractJSON = function (text) {
  if (text.startsWith("<"))
    return null;
  var inner = WebInspector.JSONView._findBrackets(text, "{", "}");
  var inner2 = WebInspector.JSONView._findBrackets(text, "[", "]");
  inner = inner2.length > inner.length ? inner2 : inner;
  if (inner.length === -1 || text.length - inner.length > 80)
    return null;
  var prefix = text.substring(0, inner.start);
  var suffix = text.substring(inner.end + 1);
  text = text.substring(inner.start, inner.end + 1);
  if (suffix.trim().length && !(suffix.trim().startsWith(")") && prefix.trim().endsWith("(")))
    return null;
  return new WebInspector.ParsedJSON(text, prefix, suffix);
}
WebInspector.JSONView._findBrackets = function (text, open, close) {
  var start = text.indexOf(open);
  var end = text.lastIndexOf(close);
  var length = end - start - 1;
  if (start === -1 || end === -1 || end < start)
    length = -1;
  return {
    start: start,
    end: end,
    length: length
  };
}
WebInspector.JSONView.prototype = {
  wasShown: function () {
    this._initialize();
  },
  _initialize: function () {
    if (this._initialized)
      return;
    this._initialized = true;
    var obj = WebInspector.RemoteObject.fromLocalObject(this._parsedJSON.data);
    var title = this._parsedJSON.prefix + obj.description + this._parsedJSON.suffix;
    this._treeOutline = new WebInspector.ObjectPropertiesSection(obj, title);
    this._treeOutline.setEditable(false);
    this._treeOutline.expand();
    this.element.appendChild(this._treeOutline.element);
  },
  _jumpToMatch: function (index) {
    if (!this._searchRegex)
      return;
    var previousFocusElement = this._currentSearchTreeElements[this._currentSearchFocusIndex];
    if (previousFocusElement)
      previousFocusElement.setSearchRegex(this._searchRegex);
    var newFocusElement = this._currentSearchTreeElements[index];
    if (newFocusElement) {
      this._updateSearchIndex(index);
      newFocusElement.setSearchRegex(this._searchRegex, WebInspector.highlightedCurrentSearchResultClassName);
      newFocusElement.reveal();
    } else {
      this._updateSearchIndex(0);
    }
  },
  _updateSearchCount: function (count) {
    if (!this._searchableView)
      return;
    this._searchableView.updateSearchMatchesCount(count);
  },
  _updateSearchIndex: function (index) {
    this._currentSearchFocusIndex = index;
    if (!this._searchableView)
      return;
    this._searchableView.updateCurrentMatchIndex(index);
  },
  searchCanceled: function () {
    this._searchRegex = null;
    this._currentSearchTreeElements = [];
    for (var element = this._treeOutline.rootElement(); element; element = element.traverseNextTreeElement(false)) {
      if (!(element instanceof WebInspector.ObjectPropertyTreeElement))
        continue;
      element.revertHighlightChanges();
    }
    this._updateSearchCount(0);
    this._updateSearchIndex(0);
  },
  performSearch: function (searchConfig, shouldJump, jumpBackwards) {
    var newIndex = this._currentSearchFocusIndex;
    var previousSearchFocusElement = this._currentSearchTreeElements[newIndex];
    this.searchCanceled();
    this._searchRegex = searchConfig.toSearchRegex(true);
    for (var element = this._treeOutline.rootElement(); element; element = element.traverseNextTreeElement(false)) {
      if (!(element instanceof WebInspector.ObjectPropertyTreeElement))
        continue;
      var hasMatch = element.setSearchRegex(this._searchRegex);
      if (hasMatch)
        this._currentSearchTreeElements.push(element);
      if (previousSearchFocusElement === element) {
        var currentIndex = this._currentSearchTreeElements.length - 1;
        if (hasMatch || jumpBackwards)
          newIndex = currentIndex;
        else
          newIndex = currentIndex + 1;
      }
    }
    this._updateSearchCount(this._currentSearchTreeElements.length);
    if (!this._currentSearchTreeElements.length) {
      this._updateSearchIndex(0);
      return;
    }
    newIndex = mod(newIndex, this._currentSearchTreeElements.length);
    this._jumpToMatch(newIndex);
  },
  jumpToNextSearchResult: function () {
    if (!this._currentSearchTreeElements.length)
      return;
    var newIndex = mod(this._currentSearchFocusIndex + 1, this._currentSearchTreeElements.length);
    this._jumpToMatch(newIndex);
  },
  jumpToPreviousSearchResult: function () {
    if (!this._currentSearchTreeElements.length)
      return;
    var newIndex = mod(this._currentSearchFocusIndex - 1, this._currentSearchTreeElements.length);
    this._jumpToMatch(newIndex);
  },
  supportsCaseSensitiveSearch: function () {
    return true;
  },
  supportsRegexSearch: function () {
    return true;
  },
  __proto__: WebInspector.VBox.prototype
}
WebInspector.ParsedJSON = function (data, prefix, suffix) {
  this.data = data;
  this.prefix = prefix;
  this.suffix = suffix;
};
WebInspector.RequestView = function (request) {
  WebInspector.VBox.call(this);
  this.element.classList.add("request-view");
  this.request = request;
}
WebInspector.RequestView.prototype = {
  __proto__: WebInspector.VBox.prototype
}
WebInspector.RequestView.hasTextContent = function (request) {
  if (request.resourceType().isTextType())
    return true;
  if (request.resourceType() === WebInspector.resourceTypes.Other || request.hasErrorStatusCode())
    return !!request.content && !request.contentEncoded;
  return false;
}
WebInspector.RequestView.nonSourceViewForRequest = function (request) {
  switch (request.resourceType()) {
  case WebInspector.resourceTypes.Image:
    return new WebInspector.ImageView(request.mimeType, request);
  case WebInspector.resourceTypes.Font:
    return new WebInspector.FontView(request.mimeType, request);
  default:
    return new WebInspector.RequestView(request);
  }
};
WebInspector.NetworkConfigView = function () {
  WebInspector.VBox.call(this, true);
  this.registerRequiredCSS("network/networkConfigView.css");
  this.contentElement.classList.add("network-config");
  this._createCacheSection();
  this.contentElement.createChild("div").classList.add("panel-section-separator");
  this._createNetworkThrottlingSection();
  this.contentElement.createChild("div").classList.add("panel-section-separator");
  this._createUserAgentSection();
}
WebInspector.NetworkConfigView.prototype = {
  _createSection: function (title, className) {
    var section = this.contentElement.createChild("section", "network-config-group");
    if (className)
      section.classList.add(className);
    section.createChild("div", "network-config-title").textContent = title;
    return section.createChild("div", "network-config-fields");
  },
  _createCacheSection: function () {
    var section = this._createSection(WebInspector.UIString("Caching"), "network-config-disable-cache");
    section.appendChild(WebInspector.SettingsUI.createSettingCheckbox(WebInspector.UIString("Disable cache"), WebInspector.moduleSetting("cacheDisabled"), true));
  },
  _createNetworkThrottlingSection: function () {
    var section = this._createSection(WebInspector.UIString("Network throttling"), "network-config-throttling");
    WebInspector.NetworkConditionsSelector.decorateSelect((section.createChild("select", "chrome-select")));
  },
  _createUserAgentSection: function () {
    var section = this._createSection(WebInspector.UIString("User agent"), "network-config-ua");
    var checkboxLabel = createCheckboxLabel(WebInspector.UIString("Select automatically"), true);
    section.appendChild(checkboxLabel);
    this._autoCheckbox = checkboxLabel.checkboxElement;
    this._autoCheckbox.addEventListener("change", this._userAgentTypeChanged.bind(this));
    this._customUserAgentSetting = WebInspector.settings.createSetting("customUserAgent", "");
    this._customUserAgentSetting.addChangeListener(this._customUserAgentChanged, this);
    this._customUserAgent = section.createChild("div", "network-config-ua-custom");
    this._customSelectAndInput = WebInspector.NetworkConfigView.createUserAgentSelectAndInput();
    this._customSelectAndInput.select.classList.add("chrome-select");
    this._customUserAgent.appendChild(this._customSelectAndInput.select);
    this._customUserAgent.appendChild(this._customSelectAndInput.input);
    this._userAgentTypeChanged();
  },
  _customUserAgentChanged: function () {
    if (this._autoCheckbox.checked)
      return;
    WebInspector.multitargetNetworkManager.setCustomUserAgentOverride(this._customUserAgentSetting.get());
  },
  _userAgentTypeChanged: function () {
    var useCustomUA = !this._autoCheckbox.checked;
    this._customUserAgent.classList.toggle("checked", useCustomUA);
    this._customSelectAndInput.select.disabled = !useCustomUA;
    this._customSelectAndInput.input.disabled = !useCustomUA;
    var customUA = useCustomUA ? this._customUserAgentSetting.get() : "";
    WebInspector.multitargetNetworkManager.setCustomUserAgentOverride(customUA);
  },
  __proto__: WebInspector.VBox.prototype
}
WebInspector.NetworkConfigView.createUserAgentSelectAndInput = function () {
  var userAgentSetting = WebInspector.settings.createSetting("customUserAgent", "");
  var userAgentSelectElement = createElement("select");
  const customOverride = {
    title: WebInspector.UIString("Custom..."),
    value: "custom"
  };
  userAgentSelectElement.appendChild(new Option(customOverride.title, customOverride.value));
  var groups = WebInspector.NetworkConfigView._userAgentGroups;
  for (var userAgentDescriptor of WebInspector.NetworkConfigView._userAgentGroups) {
    var groupElement = userAgentSelectElement.createChild("optgroup");
    groupElement.label = userAgentDescriptor.title;
    for (var userAgentVersion of userAgentDescriptor.values)
      groupElement.appendChild(new Option(userAgentVersion.title, userAgentVersion.value));
  }
  userAgentSelectElement.selectedIndex = 0;
  var otherUserAgentElement = createElement("input");
  otherUserAgentElement.type = "text";
  otherUserAgentElement.value = userAgentSetting.get();
  otherUserAgentElement.title = userAgentSetting.get();
  otherUserAgentElement.placeholder = WebInspector.UIString("Enter a custom user agent");
  otherUserAgentElement.required = true;
  settingChanged();
  userAgentSelectElement.addEventListener("change", userAgentSelected, false);
  otherUserAgentElement.addEventListener("input", applyOtherUserAgent, false);

  function userAgentSelected() {
    var value = userAgentSelectElement.options[userAgentSelectElement.selectedIndex].value;
    if (value !== customOverride.value) {
      userAgentSetting.set(value);
      otherUserAgentElement.value = value;
      otherUserAgentElement.title = value;
    } else {
      otherUserAgentElement.select();
    }
  }

  function settingChanged() {
    var value = userAgentSetting.get();
    var options = userAgentSelectElement.options;
    var selectionRestored = false;
    for (var i = 0; i < options.length; ++i) {
      if (options[i].value === value) {
        userAgentSelectElement.selectedIndex = i;
        selectionRestored = true;
        break;
      }
    }
    if (!selectionRestored)
      userAgentSelectElement.selectedIndex = 0;
  }

  function applyOtherUserAgent() {
    if (userAgentSetting.get() !== otherUserAgentElement.value) {
      userAgentSetting.set(otherUserAgentElement.value);
      otherUserAgentElement.title = otherUserAgentElement.value;
      settingChanged();
    }
  }
  return {
    select: userAgentSelectElement,
    input: otherUserAgentElement
  };
}
WebInspector.NetworkConfigView._userAgentGroups = [{
  title: "Android",
  values: [{
    title: "Android (4.0.2) Browser — Galaxy Nexus",
    value: "Mozilla/5.0 (Linux; U; Android 4.0.2; en-us; Galaxy Nexus Build/ICL53F) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30"
  }, {
    title: "Android (2.3) Browser — Nexus S",
    value: "Mozilla/5.0 (Linux; U; Android 2.3.6; en-us; Nexus S Build/GRK39F) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1"
  }]
}, {
  title: "BlackBerry",
  values: [{
    title: "BlackBerry — BB10",
    value: "Mozilla/5.0 (BB10; Touch) AppleWebKit/537.1+ (KHTML, like Gecko) Version/10.0.0.1337 Mobile Safari/537.1+"
  }, {
    title: "BlackBerry — PlayBook 2.1",
    value: "Mozilla/5.0 (PlayBook; U; RIM Tablet OS 2.1.0; en-US) AppleWebKit/536.2+ (KHTML, like Gecko) Version/7.2.1.0 Safari/536.2+"
  }, {
    title: "BlackBerry — 9900",
    value: "Mozilla/5.0 (BlackBerry; U; BlackBerry 9900; en-US) AppleWebKit/534.11+ (KHTML, like Gecko) Version/7.0.0.187 Mobile Safari/534.11+"
  }]
}, {
  title: "Chrome",
  values: [{
    title: "Chrome 52 — Android Mobile",
    value: "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2725.0 Mobile Safari/537.36"
  }, {
    title: "Chrome 52 — Android Tablet",
    value: "Mozilla/5.0 (Linux; Android 4.3; Nexus 7 Build/JSS15Q) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2725.0 Safari/537.36"
  }, {
    title: "Chrome 52 — iPhone",
    value: "Mozilla/5.0 (iPhone; CPU iPhone OS 9_1 like Mac OS X) AppleWebKit/601.1 (KHTML, like Gecko) CriOS/52.0.2725.0 Mobile/13B143 Safari/601.1.46"
  }, {
    title: "Chrome 52 — iPad",
    value: "Mozilla/5.0 (iPad; CPU OS 9_1 like Mac OS X) AppleWebKit/601.1 (KHTML, like Gecko) CriOS/52.0.2725.0 Mobile/13B143 Safari/601.1.46"
  }, {
    title: "Chrome 52 — Mac",
    value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2725.0 Safari/537.36"
  }, {
    title: "Chrome 52 — Windows",
    value: "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2725.0 Safari/537.36"
  }]
}, {
  title: "Edge",
  values: [{
    title: "Edge — Windows",
    value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/12.10240"
  }, {
    title: "Edge — Mobile",
    value: "Mozilla/5.0 (Windows Phone 10.0; Android 4.2.1; Microsoft; Lumia 640 XL LTE) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Mobile Safari/537.36 Edge/12.10166"
  }, {
    title: "Edge — XBox",
    value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox One) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/13.10586"
  }]
}, {
  title: "Firefox",
  values: [{
    title: "Firefox 46 — Android Mobile",
    value: "Mozilla/5.0 (Android 4.4; Mobile; rv:46.0) Gecko/46.0 Firefox/46.0"
  }, {
    title: "Firefox 46 — Android Tablet",
    value: "Mozilla/5.0 (Android 4.4; Tablet; rv:46.0) Gecko/46.0 Firefox/46.0"
  }, {
    title: "Firefox 46 — iPhone",
    value: "Mozilla/5.0 (iPhone; CPU iPhone OS 8_3 like Mac OS X) AppleWebKit/600.1.4 (KHTML, like Gecko) FxiOS/1.0 Mobile/12F69 Safari/600.1.4"
  }, {
    title: "Firefox 46 — iPad",
    value: "Mozilla/5.0 (iPad; CPU iPhone OS 8_3 like Mac OS X) AppleWebKit/600.1.4 (KHTML, like Gecko) FxiOS/1.0 Mobile/12F69 Safari/600.1.4"
  }, {
    title: "Firefox 46 — Mac",
    value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.11; rv:46.0) Gecko/20100101 Firefox/46.0"
  }, {
    title: "Firefox 46 — Windows",
    value: "Mozilla/5.0 (Windows NT 10.0; WOW64; rv:46.0) Gecko/20100101 Firefox/46.0"
  }]
}, {
  title: "Googlebot",
  values: [{
    title: "Googlebot",
    value: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
  }, {
    title: "Googlebot Smartphone",
    value: "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2272.96 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
  }]
}, {
  title: "Internet Explorer",
  values: [{
    title: "Internet Explorer 11",
    value: "Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko"
  }, {
    title: "Internet Explorer 10",
    value: "Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; WOW64; Trident/6.0)"
  }, {
    title: "Internet Explorer 9",
    value: "Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; Trident/5.0)"
  }, {
    title: "Internet Explorer 8",
    value: "Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.0; Trident/4.0)"
  }, {
    title: "Internet Explorer 7",
    value: "Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 6.0)"
  }]
}, {
  title: "Opera",
  values: [{
    title: "Opera 37 — Mac",
    value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.87 Safari/537.36 OPR/37.0.2178.31"
  }, {
    title: "Opera 37 — Windows",
    value: "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.87 Safari/537.36 OPR/37.0.2178.31"
  }, {
    title: "Opera 12 — Mac",
    value: "Opera/9.80 (Macintosh; Intel Mac OS X 10.9.1) Presto/2.12.388 Version/12.16"
  }, {
    title: "Opera 12 — Windows",
    value: "Opera/9.80 (Windows NT 6.1) Presto/2.12.388 Version/12.16"
  }, {
    title: "Opera Mobile — Android Mobile",
    value: "Opera/12.02 (Android 4.1; Linux; Opera Mobi/ADR-1111101157; U; en-US) Presto/2.9.201 Version/12.02"
  }, {
    title: "Opera Mini — iOS",
    value: "Opera/9.80 (iPhone; Opera Mini/8.0.0/34.2336; U; en) Presto/2.8.119 Version/11.10"
  }]
}, {
  title: "Safari",
  values: [{
    title: "Safari — iPad iOS 9",
    value: "Mozilla/5.0 (iPad; CPU OS 9_1 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13B137 Safari/601.1"
  }, {
    title: "Safari — iPhone iOS 9",
    value: "Mozilla/5.0 (iPhone; CPU iPhone OS 9_1 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13B137 Safari/601.1"
  }, {
    title: "Safari — Mac",
    value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_3) AppleWebKit/537.75.14 (KHTML, like Gecko) Version/7.0.3 Safari/7046A194A"
  }]
}]
WebInspector.NetworkConfigView.ShowActionDelegate = function () {}
WebInspector.NetworkConfigView.ShowActionDelegate.prototype = {
  handleAction: function (context, actionId) {
    WebInspector.inspectorView.showViewInDrawer("network.config");
    return true;
  }
};
WebInspector.NetworkDataGridNode = function (parentView, request) {
  WebInspector.SortableDataGridNode.call(this, {});
  this._parentView = parentView;
  this._request = request;
  this._staleGraph = true;
  this._isNavigationRequest = false;
  this.selectable = true;
}
WebInspector.NetworkDataGridNode._hoveredRowSymbol = Symbol("hoveredRow");
WebInspector.NetworkDataGridNode.prototype = {
  displayType: function () {
    var mimeType = this._request.mimeType || this._request.requestContentType() || "";
    var resourceType = this._request.resourceType();
    var simpleType = resourceType.name();
    if (resourceType === WebInspector.resourceTypes.Other || resourceType === WebInspector.resourceTypes.Image)
      simpleType = mimeType.replace(/^(application|image)\//, "");
    return simpleType;
  },
  request: function () {
    return this._request;
  },
  markAsNavigationRequest: function () {
    this._isNavigationRequest = true;
    this.refresh();
  },
  nodeSelfHeight: function () {
    return this._parentView.rowHeight();
  },
  createCells: function () {
    this._showTiming = !WebInspector.moduleSetting("networkColorCodeResourceTypes").get() && !this._parentView.calculator().startAtZero;
    this._nameCell = null;
    this._timelineCell = null;
    this._initiatorCell = null;
    this._element.classList.toggle("network-error-row", this._isFailed());
    this._element.classList.toggle("network-navigation-row", this._isNavigationRequest);
    WebInspector.SortableDataGridNode.prototype.createCells.call(this);
    this._updateGraph();
  },
  createCell: function (columnIdentifier) {
    var cell = this.createTD(columnIdentifier);
    switch (columnIdentifier) {
    case "name":
      this._renderNameCell(cell);
      break;
    case "timeline":
      this._createTimelineBar(cell);
      break;
    case "method":
      cell.setTextAndTitle(this._request.requestMethod);
      break;
    case "status":
      this._renderStatusCell(cell);
      break;
    case "protocol":
      cell.setTextAndTitle(this._request.protocol);
      break;
    case "scheme":
      cell.setTextAndTitle(this._request.scheme);
      break;
    case "domain":
      cell.setTextAndTitle(this._request.domain);
      break;
    case "remoteAddress":
      cell.setTextAndTitle(this._request.remoteAddress());
      break;
    case "cookies":
      cell.setTextAndTitle(this._arrayLength(this._request.requestCookies));
      break;
    case "setCookies":
      cell.setTextAndTitle(this._arrayLength(this._request.responseCookies));
      break;
    case "priority":
      cell.setTextAndTitle(WebInspector.uiLabelForPriority(this._request.initialPriority()));
      break;
    case "connectionId":
      cell.setTextAndTitle(this._request.connectionId);
      break;
    case "type":
      this._renderTypeCell(cell);
      break;
    case "initiator":
      this._renderInitiatorCell(cell);
      break;
    case "size":
      this._renderSizeCell(cell);
      break;
    case "time":
      this._renderTimeCell(cell);
      break;
    default:
      cell.setTextAndTitle(this._request.responseHeaderValue(columnIdentifier) || "");
      break;
    }
    return cell;
  },
  _arrayLength: function (array) {
    return array ? "" + array.length : "";
  },
  willAttach: function () {
    if (this._staleGraph)
      this._updateGraph();
    if (this._initiatorCell && this._request.initiatorInfo().type === WebInspector.NetworkRequest.InitiatorType.Script)
      this._initiatorCell.insertBefore(this._linkifiedInitiatorAnchor, this._initiatorCell.firstChild);
  },
  wasDetached: function () {
    if (this._linkifiedInitiatorAnchor)
      this._linkifiedInitiatorAnchor.remove();
  },
  dispose: function () {
    if (this._linkifiedInitiatorAnchor)
      this._parentView.linkifier.disposeAnchor(this._request.target(), this._linkifiedInitiatorAnchor);
  },
  select: function () {
    WebInspector.SortableDataGridNode.prototype.select.apply(this, arguments);
    this._parentView.dispatchEventToListeners(WebInspector.NetworkLogView.EventTypes.RequestSelected, this._request);
  },
  highlightMatchedSubstring: function (regexp) {
    this.element();
    var domChanges = [];
    var matchInfo = this._nameCell.textContent.match(regexp);
    if (matchInfo)
      WebInspector.highlightSearchResult(this._nameCell, matchInfo.index, matchInfo[0].length, domChanges);
    return domChanges;
  },
  _openInNewTab: function () {
    InspectorFrontendHost.openInNewTab(this._request.url);
  },
  _createTimelineBar: function (cell) {
    cell = cell.createChild("div");
    this._timelineCell = cell;
    cell.className = "network-graph-side";
    this._barAreaElement = cell.createChild("div", "network-graph-bar-area");
    this._barAreaElement.request = this._request;
    if (this._showTiming)
      return;
    var type = this._request.resourceType().name();
    var cached = this._request.cached();
    this._barLeftElement = this._barAreaElement.createChild("div", "network-graph-bar");
    this._barLeftElement.classList.add(type, "waiting");
    this._barLeftElement.classList.toggle("cached", cached);
    this._barRightElement = this._barAreaElement.createChild("div", "network-graph-bar");
    this._barRightElement.classList.add(type);
    this._barRightElement.classList.toggle("cached", cached);
    this._labelLeftElement = this._barAreaElement.createChild("div", "network-graph-label");
    this._labelLeftElement.classList.add("waiting");
    this._labelRightElement = this._barAreaElement.createChild("div", "network-graph-label");
    cell.addEventListener("mouseover", this._onMouseOver.bind(this), false);
  },
  _onMouseOver: function (event) {
    this._refreshLabelPositions();
    this._parentView[WebInspector.NetworkDataGridNode._hoveredRowSymbol] = this;
  },
  _isFailed: function () {
    return (this._request.failed && !this._request.statusCode) || (this._request.statusCode >= 400);
  },
  _renderNameCell: function (cell) {
    this._nameCell = cell;
    cell.addEventListener("dblclick", this._openInNewTab.bind(this), false);
    var iconElement;
    if (this._request.resourceType() === WebInspector.resourceTypes.Image) {
      var previewImage = createElementWithClass("img", "image-network-icon-preview");
      this._request.populateImageSource(previewImage);
      iconElement = createElementWithClass("div", "icon");
      iconElement.appendChild(previewImage);
    } else {
      iconElement = createElementWithClass("img", "icon");
    }
    iconElement.classList.add(this._request.resourceType().name());
    cell.appendChild(iconElement);
    cell.createTextChild(this._request.target().decorateLabel(this._request.name()));
    this._appendSubtitle(cell, this._request.path());
    cell.title = this._request.url;
  },
  _renderStatusCell: function (cell) {
    cell.classList.toggle("network-dim-cell", !this._isFailed() && (this._request.cached() || !this._request.statusCode));
    if (this._request.failed && !this._request.canceled && !this._request.wasBlocked()) {
      var failText = WebInspector.UIString("(failed)");
      if (this._request.localizedFailDescription) {
        cell.createTextChild(failText);
        this._appendSubtitle(cell, this._request.localizedFailDescription);
        cell.title = failText + " " + this._request.localizedFailDescription;
      } else
        cell.setTextAndTitle(failText);
    } else if (this._request.statusCode) {
      cell.createTextChild("" + this._request.statusCode);
      this._appendSubtitle(cell, this._request.statusText);
      cell.title = this._request.statusCode + " " + this._request.statusText;
    } else if (this._request.parsedURL.isDataURL()) {
      cell.setTextAndTitle(WebInspector.UIString("(data)"));
    } else if (this._request.canceled) {
      cell.setTextAndTitle(WebInspector.UIString("(canceled)"));
    } else if (this._request.wasBlocked()) {
      var reason = WebInspector.UIString("other");
      switch (this._request.blockedReason()) {
      case NetworkAgent.BlockedReason.Csp:
        reason = WebInspector.UIString("csp");
        break;
      case NetworkAgent.BlockedReason.MixedContent:
        reason = WebInspector.UIString("mixed-content");
        break;
      case NetworkAgent.BlockedReason.Origin:
        reason = WebInspector.UIString("origin");
        break;
      case NetworkAgent.BlockedReason.Inspector:
        reason = WebInspector.UIString("devtools");
        break;
      case NetworkAgent.BlockedReason.Other:
        reason = WebInspector.UIString("other");
        break;
      }
      cell.setTextAndTitle(WebInspector.UIString("(blocked:%s)", reason));
    } else if (this._request.finished) {
      cell.setTextAndTitle(WebInspector.UIString("Finished"));
    } else {
      cell.setTextAndTitle(WebInspector.UIString("(pending)"));
    }
  },
  _renderTypeCell: function (cell) {
    cell.setTextAndTitle(this.displayType());
  },
  _renderInitiatorCell: function (cell) {
    this._initiatorCell = cell;
    var request = this._request;
    var initiator = request.initiatorInfo();
    if (request.timing && request.timing.pushStart)
      cell.appendChild(createTextNode(WebInspector.UIString("Push / ")));
    switch (initiator.type) {
    case WebInspector.NetworkRequest.InitiatorType.Parser:
      cell.title = initiator.url + ":" + initiator.lineNumber;
      var uiSourceCode = WebInspector.networkMapping.uiSourceCodeForURLForAnyTarget(initiator.url);
      cell.appendChild(WebInspector.linkifyResourceAsNode(initiator.url, initiator.lineNumber - 1, initiator.columnNumber - 1, undefined, undefined, uiSourceCode ? uiSourceCode.displayName() : undefined));
      this._appendSubtitle(cell, WebInspector.UIString("Parser"));
      break;
    case WebInspector.NetworkRequest.InitiatorType.Redirect:
      cell.title = initiator.url;
      console.assert(request.redirectSource);
      var redirectSource = (request.redirectSource);
      cell.appendChild(WebInspector.linkifyRequestAsNode(redirectSource));
      this._appendSubtitle(cell, WebInspector.UIString("Redirect"));
      break;
    case WebInspector.NetworkRequest.InitiatorType.Script:
      if (!this._linkifiedInitiatorAnchor) {
        this._linkifiedInitiatorAnchor = this._parentView.linkifier.linkifyScriptLocation(request.target(), initiator.scriptId, initiator.url, initiator.lineNumber - 1, initiator.columnNumber - 1);
        this._linkifiedInitiatorAnchor.title = "";
      }
      cell.appendChild(this._linkifiedInitiatorAnchor);
      this._appendSubtitle(cell, WebInspector.UIString("Script"));
      cell.classList.add("network-script-initiated");
      cell.request = request;
      break;
    default:
      cell.title = WebInspector.UIString("Other");
      cell.classList.add("network-dim-cell");
      cell.appendChild(createTextNode(WebInspector.UIString("Other")));
    }
  },
  _renderSizeCell: function (cell) {
    if (this._request.fetchedViaServiceWorker) {
      cell.setTextAndTitle(WebInspector.UIString("(from ServiceWorker)"));
      cell.classList.add("network-dim-cell");
    } else if (this._request.cached()) {
      cell.setTextAndTitle(WebInspector.UIString("(from cache)"));
      cell.classList.add("network-dim-cell");
    } else {
      var resourceSize = Number.bytesToString(this._request.resourceSize);
      var transferSize = Number.bytesToString(this._request.transferSize);
      cell.setTextAndTitle(transferSize);
      this._appendSubtitle(cell, resourceSize);
    }
  },
  _renderTimeCell: function (cell) {
    if (this._request.duration > 0) {
      cell.setTextAndTitle(Number.secondsToString(this._request.duration));
      this._appendSubtitle(cell, Number.secondsToString(this._request.latency));
    } else {
      cell.classList.add("network-dim-cell");
      cell.setTextAndTitle(WebInspector.UIString("Pending"));
    }
  },
  _appendSubtitle: function (cellElement, subtitleText) {
    var subtitleElement = createElement("div");
    subtitleElement.className = "network-cell-subtitle";
    subtitleElement.textContent = subtitleText;
    cellElement.appendChild(subtitleElement);
  },
  refreshGraph: function () {
    if (!this._timelineCell)
      return;
    this._staleGraph = true;
    if (this.attached())
      this.dataGrid.scheduleUpdate();
  },
  _updateTimingGraph: function () {
    var calculator = this._parentView.calculator();
    var timeRanges = WebInspector.RequestTimingView.calculateRequestTimeRanges(this._request, calculator.minimumBoundary());
    var right = timeRanges[0].end;
    var container = this._barAreaElement;
    var nextBar = container.firstChild;
    for (var i = 0; i < timeRanges.length; ++i) {
      var range = timeRanges[i];
      var start = calculator.computePercentageFromEventTime(range.start);
      var end = (range.end !== Number.MAX_VALUE) ? calculator.computePercentageFromEventTime(range.end) : 100;
      if (!nextBar)
        nextBar = container.createChild("div");
      nextBar.className = "network-graph-bar request-timing";
      nextBar.classList.add(range.name);
      nextBar.style.setProperty("left", start + "%");
      nextBar.style.setProperty("right", (100 - end) + "%");
      nextBar = nextBar.nextSibling;
    }
    while (nextBar) {
      var nextSibling = nextBar.nextSibling;
      nextBar.remove();
      nextBar = nextSibling;
    }
  },
  _updateGraph: function () {
    this._staleGraph = false;
    if (!this._timelineCell)
      return;
    if (this._showTiming) {
      this._updateTimingGraph();
      return;
    }
    var calculator = this._parentView.calculator();
    var percentages = calculator.computeBarGraphPercentages(this._request);
    this._percentages = percentages;
    this._barAreaElement.classList.remove("hidden");
    this._barLeftElement.style.setProperty("left", percentages.start + "%");
    this._barLeftElement.style.setProperty("right", (100 - percentages.middle) + "%");
    this._barRightElement.style.setProperty("left", percentages.middle + "%");
    this._barRightElement.style.setProperty("right", (100 - percentages.end) + "%");
    var labels = calculator.computeBarGraphLabels(this._request);
    this._labelLeftElement.textContent = labels.left;
    this._labelRightElement.textContent = labels.right;
    var tooltip = (labels.tooltip || "");
    this._barLeftElement.title = tooltip;
    this._labelLeftElement.title = tooltip;
    this._labelRightElement.title = tooltip;
    this._barRightElement.title = tooltip;
    if (this._parentView[WebInspector.NetworkDataGridNode._hoveredRowSymbol] === this)
      this._refreshLabelPositions();
  },
  _refreshLabelPositions: function () {
    if (!this._percentages)
      return;
    this._labelLeftElement.style.removeProperty("left");
    this._labelLeftElement.style.removeProperty("right");
    this._labelLeftElement.classList.remove("before");
    this._labelLeftElement.classList.remove("hidden");
    this._labelRightElement.style.removeProperty("left");
    this._labelRightElement.style.removeProperty("right");
    this._labelRightElement.classList.remove("after");
    this._labelRightElement.classList.remove("hidden");
    const labelPadding = 10;
    const barRightElementOffsetWidth = this._barRightElement.offsetWidth;
    const barLeftElementOffsetWidth = this._barLeftElement.offsetWidth;
    if (this._barLeftElement) {
      var leftBarWidth = barLeftElementOffsetWidth - labelPadding;
      var rightBarWidth = (barRightElementOffsetWidth - barLeftElementOffsetWidth) - labelPadding;
    } else {
      var leftBarWidth = (barLeftElementOffsetWidth - barRightElementOffsetWidth) - labelPadding;
      var rightBarWidth = barRightElementOffsetWidth - labelPadding;
    }
    const labelLeftElementOffsetWidth = this._labelLeftElement.offsetWidth;
    const labelRightElementOffsetWidth = this._labelRightElement.offsetWidth;
    const labelBefore = (labelLeftElementOffsetWidth > leftBarWidth);
    const labelAfter = (labelRightElementOffsetWidth > rightBarWidth);
    const graphElementOffsetWidth = this._timelineCell.offsetWidth;
    if (labelBefore && (graphElementOffsetWidth * (this._percentages.start / 100)) < (labelLeftElementOffsetWidth + 10))
      var leftHidden = true;
    if (labelAfter && (graphElementOffsetWidth * ((100 - this._percentages.end) / 100)) < (labelRightElementOffsetWidth + 10))
      var rightHidden = true;
    if (barLeftElementOffsetWidth === barRightElementOffsetWidth) {
      if (labelBefore && !labelAfter)
        leftHidden = true;
      else if (labelAfter && !labelBefore)
        rightHidden = true;
    }
    if (labelBefore) {
      if (leftHidden)
        this._labelLeftElement.classList.add("hidden");
      this._labelLeftElement.style.setProperty("right", (100 - this._percentages.start) + "%");
      this._labelLeftElement.classList.add("before");
    } else {
      this._labelLeftElement.style.setProperty("left", this._percentages.start + "%");
      this._labelLeftElement.style.setProperty("right", (100 - this._percentages.middle) + "%");
    }
    if (labelAfter) {
      if (rightHidden)
        this._labelRightElement.classList.add("hidden");
      this._labelRightElement.style.setProperty("left", this._percentages.end + "%");
      this._labelRightElement.classList.add("after");
    } else {
      this._labelRightElement.style.setProperty("left", this._percentages.middle + "%");
      this._labelRightElement.style.setProperty("right", (100 - this._percentages.end) + "%");
    }
  },
  __proto__: WebInspector.SortableDataGridNode.prototype
}
WebInspector.NetworkDataGridNode.NameComparator = function (a, b) {
  var aFileName = a._request.name();
  var bFileName = b._request.name();
  if (aFileName > bFileName)
    return 1;
  if (bFileName > aFileName)
    return -1;
  return a._request.indentityCompare(b._request);
}
WebInspector.NetworkDataGridNode.RemoteAddressComparator = function (a, b) {
  var aRemoteAddress = a._request.remoteAddress();
  var bRemoteAddress = b._request.remoteAddress();
  if (aRemoteAddress > bRemoteAddress)
    return 1;
  if (bRemoteAddress > aRemoteAddress)
    return -1;
  return a._request.indentityCompare(b._request);
}
WebInspector.NetworkDataGridNode.SizeComparator = function (a, b) {
  if (b._request.cached() && !a._request.cached())
    return 1;
  if (a._request.cached() && !b._request.cached())
    return -1;
  return (a._request.transferSize - b._request.transferSize) || a._request.indentityCompare(b._request);
}
WebInspector.NetworkDataGridNode.TypeComparator = function (a, b) {
  var aSimpleType = a.displayType();
  var bSimpleType = b.displayType();
  if (aSimpleType > bSimpleType)
    return 1;
  if (bSimpleType > aSimpleType)
    return -1;
  return a._request.indentityCompare(b._request);
}
WebInspector.NetworkDataGridNode.InitiatorComparator = function (a, b) {
  var aInitiator = a._request.initiatorInfo();
  var bInitiator = b._request.initiatorInfo();
  if (aInitiator.type < bInitiator.type)
    return -1;
  if (aInitiator.type > bInitiator.type)
    return 1;
  if (typeof aInitiator.__source === "undefined")
    aInitiator.__source = WebInspector.displayNameForURL(aInitiator.url);
  if (typeof bInitiator.__source === "undefined")
    bInitiator.__source = WebInspector.displayNameForURL(bInitiator.url);
  if (aInitiator.__source < bInitiator.__source)
    return -1;
  if (aInitiator.__source > bInitiator.__source)
    return 1;
  if (aInitiator.lineNumber < bInitiator.lineNumber)
    return -1;
  if (aInitiator.lineNumber > bInitiator.lineNumber)
    return 1;
  if (aInitiator.columnNumber < bInitiator.columnNumber)
    return -1;
  if (aInitiator.columnNumber > bInitiator.columnNumber)
    return 1;
  return a._request.indentityCompare(b._request);
}
WebInspector.NetworkDataGridNode.RequestCookiesCountComparator = function (a, b) {
  var aScore = a._request.requestCookies ? a._request.requestCookies.length : 0;
  var bScore = b._request.requestCookies ? b._request.requestCookies.length : 0;
  return (aScore - bScore) || a._request.indentityCompare(b._request);
}
WebInspector.NetworkDataGridNode.ResponseCookiesCountComparator = function (a, b) {
  var aScore = a._request.responseCookies ? a._request.responseCookies.length : 0;
  var bScore = b._request.responseCookies ? b._request.responseCookies.length : 0;
  return (aScore - bScore) || a._request.indentityCompare(b._request);
}
WebInspector.NetworkDataGridNode.InitialPriorityComparator = function (a, b) {
  var priorityMap = WebInspector.NetworkDataGridNode._symbolicToNumericPriority;
  if (!priorityMap) {
    WebInspector.NetworkDataGridNode._symbolicToNumericPriority = new Map();
    priorityMap = WebInspector.NetworkDataGridNode._symbolicToNumericPriority;
    priorityMap.set(NetworkAgent.ResourcePriority.VeryLow, 1);
    priorityMap.set(NetworkAgent.ResourcePriority.Low, 2);
    priorityMap.set(NetworkAgent.ResourcePriority.Medium, 3);
    priorityMap.set(NetworkAgent.ResourcePriority.High, 4);
    priorityMap.set(NetworkAgent.ResourcePriority.VeryHigh, 5);
  }
  var aScore = priorityMap.get(a._request.initialPriority()) || 0;
  var bScore = priorityMap.get(b._request.initialPriority()) || 0;
  return aScore - bScore || a._request.indentityCompare(b._request);
}
WebInspector.NetworkDataGridNode.RequestPropertyComparator = function (propertyName, a, b) {
  var aValue = a._request[propertyName];
  var bValue = b._request[propertyName];
  if (aValue === bValue)
    return a._request.indentityCompare(b._request);
  return aValue > bValue ? 1 : -1;
}
WebInspector.NetworkDataGridNode.ResponseHeaderStringComparator = function (propertyName, a, b) {
  var aValue = String(a._request.responseHeaderValue(propertyName) || "");
  var bValue = String(b._request.responseHeaderValue(propertyName) || "");
  return aValue.localeCompare(bValue) || a._request.indentityCompare(b._request);
}
WebInspector.NetworkDataGridNode.ResponseHeaderNumberComparator = function (propertyName, a, b) {
  var aValue = (a._request.responseHeaderValue(propertyName) !== undefined) ? parseFloat(a._request.responseHeaderValue(propertyName)) : -Infinity;
  var bValue = (b._request.responseHeaderValue(propertyName) !== undefined) ? parseFloat(b._request.responseHeaderValue(propertyName)) : -Infinity;
  if (aValue === bValue)
    return a._request.indentityCompare(b._request);
  return aValue > bValue ? 1 : -1;
}
WebInspector.NetworkDataGridNode.ResponseHeaderDateComparator = function (propertyName, a, b) {
  var aHeader = a._request.responseHeaderValue(propertyName);
  var bHeader = b._request.responseHeaderValue(propertyName);
  var aValue = aHeader ? new Date(aHeader).getTime() : -Infinity;
  var bValue = bHeader ? new Date(bHeader).getTime() : -Infinity;
  if (aValue === bValue)
    return a._request.indentityCompare(b._request);
  return aValue > bValue ? 1 : -1;
};
WebInspector.NetworkItemView = function (request, calculator) {
  WebInspector.TabbedPane.call(this);
  this.renderWithNoHeaderBackground();
  this.element.classList.add("network-item-view");
  this._resourceViewTabSetting = WebInspector.settings.createSetting("resourceViewTab", "preview");
  var headersView = new WebInspector.RequestHeadersView(request);
  this.appendTab("headers", WebInspector.UIString("Headers"), headersView);
  this.addEventListener(WebInspector.TabbedPane.EventTypes.TabSelected, this._tabSelected, this);
  if (request.resourceType() === WebInspector.resourceTypes.WebSocket) {
    var frameView = new WebInspector.ResourceWebSocketFrameView(request);
    this.appendTab("webSocketFrames", WebInspector.UIString("Frames"), frameView);
  } else if (request.mimeType === "text/event-stream") {
    this.appendTab("eventSource", WebInspector.UIString("EventStream"), new WebInspector.EventSourceMessagesView(request));
  } else {
    var responseView = new WebInspector.RequestResponseView(request);
    var previewView = new WebInspector.RequestPreviewView(request, responseView);
    this.appendTab("preview", WebInspector.UIString("Preview"), previewView);
    this.appendTab("response", WebInspector.UIString("Response"), responseView);
  }
  if (request.requestCookies || request.responseCookies) {
    this._cookiesView = new WebInspector.RequestCookiesView(request);
    this.appendTab("cookies", WebInspector.UIString("Cookies"), this._cookiesView);
  }
  this.appendTab("timing", WebInspector.UIString("Timing"), new WebInspector.RequestTimingView(request, calculator));
  this._request = request;
}
WebInspector.NetworkItemView.prototype = {
  wasShown: function () {
    WebInspector.TabbedPane.prototype.wasShown.call(this);
    this._selectTab();
  },
  _selectTab: function (tabId) {
    if (!tabId)
      tabId = this._resourceViewTabSetting.get();
    if (!this.selectTab(tabId))
      this.selectTab("headers");
  },
  _tabSelected: function (event) {
    if (!event.data.isUserGesture)
      return;
    this._resourceViewTabSetting.set(event.data.tabId);
  },
  request: function () {
    return this._request;
  },
  __proto__: WebInspector.TabbedPane.prototype
}
WebInspector.RequestContentView = function (request) {
  WebInspector.RequestView.call(this, request);
}
WebInspector.RequestContentView.prototype = {get innerView() {
    return this._innerView;
  },
  set innerView(innerView) {
    this._innerView = innerView;
  },
  wasShown: function () {
    this._ensureInnerViewShown();
  },
  _ensureInnerViewShown: function () {
    if (this._innerViewShowRequested)
      return;
    this._innerViewShowRequested = true;

    function callback(content) {
      this._innerViewShowRequested = false;
      this.contentLoaded();
    }
    this.request.requestContent().then(callback.bind(this));
  },
  contentLoaded: function () {},
  __proto__: WebInspector.RequestView.prototype
};
WebInspector.NetworkTimeBoundary = function (minimum, maximum) {
  this.minimum = minimum;
  this.maximum = maximum;
}
WebInspector.NetworkTimeBoundary.prototype = {
  equals: function (other) {
    return (this.minimum === other.minimum) && (this.maximum === other.maximum);
  }
}
WebInspector.NetworkTimeCalculator = function (startAtZero) {
  this.startAtZero = startAtZero;
  this._boundryChangedEventThrottler = new WebInspector.Throttler(0);
  this._window = null;
}
WebInspector.NetworkTimeCalculator.Events = {
  BoundariesChanged: "BoundariesChanged"
}
WebInspector.NetworkTimeCalculator._latencyDownloadTotalFormat = new WebInspector.UIStringFormat("%s latency, %s download (%s total)");
WebInspector.NetworkTimeCalculator._latencyFormat = new WebInspector.UIStringFormat("%s latency");
WebInspector.NetworkTimeCalculator._downloadFormat = new WebInspector.UIStringFormat("%s download");
WebInspector.NetworkTimeCalculator._fromServiceWorkerFormat = new WebInspector.UIStringFormat("%s (from ServiceWorker)");
WebInspector.NetworkTimeCalculator._fromCacheFormat = new WebInspector.UIStringFormat("%s (from cache)");
WebInspector.NetworkTimeCalculator.prototype = {
  setWindow: function (window) {
    this._window = window;
    this._boundaryChanged();
  },
  setInitialUserFriendlyBoundaries: function () {
    this._minimumBoundary = 0;
    this._maximumBoundary = 1;
  },
  paddingLeft: function () {
    return 0;
  },
  computePosition: function (time) {
    return (time - this.minimumBoundary()) / this.boundarySpan() * this._workingArea;
  },
  formatValue: function (value, precision) {
    return Number.secondsToString(value, !!precision);
  },
  minimumBoundary: function () {
    return this._window ? this._window.minimum : this._minimumBoundary;
  },
  zeroTime: function () {
    return this._minimumBoundary;
  },
  maximumBoundary: function () {
    return this._window ? this._window.maximum : this._maximumBoundary;
  },
  boundary: function () {
    return new WebInspector.NetworkTimeBoundary(this.minimumBoundary(), this.maximumBoundary());
  },
  boundarySpan: function () {
    return this.maximumBoundary() - this.minimumBoundary();
  },
  reset: function () {
    delete this._minimumBoundary;
    delete this._maximumBoundary;
    this._boundaryChanged();
  },
  _value: function (item) {
    return 0;
  },
  setDisplayWindow: function (clientWidth) {
    this._workingArea = clientWidth;
  },
  computeBarGraphPercentages: function (request) {
    if (request.startTime !== -1)
      var start = ((request.startTime - this.minimumBoundary()) / this.boundarySpan()) * 100;
    else
      var start = 0;
    if (request.responseReceivedTime !== -1)
      var middle = ((request.responseReceivedTime - this.minimumBoundary()) / this.boundarySpan()) * 100;
    else
      var middle = (this.startAtZero ? start : 100);
    if (request.endTime !== -1)
      var end = ((request.endTime - this.minimumBoundary()) / this.boundarySpan()) * 100;
    else
      var end = (this.startAtZero ? middle : 100);
    if (this.startAtZero) {
      end -= start;
      middle -= start;
      start = 0;
    }
    return {
      start: start,
      middle: middle,
      end: end
    };
  },
  computePercentageFromEventTime: function (eventTime) {
    if (eventTime !== -1 && !this.startAtZero)
      return ((eventTime - this.minimumBoundary()) / this.boundarySpan()) * 100;
    return 0;
  },
  percentageToTime: function (percentage) {
    return percentage * this.boundarySpan() / 100 + this.minimumBoundary();
  },
  _boundaryChanged: function () {
    this._boundryChangedEventThrottler.schedule(dispatchEvent.bind(this));

    function dispatchEvent() {
      this.dispatchEventToListeners(WebInspector.NetworkTimeCalculator.Events.BoundariesChanged);
      return Promise.resolve();
    }
  },
  updateBoundariesForEventTime: function (eventTime) {
    if (eventTime === -1 || this.startAtZero)
      return;
    if (this._maximumBoundary === undefined || eventTime > this._maximumBoundary) {
      this._maximumBoundary = eventTime;
      this._boundaryChanged();
    }
  },
  computeBarGraphLabels: function (request) {
    var rightLabel = "";
    if (request.responseReceivedTime !== -1 && request.endTime !== -1)
      rightLabel = Number.secondsToString(request.endTime - request.responseReceivedTime);
    var hasLatency = request.latency > 0;
    if (hasLatency)
      var leftLabel = Number.secondsToString(request.latency);
    else
      var leftLabel = rightLabel;
    if (request.timing)
      return {
        left: leftLabel,
        right: rightLabel
      };
    if (hasLatency && rightLabel) {
      var total = Number.secondsToString(request.duration);
      var tooltip = WebInspector.NetworkTimeCalculator._latencyDownloadTotalFormat.format(leftLabel, rightLabel, total);
    } else if (hasLatency) {
      var tooltip = WebInspector.NetworkTimeCalculator._latencyFormat.format(leftLabel);
    } else if (rightLabel) {
      var tooltip = WebInspector.NetworkTimeCalculator._downloadFormat.format(rightLabel);
    }
    if (request.fetchedViaServiceWorker)
      tooltip = WebInspector.NetworkTimeCalculator._fromServiceWorkerFormat.format(tooltip);
    else if (request.cached())
      tooltip = WebInspector.NetworkTimeCalculator._fromCacheFormat.format(tooltip);
    return {
      left: leftLabel,
      right: rightLabel,
      tooltip: tooltip
    };
  },
  updateBoundaries: function (request) {
    var lowerBound = this._lowerBound(request);
    var upperBound = this._upperBound(request);
    var changed = false;
    if (lowerBound !== -1 || this.startAtZero)
      changed = this._extendBoundariesToIncludeTimestamp(this.startAtZero ? 0 : lowerBound);
    if (upperBound !== -1)
      changed = this._extendBoundariesToIncludeTimestamp(upperBound) || changed;
    if (changed)
      this._boundaryChanged();
  },
  _extendBoundariesToIncludeTimestamp: function (timestamp) {
    var previousMinimumBoundary = this._minimumBoundary;
    var previousMaximumBoundary = this._maximumBoundary;
    if (typeof this._minimumBoundary === "undefined" || typeof this._maximumBoundary === "undefined") {
      this._minimumBoundary = timestamp;
      this._maximumBoundary = timestamp + 1;
    } else {
      this._minimumBoundary = Math.min(timestamp, this._minimumBoundary);
      this._maximumBoundary = Math.max(timestamp, this._minimumBoundary + 1, this._maximumBoundary);
    }
    return previousMinimumBoundary !== this._minimumBoundary || previousMaximumBoundary !== this._maximumBoundary;
  },
  _lowerBound: function (request) {
    return 0;
  },
  _upperBound: function (request) {
    return 0;
  },
  __proto__: WebInspector.Object.prototype
}
WebInspector.NetworkTransferTimeCalculator = function () {
  WebInspector.NetworkTimeCalculator.call(this, false);
}
WebInspector.NetworkTransferTimeCalculator.prototype = {
  formatValue: function (value, precision) {
    return Number.secondsToString(value - this.zeroTime(), !!precision);
  },
  _lowerBound: function (request) {
    return request.issueTime();
  },
  _upperBound: function (request) {
    return request.endTime;
  },
  __proto__: WebInspector.NetworkTimeCalculator.prototype
}
WebInspector.NetworkTransferDurationCalculator = function () {
  WebInspector.NetworkTimeCalculator.call(this, true);
}
WebInspector.NetworkTransferDurationCalculator.prototype = {
  formatValue: function (value, precision) {
    return Number.secondsToString(value, !!precision);
  },
  _upperBound: function (request) {
    return request.duration;
  },
  __proto__: WebInspector.NetworkTimeCalculator.prototype
};
WebInspector.NetworkLogView = function (filterBar, progressBarContainer, networkLogLargeRowsSetting) {
  WebInspector.VBox.call(this);
  this.setMinimumSize(50, 64);
  this.registerRequiredCSS("network/networkLogView.css");
  this._networkHideDataURLSetting = WebInspector.settings.createSetting("networkHideDataURL", false);
  this._networkResourceTypeFiltersSetting = WebInspector.settings.createSetting("networkResourceTypeFilters", {});
  this._networkShowPrimaryLoadWaterfallSetting = WebInspector.settings.createSetting("networkShowPrimaryLoadWaterfall", false);
  this._filterBar = filterBar;
  this._progressBarContainer = progressBarContainer;
  this._networkLogLargeRowsSetting = networkLogLargeRowsSetting;
  var defaultColumnsVisibility = WebInspector.NetworkLogView._defaultColumnsVisibility;
  this._columnsVisibilitySetting = WebInspector.settings.createSetting("networkLogColumnsVisibility", defaultColumnsVisibility);
  var savedColumnsVisibility = this._columnsVisibilitySetting.get();
  var columnsVisibility = {};
  for (var columnId in defaultColumnsVisibility)
    columnsVisibility[columnId] = savedColumnsVisibility.hasOwnProperty(columnId) ? savedColumnsVisibility[columnId] : defaultColumnsVisibility[columnId];
  this._columnsVisibilitySetting.set(columnsVisibility);
  this._nodesByRequestId = new Map();
  this._staleRequestIds = {};
  this._mainRequestLoadTime = -1;
  this._mainRequestDOMContentLoadedTime = -1;
  this._matchedRequestCount = 0;
  this._eventDividers = [];
  this._highlightedSubstringChanges = [];
  this._filters = [];
  this._timeFilter = null;
  this._currentMatchedRequestNode = null;
  this._currentMatchedRequestIndex = -1;
  this._popupLinkifier = new WebInspector.Linkifier();
  this.linkifier = new WebInspector.Linkifier();
  this._gridMode = true;
  this._recording = false;
  this._preserveLog = false;
  this._rowHeight = 0;
  this._addFilters();
  this._resetSuggestionBuilder();
  this._initializeView();
  WebInspector.moduleSetting("networkColorCodeResourceTypes").addChangeListener(this._invalidateAllItems, this);
  this._networkLogLargeRowsSetting.addChangeListener(this._updateRowsSize, this);
  WebInspector.targetManager.observeTargets(this);
  WebInspector.targetManager.addModelListener(WebInspector.NetworkManager, WebInspector.NetworkManager.EventTypes.RequestStarted, this._onRequestStarted, this);
  WebInspector.targetManager.addModelListener(WebInspector.NetworkManager, WebInspector.NetworkManager.EventTypes.RequestUpdated, this._onRequestUpdated, this);
  WebInspector.targetManager.addModelListener(WebInspector.NetworkManager, WebInspector.NetworkManager.EventTypes.RequestFinished, this._onRequestUpdated, this);
}
WebInspector.NetworkLogView._isFilteredOutSymbol = Symbol("isFilteredOut");
WebInspector.NetworkLogView._isMatchingSearchQuerySymbol = Symbol("isMatchingSearchQuery");
WebInspector.NetworkLogView.HTTPSchemas = {
  "http": true,
  "https": true,
  "ws": true,
  "wss": true
};
WebInspector.NetworkLogView._responseHeaderColumns = ["Cache-Control", "Connection", "Content-Encoding", "Content-Length", "ETag", "Keep-Alive", "Last-Modified", "Server", "Vary"];
WebInspector.NetworkLogView._defaultColumnsVisibility = {
  method: false,
  status: true,
  protocol: false,
  scheme: false,
  domain: false,
  remoteAddress: false,
  type: true,
  initiator: true,
  cookies: false,
  setCookies: false,
  size: true,
  time: true,
  priority: false,
  connectionId: false,
  "Cache-Control": false,
  "Connection": false,
  "Content-Encoding": false,
  "Content-Length": false,
  "ETag": false,
  "Keep-Alive": false,
  "Last-Modified": false,
  "Server": false,
  "Vary": false
};
WebInspector.NetworkLogView._defaultRefreshDelay = 200;
WebInspector.NetworkLogView._waterfallMinOvertime = 1;
WebInspector.NetworkLogView._waterfallMaxOvertime = 3;
WebInspector.NetworkLogView.FilterType = {
  Domain: "domain",
  HasResponseHeader: "has-response-header",
  Is: "is",
  LargerThan: "larger-than",
  Method: "method",
  MimeType: "mime-type",
  MixedContent: "mixed-content",
  Scheme: "scheme",
  SetCookieDomain: "set-cookie-domain",
  SetCookieName: "set-cookie-name",
  SetCookieValue: "set-cookie-value",
  StatusCode: "status-code"
};
WebInspector.NetworkLogView.MixedContentFilterValues = {
  All: "all",
  Displayed: "displayed",
  Blocked: "blocked",
  BlockOverridden: "block-overridden"
}
WebInspector.NetworkLogView.IsFilterType = {
  Running: "running"
};
WebInspector.NetworkLogView._searchKeys = Object.values(WebInspector.NetworkLogView.FilterType);
WebInspector.NetworkLogView._columnTitles = {
  "name": WebInspector.UIString("Name"),
  "method": WebInspector.UIString("Method"),
  "status": WebInspector.UIString("Status"),
  "protocol": WebInspector.UIString("Protocol"),
  "scheme": WebInspector.UIString("Scheme"),
  "domain": WebInspector.UIString("Domain"),
  "remoteAddress": WebInspector.UIString("Remote Address"),
  "type": WebInspector.UIString("Type"),
  "initiator": WebInspector.UIString("Initiator"),
  "cookies": WebInspector.UIString("Cookies"),
  "setCookies": WebInspector.UIString("Set-Cookies"),
  "size": WebInspector.UIString("Size"),
  "time": WebInspector.UIString("Time"),
  "connectionId": WebInspector.UIString("Connection Id"),
  "priority": WebInspector.UIString("Priority"),
  "timeline": WebInspector.UIString("Timeline"),
  "Cache-Control": WebInspector.UIString("Cache-Control"),
  "Connection": WebInspector.UIString("Connection"),
  "Content-Encoding": WebInspector.UIString("Content-Encoding"),
  "Content-Length": WebInspector.UIString("Content-Length"),
  "ETag": WebInspector.UIString("ETag"),
  "Keep-Alive": WebInspector.UIString("Keep-Alive"),
  "Last-Modified": WebInspector.UIString("Last-Modified"),
  "Server": WebInspector.UIString("Server"),
  "Vary": WebInspector.UIString("Vary")
};
WebInspector.NetworkLogView.prototype = {
  setRecording: function (recording) {
    this._recording = recording;
    this._updateSummaryBar();
  },
  setPreserveLog: function (preserveLog) {
    this._preserveLog = preserveLog;
  },
  targetAdded: function (target) {
    if (!target.parentTarget()) {
      target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.MainFrameNavigated, this._mainFrameNavigated, this);
      target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.Load, this._loadEventFired, this);
      target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.DOMContentLoaded, this._domContentLoadedEventFired, this);
    }
    target.networkLog.requests().forEach(this._appendRequest.bind(this));
  },
  targetRemoved: function (target) {
    if (!target.parentTarget()) {
      target.resourceTreeModel.removeEventListener(WebInspector.ResourceTreeModel.EventTypes.MainFrameNavigated, this._mainFrameNavigated, this);
      target.resourceTreeModel.removeEventListener(WebInspector.ResourceTreeModel.EventTypes.Load, this._loadEventFired, this);
      target.resourceTreeModel.removeEventListener(WebInspector.ResourceTreeModel.EventTypes.DOMContentLoaded, this._domContentLoadedEventFired, this);
    }
  },
  setWindow: function (start, end) {
    if (!start && !end) {
      this._timeFilter = null;
      this._timeCalculator.setWindow(null);
    } else {
      this._timeFilter = WebInspector.NetworkLogView._requestTimeFilter.bind(null, start, end);
      this._timeCalculator.setWindow(new WebInspector.NetworkTimeBoundary(start, end));
    }
    this._updateDividersIfNeeded();
    this._filterRequests();
  },
  clearSelection: function () {
    if (this._dataGrid.selectedNode)
      this._dataGrid.selectedNode.deselect();
  },
  _addFilters: function () {
    this._textFilterUI = new WebInspector.TextFilterUI(true);
    this._textFilterUI.addEventListener(WebInspector.FilterUI.Events.FilterChanged, this._filterChanged, this);
    this._filterBar.addFilter(this._textFilterUI);
    var dataURLSetting = this._networkHideDataURLSetting;
    this._dataURLFilterUI = new WebInspector.CheckboxFilterUI("hide-data-url", WebInspector.UIString("Hide data URLs"), true, dataURLSetting);
    this._dataURLFilterUI.addEventListener(WebInspector.FilterUI.Events.FilterChanged, this._filterChanged.bind(this), this);
    this._filterBar.addFilter(this._dataURLFilterUI);
    var filterItems = [];
    for (var categoryId in WebInspector.resourceCategories) {
      var category = WebInspector.resourceCategories[categoryId];
      filterItems.push({
        name: category.title,
        label: category.shortTitle,
        title: category.title
      });
    }
    this._resourceCategoryFilterUI = new WebInspector.NamedBitSetFilterUI(filterItems, this._networkResourceTypeFiltersSetting);
    this._resourceCategoryFilterUI.addEventListener(WebInspector.FilterUI.Events.FilterChanged, this._filterChanged.bind(this), this);
    this._filterBar.addFilter(this._resourceCategoryFilterUI);
  },
  _resetSuggestionBuilder: function () {
    this._suggestionBuilder = new WebInspector.FilterSuggestionBuilder(WebInspector.NetworkLogView._searchKeys);
    this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.Is, WebInspector.NetworkLogView.IsFilterType.Running);
    this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.LargerThan, "100");
    this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.LargerThan, "10k");
    this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.LargerThan, "1M");
    this._textFilterUI.setSuggestionBuilder(this._suggestionBuilder);
  },
  _filterChanged: function (event) {
    this._removeAllNodeHighlights();
    this._parseFilterQuery(this._textFilterUI.value());
    this._filterRequests();
  },
  _initializeView: function () {
    this.element.id = "network-container";
    this._createSortingFunctions();
    this._createCalculators();
    this._createTable();
    this._createTimelineGrid();
    this._summaryBarElement = this.element.createChild("div", "network-summary-bar");
    this._updateRowsSize();
    this._popoverHelper = new WebInspector.PopoverHelper(this.element, this._getPopoverAnchor.bind(this), this._showPopover.bind(this), this._onHidePopover.bind(this));
    this.switchViewMode(true);
  },
  _showRecordingHint: function () {
    this._hideRecordingHint();
    this._recordingHint = this.element.createChild("div", "network-status-pane fill");
    var hintText = this._recordingHint.createChild("div", "recording-hint");
    var reloadShortcutNode = this._recordingHint.createChild("b");
    reloadShortcutNode.textContent = WebInspector.shortcutRegistry.shortcutDescriptorsForAction("main.reload")[0].name;
    if (this._recording) {
      var recordingText = hintText.createChild("span");
      recordingText.textContent = WebInspector.UIString("Recording network activity…");
      hintText.createChild("br");
      hintText.appendChild(WebInspector.formatLocalized("Perform a request or hit %s to record the reload.", [reloadShortcutNode]));
    } else {
      var recordNode = hintText.createChild("b");
      recordNode.textContent = WebInspector.shortcutRegistry.shortcutTitleForAction("network.toggle-recording");
      hintText.appendChild(WebInspector.formatLocalized("Record (%s) or reload (%s) to display network activity.", [recordNode, reloadShortcutNode]));
    }
  },
  _hideRecordingHint: function () {
    if (this._recordingHint)
      this._recordingHint.remove();
    delete this._recordingHint;
  },
  elementsToRestoreScrollPositionsFor: function () {
    if (!this._dataGrid)
      return [];
    return [this._dataGrid.scrollContainer];
  },
  _createTimelineGrid: function () {
    this._timelineGrid = new WebInspector.TimelineGrid();
    this._timelineGrid.element.classList.add("network-timeline-grid");
    this._dataGrid.element.appendChild(this._timelineGrid.element);
  },
  _createTable: function () {
    var columns = [];
    columns.push({
      id: "name",
      titleDOMFragment: this._makeHeaderFragment(WebInspector.UIString("Name"), WebInspector.UIString("Path")),
      title: WebInspector.NetworkLogView._columnTitles["name"],
      weight: 20
    });
    columns.push({
      id: "method",
      title: WebInspector.NetworkLogView._columnTitles["method"],
      weight: 6
    });
    columns.push({
      id: "status",
      titleDOMFragment: this._makeHeaderFragment(WebInspector.UIString("Status"), WebInspector.UIString("Text")),
      title: WebInspector.NetworkLogView._columnTitles["status"],
      weight: 6
    });
    columns.push({
      id: "protocol",
      title: WebInspector.NetworkLogView._columnTitles["protocol"],
      weight: 6
    });
    columns.push({
      id: "scheme",
      title: WebInspector.NetworkLogView._columnTitles["scheme"],
      weight: 6
    });
    columns.push({
      id: "domain",
      title: WebInspector.NetworkLogView._columnTitles["domain"],
      weight: 6
    });
    columns.push({
      id: "remoteAddress",
      title: WebInspector.NetworkLogView._columnTitles["remoteAddress"],
      weight: 10,
      align: WebInspector.DataGrid.Align.Right
    });
    columns.push({
      id: "type",
      title: WebInspector.NetworkLogView._columnTitles["type"],
      weight: 6
    });
    columns.push({
      id: "initiator",
      title: WebInspector.NetworkLogView._columnTitles["initiator"],
      weight: 10
    });
    columns.push({
      id: "cookies",
      title: WebInspector.NetworkLogView._columnTitles["cookies"],
      weight: 6,
      align: WebInspector.DataGrid.Align.Right
    });
    columns.push({
      id: "setCookies",
      title: WebInspector.NetworkLogView._columnTitles["setCookies"],
      weight: 6,
      align: WebInspector.DataGrid.Align.Right
    });
    columns.push({
      id: "size",
      titleDOMFragment: this._makeHeaderFragment(WebInspector.UIString("Size"), WebInspector.UIString("Content")),
      title: WebInspector.NetworkLogView._columnTitles["size"],
      weight: 6,
      align: WebInspector.DataGrid.Align.Right
    });
    columns.push({
      id: "time",
      titleDOMFragment: this._makeHeaderFragment(WebInspector.UIString("Time"), WebInspector.UIString("Latency")),
      title: WebInspector.NetworkLogView._columnTitles["time"],
      weight: 6,
      align: WebInspector.DataGrid.Align.Right
    });
    columns.push({
      id: "priority",
      title: WebInspector.NetworkLogView._columnTitles["priority"],
      weight: 6
    });
    columns.push({
      id: "connectionId",
      title: WebInspector.NetworkLogView._columnTitles["connectionId"],
      weight: 6
    });
    var responseHeaderColumns = WebInspector.NetworkLogView._responseHeaderColumns;
    for (var i = 0; i < responseHeaderColumns.length; ++i) {
      var headerName = responseHeaderColumns[i];
      var descriptor = {
        id: headerName,
        title: WebInspector.NetworkLogView._columnTitles[headerName],
        weight: 6
      };
      if (headerName === "Content-Length")
        descriptor.align = WebInspector.DataGrid.Align.Right;
      columns.push(descriptor);
    }
    columns.push({
      id: "timeline",
      title: WebInspector.NetworkLogView._columnTitles["timeline"],
      sortable: false,
      weight: 40,
      sort: WebInspector.DataGrid.Order.Ascending
    });
    for (var column of columns) {
      column.sortable = column.id !== "timeline";
      column.nonSelectable = column.id !== "name";
    }
    this._dataGrid = new WebInspector.SortableDataGrid(columns);
    this._dataGrid.setStickToBottom(true);
    this._updateColumns();
    this._dataGrid.setName("networkLog");
    this._dataGrid.setResizeMethod(WebInspector.DataGrid.ResizeMethod.Last);
    this._dataGrid.element.classList.add("network-log-grid");
    this._dataGrid.element.addEventListener("contextmenu", this._contextMenu.bind(this), true);
    this._dataGrid.element.addEventListener("mousedown", this._dataGridMouseDown.bind(this), true);
    this._dataGrid.element.addEventListener("mousemove", this._dataGridMouseMove.bind(this), true);
    this._dataGrid.element.addEventListener("mouseleave", this._highlightInitiatorChain.bind(this, null), true);
    this._dataGrid.asWidget().show(this.element);
    this._dataGrid.addEventListener(WebInspector.DataGrid.Events.SortingChanged, this._sortItems, this);
    this._dataGrid.addEventListener(WebInspector.DataGrid.Events.ColumnsResized, this._updateDividersIfNeeded, this);
    this._patchTimelineHeader();
    this._dataGrid.sortNodes(this._sortingFunctions.startTime, false);
  },
  _dataGridMouseDown: function (event) {
    if ((!this._dataGrid.selectedNode && event.button) || event.target.enclosingNodeOrSelfWithNodeName("a"))
      event.consume();
  },
  _dataGridMouseMove: function (event) {
    var node = event.shiftKey ? this._dataGrid.dataGridNodeFromNode(event.target) : null;
    this._highlightInitiatorChain(node ? node.request() : null);
  },
  _highlightInitiatorChain: function (request) {
    if (this._requestWithHighlightedInitiators === request)
      return;
    this._requestWithHighlightedInitiators = request;
    if (!request) {
      for (var node of this._nodesByRequestId.values()) {
        if (!node.dataGrid)
          continue;
        node.element().classList.remove("network-node-on-initiator-path", "network-node-on-initiated-path");
      }
      return;
    }
    var initiators = request.initiatorChain();
    var initiated = new Set();
    for (var node of this._nodesByRequestId.values()) {
      if (!node.dataGrid)
        continue;
      var localInitiators = node.request().initiatorChain();
      if (localInitiators.has(request))
        initiated.add(node.request());
    }
    for (var node of this._nodesByRequestId.values()) {
      if (!node.dataGrid)
        continue;
      node.element().classList.toggle("network-node-on-initiator-path", node.request() !== request && initiators.has(node.request()));
      node.element().classList.toggle("network-node-on-initiated-path", node.request() !== request && initiated.has(node.request()));
    }
  },
  _makeHeaderFragment: function (title, subtitle) {
    var fragment = createDocumentFragment();
    fragment.createTextChild(title);
    var subtitleDiv = fragment.createChild("div", "network-header-subtitle");
    subtitleDiv.createTextChild(subtitle);
    return fragment;
  },
  _patchTimelineHeader: function () {
    var timelineSorting = createElement("select");
    var option = createElement("option");
    option.value = "startTime";
    option.label = WebInspector.UIString("Timeline");
    option.disabled = true;
    timelineSorting.appendChild(option);
    option = createElement("option");
    option.value = "startTime";
    option.label = WebInspector.UIString("Timeline – Start Time");
    option.sortOrder = WebInspector.DataGrid.Order.Ascending;
    timelineSorting.appendChild(option);
    option = createElement("option");
    option.value = "responseTime";
    option.label = WebInspector.UIString("Timeline – Response Time");
    option.sortOrder = WebInspector.DataGrid.Order.Ascending;
    timelineSorting.appendChild(option);
    option = createElement("option");
    option.value = "endTime";
    option.label = WebInspector.UIString("Timeline – End Time");
    option.sortOrder = WebInspector.DataGrid.Order.Ascending;
    timelineSorting.appendChild(option);
    option = createElement("option");
    option.value = "duration";
    option.label = WebInspector.UIString("Timeline – Total Duration");
    option.sortOrder = WebInspector.DataGrid.Order.Descending;
    timelineSorting.appendChild(option);
    option = createElement("option");
    option.value = "latency";
    option.label = WebInspector.UIString("Timeline – Latency");
    option.sortOrder = WebInspector.DataGrid.Order.Descending;
    timelineSorting.appendChild(option);
    var header = this._dataGrid.headerTableHeader("timeline");
    header.replaceChild(timelineSorting, header.firstChild);
    header.createChild("div", "sort-order-icon-container").createChild("div", "sort-order-icon");
    timelineSorting.selectedIndex = 1;
    timelineSorting.addEventListener("click", function (event) {
      event.consume();
    }, false);
    timelineSorting.addEventListener("change", this._sortByTimeline.bind(this), false);
    this._timelineSortSelector = timelineSorting;
  },
  _createSortingFunctions: function () {
    this._sortingFunctions = {};
    this._sortingFunctions.name = WebInspector.NetworkDataGridNode.NameComparator;
    this._sortingFunctions.method = WebInspector.NetworkDataGridNode.RequestPropertyComparator.bind(null, "requestMethod");
    this._sortingFunctions.status = WebInspector.NetworkDataGridNode.RequestPropertyComparator.bind(null, "statusCode");
    this._sortingFunctions.protocol = WebInspector.NetworkDataGridNode.RequestPropertyComparator.bind(null, "protocol");
    this._sortingFunctions.scheme = WebInspector.NetworkDataGridNode.RequestPropertyComparator.bind(null, "scheme");
    this._sortingFunctions.domain = WebInspector.NetworkDataGridNode.RequestPropertyComparator.bind(null, "domain");
    this._sortingFunctions.remoteAddress = WebInspector.NetworkDataGridNode.RemoteAddressComparator;
    this._sortingFunctions.type = WebInspector.NetworkDataGridNode.TypeComparator;
    this._sortingFunctions.initiator = WebInspector.NetworkDataGridNode.InitiatorComparator;
    this._sortingFunctions.cookies = WebInspector.NetworkDataGridNode.RequestCookiesCountComparator;
    this._sortingFunctions.setCookies = WebInspector.NetworkDataGridNode.ResponseCookiesCountComparator;
    this._sortingFunctions.size = WebInspector.NetworkDataGridNode.SizeComparator;
    this._sortingFunctions.time = WebInspector.NetworkDataGridNode.RequestPropertyComparator.bind(null, "duration");
    this._sortingFunctions.connectionId = WebInspector.NetworkDataGridNode.RequestPropertyComparator.bind(null, "connectionId");
    this._sortingFunctions.priority = WebInspector.NetworkDataGridNode.InitialPriorityComparator;
    this._sortingFunctions.timeline = WebInspector.NetworkDataGridNode.RequestPropertyComparator.bind(null, "startTime");
    this._sortingFunctions.startTime = WebInspector.NetworkDataGridNode.RequestPropertyComparator.bind(null, "startTime");
    this._sortingFunctions.endTime = WebInspector.NetworkDataGridNode.RequestPropertyComparator.bind(null, "endTime");
    this._sortingFunctions.responseTime = WebInspector.NetworkDataGridNode.RequestPropertyComparator.bind(null, "responseReceivedTime");
    this._sortingFunctions.duration = WebInspector.NetworkDataGridNode.RequestPropertyComparator.bind(null, "duration");
    this._sortingFunctions.latency = WebInspector.NetworkDataGridNode.RequestPropertyComparator.bind(null, "latency");
    this._sortingFunctions["Cache-Control"] = WebInspector.NetworkDataGridNode.ResponseHeaderStringComparator.bind(null, "Cache-Control");
    this._sortingFunctions["Connection"] = WebInspector.NetworkDataGridNode.ResponseHeaderStringComparator.bind(null, "Connection");
    this._sortingFunctions["Content-Encoding"] = WebInspector.NetworkDataGridNode.ResponseHeaderStringComparator.bind(null, "Content-Encoding");
    this._sortingFunctions["Content-Length"] = WebInspector.NetworkDataGridNode.ResponseHeaderNumberComparator.bind(null, "Content-Length");
    this._sortingFunctions["ETag"] = WebInspector.NetworkDataGridNode.ResponseHeaderStringComparator.bind(null, "ETag");
    this._sortingFunctions["Keep-Alive"] = WebInspector.NetworkDataGridNode.ResponseHeaderStringComparator.bind(null, "Keep-Alive");
    this._sortingFunctions["Last-Modified"] = WebInspector.NetworkDataGridNode.ResponseHeaderDateComparator.bind(null, "Last-Modified");
    this._sortingFunctions["Server"] = WebInspector.NetworkDataGridNode.ResponseHeaderStringComparator.bind(null, "Server");
    this._sortingFunctions["Vary"] = WebInspector.NetworkDataGridNode.ResponseHeaderStringComparator.bind(null, "Vary");
  },
  _createCalculators: function () {
    this._timeCalculator = new WebInspector.NetworkTransferTimeCalculator();
    this._durationCalculator = new WebInspector.NetworkTransferDurationCalculator();
    this._calculators = {};
    this._calculators.timeline = this._timeCalculator;
    this._calculators.startTime = this._timeCalculator;
    this._calculators.endTime = this._timeCalculator;
    this._calculators.responseTime = this._timeCalculator;
    this._calculators.duration = this._durationCalculator;
    this._calculators.latency = this._durationCalculator;
    this._calculator = this._timeCalculator;
  },
  _sortItems: function () {
    this._removeAllNodeHighlights();
    var columnIdentifier = this._dataGrid.sortColumnIdentifier();
    if (columnIdentifier === "timeline") {
      this._sortByTimeline();
      return;
    }
    var sortingFunction = this._sortingFunctions[columnIdentifier];
    if (!sortingFunction)
      return;
    this._dataGrid.sortNodes(sortingFunction, !this._dataGrid.isSortOrderAscending());
    this._highlightNthMatchedRequestForSearch(this._updateMatchCountAndFindMatchIndex(this._currentMatchedRequestNode), false);
    this._timelineSortSelector.selectedIndex = 0;
  },
  _sortByTimeline: function () {
    this._removeAllNodeHighlights();
    var selectedIndex = this._timelineSortSelector.selectedIndex;
    if (!selectedIndex)
      selectedIndex = 1;
    var selectedOption = this._timelineSortSelector[selectedIndex];
    var value = selectedOption.value;
    this._setCalculator(this._calculators[value]);
    var sortingFunction = this._sortingFunctions[value];
    this._dataGrid.sortNodes(sortingFunction);
    this._highlightNthMatchedRequestForSearch(this._updateMatchCountAndFindMatchIndex(this._currentMatchedRequestNode), false);
    this._dataGrid.markColumnAsSortedBy("timeline", selectedOption.sortOrder);
  },
  _updateSummaryBar: function () {
    var requestsNumber = this._nodesByRequestId.size;
    if (!requestsNumber) {
      this._showRecordingHint();
      return;
    }
    this._hideRecordingHint();
    var transferSize = 0;
    var selectedRequestsNumber = 0;
    var selectedTransferSize = 0;
    var baseTime = -1;
    var maxTime = -1;
    var nodes = this._nodesByRequestId.valuesArray();
    for (var i = 0; i < nodes.length; ++i) {
      var request = nodes[i].request();
      var requestTransferSize = request.transferSize;
      transferSize += requestTransferSize;
      if (!nodes[i][WebInspector.NetworkLogView._isFilteredOutSymbol]) {
        selectedRequestsNumber++;
        selectedTransferSize += requestTransferSize;
      }
      if (request.url === request.target().resourceTreeModel.inspectedPageURL() && request.resourceType() === WebInspector.resourceTypes.Document)
        baseTime = request.startTime;
      if (request.endTime > maxTime)
        maxTime = request.endTime;
    }
    var summaryBar = this._summaryBarElement;
    summaryBar.removeChildren();
    var separator = " ❘ ";
    var text = "";

    function appendChunk(chunk) {
      var span = summaryBar.createChild("span");
      span.textContent = chunk;
      text += chunk;
      return span;
    }
    if (selectedRequestsNumber !== requestsNumber) {
      appendChunk(WebInspector.UIString("%d / %d requests", selectedRequestsNumber, requestsNumber));
      appendChunk(separator);
      appendChunk(WebInspector.UIString("%s / %s transferred", Number.bytesToString(selectedTransferSize), Number.bytesToString(transferSize)));
    } else {
      appendChunk(WebInspector.UIString("%d requests", requestsNumber));
      appendChunk(separator);
      appendChunk(WebInspector.UIString("%s transferred", Number.bytesToString(transferSize)));
    }
    if (baseTime !== -1 && maxTime !== -1) {
      appendChunk(separator);
      appendChunk(WebInspector.UIString("Finish: %s", Number.secondsToString(maxTime - baseTime)));
      if (this._mainRequestDOMContentLoadedTime !== -1 && this._mainRequestDOMContentLoadedTime > baseTime) {
        appendChunk(separator);
        var domContentLoadedText = WebInspector.UIString("DOMContentLoaded: %s", Number.secondsToString(this._mainRequestDOMContentLoadedTime - baseTime));
        appendChunk(domContentLoadedText).classList.add("summary-blue");
      }
      if (this._mainRequestLoadTime !== -1) {
        appendChunk(separator);
        var loadText = WebInspector.UIString("Load: %s", Number.secondsToString(this._mainRequestLoadTime - baseTime));
        appendChunk(loadText).classList.add("summary-red");
      }
    }
    summaryBar.title = text;
  },
  _scheduleRefresh: function () {
    if (this._needsRefresh)
      return;
    this._needsRefresh = true;
    if (this.isShowing() && !this._refreshTimeout)
      this._refreshTimeout = setTimeout(this.refresh.bind(this), WebInspector.NetworkLogView._defaultRefreshDelay);
  },
  _updateDividersIfNeeded: function () {
    if (!this.isShowing()) {
      this._scheduleRefresh();
      return;
    }
    var timelineOffset = this._dataGrid.columnOffset("timeline");
    if (timelineOffset)
      this._timelineGrid.element.style.left = timelineOffset + "px";
    var calculator = this.calculator();
    calculator.setDisplayWindow(this._timelineGrid.dividersElement.clientWidth);
    this._timelineGrid.updateDividers(calculator, 75);
    if (calculator.startAtZero) {
      return;
    }
    this._updateEventDividers();
  },
  addFilmStripFrames: function (times) {
    this._addEventDividers(times, "network-frame-divider");
  },
  selectFilmStripFrame: function (time) {
    for (var divider of this._eventDividers)
      divider.element.classList.toggle("network-frame-divider-selected", divider.time === time);
  },
  clearFilmStripFrame: function () {
    for (var divider of this._eventDividers)
      divider.element.classList.toggle("network-frame-divider-selected", false);
  },
  _addEventDividers: function (times, className) {
    for (var i = 0; i < times.length; ++i) {
      var element = createElementWithClass("div", "network-event-divider " + className);
      this._timelineGrid.addEventDivider(element);
      this._eventDividers.push({
        time: times[i],
        element: element
      });
    }
    this._updateEventDividers();
    this._scheduleRefresh();
  },
  _updateEventDividers: function () {
    var calculator = this.calculator();
    for (var divider of this._eventDividers) {
      var timePercent = calculator.computePercentageFromEventTime(divider.time);
      divider.element.classList.toggle("invisible", timePercent < 0);
      divider.element.style.left = timePercent + "%";
    }
  },
  _refreshIfNeeded: function () {
    if (this._needsRefresh)
      this.refresh();
  },
  _invalidateAllItems: function () {
    var requestIds = this._nodesByRequestId.keysArray();
    for (var i = 0; i < requestIds.length; ++i)
      this._staleRequestIds[requestIds[i]] = true;
    this.refresh();
  },
  timeCalculator: function () {
    return this._timeCalculator;
  },
  calculator: function () {
    return this._calculator;
  },
  _setCalculator: function (x) {
    if (!x || this._calculator === x)
      return;
    this._calculator = x;
    this._calculator.reset();
    if (this._calculator.startAtZero)
      this._timelineGrid.hideEventDividers();
    else
      this._timelineGrid.showEventDividers();
    this._invalidateAllItems();
  },
  _loadEventFired: function (event) {
    if (!this._recording)
      return;
    var data = (event.data);
    if (data) {
      this._mainRequestLoadTime = data;
      this._addEventDividers([data], "network-red-divider");
    }
  },
  _domContentLoadedEventFired: function (event) {
    if (!this._recording)
      return;
    var data = (event.data);
    if (data) {
      this._mainRequestDOMContentLoadedTime = data;
      this._addEventDividers([data], "network-blue-divider");
    }
  },
  wasShown: function () {
    this._refreshIfNeeded();
  },
  willHide: function () {
    this._popoverHelper.hidePopover();
  },
  refresh: function () {
    this._needsRefresh = false;
    if (this._refreshTimeout) {
      clearTimeout(this._refreshTimeout);
      delete this._refreshTimeout;
    }
    this._removeAllNodeHighlights();
    var oldBoundary = this.calculator().boundary();
    this._timeCalculator.updateBoundariesForEventTime(this._mainRequestLoadTime);
    this._durationCalculator.updateBoundariesForEventTime(this._mainRequestLoadTime);
    this._timeCalculator.updateBoundariesForEventTime(this._mainRequestDOMContentLoadedTime);
    this._durationCalculator.updateBoundariesForEventTime(this._mainRequestDOMContentLoadedTime);
    var dataGrid = this._dataGrid;
    var rootNode = dataGrid.rootNode();
    var nodesToInsert = [];
    var nodesToRefresh = [];
    for (var requestId in this._staleRequestIds) {
      var node = this._nodesByRequestId.get(requestId);
      if (!node)
        continue;
      var isFilteredOut = !this._applyFilter(node);
      if (node[WebInspector.NetworkLogView._isFilteredOutSymbol] !== isFilteredOut) {
        if (!node[WebInspector.NetworkLogView._isFilteredOutSymbol])
          rootNode.removeChild(node);
        node[WebInspector.NetworkLogView._isFilteredOutSymbol] = isFilteredOut;
        if (!node[WebInspector.NetworkLogView._isFilteredOutSymbol])
          nodesToInsert.push(node);
      }
      if (!isFilteredOut)
        nodesToRefresh.push(node);
      var request = node.request();
      this._timeCalculator.updateBoundaries(request);
      this._durationCalculator.updateBoundaries(request);
    }
    for (var i = 0; i < nodesToInsert.length; ++i) {
      var node = nodesToInsert[i];
      var request = node.request();
      dataGrid.insertChild(node);
      node[WebInspector.NetworkLogView._isMatchingSearchQuerySymbol] = this._matchRequest(request);
    }
    for (var node of nodesToRefresh)
      node.refresh();
    this._highlightNthMatchedRequestForSearch(this._updateMatchCountAndFindMatchIndex(this._currentMatchedRequestNode), false);
    if (!this.calculator().boundary().equals(oldBoundary)) {
      this._updateDividersIfNeeded();
      var nodes = this._nodesByRequestId.valuesArray();
      for (var i = 0; i < nodes.length; ++i)
        nodes[i].refreshGraph();
    }
    this._staleRequestIds = {};
    this._updateSummaryBar();
  },
  reset: function () {
    this._requestWithHighlightedInitiators = null;
    this.dispatchEventToListeners(WebInspector.NetworkLogView.EventTypes.RequestSelected, null);
    this._clearSearchMatchedList();
    if (this._popoverHelper)
      this._popoverHelper.hidePopover();
    this._timeFilter = null;
    this._calculator.reset();
    this._timeCalculator.setWindow(null);
    var nodes = this._nodesByRequestId.valuesArray();
    for (var i = 0; i < nodes.length; ++i)
      nodes[i].dispose();
    this._nodesByRequestId.clear();
    this._staleRequestIds = {};
    this._resetSuggestionBuilder();
    this._mainRequestLoadTime = -1;
    this._mainRequestDOMContentLoadedTime = -1;
    this._eventDividers = [];
    this._timelineGrid.removeEventDividers();
    if (this._dataGrid) {
      this._dataGrid.rootNode().removeChildren();
      this._updateDividersIfNeeded();
      this._updateSummaryBar();
    }
  },
  setTextFilterValue: function (filterString) {
    this._textFilterUI.setValue(filterString);
    this._textFilterUI.setRegexChecked(false);
    this._dataURLFilterUI.setChecked(false);
    this._resourceCategoryFilterUI.reset();
  },
  _onRequestStarted: function (event) {
    if (!this._recording)
      return;
    var request = (event.data);
    this._appendRequest(request);
  },
  _appendRequest: function (request) {
    var node = new WebInspector.NetworkDataGridNode(this, request);
    node[WebInspector.NetworkLogView._isFilteredOutSymbol] = true;
    node[WebInspector.NetworkLogView._isMatchingSearchQuerySymbol] = false;
    var originalRequestNode = this._nodesByRequestId.get(request.requestId);
    if (originalRequestNode)
      this._nodesByRequestId.set(originalRequestNode.request().requestId, originalRequestNode);
    this._nodesByRequestId.set(request.requestId, node);
    if (request.redirects) {
      for (var i = 0; i < request.redirects.length; ++i)
        this._refreshRequest(request.redirects[i]);
    }
    this._refreshRequest(request);
  },
  _onRequestUpdated: function (event) {
    var request = (event.data);
    this._refreshRequest(request);
  },
  _refreshRequest: function (request) {
    if (!this._nodesByRequestId.get(request.requestId))
      return;
    WebInspector.NetworkLogView._subdomains(request.domain).forEach(this._suggestionBuilder.addItem.bind(this._suggestionBuilder, WebInspector.NetworkLogView.FilterType.Domain));
    this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.Method, request.requestMethod);
    this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.MimeType, request.mimeType);
    this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.Scheme, "" + request.scheme);
    this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.StatusCode, "" + request.statusCode);
    if (request.mixedContentType !== "none") {
      this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.MixedContent, WebInspector.NetworkLogView.MixedContentFilterValues.All);
    }
    if (request.mixedContentType === "optionally-blockable") {
      this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.MixedContent, WebInspector.NetworkLogView.MixedContentFilterValues.Displayed);
    }
    if (request.mixedContentType === "blockable") {
      var suggestion = request.wasBlocked() ? WebInspector.NetworkLogView.MixedContentFilterValues.Blocked : WebInspector.NetworkLogView.MixedContentFilterValues.BlockOverridden;
      this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.MixedContent, suggestion);
    }
    var responseHeaders = request.responseHeaders;
    for (var i = 0, l = responseHeaders.length; i < l; ++i)
      this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.HasResponseHeader, responseHeaders[i].name);
    var cookies = request.responseCookies;
    for (var i = 0, l = cookies ? cookies.length : 0; i < l; ++i) {
      var cookie = cookies[i];
      this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.SetCookieDomain, cookie.domain());
      this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.SetCookieName, cookie.name());
      this._suggestionBuilder.addItem(WebInspector.NetworkLogView.FilterType.SetCookieValue, cookie.value());
    }
    this._staleRequestIds[request.requestId] = true;
    this.dispatchEventToListeners(WebInspector.NetworkLogView.EventTypes.UpdateRequest, request);
    this._scheduleRefresh();
  },
  _mainFrameNavigated: function (event) {
    if (!this._recording)
      return;
    var frame = (event.data);
    var loaderId = frame.loaderId;
    var requestsToPick = [];
    var requests = frame.target().networkLog.requests();
    for (var i = 0; i < requests.length; ++i) {
      var request = requests[i];
      if (request.loaderId === loaderId)
        requestsToPick.push(request);
    }
    if (!this._preserveLog) {
      this.reset();
      for (var i = 0; i < requestsToPick.length; ++i)
        this._appendRequest(requestsToPick[i]);
    }
    for (var i = 0; i < requestsToPick.length; ++i) {
      var request = requestsToPick[i];
      var node = this._nodesByRequestId.get(request.requestId);
      if (node) {
        node.markAsNavigationRequest();
        break;
      }
    }
  },
  switchViewMode: function (gridMode) {
    if (this._gridMode === gridMode)
      return;
    this._gridMode = gridMode;
    if (gridMode) {
      if (this._dataGrid.selectedNode)
        this._dataGrid.selectedNode.selected = false;
    } else {
      this._removeAllNodeHighlights();
      this._popoverHelper.hidePopover();
    }
    this.element.classList.toggle("brief-mode", !gridMode);
    this._updateColumns();
  },
  rowHeight: function () {
    return this._rowHeight;
  },
  _updateRowsSize: function () {
    var largeRows = !!this._networkLogLargeRowsSetting.get();
    this._rowHeight = largeRows ? 41 : 21;
    this._dataGrid.element.classList.toggle("small", !largeRows);
    this._timelineGrid.element.classList.toggle("small", !largeRows);
    this._dataGrid.scheduleUpdate();
  },
  _getPopoverAnchor: function (element, event) {
    if (!this._gridMode)
      return;
    var anchor = element.enclosingNodeOrSelfWithClass("network-graph-bar") || element.enclosingNodeOrSelfWithClass("network-graph-label");
    if (anchor && anchor.parentElement.request && anchor.parentElement.request.timing)
      return anchor;
    anchor = element.enclosingNodeOrSelfWithClass("network-script-initiated");
    if (anchor && anchor.request) {
      var initiator = (anchor.request).initiator();
      if (initiator && initiator.stack)
        return anchor;
    }
  },
  _showPopover: function (anchor, popover) {
    var content;
    if (anchor.classList.contains("network-script-initiated")) {
      var request = (anchor.request);
      var initiator = (request.initiator());
      content = WebInspector.DOMPresentationUtils.buildStackTracePreviewContents(request.target(), this._popupLinkifier, initiator.stack);
      popover.setCanShrink(true);
    } else {
      content = WebInspector.RequestTimingView.createTimingTable(anchor.parentElement.request, this._timeCalculator.minimumBoundary());
      popover.setCanShrink(false);
    }
    popover.showForAnchor(content, anchor);
  },
  _onHidePopover: function () {
    this._popupLinkifier.reset();
  },
  _updateColumns: function () {
    if (!this._dataGrid)
      return;
    var gridMode = this._gridMode;
    var visibleColumns = {
      "name": true
    };
    if (gridMode)
      visibleColumns["timeline"] = true;
    if (gridMode) {
      var columnsVisibility = this._columnsVisibilitySetting.get();
      for (var columnIdentifier in columnsVisibility)
        visibleColumns[columnIdentifier] = columnsVisibility[columnIdentifier];
    }
    this._dataGrid.setColumnsVisiblity(visibleColumns);
  },
  _toggleColumnVisibility: function (columnIdentifier) {
    var columnsVisibility = this._columnsVisibilitySetting.get();
    columnsVisibility[columnIdentifier] = !columnsVisibility[columnIdentifier];
    this._columnsVisibilitySetting.set(columnsVisibility);
    this._updateColumns();
  },
  _getConfigurableColumnIDs: function () {
    if (this._configurableColumnIDs)
      return this._configurableColumnIDs;
    var columnTitles = WebInspector.NetworkLogView._columnTitles;

    function compare(id1, id2) {
      return columnTitles[id1].compareTo(columnTitles[id2]);
    }
    var columnIDs = Object.keys(this._columnsVisibilitySetting.get());
    this._configurableColumnIDs = columnIDs.sort(compare);
    return this._configurableColumnIDs;
  },
  _contextMenu: function (event) {
    var contextMenu = new WebInspector.ContextMenu(event);
    if (this._gridMode && event.target.isSelfOrDescendant(this._dataGrid.headerTableBody)) {
      var columnsVisibility = this._columnsVisibilitySetting.get();
      var columnIDs = this._getConfigurableColumnIDs();
      var columnTitles = WebInspector.NetworkLogView._columnTitles;
      for (var i = 0; i < columnIDs.length; ++i) {
        var columnIdentifier = columnIDs[i];
        contextMenu.appendCheckboxItem(columnTitles[columnIdentifier], this._toggleColumnVisibility.bind(this, columnIdentifier), !!columnsVisibility[columnIdentifier]);
      }
      contextMenu.show();
      return;
    }
    var gridNode = this._dataGrid.dataGridNodeFromNode(event.target);
    var request = gridNode && gridNode.request();

    function openResourceInNewTab(url) {
      InspectorFrontendHost.openInNewTab(url);
    }
    if (request) {
      contextMenu.appendApplicableItems(request);
      if (request.requestHeadersText())
        contextMenu.appendItem(WebInspector.UIString.capitalize("Copy ^request ^headers"), this._copyRequestHeaders.bind(this, request));
      if (request.responseHeadersText)
        contextMenu.appendItem(WebInspector.UIString.capitalize("Copy ^response ^headers"), this._copyResponseHeaders.bind(this, request));
      if (request.finished)
        contextMenu.appendItem(WebInspector.UIString.capitalize("Copy ^response"), this._copyResponse.bind(this, request));
      if (WebInspector.isWin()) {
        contextMenu.appendItem(WebInspector.UIString("Copy as cURL (cmd)"), this._copyCurlCommand.bind(this, request, "win"));
        contextMenu.appendItem(WebInspector.UIString("Copy as cURL (bash)"), this._copyCurlCommand.bind(this, request, "unix"));
      } else {
        contextMenu.appendItem(WebInspector.UIString("Copy as cURL"), this._copyCurlCommand.bind(this, request, "unix"));
      }
    }
    contextMenu.appendItem(WebInspector.UIString.capitalize("Copy ^all as HAR"), this._copyAll.bind(this));
    contextMenu.appendSeparator();
    contextMenu.appendItem(WebInspector.UIString.capitalize("Save as HAR with ^content"), this._exportAll.bind(this));
    contextMenu.appendSeparator();
    contextMenu.appendItem(WebInspector.UIString.capitalize("Clear ^browser ^cache"), this._clearBrowserCache.bind(this));
    contextMenu.appendItem(WebInspector.UIString.capitalize("Clear ^browser ^cookies"), this._clearBrowserCookies.bind(this));
    var blockedSetting = WebInspector.moduleSetting("blockedURLs");
    if (request && Runtime.experiments.isEnabled("requestBlocking")) {
      contextMenu.appendSeparator();
      var urlWithoutScheme = request.parsedURL.urlWithoutScheme();
      if (urlWithoutScheme && blockedSetting.get().indexOf(urlWithoutScheme) === -1)
        contextMenu.appendItem(WebInspector.UIString.capitalize("Block ^request URL"), addBlockedURL.bind(null, urlWithoutScheme));
      var domain = request.parsedURL.domain();
      if (domain && blockedSetting.get().indexOf(domain) === -1)
        contextMenu.appendItem(WebInspector.UIString.capitalize("Block ^request ^domain"), addBlockedURL.bind(null, domain));

      function addBlockedURL(url) {
        var list = blockedSetting.get();
        list.push(url);
        blockedSetting.set(list);
        WebInspector.inspectorView.showViewInDrawer("network.blocked-urls");
      }
    }
    if (request && request.resourceType() === WebInspector.resourceTypes.XHR) {
      contextMenu.appendSeparator();
      contextMenu.appendItem(WebInspector.UIString("Replay XHR"), request.replayXHR.bind(request));
      contextMenu.appendSeparator();
    }
    contextMenu.show();
  },
  _harRequests: function () {
    var requests = this._nodesByRequestId.valuesArray().map(function (node) {
      return node.request();
    });
    var httpRequests = requests.filter(WebInspector.NetworkLogView.HTTPRequestsFilter);
    return httpRequests.filter(WebInspector.NetworkLogView.FinishedRequestsFilter);
  },
  _copyAll: function () {
    var harArchive = {
      log: (new WebInspector.HARLog(this._harRequests())).build()
    };
    InspectorFrontendHost.copyText(JSON.stringify(harArchive, null, 2));
  },
  _copyRequestHeaders: function (request) {
    InspectorFrontendHost.copyText(request.requestHeadersText());
  },
  _copyResponse: function (request) {
    function callback(content) {
      if (request.contentEncoded)
        content = request.asDataURL();
      InspectorFrontendHost.copyText(content || "");
    }
    request.requestContent().then(callback);
  },
  _copyResponseHeaders: function (request) {
    InspectorFrontendHost.copyText(request.responseHeadersText);
  },
  _copyCurlCommand: function (request, platform) {
    InspectorFrontendHost.copyText(this._generateCurlCommand(request, platform));
  },
  _exportAll: function () {
    var filename = WebInspector.targetManager.inspectedPageDomain() + ".har";
    var stream = new WebInspector.FileOutputStream();
    stream.open(filename, openCallback.bind(this));

    function openCallback(accepted) {
      if (!accepted)
        return;
      var progressIndicator = new WebInspector.ProgressIndicator();
      this._progressBarContainer.appendChild(progressIndicator.element);
      var harWriter = new WebInspector.HARWriter();
      harWriter.write(stream, this._harRequests(), progressIndicator);
    }
  },
  _clearBrowserCache: function () {
    if (confirm(WebInspector.UIString("Are you sure you want to clear browser cache?")))
      WebInspector.multitargetNetworkManager.clearBrowserCache();
  },
  _clearBrowserCookies: function () {
    if (confirm(WebInspector.UIString("Are you sure you want to clear browser cookies?")))
      WebInspector.multitargetNetworkManager.clearBrowserCookies();
  },
  _matchRequest: function (request) {
    var re = this._searchRegex;
    if (!re)
      return false;
    return re.test(request.name()) || (this._networkLogLargeRowsSetting.get() && re.test(request.path()));
  },
  _clearSearchMatchedList: function () {
    this._matchedRequestCount = -1;
    this._currentMatchedRequestNode = null;
    this._removeAllHighlights();
  },
  _removeAllHighlights: function () {
    this._removeAllNodeHighlights();
    for (var i = 0; i < this._highlightedSubstringChanges.length; ++i)
      WebInspector.revertDomChanges(this._highlightedSubstringChanges[i]);
    this._highlightedSubstringChanges = [];
  },
  _highlightNthMatchedRequestForSearch: function (n, reveal) {
    this._removeAllHighlights();
    var nodes = this._dataGrid.rootNode().children;
    var matchCount = 0;
    var node = null;
    for (var i = 0; i < nodes.length; ++i) {
      if (nodes[i][WebInspector.NetworkLogView._isMatchingSearchQuerySymbol]) {
        if (matchCount === n) {
          node = nodes[i];
          break;
        }
        matchCount++;
      }
    }
    if (!node) {
      this._currentMatchedRequestNode = null;
      return;
    }
    var request = node.request();
    if (reveal)
      WebInspector.Revealer.reveal(request);
    var highlightedSubstringChanges = node.highlightMatchedSubstring(this._searchRegex);
    this._highlightedSubstringChanges.push(highlightedSubstringChanges);
    this._currentMatchedRequestNode = node;
    this._currentMatchedRequestIndex = n;
    this.dispatchEventToListeners(WebInspector.NetworkLogView.EventTypes.SearchIndexUpdated, n);
  },
  performSearch: function (searchConfig, shouldJump, jumpBackwards) {
    var query = searchConfig.query;
    var currentMatchedRequestNode = this._currentMatchedRequestNode;
    this._clearSearchMatchedList();
    this._searchRegex = createPlainTextSearchRegex(query, "i");
    var nodes = this._dataGrid.rootNode().children;
    for (var i = 0; i < nodes.length; ++i)
      nodes[i][WebInspector.NetworkLogView._isMatchingSearchQuerySymbol] = this._matchRequest(nodes[i].request());
    var newMatchedRequestIndex = this._updateMatchCountAndFindMatchIndex(currentMatchedRequestNode);
    if (!newMatchedRequestIndex && jumpBackwards)
      newMatchedRequestIndex = this._matchedRequestCount - 1;
    this._highlightNthMatchedRequestForSearch(newMatchedRequestIndex, shouldJump);
  },
  supportsCaseSensitiveSearch: function () {
    return false;
  },
  supportsRegexSearch: function () {
    return true;
  },
  _updateMatchCountAndFindMatchIndex: function (node) {
    var nodes = this._dataGrid.rootNode().children;
    var matchCount = 0;
    var matchIndex = 0;
    for (var i = 0; i < nodes.length; ++i) {
      if (!nodes[i][WebInspector.NetworkLogView._isMatchingSearchQuerySymbol])
        continue;
      if (node === nodes[i])
        matchIndex = matchCount;
      matchCount++;
    }
    if (this._matchedRequestCount !== matchCount) {
      this._matchedRequestCount = matchCount;
      this.dispatchEventToListeners(WebInspector.NetworkLogView.EventTypes.SearchCountUpdated, matchCount);
    }
    return matchIndex;
  },
  _normalizeSearchResultIndex: function (index) {
    return (index + this._matchedRequestCount) % this._matchedRequestCount;
  },
  _applyFilter: function (node) {
    var request = node.request();
    if (this._timeFilter && !this._timeFilter(request))
      return false;
    var categoryName = request.resourceType().category().title;
    if (!this._resourceCategoryFilterUI.accept(categoryName))
      return false;
    if (this._dataURLFilterUI.checked() && request.parsedURL.isDataURL())
      return false;
    if (request.statusText === "Service Worker Fallback Required")
      return false;
    for (var i = 0; i < this._filters.length; ++i) {
      if (!this._filters[i](request))
        return false;
    }
    return true;
  },
  _parseFilterQuery: function (query) {
    var parsedQuery;
    if (this._textFilterUI.isRegexChecked() && query !== "")
      parsedQuery = {
        text: [query],
        filters: []
      };
    else
      parsedQuery = this._suggestionBuilder.parseQuery(query);
    this._filters = parsedQuery.text.map(this._createTextFilter, this);
    var n = parsedQuery.filters.length;
    for (var i = 0; i < n; ++i) {
      var filter = parsedQuery.filters[i];
      var filterType = (filter.type.toLowerCase());
      this._filters.push(this._createFilter(filterType, filter.data, filter.negative));
    }
  },
  _createTextFilter: function (text) {
    var negative = false;
    var regex;
    if (!this._textFilterUI.isRegexChecked() && text[0] === "-" && text.length > 1) {
      negative = true;
      text = text.substring(1);
      regex = new RegExp(text.escapeForRegExp(), "i");
    } else {
      regex = this._textFilterUI.regex();
    }
    var filter = WebInspector.NetworkLogView._requestNameOrPathFilter.bind(null, regex);
    if (negative)
      filter = WebInspector.NetworkLogView._negativeFilter.bind(null, filter);
    return filter;
  },
  _createFilter: function (type, value, negative) {
    var filter = this._createSpecialFilter(type, value);
    if (!filter)
      return this._createTextFilter((negative ? "-" : "") + type + ":" + value);
    if (negative)
      return WebInspector.NetworkLogView._negativeFilter.bind(null, filter);
    return filter;
  },
  _createSpecialFilter: function (type, value) {
    switch (type) {
    case WebInspector.NetworkLogView.FilterType.Domain:
      return WebInspector.NetworkLogView._createRequestDomainFilter(value);
    case WebInspector.NetworkLogView.FilterType.HasResponseHeader:
      return WebInspector.NetworkLogView._requestResponseHeaderFilter.bind(null, value);
    case WebInspector.NetworkLogView.FilterType.Is:
      if (value.toLowerCase() === WebInspector.NetworkLogView.IsFilterType.Running)
        return WebInspector.NetworkLogView._runningRequestFilter;
      break;
    case WebInspector.NetworkLogView.FilterType.LargerThan:
      return this._createSizeFilter(value.toLowerCase());
    case WebInspector.NetworkLogView.FilterType.Method:
      return WebInspector.NetworkLogView._requestMethodFilter.bind(null, value);
    case WebInspector.NetworkLogView.FilterType.MimeType:
      return WebInspector.NetworkLogView._requestMimeTypeFilter.bind(null, value);
    case WebInspector.NetworkLogView.FilterType.MixedContent:
      return WebInspector.NetworkLogView._requestMixedContentFilter.bind(null, (value));
    case WebInspector.NetworkLogView.FilterType.Scheme:
      return WebInspector.NetworkLogView._requestSchemeFilter.bind(null, value);
    case WebInspector.NetworkLogView.FilterType.SetCookieDomain:
      return WebInspector.NetworkLogView._requestSetCookieDomainFilter.bind(null, value);
    case WebInspector.NetworkLogView.FilterType.SetCookieName:
      return WebInspector.NetworkLogView._requestSetCookieNameFilter.bind(null, value);
    case WebInspector.NetworkLogView.FilterType.SetCookieValue:
      return WebInspector.NetworkLogView._requestSetCookieValueFilter.bind(null, value);
    case WebInspector.NetworkLogView.FilterType.StatusCode:
      return WebInspector.NetworkLogView._statusCodeFilter.bind(null, value);
    }
    return null;
  },
  _createSizeFilter: function (value) {
    var multiplier = 1;
    if (value.endsWith("k")) {
      multiplier = 1024;
      value = value.substring(0, value.length - 1);
    } else if (value.endsWith("m")) {
      multiplier = 1024 * 1024;
      value = value.substring(0, value.length - 1);
    }
    var quantity = Number(value);
    if (isNaN(quantity))
      return null;
    return WebInspector.NetworkLogView._requestSizeLargerThanFilter.bind(null, quantity * multiplier);
  },
  _filterRequests: function () {
    this._removeAllHighlights();
    this._invalidateAllItems();
  },
  jumpToPreviousSearchResult: function () {
    if (!this._matchedRequestCount)
      return;
    var index = this._normalizeSearchResultIndex(this._currentMatchedRequestIndex - 1);
    this._highlightNthMatchedRequestForSearch(index, true);
  },
  jumpToNextSearchResult: function () {
    if (!this._matchedRequestCount)
      return;
    var index = this._normalizeSearchResultIndex(this._currentMatchedRequestIndex + 1);
    this._highlightNthMatchedRequestForSearch(index, true);
  },
  searchCanceled: function () {
    delete this._searchRegex;
    this._clearSearchMatchedList();
    this.dispatchEventToListeners(WebInspector.NetworkLogView.EventTypes.SearchCountUpdated, 0);
  },
  revealAndHighlightRequest: function (request) {
    this._removeAllNodeHighlights();
    var node = this._nodesByRequestId.get(request.requestId);
    if (node) {
      node.reveal();
      this._highlightNode(node);
    }
  },
  _removeAllNodeHighlights: function () {
    if (this._highlightedNode) {
      this._highlightedNode.element().classList.remove("highlighted-row");
      delete this._highlightedNode;
    }
  },
  _highlightNode: function (node) {
    WebInspector.runCSSAnimationOnce(node.element(), "highlighted-row");
    this._highlightedNode = node;
  },
  _generateCurlCommand: function (request, platform) {
    var command = ["curl"];
    var ignoredHeaders = {
      "host": 1,
      "method": 1,
      "path": 1,
      "scheme": 1,
      "version": 1
    };

    function escapeStringWin(str) {
      return "\"" + str.replace(/"/g, "\"\"").replace(/%/g, "\"%\"").replace(/\\/g, "\\\\").replace(/[\r\n]+/g, "\"^$&\"") + "\"";
    }

    function escapeStringPosix(str) {
      function escapeCharacter(x) {
        var code = x.charCodeAt(0);
        if (code < 256) {
          return code < 16 ? "\\x0" + code.toString(16) : "\\x" + code.toString(16);
        }
        code = code.toString(16);
        return "\\u" + ("0000" + code).substr(code.length, 4);
      }
      if (/[^\x20-\x7E]|\'/.test(str)) {
        return "$\'" + str.replace(/\\/g, "\\\\").replace(/\'/g, "\\\'").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/[^\x20-\x7E]/g, escapeCharacter) + "'";
      } else {
        return "'" + str + "'";
      }
    }
    var escapeString = platform === "win" ? escapeStringWin : escapeStringPosix;
    command.push(escapeString(request.url).replace(/[[{}\]]/g, "\\$&"));
    var inferredMethod = "GET";
    var data = [];
    var requestContentType = request.requestContentType();
    if (requestContentType && requestContentType.startsWith("application/x-www-form-urlencoded") && request.requestFormData) {
      data.push("--data");
      data.push(escapeString(request.requestFormData));
      ignoredHeaders["content-length"] = true;
      inferredMethod = "POST";
    } else if (request.requestFormData) {
      data.push("--data-binary");
      data.push(escapeString(request.requestFormData));
      ignoredHeaders["content-length"] = true;
      inferredMethod = "POST";
    }
    if (request.requestMethod !== inferredMethod) {
      command.push("-X");
      command.push(request.requestMethod);
    }
    var requestHeaders = request.requestHeaders();
    for (var i = 0; i < requestHeaders.length; i++) {
      var header = requestHeaders[i];
      var name = header.name.replace(/^:/, "");
      if (name.toLowerCase() in ignoredHeaders)
        continue;
      command.push("-H");
      command.push(escapeString(name + ": " + header.value));
    }
    command = command.concat(data);
    command.push("--compressed");
    if (request.securityState() === SecurityAgent.SecurityState.Insecure)
      command.push("--insecure");
    return command.join(" ");
  },
  __proto__: WebInspector.VBox.prototype
}
WebInspector.NetworkLogView.Filter;
WebInspector.NetworkLogView._negativeFilter = function (filter, request) {
  return !filter(request);
}
WebInspector.NetworkLogView._requestNameOrPathFilter = function (regex, request) {
  if (!regex)
    return false;
  return regex.test(request.name()) || regex.test(request.path());
}
WebInspector.NetworkLogView._subdomains = function (domain) {
  var result = [domain];
  var indexOfPeriod = domain.indexOf(".");
  while (indexOfPeriod !== -1) {
    result.push("*" + domain.substring(indexOfPeriod));
    indexOfPeriod = domain.indexOf(".", indexOfPeriod + 1);
  }
  return result;
}
WebInspector.NetworkLogView._createRequestDomainFilter = function (value) {
  function escapeForRegExp(string) {
    return string.escapeForRegExp();
  }
  var escapedPattern = value.split("*").map(escapeForRegExp).join(".*");
  return WebInspector.NetworkLogView._requestDomainFilter.bind(null, new RegExp("^" + escapedPattern + "$", "i"));
}
WebInspector.NetworkLogView._requestDomainFilter = function (regex, request) {
  return regex.test(request.domain);
}
WebInspector.NetworkLogView._runningRequestFilter = function (request) {
  return !request.finished;
}
WebInspector.NetworkLogView._requestResponseHeaderFilter = function (value, request) {
  return request.responseHeaderValue(value) !== undefined;
}
WebInspector.NetworkLogView._requestMethodFilter = function (value, request) {
  return request.requestMethod === value;
}
WebInspector.NetworkLogView._requestMimeTypeFilter = function (value, request) {
  return request.mimeType === value;
}
WebInspector.NetworkLogView._requestMixedContentFilter = function (value, request) {
  if (value === WebInspector.NetworkLogView.MixedContentFilterValues.Displayed) {
    return request.mixedContentType === "optionally-blockable";
  } else if (value === WebInspector.NetworkLogView.MixedContentFilterValues.Blocked) {
    return request.mixedContentType === "blockable" && request.wasBlocked();
  } else if (value === WebInspector.NetworkLogView.MixedContentFilterValues.BlockOverridden) {
    return request.mixedContentType === "blockable" && !request.wasBlocked();
  } else if (value === WebInspector.NetworkLogView.MixedContentFilterValues.All) {
    return request.mixedContentType !== "none";
  }
  return false;
}
WebInspector.NetworkLogView._requestSchemeFilter = function (value, request) {
  return request.scheme === value;
}
WebInspector.NetworkLogView._requestSetCookieDomainFilter = function (value, request) {
  var cookies = request.responseCookies;
  for (var i = 0, l = cookies ? cookies.length : 0; i < l; ++i) {
    if (cookies[i].domain() === value)
      return true;
  }
  return false;
}
WebInspector.NetworkLogView._requestSetCookieNameFilter = function (value, request) {
  var cookies = request.responseCookies;
  for (var i = 0, l = cookies ? cookies.length : 0; i < l; ++i) {
    if (cookies[i].name() === value)
      return true;
  }
  return false;
}
WebInspector.NetworkLogView._requestSetCookieValueFilter = function (value, request) {
  var cookies = request.responseCookies;
  for (var i = 0, l = cookies ? cookies.length : 0; i < l; ++i) {
    if (cookies[i].value() === value)
      return true;
  }
  return false;
}
WebInspector.NetworkLogView._requestSizeLargerThanFilter = function (value, request) {
  return request.transferSize >= value;
}
WebInspector.NetworkLogView._statusCodeFilter = function (value, request) {
  return ("" + request.statusCode) === value;
}
WebInspector.NetworkLogView.HTTPRequestsFilter = function (request) {
  return request.parsedURL.isValid && (request.scheme in WebInspector.NetworkLogView.HTTPSchemas);
}
WebInspector.NetworkLogView.FinishedRequestsFilter = function (request) {
  return request.finished;
}
WebInspector.NetworkLogView._requestTimeFilter = function (windowStart, windowEnd, request) {
  if (request.issueTime() > windowEnd)
    return false;
  if (request.endTime !== -1 && request.endTime < windowStart)
    return false;
  return true;
}
WebInspector.NetworkLogView.EventTypes = {
  RequestSelected: "RequestSelected",
  SearchCountUpdated: "SearchCountUpdated",
  SearchIndexUpdated: "SearchIndexUpdated",
  UpdateRequest: "UpdateRequest"
};;
WebInspector.NetworkOverview = function () {
  WebInspector.TimelineOverviewBase.call(this);
  this.element.classList.add("network-overview");
  this._numBands = 1;
  this._windowStart = 0;
  this._windowEnd = 0;
  this._restoringWindow = false;
  this._updateScheduled = false;
  this._canvasWidth = 0;
  this._canvasHeight = 0;
  WebInspector.targetManager.addModelListener(WebInspector.ResourceTreeModel, WebInspector.ResourceTreeModel.EventTypes.Load, this._loadEventFired, this);
  WebInspector.targetManager.addModelListener(WebInspector.ResourceTreeModel, WebInspector.ResourceTreeModel.EventTypes.DOMContentLoaded, this._domContentLoadedEventFired, this);
  this.reset();
}
WebInspector.NetworkOverview._bandHeight = 3;
WebInspector.NetworkOverview.Window;
WebInspector.NetworkOverview.prototype = {
  setFilmStripModel: function (filmStripModel) {
    this._filmStripModel = filmStripModel;
    this.scheduleUpdate();
  },
  selectFilmStripFrame: function (time) {
    this._selectedFilmStripTime = time;
    this.scheduleUpdate();
  },
  clearFilmStripFrame: function () {
    this._selectedFilmStripTime = -1;
    this.scheduleUpdate();
  },
  _loadEventFired: function (event) {
    var data = (event.data);
    if (data)
      this._loadEvents.push(data * 1000);
    this.scheduleUpdate();
  },
  _domContentLoadedEventFired: function (event) {
    var data = (event.data);
    if (data)
      this._domContentLoadedEvents.push(data * 1000);
    this.scheduleUpdate();
  },
  _bandId: function (connectionId) {
    if (!connectionId || connectionId === "0")
      return -1;
    if (this._bandMap.has(connectionId))
      return (this._bandMap.get(connectionId));
    var result = this._nextBand++;
    this._bandMap.set(connectionId, result);
    return result;
  },
  updateRequest: function (request) {
    if (!this._requestsSet.has(request)) {
      this._requestsSet.add(request);
      this._requestsList.push(request);
    }
    this.scheduleUpdate();
  },
  wasShown: function () {
    this.onResize();
  },
  onResize: function () {
    var width = this.element.offsetWidth;
    var height = this.element.offsetHeight;
    this._calculator.setDisplayWindow(width);
    this.resetCanvas();
    var numBands = (((height - 1) / WebInspector.NetworkOverview._bandHeight) - 1) | 0;
    this._numBands = (numBands > 0) ? numBands : 1;
    this.scheduleUpdate();
  },
  reset: function () {
    this._windowStart = 0;
    this._windowEnd = 0;
    this._filmStripModel = null;
    this._span = 1;
    this._lastBoundary = null;
    this._nextBand = 0;
    this._bandMap = new Map();
    this._requestsList = [];
    this._requestsSet = new Set();
    this._loadEvents = [];
    this._domContentLoadedEvents = [];
    this.resetCanvas();
  },
  scheduleUpdate: function () {
    if (this._updateScheduled || !this.isShowing())
      return;
    this._updateScheduled = true;
    this.element.window().requestAnimationFrame(this.update.bind(this));
  },
  update: function () {
    this._updateScheduled = false;
    var newBoundary = new WebInspector.NetworkTimeBoundary(this._calculator.minimumBoundary(), this._calculator.maximumBoundary());
    if (!this._lastBoundary || !newBoundary.equals(this._lastBoundary)) {
      var span = this._calculator.boundarySpan();
      while (this._span < span)
        this._span *= 1.25;
      this._calculator.setBounds(this._calculator.minimumBoundary(), this._calculator.minimumBoundary() + this._span);
      this._lastBoundary = new WebInspector.NetworkTimeBoundary(this._calculator.minimumBoundary(), this._calculator.maximumBoundary());
      if (this._windowStart || this._windowEnd) {
        this._restoringWindow = true;
        var startTime = this._calculator.minimumBoundary();
        var totalTime = this._calculator.boundarySpan();
        var left = (this._windowStart - startTime) / totalTime;
        var right = (this._windowEnd - startTime) / totalTime;
        this._restoringWindow = false;
      }
    }
    var context = this._canvas.getContext("2d");
    var calculator = this._calculator;
    var linesByType = {};
    var paddingTop = 2;

    function drawLines(type, strokeStyle) {
      var lines = linesByType[type];
      if (!lines)
        return;
      var n = lines.length;
      context.beginPath();
      context.strokeStyle = strokeStyle;
      for (var i = 0; i < n;) {
        var y = lines[i++] * WebInspector.NetworkOverview._bandHeight + paddingTop;
        var startTime = lines[i++];
        var endTime = lines[i++];
        if (endTime === Number.MAX_VALUE)
          endTime = calculator.maximumBoundary();
        context.moveTo(calculator.computePosition(startTime), y);
        context.lineTo(calculator.computePosition(endTime) + 1, y);
      }
      context.stroke();
    }

    function addLine(type, y, start, end) {
      var lines = linesByType[type];
      if (!lines) {
        lines = [];
        linesByType[type] = lines;
      }
      lines.push(y, start, end);
    }
    var requests = this._requestsList;
    var n = requests.length;
    for (var i = 0; i < n; ++i) {
      var request = requests[i];
      var band = this._bandId(request.connectionId);
      var y = (band === -1) ? 0 : (band % this._numBands + 1);
      var timeRanges = WebInspector.RequestTimingView.calculateRequestTimeRanges(request, this._calculator.minimumBoundary());
      for (var j = 0; j < timeRanges.length; ++j) {
        var type = timeRanges[j].name;
        if (band !== -1 || type === WebInspector.RequestTimeRangeNames.Total)
          addLine(type, y, timeRanges[j].start * 1000, timeRanges[j].end * 1000);
      }
    }
    context.clearRect(0, 0, this._canvas.width, this._canvas.height);
    context.save();
    context.scale(window.devicePixelRatio, window.devicePixelRatio);
    context.lineWidth = 2;
    drawLines(WebInspector.RequestTimeRangeNames.Total, "#CCCCCC");
    drawLines(WebInspector.RequestTimeRangeNames.Blocking, "#AAAAAA");
    drawLines(WebInspector.RequestTimeRangeNames.Connecting, "#FF9800");
    drawLines(WebInspector.RequestTimeRangeNames.ServiceWorker, "#FF9800");
    drawLines(WebInspector.RequestTimeRangeNames.ServiceWorkerPreparation, "#FF9800");
    drawLines(WebInspector.RequestTimeRangeNames.Push, "#8CDBff");
    drawLines(WebInspector.RequestTimeRangeNames.Proxy, "#A1887F");
    drawLines(WebInspector.RequestTimeRangeNames.DNS, "#009688");
    drawLines(WebInspector.RequestTimeRangeNames.SSL, "#9C27B0");
    drawLines(WebInspector.RequestTimeRangeNames.Sending, "#B0BEC5");
    drawLines(WebInspector.RequestTimeRangeNames.Waiting, "#00C853");
    drawLines(WebInspector.RequestTimeRangeNames.Receiving, "#03A9F4");
    var height = this.element.offsetHeight;
    context.lineWidth = 1;
    context.beginPath();
    context.strokeStyle = "#8080FF";
    for (var i = this._domContentLoadedEvents.length - 1; i >= 0; --i) {
      var x = Math.round(calculator.computePosition(this._domContentLoadedEvents[i])) + 0.5;
      context.moveTo(x, 0);
      context.lineTo(x, height);
    }
    context.stroke();
    context.beginPath();
    context.strokeStyle = "#FF8080";
    for (var i = this._loadEvents.length - 1; i >= 0; --i) {
      var x = Math.round(calculator.computePosition(this._loadEvents[i])) + 0.5;
      context.moveTo(x, 0);
      context.lineTo(x, height);
    }
    context.stroke();
    if (this._selectedFilmStripTime !== -1) {
      context.lineWidth = 2;
      context.beginPath();
      context.strokeStyle = "#FCCC49";
      var x = Math.round(calculator.computePosition(this._selectedFilmStripTime));
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    context.restore();
  },
  __proto__: WebInspector.TimelineOverviewBase.prototype
};
WebInspector.RequestCookiesView = function (request) {
  WebInspector.VBox.call(this);
  this.registerRequiredCSS("network/requestCookiesView.css");
  this.element.classList.add("request-cookies-view");
  this._request = request;
}
WebInspector.RequestCookiesView.prototype = {
  wasShown: function () {
    this._request.addEventListener(WebInspector.NetworkRequest.Events.RequestHeadersChanged, this._refreshCookies, this);
    this._request.addEventListener(WebInspector.NetworkRequest.Events.ResponseHeadersChanged, this._refreshCookies, this);
    if (!this._gotCookies) {
      if (!this._emptyWidget) {
        this._emptyWidget = new WebInspector.EmptyWidget(WebInspector.UIString("This request has no cookies."));
        this._emptyWidget.show(this.element);
      }
      return;
    }
    if (!this._cookiesTable)
      this._buildCookiesTable();
  },
  willHide: function () {
    this._request.removeEventListener(WebInspector.NetworkRequest.Events.RequestHeadersChanged, this._refreshCookies, this);
    this._request.removeEventListener(WebInspector.NetworkRequest.Events.ResponseHeadersChanged, this._refreshCookies, this);
  },
  get _gotCookies() {
    return (this._request.requestCookies && this._request.requestCookies.length) || (this._request.responseCookies && this._request.responseCookies.length);
  },
  _buildCookiesTable: function () {
    this.detachChildWidgets();
    this._cookiesTable = new WebInspector.CookiesTable(true);
    this._cookiesTable.setCookieFolders([{
      folderName: WebInspector.UIString("Request Cookies"),
      cookies: this._request.requestCookies
    }, {
      folderName: WebInspector.UIString("Response Cookies"),
      cookies: this._request.responseCookies
    }]);
    this._cookiesTable.show(this.element);
  },
  _refreshCookies: function () {
    delete this._cookiesTable;
    if (!this._gotCookies || !this.isShowing())
      return;
    this._buildCookiesTable();
  },
  __proto__: WebInspector.VBox.prototype
};
WebInspector.RequestHeadersView = function (request) {
  WebInspector.VBox.call(this);
  this.registerRequiredCSS("network/requestHeadersView.css");
  this.element.classList.add("request-headers-view");
  this._request = request;
  this._decodeRequestParameters = true;
  this._showRequestHeadersText = false;
  this._showResponseHeadersText = false;
  var root = new TreeOutline(true);
  root.element.classList.add("outline-disclosure");
  root.expandTreeElementsWhenArrowing = true;
  this.element.appendChild(root.element);
  var generalCategory = new WebInspector.RequestHeadersView.Category(root, "general", WebInspector.UIString("General"));
  generalCategory.hidden = false;
  this._urlItem = generalCategory.createLeaf();
  this._requestMethodItem = generalCategory.createLeaf();
  this._statusCodeItem = generalCategory.createLeaf();
  this._remoteAddressItem = generalCategory.createLeaf();
  this._remoteAddressItem.hidden = true;
  this._responseHeadersCategory = new WebInspector.RequestHeadersView.Category(root, "responseHeaders", "");
  this._requestHeadersCategory = new WebInspector.RequestHeadersView.Category(root, "requestHeaders", "");
  this._queryStringCategory = new WebInspector.RequestHeadersView.Category(root, "queryString", "");
  this._formDataCategory = new WebInspector.RequestHeadersView.Category(root, "formData", "");
  this._requestPayloadCategory = new WebInspector.RequestHeadersView.Category(root, "requestPayload", WebInspector.UIString("Request Payload"));
}
WebInspector.RequestHeadersView.prototype = {
  wasShown: function () {
    this._request.addEventListener(WebInspector.NetworkRequest.Events.RemoteAddressChanged, this._refreshRemoteAddress, this);
    this._request.addEventListener(WebInspector.NetworkRequest.Events.RequestHeadersChanged, this._refreshRequestHeaders, this);
    this._request.addEventListener(WebInspector.NetworkRequest.Events.ResponseHeadersChanged, this._refreshResponseHeaders, this);
    this._request.addEventListener(WebInspector.NetworkRequest.Events.FinishedLoading, this._refreshHTTPInformation, this);
    this._refreshURL();
    this._refreshQueryString();
    this._refreshRequestHeaders();
    this._refreshResponseHeaders();
    this._refreshHTTPInformation();
    this._refreshRemoteAddress();
  },
  willHide: function () {
    this._request.removeEventListener(WebInspector.NetworkRequest.Events.RemoteAddressChanged, this._refreshRemoteAddress, this);
    this._request.removeEventListener(WebInspector.NetworkRequest.Events.RequestHeadersChanged, this._refreshRequestHeaders, this);
    this._request.removeEventListener(WebInspector.NetworkRequest.Events.ResponseHeadersChanged, this._refreshResponseHeaders, this);
    this._request.removeEventListener(WebInspector.NetworkRequest.Events.FinishedLoading, this._refreshHTTPInformation, this);
  },
  _formatHeader: function (name, value) {
    var fragment = createDocumentFragment();
    fragment.createChild("div", "header-name").textContent = name + ":";
    fragment.createChild("div", "header-value source-code").textContent = value;
    return fragment;
  },
  _formatParameter: function (value, className, decodeParameters) {
    var errorDecoding = false;
    if (decodeParameters) {
      value = value.replace(/\+/g, " ");
      if (value.indexOf("%") >= 0) {
        try {
          value = decodeURIComponent(value);
        } catch (e) {
          errorDecoding = true;
        }
      }
    }
    var div = createElementWithClass("div", className);
    if (value === "")
      div.classList.add("empty-value");
    if (errorDecoding)
      div.createChild("span", "error-message").textContent = WebInspector.UIString("(unable to decode value)");
    else
      div.textContent = value;
    return div;
  },
  _refreshURL: function () {
    this._urlItem.title = this._formatHeader(WebInspector.UIString("Request URL"), this._request.url);
  },
  _refreshQueryString: function () {
    var queryString = this._request.queryString();
    var queryParameters = this._request.queryParameters;
    this._queryStringCategory.hidden = !queryParameters;
    if (queryParameters)
      this._refreshParams(WebInspector.UIString("Query String Parameters"), queryParameters, queryString, this._queryStringCategory);
  },
  _refreshFormData: function () {
    this._formDataCategory.hidden = true;
    this._requestPayloadCategory.hidden = true;
    var formData = this._request.requestFormData;
    if (!formData)
      return;
    var formParameters = this._request.formParameters;
    if (formParameters) {
      this._formDataCategory.hidden = false;
      this._refreshParams(WebInspector.UIString("Form Data"), formParameters, formData, this._formDataCategory);
    } else {
      this._requestPayloadCategory.hidden = false;
      try {
        var json = JSON.parse(formData);
        this._refreshRequestJSONPayload(json, formData);
      } catch (e) {
        this._populateTreeElementWithSourceText(this._requestPayloadCategory, formData);
      }
    }
  },
  _populateTreeElementWithSourceText: function (treeElement, sourceText) {
    var sourceTextElement = createElementWithClass("span", "header-value source-code");
    sourceTextElement.textContent = String(sourceText || "").trim();
    var sourceTreeElement = new TreeElement(sourceTextElement);
    sourceTreeElement.selectable = false;
    treeElement.removeChildren();
    treeElement.appendChild(sourceTreeElement);
  },
  _refreshParams: function (title, params, sourceText, paramsTreeElement) {
    paramsTreeElement.removeChildren();
    paramsTreeElement.listItemElement.removeChildren();
    paramsTreeElement.listItemElement.createTextChild(title);
    var headerCount = createElementWithClass("span", "header-count");
    headerCount.textContent = WebInspector.UIString(" (%d)", params.length);
    paramsTreeElement.listItemElement.appendChild(headerCount);

    function toggleViewSource(event) {
      paramsTreeElement._viewSource = !paramsTreeElement._viewSource;
      this._refreshParams(title, params, sourceText, paramsTreeElement);
      event.consume();
    }
    paramsTreeElement.listItemElement.appendChild(this._createViewSourceToggle(paramsTreeElement._viewSource, toggleViewSource.bind(this)));
    if (paramsTreeElement._viewSource) {
      this._populateTreeElementWithSourceText(paramsTreeElement, sourceText);
      return;
    }
    var toggleTitle = this._decodeRequestParameters ? WebInspector.UIString("view URL encoded") : WebInspector.UIString("view decoded");
    var toggleButton = this._createToggleButton(toggleTitle);
    toggleButton.addEventListener("click", this._toggleURLDecoding.bind(this), false);
    paramsTreeElement.listItemElement.appendChild(toggleButton);
    for (var i = 0; i < params.length; ++i) {
      var paramNameValue = createDocumentFragment();
      if (params[i].name !== "") {
        var name = this._formatParameter(params[i].name + ":", "header-name", this._decodeRequestParameters);
        var value = this._formatParameter(params[i].value, "header-value source-code", this._decodeRequestParameters);
        paramNameValue.appendChild(name);
        paramNameValue.appendChild(value);
      } else {
        paramNameValue.appendChild(this._formatParameter(WebInspector.UIString("(empty)"), "empty-request-header", this._decodeRequestParameters));
      }
      var paramTreeElement = new TreeElement(paramNameValue);
      paramTreeElement.selectable = false;
      paramsTreeElement.appendChild(paramTreeElement);
    }
  },
  _refreshRequestJSONPayload: function (parsedObject, sourceText) {
    var treeElement = this._requestPayloadCategory;
    treeElement.removeChildren();
    var listItem = this._requestPayloadCategory.listItemElement;
    listItem.removeChildren();
    listItem.createTextChild(this._requestPayloadCategory.title);

    function toggleViewSource(event) {
      treeElement._viewSource = !treeElement._viewSource;
      this._refreshRequestJSONPayload(parsedObject, sourceText);
      event.consume();
    }
    listItem.appendChild(this._createViewSourceToggle(treeElement._viewSource, toggleViewSource.bind(this)));
    if (treeElement._viewSource) {
      this._populateTreeElementWithSourceText(this._requestPayloadCategory, sourceText);
    } else {
      var object = WebInspector.RemoteObject.fromLocalObject(parsedObject);
      var section = new WebInspector.ObjectPropertiesSection(object, object.description);
      section.expand();
      section.editable = false;
      treeElement.appendChild(new TreeElement(section.element));
    }
  },
  _createViewSourceToggle: function (viewSource, handler) {
    var viewSourceToggleTitle = viewSource ? WebInspector.UIString("view parsed") : WebInspector.UIString("view source");
    var viewSourceToggleButton = this._createToggleButton(viewSourceToggleTitle);
    viewSourceToggleButton.addEventListener("click", handler, false);
    return viewSourceToggleButton;
  },
  _toggleURLDecoding: function (event) {
    this._decodeRequestParameters = !this._decodeRequestParameters;
    this._refreshQueryString();
    this._refreshFormData();
    event.consume();
  },
  _refreshRequestHeaders: function () {
    var treeElement = this._requestHeadersCategory;
    var headers = this._request.requestHeaders().slice();
    headers.sort(function (a, b) {
      return a.name.toLowerCase().compareTo(b.name.toLowerCase());
    });
    var headersText = this._request.requestHeadersText();
    if (this._showRequestHeadersText && headersText)
      this._refreshHeadersText(WebInspector.UIString("Request Headers"), headers.length, headersText, treeElement);
    else
      this._refreshHeaders(WebInspector.UIString("Request Headers"), headers, treeElement, headersText === undefined);
    if (headersText) {
      var toggleButton = this._createHeadersToggleButton(this._showRequestHeadersText);
      toggleButton.addEventListener("click", this._toggleRequestHeadersText.bind(this), false);
      treeElement.listItemElement.appendChild(toggleButton);
    }
    this._refreshFormData();
  },
  _refreshResponseHeaders: function () {
    var treeElement = this._responseHeadersCategory;
    var headers = this._request.sortedResponseHeaders.slice();
    var headersText = this._request.responseHeadersText;
    if (this._showResponseHeadersText)
      this._refreshHeadersText(WebInspector.UIString("Response Headers"), headers.length, headersText, treeElement);
    else
      this._refreshHeaders(WebInspector.UIString("Response Headers"), headers, treeElement);
    if (headersText) {
      var toggleButton = this._createHeadersToggleButton(this._showResponseHeadersText);
      toggleButton.addEventListener("click", this._toggleResponseHeadersText.bind(this), false);
      treeElement.listItemElement.appendChild(toggleButton);
    }
  },
  _refreshHTTPInformation: function () {
    var requestMethodElement = this._requestMethodItem;
    requestMethodElement.hidden = !this._request.statusCode;
    var statusCodeElement = this._statusCodeItem;
    statusCodeElement.hidden = !this._request.statusCode;
    if (this._request.statusCode) {
      var statusCodeFragment = createDocumentFragment();
      statusCodeFragment.createChild("div", "header-name").textContent = WebInspector.UIString("Status Code") + ":";
      var statusCodeImage = statusCodeFragment.createChild("label", "resource-status-image", "dt-icon-label");
      statusCodeImage.title = this._request.statusCode + " " + this._request.statusText;
      if (this._request.statusCode < 300 || this._request.statusCode === 304)
        statusCodeImage.type = "green-ball";
      else if (this._request.statusCode < 400)
        statusCodeImage.type = "orange-ball";
      else
        statusCodeImage.type = "red-ball";
      requestMethodElement.title = this._formatHeader(WebInspector.UIString("Request Method"), this._request.requestMethod);
      var statusTextElement = statusCodeFragment.createChild("div", "header-value source-code");
      var statusText = this._request.statusCode + " " + this._request.statusText;
      if (this._request.fetchedViaServiceWorker) {
        statusText += " " + WebInspector.UIString("(from ServiceWorker)");
        statusTextElement.classList.add("status-from-cache");
      } else if (this._request.cached()) {
        statusText += " " + WebInspector.UIString("(from cache)");
        statusTextElement.classList.add("status-from-cache");
      }
      statusTextElement.textContent = statusText;
      statusCodeElement.title = statusCodeFragment;
    }
  },
  _refreshHeadersTitle: function (title, headersTreeElement, headersLength) {
    headersTreeElement.listItemElement.removeChildren();
    headersTreeElement.listItemElement.createTextChild(title);
    var headerCount = WebInspector.UIString(" (%d)", headersLength);
    headersTreeElement.listItemElement.createChild("span", "header-count").textContent = headerCount;
  },
  _refreshHeaders: function (title, headers, headersTreeElement, provisionalHeaders) {
    headersTreeElement.removeChildren();
    var length = headers.length;
    this._refreshHeadersTitle(title, headersTreeElement, length);
    if (provisionalHeaders) {
      var cautionText = WebInspector.UIString("Provisional headers are shown");
      var cautionFragment = createDocumentFragment();
      cautionFragment.createChild("label", "", "dt-icon-label").type = "warning-icon";
      cautionFragment.createChild("div", "caution").textContent = cautionText;
      var cautionTreeElement = new TreeElement(cautionFragment);
      cautionTreeElement.selectable = false;
      headersTreeElement.appendChild(cautionTreeElement);
    }
    headersTreeElement.hidden = !length && !provisionalHeaders;
    for (var i = 0; i < length; ++i) {
      var headerTreeElement = new TreeElement(this._formatHeader(headers[i].name, headers[i].value));
      headerTreeElement.selectable = false;
      headersTreeElement.appendChild(headerTreeElement);
    }
  },
  _refreshHeadersText: function (title, count, headersText, headersTreeElement) {
    this._populateTreeElementWithSourceText(headersTreeElement, headersText);
    this._refreshHeadersTitle(title, headersTreeElement, count);
  },
  _refreshRemoteAddress: function () {
    var remoteAddress = this._request.remoteAddress();
    var treeElement = this._remoteAddressItem;
    treeElement.hidden = !remoteAddress;
    if (remoteAddress)
      treeElement.title = this._formatHeader(WebInspector.UIString("Remote Address"), remoteAddress);
  },
  _toggleRequestHeadersText: function (event) {
    this._showRequestHeadersText = !this._showRequestHeadersText;
    this._refreshRequestHeaders();
    event.consume();
  },
  _toggleResponseHeadersText: function (event) {
    this._showResponseHeadersText = !this._showResponseHeadersText;
    this._refreshResponseHeaders();
    event.consume();
  },
  _createToggleButton: function (title) {
    var button = createElementWithClass("span", "header-toggle");
    button.textContent = title;
    return button;
  },
  _createHeadersToggleButton: function (isHeadersTextShown) {
    var toggleTitle = isHeadersTextShown ? WebInspector.UIString("view parsed") : WebInspector.UIString("view source");
    return this._createToggleButton(toggleTitle);
  },
  __proto__: WebInspector.VBox.prototype
}
WebInspector.RequestHeadersView.Category = function (root, name, title) {
  TreeElement.call(this, title || "", true);
  this.selectable = false;
  this.toggleOnClick = true;
  this.hidden = true;
  this._expandedSetting = WebInspector.settings.createSetting("request-info-" + name + "-category-expanded", true);
  this.expanded = this._expandedSetting.get();
  root.appendChild(this);
}
WebInspector.RequestHeadersView.Category.prototype = {
  createLeaf: function () {
    var leaf = new TreeElement();
    leaf.selectable = false;
    this.appendChild(leaf);
    return leaf;
  },
  onexpand: function () {
    this._expandedSetting.set(true);
  },
  oncollapse: function () {
    this._expandedSetting.set(false);
  },
  __proto__: TreeElement.prototype
};
WebInspector.RequestHTMLView = function (request, dataURL) {
  WebInspector.RequestView.call(this, request);
  this._dataURL = dataURL;
  this.element.classList.add("html");
}
WebInspector.RequestHTMLView.prototype = {
  wasShown: function () {
    this._createIFrame();
  },
  willHide: function (parentElement) {
    this.element.removeChildren();
  },
  _createIFrame: function () {
    this.element.removeChildren();
    var iframe = createElement("iframe");
    iframe.setAttribute("sandbox", "");
    iframe.setAttribute("src", this._dataURL);
    this.element.appendChild(iframe);
  },
  __proto__: WebInspector.RequestView.prototype
};
WebInspector.RequestPreviewView = function (request, responseView) {
  WebInspector.RequestContentView.call(this, request);
  this._responseView = responseView;
}
WebInspector.RequestPreviewView.prototype = {
  contentLoaded: function () {
    if (!this.request.content && !this.request.contentError()) {
      if (!this._emptyWidget) {
        this._emptyWidget = this._createEmptyWidget();
        this._emptyWidget.show(this.element);
        this.innerView = this._emptyWidget;
      }
    } else {
      if (this._emptyWidget) {
        this._emptyWidget.detach();
        delete this._emptyWidget;
      }
      if (!this._previewView)
        this._createPreviewView(handlePreviewView.bind(this));
      else
        this.innerView = this._previewView;
    }

    function handlePreviewView(view) {
      this._previewView = view;
      this._previewView.show(this.element);
      if (this._previewView instanceof WebInspector.VBoxWithToolbarItems) {
        var toolbar = new WebInspector.Toolbar("network-item-preview-toolbar", this.element);
        for (var item of(this._previewView).toolbarItems())
          toolbar.appendToolbarItem(item);
      }
      this.innerView = this._previewView;
      this._previewViewHandledForTest(this._previewView);
    }
  },
  _previewViewHandledForTest: function (view) {},
  _createEmptyWidget: function () {
    return this._createMessageView(WebInspector.UIString("This request has no preview available."));
  },
  _createMessageView: function (message) {
    return new WebInspector.EmptyWidget(message);
  },
  _requestContent: function () {
    var content = this.request.content;
    return this.request.contentEncoded ? window.atob(content || "") : (content || "");
  },
  _jsonView: function (parsedJSON) {
    if (!parsedJSON || typeof parsedJSON.data !== "object")
      return null;
    return WebInspector.JSONView.createSearchableView((parsedJSON));
  },
  _xmlView: function () {
    var parsedXML = WebInspector.XMLView.parseXML(this._requestContent(), this.request.mimeType);
    return parsedXML ? WebInspector.XMLView.createSearchableView(parsedXML) : null;
  },
  _htmlErrorPreview: function () {
    var whitelist = ["text/html", "text/plain", "application/xhtml+xml"];
    if (whitelist.indexOf(this.request.mimeType) === -1)
      return null;
    var dataURL = this.request.asDataURL();
    if (dataURL === null)
      return null;
    return new WebInspector.RequestHTMLView(this.request, dataURL);
  },
  _createPreviewView: function (callback) {
    if (this.request.contentError()) {
      callback(this._createMessageView(WebInspector.UIString("Failed to load response data")));
      return;
    }
    var xmlView = this._xmlView();
    if (xmlView) {
      callback(xmlView);
      return;
    }
    WebInspector.JSONView.parseJSON(this._requestContent()).then(chooseView.bind(this)).then(callback);

    function chooseView(jsonData) {
      if (jsonData) {
        var jsonView = this._jsonView(jsonData);
        if (jsonView)
          return jsonView;
      }
      if (this.request.hasErrorStatusCode() || this.request.resourceType() === WebInspector.resourceTypes.XHR) {
        var htmlErrorPreview = this._htmlErrorPreview();
        if (htmlErrorPreview)
          return htmlErrorPreview;
      }
      if (this._responseView.sourceView)
        return this._responseView.sourceView;
      if (this.request.resourceType() === WebInspector.resourceTypes.Other)
        return this._createEmptyWidget();
      return WebInspector.RequestView.nonSourceViewForRequest(this.request);
    }
  },
  __proto__: WebInspector.RequestContentView.prototype
};
WebInspector.RequestResponseView = function (request) {
  WebInspector.RequestContentView.call(this, request);
}
WebInspector.RequestResponseView.prototype = {get sourceView() {
    if (this._sourceView || !WebInspector.RequestView.hasTextContent(this.request))
      return this._sourceView;
    var contentProvider = new WebInspector.RequestResponseView.ContentProvider(this.request);
    var highlighterType = this.request.resourceType().canonicalMimeType() || this.request.mimeType;
    this._sourceView = WebInspector.ResourceSourceFrame.createSearchableView(contentProvider, highlighterType);;
    return this._sourceView;
  },
  _createMessageView: function (message) {
    return new WebInspector.EmptyWidget(message);
  },
  contentLoaded: function () {
    if ((!this.request.content || !this.sourceView) && !this.request.contentError()) {
      if (!this._emptyWidget) {
        this._emptyWidget = this._createMessageView(WebInspector.UIString("This request has no response data available."));
        this._emptyWidget.show(this.element);
        this.innerView = this._emptyWidget;
      }
    } else {
      if (this._emptyWidget) {
        this._emptyWidget.detach();
        delete this._emptyWidget;
      }
      if (this.request.content && this.sourceView) {
        this.sourceView.show(this.element);
        this.innerView = this.sourceView;
      } else {
        if (!this._errorView)
          this._errorView = this._createMessageView(WebInspector.UIString("Failed to load response data"));
        this._errorView.show(this.element);
        this.innerView = this._errorView;
      }
    }
  },
  __proto__: WebInspector.RequestContentView.prototype
}
WebInspector.RequestResponseView.ContentProvider = function (request) {
  this._request = request;
}
WebInspector.RequestResponseView.ContentProvider.prototype = {
  contentURL: function () {
    return this._request.contentURL();
  },
  contentType: function () {
    return this._request.resourceType();
  },
  requestContent: function () {
    function decodeContent(content) {
      return this._request.contentEncoded ? window.atob(content || "") : content;
    }
    return this._request.requestContent().then(decodeContent.bind(this));
  },
  searchInContent: function (query, caseSensitive, isRegex, callback) {
    this._request.searchInContent(query, caseSensitive, isRegex, callback);
  }
};
WebInspector.RequestTimingView = function (request, calculator) {
  WebInspector.VBox.call(this);
  this.element.classList.add("resource-timing-view");
  this._request = request;
  this._calculator = calculator;
}
WebInspector.RequestTimingView.prototype = {
  wasShown: function () {
    this._request.addEventListener(WebInspector.NetworkRequest.Events.TimingChanged, this._refresh, this);
    this._request.addEventListener(WebInspector.NetworkRequest.Events.FinishedLoading, this._refresh, this);
    this._calculator.addEventListener(WebInspector.NetworkTimeCalculator.Events.BoundariesChanged, this._refresh, this);
    this._refresh();
  },
  willHide: function () {
    this._request.removeEventListener(WebInspector.NetworkRequest.Events.TimingChanged, this._refresh, this);
    this._request.removeEventListener(WebInspector.NetworkRequest.Events.FinishedLoading, this._refresh, this);
    this._calculator.removeEventListener(WebInspector.NetworkTimeCalculator.Events.BoundariesChanged, this._refresh, this);
  },
  _refresh: function () {
    if (this._tableElement)
      this._tableElement.remove();
    this._tableElement = WebInspector.RequestTimingView.createTimingTable(this._request, this._calculator.minimumBoundary());
    this.element.appendChild(this._tableElement);
  },
  __proto__: WebInspector.VBox.prototype
}
WebInspector.RequestTimeRangeNames = {
  Push: "push",
  Queueing: "queueing",
  Blocking: "blocking",
  Connecting: "connecting",
  DNS: "dns",
  Proxy: "proxy",
  Receiving: "receiving",
  ReceivingPush: "receiving-push",
  Sending: "sending",
  ServiceWorker: "serviceworker",
  ServiceWorkerPreparation: "serviceworker-preparation",
  SSL: "ssl",
  Total: "total",
  Waiting: "waiting"
};
WebInspector.RequestTimingView.ConnectionSetupRangeNames = [WebInspector.RequestTimeRangeNames.Queueing, WebInspector.RequestTimeRangeNames.Blocking, WebInspector.RequestTimeRangeNames.Connecting, WebInspector.RequestTimeRangeNames.DNS, WebInspector.RequestTimeRangeNames.Proxy, WebInspector.RequestTimeRangeNames.SSL].keySet();
WebInspector.RequestTimeRange;
WebInspector.RequestTimingView._timeRangeTitle = function (name) {
  switch (name) {
  case WebInspector.RequestTimeRangeNames.Push:
    return WebInspector.UIString("Receiving Push");
  case WebInspector.RequestTimeRangeNames.Queueing:
    return WebInspector.UIString("Queueing");
  case WebInspector.RequestTimeRangeNames.Blocking:
    return WebInspector.UIString("Stalled");
  case WebInspector.RequestTimeRangeNames.Connecting:
    return WebInspector.UIString("Initial connection");
  case WebInspector.RequestTimeRangeNames.DNS:
    return WebInspector.UIString("DNS Lookup");
  case WebInspector.RequestTimeRangeNames.Proxy:
    return WebInspector.UIString("Proxy negotiation");
  case WebInspector.RequestTimeRangeNames.ReceivingPush:
    return WebInspector.UIString("Reading Push");
  case WebInspector.RequestTimeRangeNames.Receiving:
    return WebInspector.UIString("Content Download");
  case WebInspector.RequestTimeRangeNames.Sending:
    return WebInspector.UIString("Request sent");
  case WebInspector.RequestTimeRangeNames.ServiceWorker:
    return WebInspector.UIString("Request to ServiceWorker");
  case WebInspector.RequestTimeRangeNames.ServiceWorkerPreparation:
    return WebInspector.UIString("ServiceWorker Preparation");
  case WebInspector.RequestTimeRangeNames.SSL:
    return WebInspector.UIString("SSL");
  case WebInspector.RequestTimeRangeNames.Total:
    return WebInspector.UIString("Total");
  case WebInspector.RequestTimeRangeNames.Waiting:
    return WebInspector.UIString("Waiting (TTFB)");
  default:
    return WebInspector.UIString(name);
  }
}
WebInspector.RequestTimingView.calculateRequestTimeRanges = function (request, navigationStart) {
  var result = [];

  function addRange(name, start, end) {
    if (start < Number.MAX_VALUE && start <= end)
      result.push({
        name: name,
        start: start,
        end: end
      });
  }

  function firstPositive(numbers) {
    for (var i = 0; i < numbers.length; ++i) {
      if (numbers[i] > 0)
        return numbers[i];
    }
    return undefined;
  }

  function addOffsetRange(name, start, end) {
    if (start >= 0 && end >= 0)
      addRange(name, startTime + (start / 1000), startTime + (end / 1000));
  }
  var timing = request.timing;
  if (!timing) {
    var start = request.issueTime() !== -1 ? request.issueTime() : request.startTime !== -1 ? request.startTime : 0;
    var middle = (request.responseReceivedTime === -1) ? Number.MAX_VALUE : request.responseReceivedTime;
    var end = (request.endTime === -1) ? Number.MAX_VALUE : request.endTime;
    addRange(WebInspector.RequestTimeRangeNames.Total, start, end);
    addRange(WebInspector.RequestTimeRangeNames.Blocking, start, middle);
    addRange(WebInspector.RequestTimeRangeNames.Receiving, middle, end);
    return result;
  }
  var issueTime = request.issueTime();
  var startTime = timing.requestTime;
  var endTime = firstPositive([request.endTime, request.responseReceivedTime]) || startTime;
  addRange(WebInspector.RequestTimeRangeNames.Total, issueTime < startTime ? issueTime : startTime, endTime);
  if (timing.pushStart) {
    var pushEnd = timing.pushEnd || endTime;
    if (pushEnd > navigationStart)
      addRange(WebInspector.RequestTimeRangeNames.Push, Math.max(timing.pushStart, navigationStart), pushEnd);
  }
  if (issueTime < startTime)
    addRange(WebInspector.RequestTimeRangeNames.Queueing, issueTime, startTime);
  if (request.fetchedViaServiceWorker) {
    addOffsetRange(WebInspector.RequestTimeRangeNames.Blocking, 0, timing.workerStart);
    addOffsetRange(WebInspector.RequestTimeRangeNames.ServiceWorkerPreparation, timing.workerStart, timing.workerReady);
    addOffsetRange(WebInspector.RequestTimeRangeNames.ServiceWorker, timing.workerReady, timing.sendEnd);
    addOffsetRange(WebInspector.RequestTimeRangeNames.Waiting, timing.sendEnd, timing.receiveHeadersEnd);
  } else if (!timing.pushStart) {
    var blocking = firstPositive([timing.dnsStart, timing.connectStart, timing.sendStart]) || 0;
    addOffsetRange(WebInspector.RequestTimeRangeNames.Blocking, 0, blocking);
    addOffsetRange(WebInspector.RequestTimeRangeNames.Proxy, timing.proxyStart, timing.proxyEnd);
    addOffsetRange(WebInspector.RequestTimeRangeNames.DNS, timing.dnsStart, timing.dnsEnd);
    addOffsetRange(WebInspector.RequestTimeRangeNames.Connecting, timing.connectStart, timing.connectEnd);
    addOffsetRange(WebInspector.RequestTimeRangeNames.SSL, timing.sslStart, timing.sslEnd);
    addOffsetRange(WebInspector.RequestTimeRangeNames.Sending, timing.sendStart, timing.sendEnd);
    addOffsetRange(WebInspector.RequestTimeRangeNames.Waiting, timing.sendEnd, timing.receiveHeadersEnd);
  }
  if (request.endTime !== -1)
    addRange(timing.pushStart ? WebInspector.RequestTimeRangeNames.ReceivingPush : WebInspector.RequestTimeRangeNames.Receiving, request.responseReceivedTime, endTime);
  return result;
}
WebInspector.RequestTimingView.createTimingTable = function (request, navigationStart) {
  var tableElement = createElementWithClass("table", "network-timing-table");
  var colgroup = tableElement.createChild("colgroup");
  colgroup.createChild("col", "labels");
  colgroup.createChild("col", "bars");
  colgroup.createChild("col", "duration");
  var timeRanges = WebInspector.RequestTimingView.calculateRequestTimeRanges(request, navigationStart);
  var startTime = timeRanges.map(r => r.start).reduce((a, b) => Math.min(a, b));
  var endTime = timeRanges.map(r => r.end).reduce((a, b) => Math.max(a, b));
  var scale = 100 / (endTime - startTime);
  var connectionHeader;
  var dataHeader;
  var totalDuration = 0;
  for (var i = 0; i < timeRanges.length; ++i) {
    var range = timeRanges[i];
    var rangeName = range.name;
    if (rangeName === WebInspector.RequestTimeRangeNames.Total) {
      totalDuration = range.end - range.start;
      continue;
    }
    if (rangeName === WebInspector.RequestTimeRangeNames.Push) {
      createHeader(WebInspector.UIString("Server Push"));
    } else if (WebInspector.RequestTimingView.ConnectionSetupRangeNames[rangeName]) {
      if (!connectionHeader)
        connectionHeader = createHeader(WebInspector.UIString("Connection Setup"));
    } else {
      if (!dataHeader)
        dataHeader = createHeader(WebInspector.UIString("Request/Response"));
    }
    var left = (scale * (range.start - startTime));
    var right = (scale * (endTime - range.end));
    var duration = range.end - range.start;
    var tr = tableElement.createChild("tr");
    tr.createChild("td").createTextChild(WebInspector.RequestTimingView._timeRangeTitle(rangeName));
    var row = tr.createChild("td").createChild("div", "network-timing-row");
    var bar = row.createChild("span", "network-timing-bar " + rangeName);
    bar.style.left = left + "%";
    bar.style.right = right + "%";
    bar.textContent = "​";
    var label = tr.createChild("td").createChild("div", "network-timing-bar-title");
    label.textContent = Number.secondsToString(duration, true);
  }
  if (!request.finished) {
    var cell = tableElement.createChild("tr").createChild("td", "caution");
    cell.colSpan = 3;
    cell.createTextChild(WebInspector.UIString("CAUTION: request is not finished yet!"));
  }
  var footer = tableElement.createChild("tr", "network-timing-footer");
  var note = footer.createChild("td");
  note.colSpan = 2;
  note.appendChild(WebInspector.linkifyDocumentationURLAsNode("profile/network-performance/resource-loading#view-network-timing-details-for-a-specific-resource", WebInspector.UIString("Explanation")));
  footer.createChild("td").createTextChild(Number.secondsToString(totalDuration, true));
  return tableElement;

  function createHeader(title) {
    var dataHeader = tableElement.createChild("tr", "network-timing-table-header");
    dataHeader.createChild("td").createTextChild(title);
    dataHeader.createChild("td").createTextChild("");
    dataHeader.createChild("td").createTextChild(WebInspector.UIString("TIME"));
    return dataHeader;
  }
};
WebInspector.ResourceWebSocketFrameView = function (request) {
  WebInspector.VBox.call(this);
  this.registerRequiredCSS("network/webSocketFrameView.css");
  this.element.classList.add("websocket-frame-view");
  this._request = request;
  this._splitWidget = new WebInspector.SplitWidget(false, true, "resourceWebSocketFrameSplitViewState");
  this._splitWidget.show(this.element);
  var columns = [{
    id: "data",
    title: WebInspector.UIString("Data"),
    sortable: false,
    weight: 88
  }, {
    id: "length",
    title: WebInspector.UIString("Length"),
    sortable: false,
    align: WebInspector.DataGrid.Align.Right,
    weight: 5
  }, {
    id: "time",
    title: WebInspector.UIString("Time"),
    sortable: true,
    weight: 7
  }];
  this._dataGrid = new WebInspector.SortableDataGrid(columns, undefined, undefined, undefined, this._onContextMenu.bind(this));
  this._dataGrid.setStickToBottom(true);
  this._dataGrid.setCellClass("websocket-frame-view-td");
  this._timeComparator = (WebInspector.ResourceWebSocketFrameNodeTimeComparator);
  this._dataGrid.sortNodes(this._timeComparator, false);
  this._dataGrid.markColumnAsSortedBy("time", WebInspector.DataGrid.Order.Ascending);
  this._dataGrid.addEventListener(WebInspector.DataGrid.Events.SortingChanged, this._sortItems, this);
  this._dataGrid.setName("ResourceWebSocketFrameView");
  this._dataGrid.addEventListener(WebInspector.DataGrid.Events.SelectedNode, this._onFrameSelected, this);
  this._dataGrid.addEventListener(WebInspector.DataGrid.Events.DeselectedNode, this._onFrameDeselected, this);
  this._splitWidget.setMainWidget(this._dataGrid.asWidget());
  var view = new WebInspector.EmptyWidget("Select frame to browse its content.");
  this._splitWidget.setSidebarWidget(view);
  this._selectedNode = null;
}
WebInspector.ResourceWebSocketFrameView.OpCodes = {
  ContinuationFrame: 0,
  TextFrame: 1,
  BinaryFrame: 2,
  ConnectionCloseFrame: 8,
  PingFrame: 9,
  PongFrame: 10
};
WebInspector.ResourceWebSocketFrameView.opCodeDescriptions = (function () {
  var opCodes = WebInspector.ResourceWebSocketFrameView.OpCodes;
  var map = [];
  map[opCodes.ContinuationFrame] = "Continuation Frame";
  map[opCodes.TextFrame] = "Text Frame";
  map[opCodes.BinaryFrame] = "Binary Frame";
  map[opCodes.ContinuationFrame] = "Connection Close Frame";
  map[opCodes.PingFrame] = "Ping Frame";
  map[opCodes.PongFrame] = "Pong Frame";
  return map;
})();
WebInspector.ResourceWebSocketFrameView.opCodeDescription = function (opCode, mask) {
  var rawDescription = WebInspector.ResourceWebSocketFrameView.opCodeDescriptions[opCode] || "";
  var localizedDescription = WebInspector.UIString(rawDescription);
  return WebInspector.UIString("%s (Opcode %d%s)", localizedDescription, opCode, (mask ? ", mask" : ""));
}
WebInspector.ResourceWebSocketFrameView.prototype = {
  wasShown: function () {
    this.refresh();
    this._request.addEventListener(WebInspector.NetworkRequest.Events.WebsocketFrameAdded, this._frameAdded, this);
  },
  willHide: function () {
    this._request.removeEventListener(WebInspector.NetworkRequest.Events.WebsocketFrameAdded, this._frameAdded, this);
  },
  _frameAdded: function (event) {
    var frame = (event.data);
    this._dataGrid.insertChild(new WebInspector.ResourceWebSocketFrameNode(this._request.url, frame));
  },
  _onFrameSelected: function (event) {
    var selectedNode = (event.target.selectedNode);
    this._currentSelectedNode = selectedNode;
    var contentProvider = selectedNode.contentProvider();
    contentProvider.requestContent().then(contentHandler.bind(this));

    function contentHandler(content) {
      if (this._currentSelectedNode !== selectedNode)
        return;
      WebInspector.JSONView.parseJSON(content).then(handleJSONData.bind(this));
    }

    function handleJSONData(parsedJSON) {
      if (this._currentSelectedNode !== selectedNode)
        return;
      if (parsedJSON)
        this._splitWidget.setSidebarWidget(WebInspector.JSONView.createSearchableView(parsedJSON));
      else
        this._splitWidget.setSidebarWidget(new WebInspector.ResourceSourceFrame(contentProvider));
    }
  },
  _onFrameDeselected: function (event) {
    this._currentSelectedNode = null;
  },
  refresh: function () {
    this._dataGrid.rootNode().removeChildren();
    var frames = this._request.frames();
    for (var i = 0; i < frames.length; ++i)
      this._dataGrid.insertChild(new WebInspector.ResourceWebSocketFrameNode(this._request.url, frames[i]));
  },
  _onContextMenu: function (contextMenu, node) {
    contextMenu.appendItem(WebInspector.UIString.capitalize("Copy ^message"), this._copyMessage.bind(this, node.data));
  },
  _copyMessage: function (row) {
    InspectorFrontendHost.copyText(row.data);
  },
  _sortItems: function () {
    this._dataGrid.sortNodes(this._timeComparator, !this._dataGrid.isSortOrderAscending());
  },
  __proto__: WebInspector.VBox.prototype
}
WebInspector.ResourceWebSocketFrameNode = function (url, frame) {
  this._frame = frame;
  this._dataText = frame.text;
  this._url = url;
  var length = frame.text.length;
  var time = new Date(frame.time * 1000);
  var timeText = ("0" + time.getHours()).substr(-2) + ":" + ("0" + time.getMinutes()).substr(-2) + ":" + ("0" + time.getSeconds()).substr(-2) + "." + ("00" + time.getMilliseconds()).substr(-3);
  var timeNode = createElement("div");
  timeNode.createTextChild(timeText);
  timeNode.title = time.toLocaleString();
  this._isTextFrame = frame.opCode === WebInspector.ResourceWebSocketFrameView.OpCodes.TextFrame;
  if (!this._isTextFrame)
    this._dataText = WebInspector.ResourceWebSocketFrameView.opCodeDescription(frame.opCode, frame.mask);
  WebInspector.SortableDataGridNode.call(this, {
    data: this._dataText,
    length: length,
    time: timeNode
  });
}
WebInspector.ResourceWebSocketFrameNode.prototype = {
  createCells: function () {
    var element = this._element;
    element.classList.toggle("websocket-frame-view-row-error", this._frame.type === WebInspector.NetworkRequest.WebSocketFrameType.Error);
    element.classList.toggle("websocket-frame-view-row-outcoming", this._frame.type === WebInspector.NetworkRequest.WebSocketFrameType.Send);
    element.classList.toggle("websocket-frame-view-row-opcode", !this._isTextFrame);
    WebInspector.SortableDataGridNode.prototype.createCells.call(this);
  },
  nodeSelfHeight: function () {
    return 17;
  },
  contentProvider: function () {
    return WebInspector.StaticContentProvider.fromString(this._url, WebInspector.resourceTypes.WebSocket, this._dataText);
  },
  __proto__: WebInspector.SortableDataGridNode.prototype
}
WebInspector.ResourceWebSocketFrameNodeTimeComparator = function (a, b) {
  return a._frame.time - b._frame.time;
};
WebInspector.NetworkPanel = function () {
  WebInspector.Panel.call(this, "network");
  this.registerRequiredCSS("network/networkPanel.css");
  this._networkLogShowOverviewSetting = WebInspector.settings.createSetting("networkLogShowOverview", true);
  this._networkLogLargeRowsSetting = WebInspector.settings.createSetting("networkLogLargeRows", false);
  this._networkRecordFilmStripSetting = WebInspector.settings.createSetting("networkRecordFilmStripSetting", false);
  this._toggleRecordAction = (WebInspector.actionRegistry.action("network.toggle-recording"));
  this._filmStripView = null;
  this._filmStripRecorder = null;
  this._panelToolbar = new WebInspector.Toolbar("", this.element);
  this._filterBar = new WebInspector.FilterBar("networkPanel", true);
  this._filterBar.show(this.element);
  this._overviewPane = new WebInspector.TimelineOverviewPane("network");
  this._overviewPane.addEventListener(WebInspector.TimelineOverviewPane.Events.WindowChanged, this._onWindowChanged.bind(this));
  this._overviewPane.element.id = "network-overview-panel";
  this._networkOverview = new WebInspector.NetworkOverview();
  this._overviewPane.setOverviewControls([this._networkOverview]);
  this._calculator = new WebInspector.NetworkTransferTimeCalculator();
  this._splitWidget = new WebInspector.SplitWidget(true, false, "networkPanelSplitViewState");
  this._splitWidget.hideMain();
  this._splitWidget.show(this.element);
  this._progressBarContainer = createElement("div");
  this._createToolbarButtons();
  this._searchableView = new WebInspector.SearchableView(this);
  this._searchableView.setPlaceholder(WebInspector.UIString("Find by filename or path"));
  this._networkLogView = new WebInspector.NetworkLogView(this._filterBar, this._progressBarContainer, this._networkLogLargeRowsSetting);
  this._networkLogView.show(this._searchableView.element);
  this._splitWidget.setSidebarWidget(this._searchableView);
  this._detailsWidget = new WebInspector.VBox();
  this._detailsWidget.element.classList.add("network-details-view");
  this._splitWidget.setMainWidget(this._detailsWidget);
  this._closeButtonElement = createElementWithClass("div", "network-close-button", "dt-close-button");
  this._closeButtonElement.addEventListener("click", this._showRequest.bind(this, null), false);
  this._networkLogShowOverviewSetting.addChangeListener(this._toggleShowOverview, this);
  this._networkLogLargeRowsSetting.addChangeListener(this._toggleLargerRequests, this);
  this._networkRecordFilmStripSetting.addChangeListener(this._toggleRecordFilmStrip, this);
  this._toggleRecord(true);
  this._toggleShowOverview();
  this._toggleLargerRequests();
  this._toggleRecordFilmStrip();
  this._updateUI();
  WebInspector.targetManager.addModelListener(WebInspector.ResourceTreeModel, WebInspector.ResourceTreeModel.EventTypes.WillReloadPage, this._willReloadPage, this);
  WebInspector.targetManager.addModelListener(WebInspector.ResourceTreeModel, WebInspector.ResourceTreeModel.EventTypes.Load, this._load, this);
  this._networkLogView.addEventListener(WebInspector.NetworkLogView.EventTypes.RequestSelected, this._onRequestSelected, this);
  this._networkLogView.addEventListener(WebInspector.NetworkLogView.EventTypes.SearchCountUpdated, this._onSearchCountUpdated, this);
  this._networkLogView.addEventListener(WebInspector.NetworkLogView.EventTypes.SearchIndexUpdated, this._onSearchIndexUpdated, this);
  this._networkLogView.addEventListener(WebInspector.NetworkLogView.EventTypes.UpdateRequest, this._onUpdateRequest, this);
  WebInspector.DataSaverInfobar.maybeShowInPanel(this);
}
WebInspector.NetworkPanel.prototype = {
  _onWindowChanged: function (event) {
    var startTime = Math.max(this._calculator.minimumBoundary(), event.data.startTime / 1000);
    var endTime = Math.min(this._calculator.maximumBoundary(), event.data.endTime / 1000);
    this._networkLogView.setWindow(startTime, endTime);
  },
  _createToolbarButtons: function () {
    this._panelToolbar.appendToolbarItem(WebInspector.Toolbar.createActionButton(this._toggleRecordAction));
    this._clearButton = new WebInspector.ToolbarButton(WebInspector.UIString("Clear"), "clear-toolbar-item");
    this._clearButton.addEventListener("click", this._onClearButtonClicked, this);
    this._panelToolbar.appendToolbarItem(this._clearButton);
    this._panelToolbar.appendSeparator();
    var recordFilmStripButton = new WebInspector.ToolbarSettingToggle(this._networkRecordFilmStripSetting, "camera-toolbar-item", WebInspector.UIString("Capture screenshots"));
    this._panelToolbar.appendToolbarItem(recordFilmStripButton);
    this._panelToolbar.appendToolbarItem(this._filterBar.filterButton());
    this._panelToolbar.appendSeparator();
    this._panelToolbar.appendText(WebInspector.UIString("View:"));
    var largerRequestsButton = new WebInspector.ToolbarSettingToggle(this._networkLogLargeRowsSetting, "large-list-toolbar-item", WebInspector.UIString("Use large request rows"), WebInspector.UIString("Use small request rows"));
    this._panelToolbar.appendToolbarItem(largerRequestsButton);
    var showOverviewButton = new WebInspector.ToolbarSettingToggle(this._networkLogShowOverviewSetting, "waterfall-toolbar-item", WebInspector.UIString("Show overview"), WebInspector.UIString("Hide overview"));
    this._panelToolbar.appendToolbarItem(showOverviewButton);
    this._panelToolbar.appendSeparator();
    this._preserveLogCheckbox = new WebInspector.ToolbarCheckbox(WebInspector.UIString("Preserve log"), WebInspector.UIString("Do not clear log on page reload / navigation"));
    this._preserveLogCheckbox.inputElement.addEventListener("change", this._onPreserveLogCheckboxChanged.bind(this), false);
    this._panelToolbar.appendToolbarItem(this._preserveLogCheckbox);
    this._disableCacheCheckbox = new WebInspector.ToolbarCheckbox(WebInspector.UIString("Disable cache"), WebInspector.UIString("Disable cache (while DevTools is open)"), WebInspector.moduleSetting("cacheDisabled"));
    this._panelToolbar.appendToolbarItem(this._disableCacheCheckbox);
    this._panelToolbar.appendSeparator();
    this._panelToolbar.appendToolbarItem(this._createBlockedURLsButton());
    this._panelToolbar.appendToolbarItem(WebInspector.NetworkConditionsSelector.createOfflineToolbarCheckbox());
    this._panelToolbar.appendToolbarItem(this._createNetworkConditionsSelect());
    this._panelToolbar.appendToolbarItem(new WebInspector.ToolbarItem(this._progressBarContainer));
  },
  _createBlockedURLsButton: function () {
    var setting = WebInspector.moduleSetting("blockedURLs");
    setting.addChangeListener(updateAction);
    var action = (WebInspector.actionRegistry.action("network.blocked-urls.show"));
    var button = WebInspector.Toolbar.createActionButton(action);
    button.setVisible(Runtime.experiments.isEnabled("requestBlocking"));
    updateAction();
    return button;

    function updateAction() {
      action.setToggled(!!setting.get().length);
    }
  },
  _createNetworkConditionsSelect: function () {
    var toolbarItem = new WebInspector.ToolbarComboBox(null);
    toolbarItem.setMaxWidth(140);
    WebInspector.NetworkConditionsSelector.decorateSelect(toolbarItem.selectElement());
    return toolbarItem;
  },
  _toggleRecording: function () {
    if (!this._preserveLogCheckbox.checked() && !this._toggleRecordAction.toggled())
      this._reset();
    this._toggleRecord(!this._toggleRecordAction.toggled());
  },
  _toggleRecord: function (toggled) {
    this._toggleRecordAction.setToggled(toggled);
    this._networkLogView.setRecording(toggled);
    if (!toggled && this._filmStripRecorder)
      this._filmStripRecorder.stopRecording(this._filmStripAvailable.bind(this));
  },
  _filmStripAvailable: function (filmStripModel) {
    if (!filmStripModel)
      return;
    var calculator = this._networkLogView.timeCalculator();
    this._filmStripView.setModel(filmStripModel, calculator.minimumBoundary() * 1000, calculator.boundarySpan() * 1000);
    this._networkOverview.setFilmStripModel(filmStripModel);
    var timestamps = filmStripModel.frames().map(mapTimestamp);

    function mapTimestamp(frame) {
      return frame.timestamp / 1000;
    }
    this._networkLogView.addFilmStripFrames(timestamps);
  },
  _onPreserveLogCheckboxChanged: function (event) {
    this._networkLogView.setPreserveLog(this._preserveLogCheckbox.checked());
  },
  _onClearButtonClicked: function (event) {
    this._reset();
  },
  _reset: function () {
    this._calculator.reset();
    this._overviewPane.reset();
    this._networkLogView.reset();
    WebInspector.BlockedURLsPane.reset();
    if (this._filmStripView)
      this._resetFilmStripView();
  },
  _willReloadPage: function (event) {
    if (!this._preserveLogCheckbox.checked())
      this._reset();
    this._toggleRecord(true);
    if (this._pendingStopTimer) {
      clearTimeout(this._pendingStopTimer);
      delete this._pendingStopTimer;
    }
    if (this.isShowing() && this._filmStripRecorder)
      this._filmStripRecorder.startRecording();
  },
  _load: function (event) {
    if (this._filmStripRecorder && this._filmStripRecorder.isRecording())
      this._pendingStopTimer = setTimeout(this._toggleRecord.bind(this, false), 1000);
  },
  _toggleLargerRequests: function () {
    this._updateUI();
  },
  _toggleShowOverview: function () {
    var toggled = this._networkLogShowOverviewSetting.get();
    if (toggled)
      this._overviewPane.show(this.element, this._splitWidget.element);
    else
      this._overviewPane.detach();
    this.doResize();
  },
  _toggleRecordFilmStrip: function () {
    var toggled = this._networkRecordFilmStripSetting.get();
    if (toggled && !this._filmStripRecorder) {
      this._filmStripView = new WebInspector.FilmStripView();
      this._filmStripView.setMode(WebInspector.FilmStripView.Modes.FrameBased);
      this._filmStripView.element.classList.add("network-film-strip");
      this._filmStripRecorder = new WebInspector.NetworkPanel.FilmStripRecorder(this._networkLogView.timeCalculator(), this._filmStripView);
      this._filmStripView.show(this.element, this.element.firstElementChild);
      this._filmStripView.addEventListener(WebInspector.FilmStripView.Events.FrameSelected, this._onFilmFrameSelected, this);
      this._filmStripView.addEventListener(WebInspector.FilmStripView.Events.FrameEnter, this._onFilmFrameEnter, this);
      this._filmStripView.addEventListener(WebInspector.FilmStripView.Events.FrameExit, this._onFilmFrameExit, this);
      this._resetFilmStripView();
    }
    if (!toggled && this._filmStripRecorder) {
      this._filmStripView.detach();
      this._filmStripView = null;
      this._filmStripRecorder = null;
    }
  },
  _resetFilmStripView: function () {
    this._filmStripView.reset();
    this._filmStripView.setStatusText(WebInspector.UIString("Hit %s to reload and capture filmstrip.", WebInspector.shortcutRegistry.shortcutDescriptorsForAction("main.reload")[0].name));
  },
  elementsToRestoreScrollPositionsFor: function () {
    return this._networkLogView.elementsToRestoreScrollPositionsFor();
  },
  searchableView: function () {
    return this._searchableView;
  },
  handleShortcut: function (event) {
    if (this._networkItemView && event.keyCode === WebInspector.KeyboardShortcut.Keys.Esc.code) {
      this._showRequest(null);
      event.handled = true;
      return;
    }
    WebInspector.Panel.prototype.handleShortcut.call(this, event);
  },
  wasShown: function () {
    WebInspector.context.setFlavor(WebInspector.NetworkPanel, this);
  },
  willHide: function () {
    WebInspector.context.setFlavor(WebInspector.NetworkPanel, null);
  },
  revealAndHighlightRequest: function (request) {
    this._showRequest(null);
    if (request)
      this._networkLogView.revealAndHighlightRequest(request);
  },
  _onRowSizeChanged: function (event) {
    this._updateUI();
  },
  _onSearchCountUpdated: function (event) {
    var count = (event.data);
    this._searchableView.updateSearchMatchesCount(count);
  },
  _onSearchIndexUpdated: function (event) {
    var index = (event.data);
    this._searchableView.updateCurrentMatchIndex(index);
  },
  _onRequestSelected: function (event) {
    var request = (event.data);
    this._showRequest(request);
  },
  _showRequest: function (request) {
    if (this._networkItemView) {
      this._networkItemView.detach();
      this._networkItemView = null;
    }
    if (request) {
      this._networkItemView = new WebInspector.NetworkItemView(request, this._networkLogView.timeCalculator());
      this._networkItemView.insertBeforeTabStrip(this._closeButtonElement);
      this._networkItemView.show(this._detailsWidget.element);
      this._splitWidget.showBoth();
    } else {
      this._splitWidget.hideMain();
      this._networkLogView.clearSelection();
    }
    this._updateUI();
  },
  _updateUI: function () {
    this._detailsWidget.element.classList.toggle("network-details-view-tall-header", this._networkLogLargeRowsSetting.get());
    this._networkLogView.switchViewMode(!this._splitWidget.isResizable());
  },
  performSearch: function (searchConfig, shouldJump, jumpBackwards) {
    this._networkLogView.performSearch(searchConfig, shouldJump, jumpBackwards);
  },
  jumpToPreviousSearchResult: function () {
    this._networkLogView.jumpToPreviousSearchResult();
  },
  supportsCaseSensitiveSearch: function () {
    return false;
  },
  supportsRegexSearch: function () {
    return false;
  },
  jumpToNextSearchResult: function () {
    this._networkLogView.jumpToNextSearchResult();
  },
  searchCanceled: function () {
    this._networkLogView.searchCanceled();
  },
  appendApplicableItems: function (event, contextMenu, target) {
    function reveal(request) {
      WebInspector.inspectorView.setCurrentPanel(this);
      this.revealAndHighlightRequest(request);
    }

    function appendRevealItem(request) {
      contextMenu.appendItem(WebInspector.UIString.capitalize("Reveal in Network ^panel"), reveal.bind(this, request));
    }
    if (event.target.isSelfOrDescendant(this.element))
      return;
    if (target instanceof WebInspector.Resource) {
      var resource = (target);
      if (resource.request)
        appendRevealItem.call(this, resource.request);
      return;
    }
    if (target instanceof WebInspector.UISourceCode) {
      var uiSourceCode = (target);
      var resource = WebInspector.resourceForURL(WebInspector.networkMapping.networkURL(uiSourceCode));
      if (resource && resource.request)
        appendRevealItem.call(this, resource.request);
      return;
    }
    if (!(target instanceof WebInspector.NetworkRequest))
      return;
    var request = (target);
    if (this._networkItemView && this._networkItemView.isShowing() && this._networkItemView.request() === request)
      return;
    appendRevealItem.call(this, request);
  },
  _onFilmFrameSelected: function (event) {
    var timestamp = (event.data);
    this._overviewPane.requestWindowTimes(0, timestamp);
  },
  _onFilmFrameEnter: function (event) {
    var timestamp = (event.data);
    this._networkOverview.selectFilmStripFrame(timestamp);
    this._networkLogView.selectFilmStripFrame(timestamp / 1000);
  },
  _onFilmFrameExit: function (event) {
    this._networkOverview.clearFilmStripFrame();
    this._networkLogView.clearFilmStripFrame();
  },
  _onUpdateRequest: function (event) {
    var request = (event.data);
    this._calculator.updateBoundaries(request);
    this._overviewPane.setBounds(this._calculator.minimumBoundary() * 1000, this._calculator.maximumBoundary() * 1000);
    this._networkOverview.updateRequest(request);
    this._overviewPane.scheduleUpdate();
  },
  __proto__: WebInspector.Panel.prototype
}
WebInspector.NetworkPanel.ContextMenuProvider = function () {}
WebInspector.NetworkPanel.ContextMenuProvider.prototype = {
  appendApplicableItems: function (event, contextMenu, target) {
    WebInspector.NetworkPanel._instance().appendApplicableItems(event, contextMenu, target);
  }
}
WebInspector.NetworkPanel.RequestRevealer = function () {}
WebInspector.NetworkPanel.RequestRevealer.prototype = {
  reveal: function (request) {
    if (!(request instanceof WebInspector.NetworkRequest))
      return Promise.reject(new Error("Internal error: not a network request"));
    var panel = WebInspector.NetworkPanel._instance();
    WebInspector.inspectorView.setCurrentPanel(panel);
    panel.revealAndHighlightRequest(request);
    return Promise.resolve();
  }
}
WebInspector.NetworkPanel.show = function () {
  WebInspector.inspectorView.setCurrentPanel(WebInspector.NetworkPanel._instance());
}
WebInspector.NetworkPanel.revealAndFilter = function (filters) {
  var panel = WebInspector.NetworkPanel._instance();
  var filterString = "";
  for (var filter of filters)
    filterString += `${filter.filterType}:${filter.filterValue}`;
  panel._networkLogView.setTextFilterValue(filterString);
  WebInspector.inspectorView.setCurrentPanel(panel);
}
WebInspector.NetworkPanel._instance = function () {
  if (!WebInspector.NetworkPanel._instanceObject)
    WebInspector.NetworkPanel._instanceObject = new WebInspector.NetworkPanel();
  return WebInspector.NetworkPanel._instanceObject;
}
WebInspector.NetworkPanelFactory = function () {}
WebInspector.NetworkPanelFactory.prototype = {
  createPanel: function () {
    return WebInspector.NetworkPanel._instance();
  }
}
WebInspector.NetworkPanel.FilmStripRecorder = function (timeCalculator, filmStripView) {
  this._timeCalculator = timeCalculator;
  this._filmStripView = filmStripView;
}
WebInspector.NetworkPanel.FilmStripRecorder.prototype = {
  tracingStarted: function () {},
  traceEventsCollected: function (events) {
    if (this._tracingModel)
      this._tracingModel.addEvents(events);
  },
  tracingComplete: function () {
    if (!this._tracingModel)
      return;
    this._tracingModel.tracingComplete();
    var resourceTreeModel = this._target.resourceTreeModel;
    this._target = null;
    setImmediate(resourceTreeModel.resumeReload.bind(resourceTreeModel));
    this._callback(new WebInspector.FilmStripModel(this._tracingModel, this._timeCalculator.minimumBoundary() * 1000));
    delete this._callback;
  },
  tracingBufferUsage: function () {},
  eventsRetrievalProgress: function (progress) {},
  startRecording: function () {
    this._filmStripView.reset();
    this._filmStripView.setStatusText(WebInspector.UIString("Recording frames..."));
    if (this._target)
      return;
    this._target = WebInspector.targetManager.mainTarget();
    if (this._tracingModel)
      this._tracingModel.reset();
    else
      this._tracingModel = new WebInspector.TracingModel(new WebInspector.TempFileBackingStorage("tracing"));
    this._target.tracingManager.start(this, "-*,disabled-by-default-devtools.screenshot", "");
  },
  isRecording: function () {
    return !!this._target;
  },
  stopRecording: function (callback) {
    if (!this._target)
      return;
    this._target.tracingManager.stop();
    this._target.resourceTreeModel.suspendReload();
    this._callback = callback;
    this._filmStripView.setStatusText(WebInspector.UIString("Fetching frames..."));
  }
}
WebInspector.NetworkPanel.RecordActionDelegate = function () {}
WebInspector.NetworkPanel.RecordActionDelegate.prototype = {
  handleAction: function (context, actionId) {
    var panel = WebInspector.context.flavor(WebInspector.NetworkPanel);
    console.assert(panel && panel instanceof WebInspector.NetworkPanel);
    panel._toggleRecording();
    return true;
  }
};
WebInspector.XMLView = function (parsedXML) {
  WebInspector.Widget.call(this, true);
  this.registerRequiredCSS("network/xmlView.css");
  this.contentElement.classList.add("shadow-xml-view", "source-code");
  this._treeOutline = new TreeOutline();
  this.contentElement.appendChild(this._treeOutline.element);
  this._searchableView;
  this._currentSearchFocusIndex = 0;
  this._currentSearchTreeElements = [];
  this._searchConfig;
  WebInspector.XMLView.Node.populate(this._treeOutline, parsedXML, this);
}
WebInspector.XMLView.createSearchableView = function (parsedXML) {
  var xmlView = new WebInspector.XMLView(parsedXML);
  var searchableView = new WebInspector.SearchableView(xmlView);
  searchableView.setPlaceholder(WebInspector.UIString("Find"));
  xmlView._searchableView = searchableView;
  xmlView.show(searchableView.element);
  xmlView.contentElement.setAttribute("tabIndex", 0);
  return searchableView;
}
WebInspector.XMLView.parseXML = function (text, mimeType) {
  var parsedXML;
  try {
    parsedXML = (new DOMParser()).parseFromString(text, mimeType);
  } catch (e) {
    return null;
  }
  if (parsedXML.body)
    return null;
  return parsedXML;
}
WebInspector.XMLView.prototype = {
  _jumpToMatch: function (index, shouldJump) {
    if (!this._searchConfig)
      return;
    var regex = this._searchConfig.toSearchRegex(true);
    var previousFocusElement = this._currentSearchTreeElements[this._currentSearchFocusIndex];
    if (previousFocusElement)
      previousFocusElement.setSearchRegex(regex);
    var newFocusElement = this._currentSearchTreeElements[index];
    if (newFocusElement) {
      this._updateSearchIndex(index);
      if (shouldJump)
        newFocusElement.reveal(true);
      newFocusElement.setSearchRegex(regex, WebInspector.highlightedCurrentSearchResultClassName);
    } else {
      this._updateSearchIndex(0);
    }
  },
  _updateSearchCount: function (count) {
    if (!this._searchableView)
      return;
    this._searchableView.updateSearchMatchesCount(count);
  },
  _updateSearchIndex: function (index) {
    this._currentSearchFocusIndex = index;
    if (!this._searchableView)
      return;
    this._searchableView.updateCurrentMatchIndex(index);
  },
  _innerPerformSearch: function (shouldJump, jumpBackwards) {
    if (!this._searchConfig)
      return;
    var newIndex = this._currentSearchFocusIndex;
    var previousSearchFocusElement = this._currentSearchTreeElements[newIndex];
    this._innerSearchCanceled();
    this._currentSearchTreeElements = [];
    var regex = this._searchConfig.toSearchRegex(true);
    for (var element = this._treeOutline.rootElement(); element; element = element.traverseNextTreeElement(false)) {
      if (!(element instanceof WebInspector.XMLView.Node))
        continue;
      var hasMatch = element.setSearchRegex(regex);
      if (hasMatch)
        this._currentSearchTreeElements.push(element);
      if (previousSearchFocusElement === element) {
        var currentIndex = this._currentSearchTreeElements.length - 1;
        if (hasMatch || jumpBackwards)
          newIndex = currentIndex;
        else
          newIndex = currentIndex + 1;
      }
    }
    this._updateSearchCount(this._currentSearchTreeElements.length);
    if (!this._currentSearchTreeElements.length) {
      this._updateSearchIndex(0);
      return;
    }
    newIndex = mod(newIndex, this._currentSearchTreeElements.length);
    this._jumpToMatch(newIndex, shouldJump);
  },
  _innerSearchCanceled: function () {
    for (var element = this._treeOutline.rootElement(); element; element = element.traverseNextTreeElement(false)) {
      if (!(element instanceof WebInspector.XMLView.Node))
        continue;
      element.revertHighlightChanges();
    }
    this._updateSearchCount(0);
    this._updateSearchIndex(0);
  },
  searchCanceled: function () {
    this._searchConfig = null;
    this._currentSearchTreeElements = [];
    this._innerSearchCanceled();
  },
  performSearch: function (searchConfig, shouldJump, jumpBackwards) {
    this._searchConfig = searchConfig;
    this._innerPerformSearch(shouldJump, jumpBackwards);
  },
  jumpToNextSearchResult: function () {
    if (!this._currentSearchTreeElements.length)
      return;
    var newIndex = mod(this._currentSearchFocusIndex + 1, this._currentSearchTreeElements.length);
    this._jumpToMatch(newIndex, true);
  },
  jumpToPreviousSearchResult: function () {
    if (!this._currentSearchTreeElements.length)
      return;
    var newIndex = mod(this._currentSearchFocusIndex - 1, this._currentSearchTreeElements.length);
    this._jumpToMatch(newIndex, true);
  },
  supportsCaseSensitiveSearch: function () {
    return true;
  },
  supportsRegexSearch: function () {
    return true;
  },
  __proto__: WebInspector.Widget.prototype
}
WebInspector.XMLView.Node = function (node, closeTag, xmlView) {
  TreeElement.call(this, "", !closeTag && !!node.childElementCount);
  this._node = node;
  this._closeTag = closeTag;
  this.selectable = false;
  this._highlightChanges = [];
  this._xmlView = xmlView;
  this._updateTitle();
}
WebInspector.XMLView.Node.populate = function (root, xmlNode, xmlView) {
  var node = xmlNode.firstChild;
  while (node) {
    var currentNode = node;
    node = node.nextSibling;
    var nodeType = currentNode.nodeType;
    if (nodeType === 3 && currentNode.nodeValue.match(/\s+/))
      continue;
    if ((nodeType !== 1) && (nodeType !== 3) && (nodeType !== 4) && (nodeType !== 7) && (nodeType !== 8))
      continue;
    root.appendChild(new WebInspector.XMLView.Node(currentNode, false, xmlView));
  }
}
WebInspector.XMLView.Node.prototype = {
  setSearchRegex: function (regex, additionalCssClassName) {
    this.revertHighlightChanges();
    if (!regex)
      return false;
    if (this._closeTag && this.parent && !this.parent.expanded)
      return false;
    regex.lastIndex = 0;
    var cssClasses = WebInspector.highlightedSearchResultClassName;
    if (additionalCssClassName)
      cssClasses += " " + additionalCssClassName;
    var content = this.listItemElement.textContent.replace(/\xA0/g, " ");
    var match = regex.exec(content);
    var ranges = [];
    while (match) {
      ranges.push(new WebInspector.SourceRange(match.index, match[0].length));
      match = regex.exec(content);
    }
    if (ranges.length)
      WebInspector.highlightRangesWithStyleClass(this.listItemElement, ranges, cssClasses, this._highlightChanges);
    return !!this._highlightChanges.length;
  },
  revertHighlightChanges: function () {
    WebInspector.revertDomChanges(this._highlightChanges);
    this._highlightChanges = [];
  },
  _updateTitle: function () {
    var node = this._node;
    switch (node.nodeType) {
    case 1:
      var tag = node.tagName;
      if (this._closeTag) {
        this._setTitle(["</" + tag + ">", "shadow-xml-view-tag"]);
        return;
      }
      var titleItems = ["<" + tag, "shadow-xml-view-tag"];
      var attributes = node.attributes;
      for (var i = 0; i < attributes.length; ++i) {
        var attributeNode = attributes.item(i);
        titleItems.push(" ", "shadow-xml-view-tag", attributeNode.name, "shadow-xml-view-attribute-name", "=\"", "shadow-xml-view-tag", attributeNode.value, "shadow-xml-view-attribute-value", "\"", "shadow-xml-view-tag")
      }
      if (!this.expanded) {
        if (node.childElementCount) {
          titleItems.push(">", "shadow-xml-view-tag", "…", "shadow-xml-view-comment", "</" + tag, "shadow-xml-view-tag");
        } else if (this._node.textContent) {
          titleItems.push(">", "shadow-xml-view-tag", node.textContent, "shadow-xml-view-text", "</" + tag, "shadow-xml-view-tag");
        } else {
          titleItems.push(" /", "shadow-xml-view-tag");
        }
      }
      titleItems.push(">", "shadow-xml-view-tag");
      this._setTitle(titleItems);
      return;
    case 3:
      this._setTitle([node.nodeValue, "shadow-xml-view-text"]);
      return;
    case 4:
      this._setTitle(["<![CDATA[", "shadow-xml-view-cdata", node.nodeValue, "shadow-xml-view-text", "]]>", "shadow-xml-view-cdata"]);
      return;
    case 7:
      this._setTitle(["<?" + node.nodeName + " " + node.nodeValue + "?>", "shadow-xml-view-processing-instruction"]);
      return;
    case 8:
      this._setTitle(["<!--" + node.nodeValue + "-->", "shadow-xml-view-comment"]);
      return;
    }
  },
  _setTitle: function (items) {
    var titleFragment = createDocumentFragment();
    for (var i = 0; i < items.length; i += 2)
      titleFragment.createChild("span", items[i + 1]).textContent = items[i];
    this.title = titleFragment;
    this._xmlView._innerPerformSearch(false, false);
  },
  onattach: function () {
    this.listItemElement.classList.toggle("shadow-xml-view-close-tag", this._closeTag);
  },
  onexpand: function () {
    this._updateTitle();
  },
  oncollapse: function () {
    this._updateTitle();
  },
  onpopulate: function () {
    WebInspector.XMLView.Node.populate(this, this._node, this._xmlView);
    this.appendChild(new WebInspector.XMLView.Node(this._node, true, this._xmlView));
  },
  __proto__: TreeElement.prototype
};
Runtime.cachedResources["network/blockedURLsPane.css"] = "/*\n * Copyright (c) 2015 The Chromium Authors. All rights reserved.\n * Use of this source code is governed by a BSD-style license that can be\n * found in the LICENSE file.\n */\n\n.blocked-urls-pane {\n    overflow: hidden;\n}\n\n.toolbar {\n    border-bottom: 1px solid #dadada;\n}\n\n.no-blocked-urls, .blocked-urls-list {\n    font-size: 11px;\n    overflow-x: hidden;\n    overflow-y: auto;\n}\n\n.no-blocked-urls {\n    display: flex;\n    justify-content: center;\n    padding: 3px;\n}\n\n.no-blocked-urls > span {\n    white-space: pre;\n}\n\n.blocked-url {\n    flex: none;\n    display: flex;\n    align-items: center;\n    padding: 3px 10px 3px 9px;\n    position: relative;\n}\n\n.blocked-url:not(.blocked-url-editing):hover {\n    background-color: #dadada;\n}\n\n.blocked-url .blocked-count {\n    flex: 30px 0 0;\n    font-size: smaller !important;\n    padding-right: 5px;\n}\n\n.blocked-url > input {\n    position: absolute;\n    left: 6px;\n    right: 6px;\n    top: 0;\n    bottom: 0;\n    width: calc(100% - 12px);\n}\n\n.blocked-url-text {\n    white-space: nowrap;\n    text-overflow: ellipsis;\n    overflow: hidden;\n    flex: auto;\n    margin-right: 5px;\n}\n\n.blocked-url .remove-button {\n    width: 13px;\n    height: 13px;\n    background-image: url(Images/toolbarButtonGlyphs.png);\n    background-size: 352px 168px;\n    background-position: -175px -96px;\n    visibility: hidden;\n    flex: none;\n    opacity: 0.7;\n    cursor: default;\n}\n\n@media (-webkit-min-device-pixel-ratio: 1.5) {\n.blocked-url .remove-button {\n    background-image: url(Images/toolbarButtonGlyphs_2x.png);\n}\n} /* media */\n\n.blocked-url:hover .remove-button {\n    visibility: visible;\n}\n\n.blocked-url .remove-button:hover {\n    opacity: 1.0;\n}\n/*# sourceURL=network/blockedURLsPane.css */";
Runtime.cachedResources["network/eventSourceMessagesView.css"] = "/*\n * Copyright (c) 2014 The Chromium Authors. All rights reserved.\n * Use of this source code is governed by a BSD-style license that can be\n * found in the LICENSE file.\n */\n\n.event-source-messages-view .data-grid {\n    flex: auto;\n    border: none;\n}\n\n/*# sourceURL=network/eventSourceMessagesView.css */";
Runtime.cachedResources["network/networkConfigView.css"] = "/*\n * Copyright (c) 2015 The Chromium Authors. All rights reserved.\n * Use of this source code is governed by a BSD-style license that can be\n * found in the LICENSE file.\n */\n\n.network-config {\n    padding: 12px;\n    display: block;\n}\n\n.network-config-group {\n    display: flex;\n    margin-bottom: 10px;\n    flex-wrap: wrap;\n    flex: 0 0 auto;\n    min-height: 30px;\n}\n\n.network-config-title {\n    margin-right: 16px;\n    width: 130px;\n}\n\n.network-config-fields {\n    flex: 2 0 200px;\n}\n\n.panel-section-separator {\n    height: 1px;\n    margin-bottom: 10px;\n    background: #f0f0f0;\n}\n\n/* Disable cache */\n\n.network-config-disable-cache {\n    line-height: 28px;\n    border-top: none;\n    padding-top: 0;\n}\n\n/* Network throttling */\n\n.network-config-throttling .chrome-select {\n    width: 100%;\n    max-width: 250px;\n}\n\n.network-config-throttling > .network-config-title {\n    line-height: 24px;\n}\n\n/* User agent */\n\n.network-config-ua > .network-config-title {\n    line-height: 20px;\n}\n\n.network-config-ua label[is=\"dt-radio\"].checked > * {\n    display: none\n}\n\n.network-config-ua input:not(.dt-radio-button) {\n    display: block;\n    width: calc(100% - 20px);\n    max-width: 250px;\n    border: 1px solid #bfbfbf;\n    border-radius: 2px;\n    box-sizing: border-box;\n    color: #444;\n    font: inherit;\n    border-width: 1px;\n    min-height: 2em;\n    padding: 3px;\n}\n\n.network-config-ua input[readonly] {\n    background-color: rgb(235, 235, 228);\n}\n\n.network-config-ua input[type=text], .network-config-ua .chrome-select {\n    margin-top: 8px;\n}\n\n.network-config-ua input[type=\"text\"]:invalid {\n    outline: auto 2px red;\n    outline-offset: -2px;\n}\n\n.network-config-ua .chrome-select {\n    width: calc(100% - 20px);\n    max-width: 250px;\n}\n\n.network-config-ua label[is=\"dt-radio\"] {\n    display: block;\n}\n\n.network-config-ua-auto, .network-config-ua-custom {\n    opacity: 0.5;\n}\n\n.network-config-ua-auto.checked, .network-config-ua-custom.checked {\n    opacity: 1;\n}\n\n/*# sourceURL=network/networkConfigView.css */";
Runtime.cachedResources["network/networkLogView.css"] = "/*\n * Copyright (C) 2013 Google Inc. All rights reserved.\n *\n * Redistribution and use in source and binary forms, with or without\n * modification, are permitted provided that the following conditions are\n * met:\n *\n *     * Redistributions of source code must retain the above copyright\n * notice, this list of conditions and the following disclaimer.\n *     * Redistributions in binary form must reproduce the above\n * copyright notice, this list of conditions and the following disclaimer\n * in the documentation and/or other materials provided with the\n * distribution.\n *     * Neither the name of Google Inc. nor the names of its\n * contributors may be used to endorse or promote products derived from\n * this software without specific prior written permission.\n *\n * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS\n * \"AS IS\" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT\n * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR\n * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT\n * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,\n * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT\n * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,\n * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY\n * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT\n * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE\n * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.\n */\n\n.network-log-grid.data-grid {\n    border: none;\n    flex: auto;\n}\n\n.network-summary-bar {\n    flex: 0 0 27px;\n    line-height: 27px;\n    padding-left: 5px;\n    background-color: #eee;\n    border-top: 1px solid #ccc;\n    white-space: nowrap;\n    text-overflow: ellipsis;\n    overflow: hidden;\n}\n\n.network-summary-bar label[is=dt-icon-label] {\n    margin-right: 6px;\n}\n\n.network-summary-bar > * {\n    flex: none;\n}\n\n.network-log-grid.data-grid table.data {\n    background: transparent;\n}\n\n.network-log-grid .odd {\n    background: #f5f5f5;\n}\n\n.network-log-grid .network-navigation-row,\n.network-log-grid .network-navigation-row.odd {\n    background: #def;\n}\n\n.network-log-grid.data-grid td {\n    line-height: 17px;\n    height: 41px;\n    border-left: 1px solid #e1e1e1;\n    vertical-align: middle;\n}\n\n.network-log-grid.data-grid.small td {\n    height: 21px;\n}\n\n.network-log-grid.data-grid th {\n    border-bottom: 1px solid rgb(205, 205, 205);\n    border-left: 1px solid rgb(205, 205, 205);\n    background: white;\n}\n\n.network-log-grid.data-grid .header-container {\n    height: 31px;\n}\n\n.network-log-grid.data-grid .data-container {\n    top: 31px;\n}\n\n.network-log-grid.data-grid.small .header-container {\n    height: 27px;\n}\n\n.network-log-grid.data-grid.small .data-container {\n    top: 27px;\n}\n\n.network-log-grid.data-grid select {\n    -webkit-appearance: none;\n    background-color: transparent;\n    border: none;\n    width: 100%;\n    color: inherit;\n}\n\n.network-log-grid.data-grid .name-column {\n    cursor: pointer;\n}\n\n.network-log-grid.data-grid .timeline-column {\n    padding: 1px 0;\n}\n\n.network-log-grid.data-grid .timeline-column .sort-order-icon-container {\n    right: 15px;\n    pointer-events: none;\n}\n\n#network-container:not(.brief-mode) .network-log-grid.data-grid td.name-column:hover {\n    text-decoration: underline;\n}\n\n.network-log-grid.data-grid.small .network-graph-side {\n    height: 19px;\n}\n\n.network-log-grid.data-grid th.sortable:active {\n    background-image: none !important;\n}\n\n.network-cell-subtitle {\n    font-weight: normal;\n    color: gray;\n}\n\n.network-error-row,\n.network-error-row .network-cell-subtitle {\n    color: rgb(230, 0, 0);\n}\n\n.initiator-column a {\n    color: inherit;\n}\n\n.network-log-grid.data-grid tr.selected,\n.network-log-grid.data-grid tr.selected .network-cell-subtitle,\n.network-log-grid.data-grid tr.selected .network-dim-cell {\n    color: inherit !important;\n}\n\n.network-log-grid.data-grid:focus tr.selected,\n.network-log-grid.data-grid:focus tr.selected .network-cell-subtitle,\n.network-log-grid.data-grid:focus tr.selected .network-dim-cell {\n    color: white !important;\n}\n\n.network-log-grid tr.highlighted-row {\n    -webkit-animation: network-row-highlight-fadeout 2s 0s;\n}\n\n@-webkit-keyframes network-row-highlight-fadeout {\n    from {background-color: rgba(255, 255, 120, 1); }\n    to { background-color: rgba(255, 255, 120, 0); }\n}\n\n.network-header-subtitle {\n    color: gray;\n}\n\n.network-log-grid.data-grid.small .network-cell-subtitle,\n.network-log-grid.data-grid.small .network-header-subtitle {\n    display: none;\n}\n\n/* Resource preview icons */\n\n.network-log-grid.data-grid .icon {\n    content: url(Images/resourcePlainIcon.png);\n}\n\n.network-log-grid.data-grid.small .icon {\n    content: url(Images/resourcePlainIconSmall.png);\n}\n\n.network-log-grid.data-grid .icon.script {\n    content: url(Images/resourceJSIcon.png);\n}\n\n.network-log-grid.data-grid.small .icon.script {\n    content: url(Images/resourceDocumentIconSmall.png);\n}\n\n.network-log-grid.data-grid .icon.document {\n    content: url(Images/resourceDocumentIcon.png);\n}\n\n.network-log-grid.data-grid.small .icon.document {\n    content: url(Images/resourceDocumentIconSmall.png);\n}\n\n.network-log-grid.data-grid .icon.stylesheet {\n    content: url(Images/resourceCSSIcon.png);\n}\n\n.network-log-grid.data-grid.small .icon.stylesheet {\n    content: url(Images/resourceDocumentIconSmall.png);\n}\n\n.network-log-grid.data-grid .icon.media {\n    content: url(Images/resourcePlainIcon.png); /* FIXME: media icon */\n}\n\n.network-log-grid.data-grid.small .icon.media {\n    content: url(Images/resourcePlainIconSmall.png); /* FIXME: media icon */\n}\n.network-log-grid.data-grid .icon.texttrack {\n    content: url(Images/resourcePlainIcon.png); /* FIXME: vtt icon */\n}\n\n.network-log-grid.data-grid.small .icon.texttrack {\n    content: url(Images/resourcePlainIconSmall.png); /* FIXME: vtt icon */\n}\n\n.network-log-grid.data-grid .icon.image {\n    position: relative;\n    background-image: url(Images/resourcePlainIcon.png);\n    background-repeat: no-repeat;\n    content: \"\";\n}\n\n.network-log-grid.data-grid.small .icon.image {\n    background-image: url(Images/resourcePlainIconSmall.png);\n    content: \"\";\n}\n\n.network-log-grid.data-grid .icon {\n    float: left;\n    width: 32px;\n    height: 32px;\n    margin-top: 1px;\n    margin-right: 3px;\n}\n\n.network-log-grid.data-grid.small .icon {\n    width: 16px;\n    height: 16px;\n}\n\n.network-log-grid.data-grid .image-network-icon-preview {\n    position: absolute;\n    margin: auto;\n    top: 3px;\n    bottom: 4px;\n    left: 5px;\n    right: 5px;\n    max-width: 18px;\n    max-height: 21px;\n    min-width: 1px;\n    min-height: 1px;\n}\n\n.network-log-grid.data-grid.small .image-network-icon-preview {\n    top: 2px;\n    bottom: 1px;\n    left: 3px;\n    right: 3px;\n    max-width: 8px;\n    max-height: 11px;\n}\n\n/* Graph styles */\n\n.network-graph-side {\n    position: relative;\n    height: 39px;\n    padding: 0;\n    white-space: nowrap;\n    overflow: hidden;\n}\n\n.network-graph-bar-area {\n    position: absolute;\n    top: 0;\n    bottom: 0;\n}\n\n.network-graph-bar-area,\n.network-timeline-grid .resources-dividers,\n.network-timeline-grid .resources-event-dividers,\n.network-timeline-grid .resources-dividers-label-bar {\n    right: 12px;\n    left: 12px;\n}\n\n.network-timeline-grid .resources-event-dividers {\n    margin-left: 1px;\n}\n\n.network-graph-label {\n    position: absolute;\n    top: 0;\n    bottom: 0;\n    height: 13px;\n    line-height: 13px;\n    margin: auto;\n    font-size: 90%;\n    color: rgba(0, 0, 0, 0.75);\n    text-shadow: rgba(255, 255, 255, 0.25) 1px 0 0, rgba(255, 255, 255, 0.25) -1px 0 0, rgba(255, 255, 255, 0.333) 0 1px 0, rgba(255, 255, 255, 0.25) 0 -1px 0;\n    z-index: 150;\n    overflow: hidden;\n    text-align: center;\n    visibility: hidden;\n}\n\n.network-graph-side:hover .network-graph-label {\n    visibility: visible;\n}\n\n.network-graph-label:empty {\n    display: none;\n}\n\n.network-graph-label.waiting {\n    margin-right: 5px;\n}\n\n.network-graph-label.before {\n    color: rgba(0, 0, 0, 0.7);\n    text-shadow: none;\n    text-align: right;\n    margin-right: -1px;\n}\n\n.network-graph-label.before::after {\n    padding-left: 2px;\n    height: 6px;\n    content: url(Images/graphLabelCalloutLeft.png);\n}\n\n.network-graph-label.after {\n    color: rgba(0, 0, 0, 0.7);\n    text-shadow: none;\n    text-align: left;\n    margin-left: -1px;\n}\n\n.network-graph-label.after::before {\n    padding-right: 2px;\n    height: 6px;\n    content: url(Images/graphLabelCalloutRight.png);\n}\n\n.small .network-graph-bar {\n    top: 3px;\n    bottom: 3px;\n}\n\n.network-graph-bar {\n    position: absolute;\n    top: 13px;\n    bottom: 13px;\n    min-width: 3px;\n}\n\n.network-graph-bar:not(.request-timing) {\n    border-width: 1px;\n    border-style: solid;\n    border-color: hsl(0, 0%, 75%);\n    background: linear-gradient(0deg, hsl(0, 0%, 85%), hsl(0, 0%, 95%));\n}\n\n.network-graph-bar.waiting:not(.request-timing) {\n    opacity: 0.5;\n}\n\n/* Resource categories */\n\n.network-graph-bar.request-timing.queueing,\n.network-graph-bar.request-timing.total,\n.network-graph-bar.request-timing.proxy,\n.network-graph-bar.request-timing.dns,\n.network-graph-bar.request-timing.ssl,\n.network-graph-bar.request-timing.connecting,\n.network-graph-bar.request-timing.blocking,\n.network-graph-bar.request-timing.push {\n    margin: 3px 0;\n}\n\n.network-graph-bar.request-timing.queueing,\n.network-graph-bar.request-timing.total, -theme-preserve {\n    border: solid 1px #AAAAAA;\n}\n\n.network-graph-bar.request-timing.receiving, -theme-preserve,\n.network-graph-bar.request-timing.receiving-push, -theme-preserve {\n    background-color: #03A9F4;\n}\n\n.network-graph-bar.request-timing.waiting, -theme-preserve {\n    background-color: #00C853;\n}\n\n.network-graph-bar.request-timing.connecting, -theme-preserve {\n    background-color: #FF9800;\n}\n\n.network-graph-bar.request-timing.ssl, -theme-preserve {\n    background-color: #9C27B0;\n}\n\n.network-graph-bar.request-timing.dns, -theme-preserve {\n    background-color: #009688;\n}\n\n.network-graph-bar.request-timing.proxy, -theme-preserve {\n    background-color: #A1887F;\n}\n\n.network-graph-bar.request-timing.blocking, -theme-preserve {\n    background-color: #AAAAAA;\n}\n\n.network-graph-bar.request-timing.push, -theme-preserve {\n    background-color: #8CDBff;\n}\n\n.network-graph-bar.cached {\n    background: hsl(0, 0%, 90%);\n}\n\n.network-graph-bar.document {\n    border-color: hsl(215, 49%, 60%);\n    background: linear-gradient(0deg, hsl(215, 72%, 65%), hsl(215, 100%, 80%));\n}\n\n.network-graph-bar.cached.document {\n    background: hsl(215, 99%, 80%);\n}\n\n.network-graph-bar.stylesheet {\n    border-color: hsl(99, 34%, 60%);\n    background: linear-gradient(0deg, hsl(100, 50%, 65%), hsl(90, 50%, 80%));\n}\n\n.network-graph-bar.cached.stylesheet {\n    background: hsl(99, 100%, 80%);\n}\n\n.network-graph-bar.image {\n    border-color: hsl(272, 31%, 60%);\n    background: linear-gradient(0deg, hsl(272, 46%, 65%), hsl(272, 64%, 80%));\n}\n\n.network-graph-bar.cached.image {\n    background: hsl(272, 65%, 80%);\n}\n\n.network-graph-bar.media {\n    border-color: hsl(272, 31%, 60%);\n    background: linear-gradient(0deg, hsl(272, 46%, 65%), hsl(272, 64%, 80%));\n}\n\n.network-graph-bar.cached.media {\n    background: hsl(272, 65%, 80%);\n}\n\n.network-graph-bar.font {\n    border-color: hsl(8, 49%, 60%);\n    background: linear-gradient(0deg, hsl(8, 72%, 65%), hsl(8, 100%, 80%));\n}\n\n.network-graph-bar.cached.font {\n    background: hsl(8, 100%, 80%);\n}\n\n.network-graph-bar.texttrack {\n    border-color: hsl(8, 49%, 60%);\n    background: linear-gradient(0deg, hsl(8, 72%, 65%), hsl(8, 100%, 80%));\n}\n\n.network-graph-bar.cached.texttrack {\n    background: hsl(8, 100%, 80%);\n}\n\n.network-graph-bar.script {\n    border-color: hsl(31, 49%, 60%);\n    background: linear-gradient(0deg, hsl(31, 72%, 65%), hsl(31, 100%, 80%));\n}\n\n.network-graph-bar.cached.script {\n    background: hsl(31, 100%, 80%);\n}\n\n.network-graph-bar.xhr {\n    border-color: hsl(53, 49%, 60%);\n    background: linear-gradient(0deg, hsl(53, 72%, 65%), hsl(53, 100%, 80%));\n}\n\n.network-graph-bar.cached.xhr {\n    background: hsl(53, 100%, 80%);\n}\n\n.network-graph-bar.websocket {\n    border-color: hsl(0, 0%, 60%);\n    background: linear-gradient(0deg, hsl(0, 0%, 65%), hsl(0, 0%, 80%));\n}\n\n.network-graph-bar.cached.websocket {\n    background: hsl(0, 0%, 80%);\n}\n\n.network-dim-cell {\n    color: grey;\n}\n\n/* Dividers */\n\n.network-timeline-grid {\n    position: absolute;\n    top: 0;\n    bottom: 0;\n    left: 0;\n    right: 14px; /* Keep in sync with td.corner width */\n    pointer-events: none;\n}\n\n.network-event-divider {\n    position: absolute;\n    width: 1px;\n    margin-left: -1px;\n    top: 31px;\n    bottom: 0;\n    z-index: 300;\n}\n\n.network-event-divider.invisible {\n    visibility: hidden;\n}\n\n.network-timeline-grid.small .network-event-divider {\n    top: 23px;\n}\n\n.network-red-divider {\n    background-color: rgba(255, 0, 0, 0.5);\n}\n\n.-theme-with-dark-background .network-red-divider {\n    background-color: hsla(0, 100%, 80%, 0.7);\n}\n\n.network-summary-bar .summary-red {\n    color: red;\n}\n\n.-theme-with-dark-background .network-blue-divider {\n    background-color: hsla(240, 100%, 80%, 0.7);\n}\n\n.network-frame-divider {\n    width: 2px;\n    background-color: #FCCC49;\n    z-index: 10;\n    visibility: hidden;\n}\n\n.network-frame-divider-selected {\n    visibility: visible;\n}\n\n.network-summary-bar .summary-blue {\n    color: blue;\n}\n\n.network-log-grid.data-grid .resources-dividers {\n    z-index: 0;\n}\n\n.network-log-grid.data-grid .resources-dividers-label-bar {\n    background-color: transparent;\n    border: none;\n    height: 30px;\n    pointer-events: none;\n}\n\n.network-timeline-grid.small .resources-dividers-label-bar {\n    height: 23px;\n}\n\n.network-timeline-grid .resources-divider-label {\n    top: 0;\n    margin-top: -5px;\n}\n\n.network-timeline-grid .resources-dividers-label-bar .resources-divider {\n    top: 23px;\n}\n\n.network-timeline-grid.small .resources-dividers-label-bar .resources-divider {\n    top: 15px;\n}\n\n.network-timeline-grid .resources-divider:first-child .resources-divider-label {\n    display: none;\n}\n\n.network-timeline-grid .resources-dividers-label-bar .resources-divider:first-child {\n    background-color: transparent;\n}\n\n#network-container {\n    overflow: hidden;\n}\n\n/* Brief mode peculiarities. */\n#network-container.brief-mode .network-timeline-grid {\n    display: none;\n}\n\n.network-log-grid.data-grid .data-container tr:not(.data-grid-filler-row):not(.selected):hover {\n    background-color: rgba(56, 121, 217, 0.1);\n}\n\n.network-log-grid .network-node-on-initiator-path {\n    background-color: hsla(120, 68%, 54%, 0.2) !important;\n}\n\n.network-log-grid .network-node-on-initiated-path {\n    background-color: hsla(0, 68%, 54%, 0.2) !important;\n}\n\n.network-status-pane {\n    color: #777;\n    background-color: white;\n    z-index: 500;\n    display: flex;\n    justify-content: center;\n    align-items: center;\n    text-align: center;\n    padding: 0 20px;\n    overflow: auto;\n}\n\n.network-status-pane > .recording-hint {\n    font-size: 14px;\n    text-align: center;\n    line-height: 28px;\n}\n\n/*# sourceURL=network/networkLogView.css */";
Runtime.cachedResources["network/networkPanel.css"] = "/*\n * Copyright (C) 2006, 2007, 2008 Apple Inc.  All rights reserved.\n * Copyright (C) 2009 Anthony Ricaud <rik@webkit.org>\n *\n * Redistribution and use in source and binary forms, with or without\n * modification, are permitted provided that the following conditions\n * are met:\n *\n * 1.  Redistributions of source code must retain the above copyright\n *     notice, this list of conditions and the following disclaimer.\n * 2.  Redistributions in binary form must reproduce the above copyright\n *     notice, this list of conditions and the following disclaimer in the\n *     documentation and/or other materials provided with the distribution.\n * 3.  Neither the name of Apple Computer, Inc. (\"Apple\") nor the names of\n *     its contributors may be used to endorse or promote products derived\n *     from this software without specific prior written permission.\n *\n * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS \"AS IS\" AND ANY\n * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED\n * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE\n * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY\n * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES\n * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;\n * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND\n * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT\n * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF\n * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.\n */\n\n.panel.network > .toolbar {\n    position: relative;\n    border-bottom: 1px solid #dadada;\n}\n\n.network-details-view {\n    background: rgb(203, 203, 203);\n}\n\n.network-close-button {\n    margin: auto -1px auto 4px;\n}\n\n.network-details-view-tall-header {\n    margin-top: 4px;\n}\n\n.network-item-view {\n    display: flex;\n    background: white;\n}\n\n.network-item-preview-toolbar {\n    border-top: 1px solid #ccc;\n    background-color: #eee;\n}\n\n.resource-timing-view {\n    display: block;\n    margin: 6px;\n    color: rgb(30%, 30%, 30%);\n}\n\n/* Network timing is shared between popover and network item view pane */\n\n.network-timing-table {\n    width: 380px;\n    border-spacing: 0;\n    padding-left: 10px;\n    padding-right: 10px;\n}\n\n.network-timing-table-header td {\n    color: #bbb;\n    border-top: 5px solid transparent;\n    border-bottom: 5px solid transparent;\n}\n\n.network-timing-table-header td:last-child {\n    text-align: right;\n}\n\n.network-timing-table col.labels {\n    width: 120px;\n}\n\n.network-timing-table col.duration {\n    width: 80px;\n}\n\n.network-timing-table td {\n    padding: 2px 0;\n}\n\n.network-timing-table td.caution {\n    font-weight: bold;\n    color: rgb(255, 128, 0);\n    padding: 2px 0;\n}\n\n.network-timing-footer td {\n    border-top: 8px solid transparent;\n}\n\n.network-timing-footer td:last-child {\n    font-weight: bold;\n    text-align: right;\n}\n\n.network-timing-row {\n    position: relative;\n    height: 15px;\n}\n\n.network-timing-bar {\n    position: absolute;\n    min-width: 1px;\n    top: 0;\n    bottom: 0;\n}\n\n.network-timing-bar-title {\n    color: #222;\n    white-space: nowrap;\n    text-align: right;\n}\n\n.network-timing-bar.queueing,\n.network-timing-bar.total {\n    border: 1px solid rgba(0, 0, 0, 0.1);\n}\n\n.network-timing-bar.blocking, -theme-preserve {\n    background-color: #AAAAAA;\n}\n\n.network-timing-bar.proxy, -theme-preserve {\n    background-color: #A1887F;\n}\n\n.network-timing-bar.dns, -theme-preserve {\n    background-color: #009688;\n}\n\n.network-timing-bar.connecting,\n.network-timing-bar.serviceworker,\n.network-timing-bar.serviceworker-preparation, -theme-preserve {\n    background-color: #FF9800;\n}\n\n.network-timing-bar.ssl, -theme-preserve {\n    background-color: #9C27B0;\n}\n\n.network-timing-bar.sending, -theme-preserve {\n    background-color: #B0BEC5;\n}\n\n.network-timing-bar.waiting, -theme-preserve {\n    background-color: #00C853;\n}\n\n.network-timing-bar.receiving, -theme-preserve,\n.network-timing-bar.receiving-push, -theme-preserve {\n    background-color: #03A9F4;\n}\n\n.network-timing-bar.push, -theme-preserve {\n    background-color: #8CDBff;\n}\n\n.network-timing-bar.proxy,\n.network-timing-bar.dns,\n.network-timing-bar.ssl,\n.network-timing-bar.connecting,\n.network-timing-bar.blocking {\n    height: 10px;\n    margin: auto;\n}\n\n.resource-timing-view .network-timing-table {\n    width: 100%;\n}\n\n#network-overview-panel {\n    flex: none;\n    position: relative;\n}\n\n#network-overview-container {\n    overflow: hidden;\n    flex: auto;\n    display: flex;\n    flex-direction: column;\n    position: relative;\n    border-bottom: 1px solid #CDCDCD;\n}\n\n#network-overview-container canvas {\n    width: 100%;\n    height: 100%;\n}\n\n#network-overview-grid .resources-dividers-label-bar {\n    pointer-events: auto;\n}\n\n.network .network-overview {\n    flex: 0 0 60px;\n}\n\n.network-overview .overview-grid-window,\n.network-overview .overview-grid-dividers-background {\n    height: 100%;\n}\n\n.network-overview .resources-dividers-label-bar {\n    background-color: rgba(255, 255, 255, 0.95);\n}\n\n.network-overview .resources-dividers-label-bar .resources-divider {\n    background-color: transparent;\n}\n\n.network-overview .resources-dividers {\n    z-index: 250;\n}\n\n.json-view {\n    padding: 2px 6px;\n    overflow: auto;\n}\n\n.request-view.html iframe {\n    width: 100%;\n    height: 100%;\n    position: absolute;\n}\n\n.network-film-strip {\n    border-bottom: solid 1px #cdcdcd;\n    flex: none !important;\n}\n\n.network-blocked-urls {\n    border-top: 1px solid #dadada;\n    flex: 104px 0 0;\n}\n\n/*# sourceURL=network/networkPanel.css */";
Runtime.cachedResources["network/requestCookiesView.css"] = "/*\n * Copyright (c) 2014 The Chromium Authors. All rights reserved.\n * Use of this source code is governed by a BSD-style license that can be\n * found in the LICENSE file.\n */\n\n.request-cookies-view {\n    display: flex;\n    overflow: auto;\n    margin: 12px;\n    height: 100%;\n}\n\n.request-cookies-view .data-grid {\n    flex: auto;\n    height: 100%;\n}\n\n.request-cookies-view .data-grid .row-group {\n    font-weight: bold;\n    font-size: 11px;\n}\n\n/*# sourceURL=network/requestCookiesView.css */";
Runtime.cachedResources["network/requestHeadersView.css"] = "/*\n * Copyright (c) 2014 The Chromium Authors. All rights reserved.\n * Use of this source code is governed by a BSD-style license that can be\n * found in the LICENSE file.\n */\n\n.request-headers-view {\n    -webkit-user-select: text;\n    overflow: auto;\n}\n\n.request-headers-view .outline-disclosure {\n    -webkit-padding-start: 4px;\n    flex-grow: 1;\n    overflow-y: auto;\n}\n\n.request-headers-view .outline-disclosure > ol {\n    padding-bottom: 5px;\n}\n\n.request-headers-view .outline-disclosure > .parent {\n    -webkit-user-select: none;\n    font-weight: bold;\n    color: #616161;\n    margin-top: -1px;\n    height: 20px;\n    border-top: solid 1px #e0e0e0;\n    display: flex;\n    align-items: center;\n}\n\n.request-headers-view .outline-disclosure li.parent::before {\n    position: static;\n    width: 13px;\n    height: 9px;\n    -webkit-mask-position: -4px -98px;\n    background-image: none;\n    opacity: 1;\n}\n\n.request-headers-view .outline-disclosure li.parent.expanded::before {\n    -webkit-mask-position: -20px -98px;\n}\n\n.request-headers-view .properties-tree li.parent {\n    margin-left: 10px;\n}\n\n.request-headers-view .outline-disclosure .children li {\n    white-space: nowrap;\n    margin-left: 10px;\n}\n\n.request-headers-view .outline-disclosure .children li::before {\n    display: none;\n}\n\n.request-headers-view .outline-disclosure .caution {\n    margin-left: 4px;\n    display: inline-block;\n    font-weight: bold;\n}\n\n.request-headers-view .outline-disclosure li.expanded .header-count {\n    display: none;\n}\n\n.request-headers-view .outline-disclosure li .header-toggle {\n    display: none;\n}\n\n.request-headers-view .outline-disclosure li .status-from-cache {\n    color: gray;\n}\n\n.request-headers-view .outline-disclosure li.expanded .header-toggle {\n    display: inline;\n    margin-left: 30px;\n    font-weight: normal;\n    color: rgb(45%, 45%, 45%);\n}\n\n.request-headers-view .outline-disclosure li .header-toggle:hover {\n    color: rgb(20%, 20%, 45%);\n    cursor: pointer;\n}\n\n.request-headers-view .outline-disclosure .header-name {\n    color: rgb(33%, 33%, 33%);\n    display: inline-block;\n    margin-right: 0.5em;\n    font-weight: bold;\n    vertical-align: top;\n    white-space: pre-wrap;\n}\n\n.request-headers-view .outline-disclosure .header-value {\n    display: inline;\n    margin-right: 1em;\n    white-space: pre-wrap;\n    word-break: break-all;\n    margin-top: 1px;\n}\n\n.request-headers-view .outline-disclosure .empty-request-header {\n    color: rgba(33%, 33%, 33%, 0.5);\n}\n\n.resource-status-image {\n    margin-top: -2px;\n    margin-right: 3px;\n}\n\n.request-headers-view .filter-input {\n    outline: none !important;\n    border: none;\n    border-bottom: solid 1px #ccc;\n    flex: 0 0 19px;\n    padding: 0 4px;\n}\n\n/*# sourceURL=network/requestHeadersView.css */";
Runtime.cachedResources["network/webSocketFrameView.css"] = "/*\n * Copyright (c) 2014 The Chromium Authors. All rights reserved.\n * Use of this source code is governed by a BSD-style license that can be\n * found in the LICENSE file.\n */\n\n.websocket-frame-view {\n    -webkit-user-select: text;\n}\n\n.websocket-frame-view .data-grid {\n    flex: auto;\n    border: none;\n}\n\n.websocket-frame-view .data-grid .data {\n    background-image: none;\n}\n\n.websocket-frame-view-td {\n    border-bottom: 1px solid #ccc;\n}\n\n.websocket-frame-view .data-grid tr.selected {\n    background-color: #def;\n}\n\n.websocket-frame-view .data-grid td,\n.websocket-frame-view .data-grid th {\n    border-left-color: #ccc;\n}\n\n.websocket-frame-view-row-outcoming {\n    background-color: rgb(226, 247, 218);\n}\n\n.websocket-frame-view-row-opcode {\n    background-color: rgb(255, 255, 232);\n    color: rgb(170, 111, 71);\n}\n\n.websocket-frame-view-row-error {\n    background-color: rgb(255, 237, 237);\n    color: rgb(182, 0, 0);\n}\n\n/*# sourceURL=network/webSocketFrameView.css */";
Runtime.cachedResources["network/xmlView.css"] = "/*\n * Copyright (c) 2014 The Chromium Authors. All rights reserved.\n * Use of this source code is governed by a BSD-style license that can be\n * found in the LICENSE file.\n */\n\n.shadow-xml-view {\n    -webkit-user-select: text;\n    overflow: auto;\n    padding: 2px 4px;\n}\n\n.shadow-xml-view ol {\n    list-style: none;\n    padding: 0;\n    margin: 0;\n    -webkit-padding-start: 16px;/* step width + arrow width */\n}\n\n.shadow-xml-view > ol {\n    -webkit-padding-start: 0;\n}\n\n.shadow-xml-view ol.children:not(.expanded) {\n    display: none;\n}\n\n.shadow-xml-view li.parent::before {\n    -webkit-user-select: none;\n    -webkit-mask-image: url(Images/toolbarButtonGlyphs.png);\n    -webkit-mask-size: 352px 168px;\n    -webkit-mask-position: -4px -97px;\n    background-color: rgb(110, 110, 110);\n    content: \" \";\n    width: 10px;/* arrow width */\n    height: 10px;\n    display: inline-block;\n    position: relative;\n    top: 2px;\n}\n\n.shadow-xml-view li.parent.expanded::before {\n  -webkit-mask-position: -20px -97px;\n}\n\n@media (-webkit-min-device-pixel-ratio: 1.5) {\n.shadow-xml-view li.parent::before {\n    -webkit-mask-image: url(Images/toolbarButtonGlyphs_2x.png);\n}\n} /* media */\n\n.shadow-xml-view li:not(.parent) {\n    margin-left: 10px; /* arrow width */\n}\n\n.shadow-xml-view li.shadow-xml-view-close-tag {\n    margin-left: -6px; /* step width */\n}\n\n.shadow-xml-view-tag {\n    color: rgb(136, 18, 128);\n}\n\n.shadow-xml-view-comment {\n    color: rgb(35, 110, 37);\n}\n\n.shadow-xml-view-processing-instruction {\n    color: rgb(35, 110, 37);\n}\n\n.shadow-xml-view-attribute-name {\n    color: rgb(153, 69, 0);\n}\n\n.shadow-xml-view-attribute-value {\n    color: rgb(26, 26, 166);\n}\n\n.shadow-xml-view-text {\n    color: rgb(0, 0, 0);\n    white-space: pre;\n}\n\n.shadow-xml-view-cdata {\n    color: rgb(0, 0, 0);\n}\n\n/*# sourceURL=network/xmlView.css */";