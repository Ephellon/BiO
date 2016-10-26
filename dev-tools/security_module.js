WebInspector.SecurityModel = function (target) {
  WebInspector.SDKModel.call(this, WebInspector.SecurityModel, target);
  this._dispatcher = new WebInspector.SecurityDispatcher(this);
  this._securityAgent = target.securityAgent();
  target.registerSecurityDispatcher(this._dispatcher);
  this._securityAgent.enable();
}
WebInspector.SecurityModel.EventTypes = {
  SecurityStateChanged: "SecurityStateChanged"
}
WebInspector.SecurityModel.prototype = {
  __proto__: WebInspector.SDKModel.prototype
}
WebInspector.SecurityModel.fromTarget = function (target) {
  var model = (target.model(WebInspector.SecurityModel));
  if (!model)
    model = new WebInspector.SecurityModel(target);
  return model;
}
WebInspector.SecurityModel.SecurityStateComparator = function (a, b) {
  var securityStateMap;
  if (WebInspector.SecurityModel._symbolicToNumericSecurityState) {
    securityStateMap = WebInspector.SecurityModel._symbolicToNumericSecurityState;
  } else {
    securityStateMap = new Map();
    var ordering = [SecurityAgent.SecurityState.Info, SecurityAgent.SecurityState.Insecure, SecurityAgent.SecurityState.Neutral, SecurityAgent.SecurityState.Warning, SecurityAgent.SecurityState.Secure, SecurityAgent.SecurityState.Unknown];
    for (var i = 0; i < ordering.length; i++)
      securityStateMap.set(ordering[i], i + 1);
    WebInspector.SecurityModel._symbolicToNumericSecurityState = securityStateMap;
  }
  var aScore = securityStateMap.get(a) || 0;
  var bScore = securityStateMap.get(b) || 0;
  return aScore - bScore;
}
WebInspector.PageSecurityState = function (securityState, explanations, mixedContentStatus, schemeIsCryptographic) {
  this.securityState = securityState;
  this.explanations = explanations;
  this.mixedContentStatus = mixedContentStatus;
  this.schemeIsCryptographic = schemeIsCryptographic;
}
WebInspector.SecurityDispatcher = function (model) {
  this._model = model;
}
WebInspector.SecurityDispatcher.prototype = {
  securityStateChanged: function (securityState, explanations, mixedContentStatus, schemeIsCryptographic) {
    var pageSecurityState = new WebInspector.PageSecurityState(securityState, explanations || [], mixedContentStatus || null, schemeIsCryptographic || false);
    this._model.dispatchEventToListeners(WebInspector.SecurityModel.EventTypes.SecurityStateChanged, pageSecurityState);
  }
};
WebInspector.SecurityPanel = function () {
  WebInspector.PanelWithSidebar.call(this, "security");
  this._mainView = new WebInspector.SecurityMainView(this);
  this._sidebarMainViewElement = new WebInspector.SecurityPanelSidebarTreeElement(WebInspector.UIString("Overview"), this._setVisibleView.bind(this, this._mainView), "security-main-view-sidebar-tree-item", "lock-icon");
  this._sidebarTree = new WebInspector.SecurityPanelSidebarTree(this._sidebarMainViewElement, this.showOrigin.bind(this));
  this.panelSidebarElement().appendChild(this._sidebarTree.element);
  this.setDefaultFocusedElement(this._sidebarTree.contentElement);
  this._lastResponseReceivedForLoaderId = new Map();
  this._origins = new Map();
  this._filterRequestCounts = new Map();
  WebInspector.targetManager.observeTargets(this, WebInspector.Target.Type.Page);
}
WebInspector.SecurityPanel.Origin;
WebInspector.SecurityPanel.OriginState;
WebInspector.SecurityPanel.prototype = {
  setRanInsecureContentStyle: function (securityState) {
    this._ranInsecureContentStyle = securityState;
  },
  setDisplayedInsecureContentStyle: function (securityState) {
    this._displayedInsecureContentStyle = securityState;
  },
  _updateSecurityState: function (newSecurityState, explanations, mixedContentStatus, schemeIsCryptographic) {
    this._sidebarMainViewElement.setSecurityState(newSecurityState);
    this._mainView.updateSecurityState(newSecurityState, explanations, mixedContentStatus, schemeIsCryptographic);
  },
  _onSecurityStateChanged: function (event) {
    var data = (event.data);
    var securityState = (data.securityState);
    var explanations = (data.explanations);
    var mixedContentStatus = (data.mixedContentStatus);
    var schemeIsCryptographic = (data.schemeIsCryptographic);
    this._updateSecurityState(securityState, explanations, mixedContentStatus, schemeIsCryptographic);
  },
  selectAndSwitchToMainView: function () {
    this._sidebarMainViewElement.select();
  },
  showOrigin: function (origin) {
    var originState = this._origins.get(origin);
    if (!originState.originView)
      originState.originView = new WebInspector.SecurityOriginView(this, origin, originState);
    this._setVisibleView(originState.originView);
  },
  wasShown: function () {
    WebInspector.Panel.prototype.wasShown.call(this);
    if (!this._visibleView)
      this.selectAndSwitchToMainView();
  },
  _setVisibleView: function (view) {
    if (this._visibleView === view)
      return;
    if (this._visibleView)
      this._visibleView.detach();
    this._visibleView = view;
    if (view)
      this.splitWidget().setMainWidget(view);
  },
  _onResponseReceived: function (event) {
    var request = (event.data);
    if (request.resourceType() === WebInspector.resourceTypes.Document)
      this._lastResponseReceivedForLoaderId.set(request.loaderId, request);
  },
  _processRequest: function (request) {
    var origin = WebInspector.ParsedURL.extractOrigin(request.url);
    if (!origin) {
      return;
    }
    var securityState = (request.securityState());
    if (request.mixedContentType === NetworkAgent.RequestMixedContentType.Blockable && this._ranInsecureContentStyle)
      securityState = this._ranInsecureContentStyle;
    else if (request.mixedContentType === NetworkAgent.RequestMixedContentType.OptionallyBlockable && this._displayedInsecureContentStyle)
      securityState = this._displayedInsecureContentStyle;
    if (this._origins.has(origin)) {
      var originState = this._origins.get(origin);
      var oldSecurityState = originState.securityState;
      originState.securityState = this._securityStateMin(oldSecurityState, securityState);
      if (oldSecurityState !== originState.securityState) {
        this._sidebarTree.updateOrigin(origin, securityState);
        if (originState.originView)
          originState.originView.setSecurityState(securityState);
      }
    } else {
      var originState = {};
      originState.securityState = securityState;
      var securityDetails = request.securityDetails();
      if (securityDetails) {
        originState.securityDetails = securityDetails;
        originState.certificateDetailsPromise = request.target().networkManager.certificateDetailsPromise(securityDetails.certificateId);
      }
      this._origins.set(origin, originState);
      this._sidebarTree.addOrigin(origin, securityState);
    }
  },
  _onRequestFinished: function (event) {
    var request = (event.data);
    this._updateFilterRequestCounts(request);
    this._processRequest(request);
  },
  _updateFilterRequestCounts: function (request) {
    if (request.mixedContentType === NetworkAgent.RequestMixedContentType.None)
      return;
    var filterKey = WebInspector.NetworkLogView.MixedContentFilterValues.All;
    if (request.wasBlocked())
      filterKey = WebInspector.NetworkLogView.MixedContentFilterValues.Blocked;
    else if (request.mixedContentType === NetworkAgent.RequestMixedContentType.Blockable)
      filterKey = WebInspector.NetworkLogView.MixedContentFilterValues.BlockOverridden;
    else if (request.mixedContentType === NetworkAgent.RequestMixedContentType.OptionallyBlockable)
      filterKey = WebInspector.NetworkLogView.MixedContentFilterValues.Displayed;
    if (!this._filterRequestCounts.has(filterKey))
      this._filterRequestCounts.set(filterKey, 1);
    else
      this._filterRequestCounts.set(filterKey, this._filterRequestCounts.get(filterKey) + 1);
    this._mainView.refreshExplanations();
  },
  filterRequestCount: function (filterKey) {
    return this._filterRequestCounts.get(filterKey) || 0;
  },
  _securityStateMin: function (stateA, stateB) {
    return WebInspector.SecurityModel.SecurityStateComparator(stateA, stateB) < 0 ? stateA : stateB;
  },
  targetAdded: function (target) {
    if (this._target)
      return;
    this._target = target;
    target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.MainFrameNavigated, this._onMainFrameNavigated, this);
    target.networkManager.addEventListener(WebInspector.NetworkManager.EventTypes.ResponseReceived, this._onResponseReceived, this);
    target.networkManager.addEventListener(WebInspector.NetworkManager.EventTypes.RequestFinished, this._onRequestFinished, this);
    var securityModel = WebInspector.SecurityModel.fromTarget(target);
    securityModel.addEventListener(WebInspector.SecurityModel.EventTypes.SecurityStateChanged, this._onSecurityStateChanged, this);
  },
  targetRemoved: function (target) {},
  _clearOrigins: function () {
    this.selectAndSwitchToMainView();
    this._sidebarTree.clearOrigins();
    this._origins.clear();
    this._lastResponseReceivedForLoaderId.clear();
    this._filterRequestCounts.clear();
  },
  _onMainFrameNavigated: function (event) {
    var frame = (event.data);
    var request = this._lastResponseReceivedForLoaderId.get(frame.loaderId);
    this._clearOrigins();
    if (request) {
      var origin = WebInspector.ParsedURL.extractOrigin(request.url);
      this._sidebarTree.setMainOrigin(origin);
      this._processRequest(request);
    }
  },
  __proto__: WebInspector.PanelWithSidebar.prototype
}
WebInspector.SecurityPanel._instance = function () {
  if (!WebInspector.SecurityPanel._instanceObject)
    WebInspector.SecurityPanel._instanceObject = new WebInspector.SecurityPanel();
  return WebInspector.SecurityPanel._instanceObject;
}
WebInspector.SecurityPanel.createCertificateViewerButton = function (text, certificateId) {
  function showCertificateViewer(e) {
    e.consume();
    WebInspector.multitargetNetworkManager.showCertificateViewer((certificateId));
  }
  return createTextButton(text, showCertificateViewer, "security-certificate-button");
}
WebInspector.SecurityPanelSidebarTree = function (mainViewElement, showOriginInPanel) {
  this._showOriginInPanel = showOriginInPanel;
  this._mainOrigin = null;
  TreeOutlineInShadow.call(this);
  this.element.classList.add("sidebar-tree");
  this.registerRequiredCSS("security/sidebar.css");
  this.registerRequiredCSS("security/lockIcon.css");
  this.appendChild(mainViewElement);
  this._originGroups = new Map();
  for (var key in WebInspector.SecurityPanelSidebarTree.OriginGroupName) {
    var originGroupName = WebInspector.SecurityPanelSidebarTree.OriginGroupName[key];
    var originGroup = new WebInspector.SidebarSectionTreeElement(WebInspector.UIString(originGroupName));
    originGroup.listItemElement.classList.add("security-sidebar-origins");
    this._originGroups.set(originGroupName, originGroup);
    this.appendChild(originGroup);
  }
  this._clearOriginGroups();
  var mainViewReloadMessage = new WebInspector.SidebarTreeElement("security-main-view-reload-message", WebInspector.UIString("Reload to view details"));
  mainViewReloadMessage.selectable = false;
  this._originGroups.get(WebInspector.SecurityPanelSidebarTree.OriginGroupName.MainOrigin).appendChild(mainViewReloadMessage);
  this._elementsByOrigin = new Map();
}
WebInspector.SecurityPanelSidebarTree.prototype = {
  addOrigin: function (origin, securityState) {
    var originElement = new WebInspector.SecurityPanelSidebarTreeElement(origin, this._showOriginInPanel.bind(this, origin), "security-sidebar-tree-item", "security-property");
    originElement.listItemElement.title = origin;
    this._elementsByOrigin.set(origin, originElement);
    this.updateOrigin(origin, securityState);
  },
  setMainOrigin: function (origin) {
    this._mainOrigin = origin;
  },
  updateOrigin: function (origin, securityState) {
    var originElement = (this._elementsByOrigin.get(origin));
    originElement.setSecurityState(securityState);
    var newParent;
    if (origin === this._mainOrigin) {
      newParent = this._originGroups.get(WebInspector.SecurityPanelSidebarTree.OriginGroupName.MainOrigin);
    } else {
      switch (securityState) {
      case SecurityAgent.SecurityState.Secure:
        newParent = this._originGroups.get(WebInspector.SecurityPanelSidebarTree.OriginGroupName.Secure);
        break;
      case SecurityAgent.SecurityState.Unknown:
        newParent = this._originGroups.get(WebInspector.SecurityPanelSidebarTree.OriginGroupName.Unknown);
        break;
      default:
        newParent = this._originGroups.get(WebInspector.SecurityPanelSidebarTree.OriginGroupName.NonSecure);
        break;
      }
    }
    var oldParent = originElement.parent;
    if (oldParent !== newParent) {
      if (oldParent) {
        oldParent.removeChild(originElement);
        if (oldParent.childCount() === 0)
          oldParent.hidden = true;
      }
      newParent.appendChild(originElement);
      newParent.hidden = false;
    }
  },
  _clearOriginGroups: function () {
    for (var originGroup of this._originGroups.values()) {
      originGroup.removeChildren();
      originGroup.hidden = true;
    }
    this._originGroups.get(WebInspector.SecurityPanelSidebarTree.OriginGroupName.MainOrigin).hidden = false;
  },
  clearOrigins: function () {
    this._clearOriginGroups();
    this._elementsByOrigin.clear();
  },
  __proto__: TreeOutlineInShadow.prototype
}
WebInspector.SecurityPanelSidebarTree.OriginGroupName = {
  MainOrigin: "Main Origin",
  NonSecure: "Non-Secure Origins",
  Secure: "Secure Origins",
  Unknown: "Unknown / Canceled"
}
WebInspector.SecurityPanelSidebarTreeElement = function (text, selectCallback, className, cssPrefix) {
  this._selectCallback = selectCallback;
  this._cssPrefix = cssPrefix;
  WebInspector.SidebarTreeElement.call(this, className, text);
  this.iconElement.classList.add(this._cssPrefix);
  this.setSecurityState(SecurityAgent.SecurityState.Unknown);
}
WebInspector.SecurityPanelSidebarTreeElement.prototype = {
  setSecurityState: function (newSecurityState) {
    if (this._securityState)
      this.iconElement.classList.remove(this._cssPrefix + "-" + this._securityState)
    this._securityState = newSecurityState;
    this.iconElement.classList.add(this._cssPrefix + "-" + newSecurityState);
  },
  securityState: function () {
    return this._securityState;
  },
  onselect: function () {
    this._selectCallback();
    return true;
  },
  __proto__: WebInspector.SidebarTreeElement.prototype
}
WebInspector.SecurityPanelSidebarTreeElement.SecurityStateComparator = function (a, b) {
  return WebInspector.SecurityModel.SecurityStateComparator(a.securityState(), b.securityState());
}
WebInspector.SecurityPanelFactory = function () {}
WebInspector.SecurityPanelFactory.prototype = {
  createPanel: function () {
    return WebInspector.SecurityPanel._instance();
  }
}
WebInspector.SecurityMainView = function (panel) {
  WebInspector.VBox.call(this, true);
  this.registerRequiredCSS("security/mainView.css");
  this.registerRequiredCSS("security/lockIcon.css");
  this.setMinimumSize(200, 100);
  this.contentElement.classList.add("security-main-view");
  this._panel = panel;
  this._summarySection = this.contentElement.createChild("div", "security-summary");
  this._securityExplanations = this.contentElement.createChild("div", "security-explanation-list");
  this._summarySection.createChild("div", "security-summary-section-title").textContent = WebInspector.UIString("Security Overview");
  var lockSpectrum = this._summarySection.createChild("div", "lock-spectrum");
  lockSpectrum.createChild("div", "lock-icon lock-icon-secure").title = WebInspector.UIString("Secure");
  lockSpectrum.createChild("div", "security-summary-lock-spacer");
  lockSpectrum.createChild("div", "lock-icon lock-icon-neutral").title = WebInspector.UIString("Not Secure");
  lockSpectrum.createChild("div", "security-summary-lock-spacer");
  lockSpectrum.createChild("div", "lock-icon lock-icon-insecure").title = WebInspector.UIString("Insecure (Broken)");
  this._summarySection.createChild("div", "triangle-pointer-container").createChild("div", "triangle-pointer-wrapper").createChild("div", "triangle-pointer");
  this._summaryText = this._summarySection.createChild("div", "security-summary-text");
}
WebInspector.SecurityMainView.prototype = {
  _addExplanation: function (explanation) {
    var explanationSection = this._securityExplanations.createChild("div", "security-explanation");
    explanationSection.classList.add("security-explanation-" + explanation.securityState);
    explanationSection.createChild("div", "security-property").classList.add("security-property-" + explanation.securityState);
    var text = explanationSection.createChild("div", "security-explanation-text");
    text.createChild("div", "security-explanation-title").textContent = explanation.summary;
    text.createChild("div").textContent = explanation.description;
    if (explanation.certificateId) {
      text.appendChild(WebInspector.SecurityPanel.createCertificateViewerButton(WebInspector.UIString("View certificate"), explanation.certificateId));
    }
    return text;
  },
  updateSecurityState: function (newSecurityState, explanations, mixedContentStatus, schemeIsCryptographic) {
    this._summarySection.classList.remove("security-summary-" + this._securityState);
    this._securityState = newSecurityState;
    this._summarySection.classList.add("security-summary-" + this._securityState);
    var summaryExplanationStrings = {
      "unknown": WebInspector.UIString("The security of this page is unknown."),
      "insecure": WebInspector.UIString("This page is insecure (broken HTTPS)."),
      "neutral": WebInspector.UIString("This page is not secure."),
      "secure": WebInspector.UIString("This page is secure (valid HTTPS).")
    }
    this._summaryText.textContent = summaryExplanationStrings[this._securityState];
    this._explanations = explanations, this._mixedContentStatus = mixedContentStatus;
    this._schemeIsCryptographic = schemeIsCryptographic;
    this._panel.setRanInsecureContentStyle(mixedContentStatus.ranInsecureContentStyle);
    this._panel.setDisplayedInsecureContentStyle(mixedContentStatus.displayedInsecureContentStyle);
    this.refreshExplanations();
  },
  refreshExplanations: function () {
    this._securityExplanations.removeChildren();
    for (var explanation of this._explanations)
      this._addExplanation(explanation);
    this._addMixedContentExplanations();
  },
  _addMixedContentExplanations: function () {
    if (!this._schemeIsCryptographic)
      return;
    if (this._mixedContentStatus && (this._mixedContentStatus.ranInsecureContent || this._mixedContentStatus.displayedInsecureContent)) {
      if (this._mixedContentStatus.ranInsecureContent)
        this._addMixedContentExplanation(this._mixedContentStatus.ranInsecureContentStyle, WebInspector.UIString("Active Mixed Content"), WebInspector.UIString("You have recently allowed insecure content (such as scripts or iframes) to run on this site."), WebInspector.NetworkLogView.MixedContentFilterValues.BlockOverridden, showBlockOverriddenMixedContentInNetworkPanel);
      if (this._mixedContentStatus.displayedInsecureContent)
        this._addMixedContentExplanation(this._mixedContentStatus.displayedInsecureContentStyle, WebInspector.UIString("Mixed Content"), WebInspector.UIString("The site includes HTTP resources."), WebInspector.NetworkLogView.MixedContentFilterValues.Displayed, showDisplayedMixedContentInNetworkPanel);
    }
    if (this._mixedContentStatus && (!this._mixedContentStatus.displayedInsecureContent && !this._mixedContentStatus.ranInsecureContent)) {
      this._addExplanation(({
        "securityState": SecurityAgent.SecurityState.Secure,
        "summary": WebInspector.UIString("Secure Resources"),
        "description": WebInspector.UIString("All resources on this page are served securely.")
      }));
    }
    if (this._panel.filterRequestCount(WebInspector.NetworkLogView.MixedContentFilterValues.Blocked) > 0)
      this._addMixedContentExplanation(SecurityAgent.SecurityState.Info, WebInspector.UIString("Blocked mixed content"), WebInspector.UIString("Your page requested insecure resources that were blocked."), WebInspector.NetworkLogView.MixedContentFilterValues.Blocked, showBlockedMixedContentInNetworkPanel);

    function showDisplayedMixedContentInNetworkPanel(e) {
      e.consume();
      WebInspector.NetworkPanel.revealAndFilter([{
        filterType: WebInspector.NetworkLogView.FilterType.MixedContent,
        filterValue: WebInspector.NetworkLogView.MixedContentFilterValues.Displayed
      }]);
    }

    function showBlockOverriddenMixedContentInNetworkPanel(e) {
      e.consume();
      WebInspector.NetworkPanel.revealAndFilter([{
        filterType: WebInspector.NetworkLogView.FilterType.MixedContent,
        filterValue: WebInspector.NetworkLogView.MixedContentFilterValues.BlockOverridden
      }]);
    }

    function showBlockedMixedContentInNetworkPanel(e) {
      e.consume();
      WebInspector.NetworkPanel.revealAndFilter([{
        filterType: WebInspector.NetworkLogView.FilterType.MixedContent,
        filterValue: WebInspector.NetworkLogView.MixedContentFilterValues.Blocked
      }]);
    }
  },
  _addMixedContentExplanation: function (securityState, summary, description, filterKey, networkFilterFn) {
    var mixedContentExplanation = ({
      "securityState": securityState,
      "summary": summary,
      "description": description
    });
    var filterRequestCount = this._panel.filterRequestCount(filterKey);
    var requestsAnchor = this._addExplanation(mixedContentExplanation).createChild("div", "security-mixed-content link");
    if (filterRequestCount > 0) {
      requestsAnchor.textContent = WebInspector.UIString("View %d request%s in Network Panel", filterRequestCount, (filterRequestCount > 1 ? "s" : ""));
    } else {
      requestsAnchor.textContent = WebInspector.UIString("View requests in Network Panel");
    }
    requestsAnchor.href = "";
    requestsAnchor.addEventListener("click", networkFilterFn);
  },
  __proto__: WebInspector.VBox.prototype
}
WebInspector.SecurityOriginView = function (panel, origin, originState) {
  this._panel = panel;
  WebInspector.VBox.call(this);
  this.setMinimumSize(200, 100);
  this.element.classList.add("security-origin-view");
  this.registerRequiredCSS("security/originView.css");
  this.registerRequiredCSS("security/lockIcon.css");
  var titleSection = this.element.createChild("div", "title-section");
  var originDisplay = titleSection.createChild("div", "origin-display");
  this._originLockIcon = originDisplay.createChild("span", "security-property");
  this._originLockIcon.classList.add("security-property-" + originState.securityState);
  originDisplay.createChild("span", "origin").textContent = origin;
  var originNetworkLink = titleSection.createChild("div", "link");
  originNetworkLink.textContent = WebInspector.UIString("View requests in Network Panel");

  function showOriginRequestsInNetworkPanel() {
    var parsedURL = new WebInspector.ParsedURL(origin);
    WebInspector.NetworkPanel.revealAndFilter([{
      filterType: WebInspector.NetworkLogView.FilterType.Domain,
      filterValue: parsedURL.host
    }, {
      filterType: WebInspector.NetworkLogView.FilterType.Scheme,
      filterValue: parsedURL.scheme
    }]);
  }
  originNetworkLink.addEventListener("click", showOriginRequestsInNetworkPanel, false);
  if (originState.securityDetails) {
    var connectionSection = this.element.createChild("div", "origin-view-section");
    connectionSection.createChild("div", "origin-view-section-title").textContent = WebInspector.UIString("Connection");
    var table = new WebInspector.SecurityDetailsTable();
    connectionSection.appendChild(table.element());
    table.addRow("Protocol", originState.securityDetails.protocol);
    table.addRow("Key Exchange", originState.securityDetails.keyExchange);
    table.addRow("Cipher Suite", originState.securityDetails.cipher + (originState.securityDetails.mac ? " with " + originState.securityDetails.mac : ""));
    var certificateSection = this.element.createChild("div", "origin-view-section");
    certificateSection.createChild("div", "origin-view-section-title").textContent = WebInspector.UIString("Certificate");
    if (originState.securityDetails.signedCertificateTimestampList.length) {
      var sctSection = this.element.createChild("div", "origin-view-section");
      sctSection.createChild("div", "origin-view-section-title").textContent = WebInspector.UIString("Certificate Transparency");
    }

    function displayCertificateDetails(certificateDetails) {
      var sanDiv = this._createSanDiv(certificateDetails.subject);
      var validFromString = new Date(1000 * certificateDetails.validFrom).toUTCString();
      var validUntilString = new Date(1000 * certificateDetails.validTo).toUTCString();
      var table = new WebInspector.SecurityDetailsTable();
      certificateSection.appendChild(table.element());
      table.addRow(WebInspector.UIString("Subject"), certificateDetails.subject.name);
      table.addRow(WebInspector.UIString("SAN"), sanDiv);
      table.addRow(WebInspector.UIString("Valid From"), validFromString);
      table.addRow(WebInspector.UIString("Valid Until"), validUntilString);
      table.addRow(WebInspector.UIString("Issuer"), certificateDetails.issuer);
      table.addRow(WebInspector.UIString("SCTs"), this.sctSummary(originState.securityDetails.certificateValidationDetails));
      table.addRow("", WebInspector.SecurityPanel.createCertificateViewerButton(WebInspector.UIString("Open full certificate details"), originState.securityDetails.certificateId));
      if (!originState.securityDetails.signedCertificateTimestampList.length)
        return;
      var sctSummaryTable = new WebInspector.SecurityDetailsTable();
      sctSummaryTable.element().classList.add("sct-summary");
      sctSection.appendChild(sctSummaryTable.element());
      for (var i = 0; i < originState.securityDetails.signedCertificateTimestampList.length; i++) {
        var sct = originState.securityDetails.signedCertificateTimestampList[i];
        sctSummaryTable.addRow(WebInspector.UIString("SCT"), sct.logDescription + " (" + sct.origin + ", " + sct.status + ")");
      }
      var sctTableWrapper = sctSection.createChild("div", "sct-details");
      sctTableWrapper.classList.add("hidden");
      for (var i = 0; i < originState.securityDetails.signedCertificateTimestampList.length; i++) {
        var sctTable = new WebInspector.SecurityDetailsTable();
        sctTableWrapper.appendChild(sctTable.element());
        var sct = originState.securityDetails.signedCertificateTimestampList[i];
        sctTable.addRow(WebInspector.UIString("Log Name"), sct.logDescription);
        sctTable.addRow(WebInspector.UIString("Log ID"), sct.logId.replace(/(.{2})/g, "$1 "));
        sctTable.addRow(WebInspector.UIString("Validation Status"), sct.status);
        sctTable.addRow(WebInspector.UIString("Source"), sct.origin);
        sctTable.addRow(WebInspector.UIString("Issued At"), new Date(sct.timestamp).toUTCString());
        sctTable.addRow(WebInspector.UIString("Hash Algorithm"), sct.hashAlgorithm);
        sctTable.addRow(WebInspector.UIString("Signature Algorithm"), sct.signatureAlgorithm);
        sctTable.addRow(WebInspector.UIString("Signature Data"), sct.signatureData.replace(/(.{2})/g, "$1 "));
      }
      var toggleSctsDetailsLink = sctSection.createChild("div", "link");
      toggleSctsDetailsLink.classList.add("sct-toggle");
      toggleSctsDetailsLink.textContent = WebInspector.UIString("Show full details");

      function toggleSctDetailsDisplay() {
        var isDetailsShown = !sctTableWrapper.classList.contains("hidden");
        if (isDetailsShown)
          toggleSctsDetailsLink.textContent = WebInspector.UIString("Show full details");
        else
          toggleSctsDetailsLink.textContent = WebInspector.UIString("Hide full details");
        sctSummaryTable.element().classList.toggle("hidden");
        sctTableWrapper.classList.toggle("hidden");
      }
      toggleSctsDetailsLink.addEventListener("click", toggleSctDetailsDisplay, false);
    }

    function displayCertificateDetailsUnavailable() {
      certificateSection.createChild("div").textContent = WebInspector.UIString("Certificate details unavailable.");
    }
    originState.certificateDetailsPromise.then(displayCertificateDetails.bind(this), displayCertificateDetailsUnavailable);
    var noteSection = this.element.createChild("div", "origin-view-section");
    noteSection.createChild("div").textContent = WebInspector.UIString("The security details above are from the first inspected response.");
  } else if (originState.securityState !== SecurityAgent.SecurityState.Unknown) {
    var notSecureSection = this.element.createChild("div", "origin-view-section");
    notSecureSection.createChild("div", "origin-view-section-title").textContent = WebInspector.UIString("Not Secure");
    notSecureSection.createChild("div").textContent = WebInspector.UIString("Your connection to this origin is not secure.");
  } else {
    var noInfoSection = this.element.createChild("div", "origin-view-section");
    noInfoSection.createChild("div", "origin-view-section-title").textContent = WebInspector.UIString("No Security Information");
    noInfoSection.createChild("div").textContent = WebInspector.UIString("No security details are available for this origin.");
  }
}
WebInspector.SecurityOriginView.prototype = {
  _createSanDiv: function (certificateSubject) {
    var sanDiv = createElement("div");
    var sanList = certificateSubject.sanDnsNames.concat(certificateSubject.sanIpAddresses);
    if (sanList.length === 0) {
      sanDiv.textContent = WebInspector.UIString("(N/A)");
      sanDiv.classList.add("empty-san");
    } else {
      var truncatedNumToShow = 2;
      var listIsTruncated = sanList.length > truncatedNumToShow;
      for (var i = 0; i < sanList.length; i++) {
        var span = sanDiv.createChild("span", "san-entry");
        span.textContent = sanList[i];
        if (listIsTruncated && i >= truncatedNumToShow)
          span.classList.add("truncated-entry");
      }
      if (listIsTruncated) {
        var truncatedSANToggle = sanDiv.createChild("div", "link");
        truncatedSANToggle.href = "";

        function toggleSANTruncation() {
          if (sanDiv.classList.contains("truncated-san")) {
            sanDiv.classList.remove("truncated-san")
            truncatedSANToggle.textContent = WebInspector.UIString("Show less");
          } else {
            sanDiv.classList.add("truncated-san");
            truncatedSANToggle.textContent = WebInspector.UIString("Show more (%d total)", sanList.length);
          }
        }
        truncatedSANToggle.addEventListener("click", toggleSANTruncation, false);
        toggleSANTruncation();
      }
    }
    return sanDiv;
  },
  setSecurityState: function (newSecurityState) {
    for (var className of Array.prototype.slice.call(this._originLockIcon.classList)) {
      if (className.startsWith("security-property-"))
        this._originLockIcon.classList.remove(className);
    }
    this._originLockIcon.classList.add("security-property-" + newSecurityState);
  },
  sctSummary: function (details) {
    if (!details)
      return WebInspector.UIString("N/A");
    var sctTypeList = [];
    if (details.numValidScts)
      sctTypeList.push(WebInspector.UIString("%d valid SCT%s", details.numValidScts, (details.numValidScts > 1) ? "s" : ""));
    if (details.numInvalidScts)
      sctTypeList.push(WebInspector.UIString("%d invalid SCT%s", details.numInvalidScts, (details.numInvalidScts > 1) ? "s" : ""));
    if (details.numUnknownScts)
      sctTypeList.push(WebInspector.UIString("%d SCT%s from unknown logs", details.numUnknownScts, (details.numUnknownScts > 1) ? "s" : ""));
    return sctTypeList.length ? sctTypeList.join(", ") : WebInspector.UIString("0 SCTs");
  },
  __proto__: WebInspector.VBox.prototype
}
WebInspector.SecurityDetailsTable = function () {
  this._element = createElement("table");
  this._element.classList.add("details-table");
}
WebInspector.SecurityDetailsTable.prototype = {
  element: function () {
    return this._element;
  },
  addRow: function (key, value) {
    var row = this._element.createChild("div", "details-table-row");
    row.createChild("div").textContent = key;
    var valueDiv = row.createChild("div");
    if (typeof value === "string") {
      valueDiv.textContent = value;
    } else {
      valueDiv.appendChild(value);
    }
  }
};
Runtime.cachedResources["security/lockIcon.css"] = "/* Copyright (c) 2015 The Chromium Authors. All rights reserved.\n * Use of this source code is governed by a BSD-style license that can be\n * found in the LICENSE file.\n */\n\n.lock-icon,\n.security-property {\n    background-size: cover;\n    height: 16px;\n    width: 16px;\n}\n\n.lock-icon-unknown {\n    background-image: url(Images/securityStateNeutral.png);\n}\n\n.lock-icon-neutral {\n    background-image: url(Images/securityStateNeutral.png);\n}\n\n.lock-icon-insecure {\n    background-image: url(Images/securityStateInsecure.png);\n}\n\n.lock-icon-secure {\n    background-image: url(Images/securityStateSecure.png);\n}\n\n.security-property-insecure {\n    background-image: url(Images/securityPropertyInsecure.png);\n}\n\n.security-property-neutral {\n    background-image: url(Images/securityPropertyWarning.png);\n}\n\n.security-property-warning {\n    background-image: url(Images/securityPropertyWarning.png);\n}\n\n.security-property-unknown {\n    background-image: url(Images/securityPropertyUnknown.png);\n}\n\n.security-property-secure {\n    background-image: url(Images/securityPropertySecure.png);\n}\n\n.security-property-info {\n    background-image: url(Images/securityPropertyInfo.png);\n}\n\n/*# sourceURL=security/lockIcon.css */";
Runtime.cachedResources["security/mainView.css"] = "/* Copyright (c) 2015 The Chromium Authors. All rights reserved.\n * Use of this source code is governed by a BSD-style license that can be\n * found in the LICENSE file.\n */\n\n.security-main-view {\n    -webkit-user-select: text;\n    overflow-x: hidden;\n    overflow-y: auto;\n    background-color: #f9f9f9;\n}\n\n.security-main-view > div {\n    flex-shrink: 0;\n}\n\n.security-summary {\n    background-color: #fff;\n}\n\n.security-summary-section-title {\n    font-size: 14px;\n    margin: 12px 24px;\n}\n\n.lock-spectrum {\n    min-width: 180px;\n    max-width: 240px;\n    margin: 6px 12px;\n    display: flex;\n    align-items: center;\n}\n\n.security-summary .lock-icon {\n    flex: none;\n    width: 32px;\n    height: 32px;\n    margin: 0 12px;\n    background-position: center center;\n\n    /* Defaults for dynamic properties. */\n    opacity: 0.5;\n}\n\n/* Shrink the margin for the page lock icon. */\n.security-summary .lock-icon-neutral {\n    margin: 0 6px;\n}\n\n.security-summary-secure .lock-icon-secure,\n.security-summary-neutral .lock-icon-neutral,\n.security-summary-insecure .lock-icon-insecure {\n    opacity: 1;\n}\n\n.security-summary-lock-spacer {\n    flex: 1 1 auto;\n    height: 1px;\n    background: rgb(217, 217, 217);\n}\n\n.triangle-pointer-container {\n    /* Let (lock width) = (horizonal width of 1 lock icon, including both margins) */\n    /* Horizontal margin is (lock width)/2 + (lock-spectrum horizontal margin) */\n    margin: 8px 40px 0px;\n    /* Width is (lock spectrum width) - (lock width) */\n    min-width: 124px;\n    max-width: 184px;\n}\n\n.triangle-pointer-wrapper {\n    /* Defaults for dynamic properties. */\n    transform: translateX(50%);\n    transition: transform 0.3s;\n}\n\n.triangle-pointer {\n    width:  12px;\n    height:  12px;\n    margin-bottom: -6px;\n    margin-left: -6px;\n    transform: rotate(-45deg);\n    border-style: solid;\n    border-width: 1px 1px 0 0;\n\n    /* Defaults for dynamic properties. */\n    background: rgb(243, 243, 243);\n    border-color: rgb(217, 217, 217);\n}\n\n.security-summary-secure .triangle-pointer-wrapper {\n    transform: translateX(0%);\n}\n\n.security-summary-neutral .triangle-pointer-wrapper {\n    transform: translateX(50%);\n}\n\n.security-summary-insecure .triangle-pointer-wrapper {\n    transform: translateX(100%);\n}\n\n.security-summary-text {\n    padding: 12px 24px;\n    border-style: solid;\n    border-width: 1px 0;\n\n    /* Defaults for dynamic properties. */\n    background: rgb(243, 243, 243);\n    border-color: rgb(217, 217, 217);\n    color: rgb(127, 127, 127);\n}\n\n.security-summary-secure .triangle-pointer,\n.security-summary-secure .security-summary-text {\n    background: rgb(243, 252, 244);\n    border-color: rgb(137, 222, 144);\n    color: rgb(42, 194, 57);\n}\n\n.security-summary-neutral .triangle-pointer,\n.security-summary-neutral .security-summary-text {\n    background: rgb(255, 251, 243);\n    border-color: rgb(253, 214, 129);\n    color: rgb(253, 177, 48);\n}\n\n.security-summary-insecure .triangle-pointer,\n.security-summary-insecure .security-summary-text {\n    background: rgb(253, 245, 245);\n    border-color: rgb(243, 157, 151);\n    color: rgb(216, 70, 60);\n}\n\n.security-explanation {\n    padding: 12px;\n    border-bottom: 1px solid rgb(230, 230, 230);\n    background-color: #fff;\n\n    display: flex;\n    white-space: nowrap;\n}\n\n.security-explanation-text {\n    flex: auto;\n    white-space: normal;\n}\n\n.security-explanation-info {\n    border-bottom: none;\n    background-color: transparent;\n}\n\n.security-certificate-button {\n    margin-top: 8px;\n}\n\n.security-explanation .security-property {\n    flex: none;\n    width: 18px;\n    height: 18px;\n    margin-left: 10px;\n    margin-right: 18px;\n}\n\n.security-explanation-title {\n    color: rgb(90, 90, 90);\n    margin-top: 1px;\n    margin-bottom: 8px;\n}\n\n.security-explanation-neutral .security-section-title,\n.security-explanation-warning .security-section-title\n{\n    color: rgb(253, 177, 48);\n    font-weight: bold;\n}\n.security-explanation-insecure .security-section-title\n{\n    color: rgb(216, 71, 60);\n    font-weight: bold;\n}\n\n.security-mixed-content {\n    margin-top: 8px;\n}\n\n/*# sourceURL=security/mainView.css */";
Runtime.cachedResources["security/originView.css"] = "/* Copyright (c) 2015 The Chromium Authors. All rights reserved.\n * Use of this source code is governed by a BSD-style license that can be\n * found in the LICENSE file.\n */\n\n.title-section {\n    padding: 12px 0;\n    border-bottom: 1px solid rgb(230, 230, 230);\n}\n\n.security-origin-view {\n    overflow-x: hidden;\n    overflow-y: scroll;\n    display: block;\n    -webkit-user-select: text;\n}\n\n.security-origin-view .origin-view-section {\n    border-bottom: 1px solid rgb(230, 230, 230);\n    padding: 12px 6px 12px 18px;\n}\n\n.security-origin-view .origin-display {\n    font-size: 15px;\n    padding-left: 38px;\n    display: flex;\n    align-items: center;\n}\n\n.title-section > .link {\n    padding: 6px 0 0 39px\n}\n\n.security-origin-view .origin-display .security-property {\n    display: inline-block;\n    vertical-align: middle;\n    position: absolute;\n    left: 18px;\n}\n\n.security-origin-view .origin-view-section-title {\n    margin-bottom: 10px;\n    padding-left: 18px;\n}\n\n.security-origin-view .details-table-row {\n    display: flex;\n    white-space: nowrap;\n    overflow: hidden;\n    line-height: 22px;\n}\n\n.security-origin-view .details-table-row > div {\n    align-items: flex-start;\n}\n\n.security-origin-view .details-table-row > div:first-child {\n    color: rgb(140, 140, 140);\n    width: 128px;\n    margin-right: 1em;\n    flex: none;\n    display: flex;\n    justify-content: flex-end;\n}\n.security-origin-view .details-table-row > div:nth-child(2) {\n    flex: auto;\n    white-space: normal;\n}\n\n.security-origin-view .sct-details .details-table .details-table-row:last-child div:last-child {\n    border-bottom: 1px solid rgb(230, 230, 230);\n    padding-bottom: 10px;\n}\n\n.security-origin-view .sct-details .details-table:last-child .details-table-row:last-child div:last-child {\n    border-bottom: none;\n    padding-bottom: 0;\n}\n\n.security-origin-view .sct-toggle {\n    padding-left: 143px;\n    padding-top: 5px;\n}\n\n.security-origin-view .details-table .empty-san {\n    color: rgb(140, 140, 140);\n}\n\n.security-origin-view .details-table .san-entry {\n    display: block;\n}\n\n.security-origin-view .truncated-san .truncated-entry {\n    display: none;\n}\n\n.security-certificate-button {\n    margin-top: 4px;\n}\n\n/*# sourceURL=security/originView.css */";
Runtime.cachedResources["security/sidebar.css"] = "/* Copyright (c) 2015 The Chromium Authors. All rights reserved.\n * Use of this source code is governed by a BSD-style license that can be\n * found in the LICENSE file.\n */\n\n.tree-outline {\n    padding: 0;\n}\n\n.tree-outline li {\n    display: flex;\n    flex-direction: row;\n    align-items: center;\n}\n\n.tree-outline:focus li.selected .lock-icon-neutral {\n    background-color: #fff;\n}\n\n.tree-outline .security-main-view-sidebar-tree-item {\n    border-bottom: 1px solid rgb(230, 230, 230);\n    padding: 16px 0;\n}\n\n.tree-outline .security-sidebar-origins {\n    padding: 1px 8px 6px 8px;\n    margin-top: 1em;\n    margin-bottom: 0.5em;\n    color: rgb(90, 90, 90);\n}\n\n.tree-outline ol {\n    padding-left: 0;\n}\n\n.tree-outline li::before {\n    content: none;\n}\n\n.tree-outline .security-main-view-sidebar-tree-item,\n.tree-outline .security-sidebar-origins,\n.tree-outline .sidebar-tree-section + .children > .sidebar-tree-item {\n    padding-left: 16px;\n}\n\n.tree-outline .sidebar-tree-item .lock-icon,\n.tree-outline .sidebar-tree-item .security-property {\n    margin-right: 2px;\n    flex: none;\n}\n\n.tree-outline:focus .security-sidebar-tree-item.selected .icon:not(.security-property-unknown) {\n    background-image: none;\n    background-color: #fff;\n}\n\n.security-sidebar-tree-item {\n    padding: 2px 0;\n}\n\n.security-sidebar-tree-item .titles {\n    overflow: hidden;\n    margin-right: 5px;\n}\n\n.tree-outline li.selected .lock-icon-neutral {\n    background-image: none;\n    background-color: #5a5a5a;\n    -webkit-mask-image: url(Images/securityStateNeutral.png);\n    -webkit-mask-size: cover;\n}\n\n.tree-outline .security-sidebar-tree-item.selected .security-property-insecure {\n    -webkit-mask-image: url(Images/securityPropertyInsecure.png);\n}\n\n.security-sidebar-tree-item.selected .security-property-neutral,\n.security-sidebar-tree-item.selected .security-property-warning {\n    -webkit-mask-image: url(Images/securityPropertyWarning.png);\n}\n\n.tree-outline .security-sidebar-tree-item.selected .security-property-unknown {\n    -webkit-mask-image: url(Images/securityPropertyUnknown.png);\n}\n\n.security-sidebar-tree-item.selected .security-property-secure {\n    -webkit-mask-image: url(Images/securityPropertySecure.png);\n}\n\n.sidebar-tree-item.security-main-view-reload-message .title {\n    color: rgba(0, 0, 0, 0.5);\n    padding-left: 8px;\n}\n\n/*# sourceURL=security/sidebar.css */";