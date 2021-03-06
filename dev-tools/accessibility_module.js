WebInspector.AccessibilityModel = function (target) {
  WebInspector.SDKModel.call(this, WebInspector.AccessibilityModel, target);
  this._agent = target.accessibilityAgent();
};
WebInspector.AccessibilityModel.prototype = {
  getAXNode: function (nodeId) {
    function parsePayload(error, value) {
      if (error)
        console.error("AccessibilityAgent.getAXNode(): " + error);
      return value || null;
    }
    return this._agent.getAXNode(nodeId, parsePayload);
  },
  __proto__: WebInspector.SDKModel.prototype
}
WebInspector.AccessibilityModel._symbol = Symbol("AccessibilityModel");
WebInspector.AccessibilityModel.fromTarget = function (target) {
  if (!target[WebInspector.AccessibilityModel._symbol])
    target[WebInspector.AccessibilityModel._symbol] = new WebInspector.AccessibilityModel(target);
  return target[WebInspector.AccessibilityModel._symbol];
};
WebInspector.AccessibilitySidebarView = function () {
  WebInspector.ThrottledWidget.call(this);
  this._axNodeSubPane = null;
  this._node = null;
  this._sidebarPaneStack = null;
  WebInspector.context.addFlavorChangeListener(WebInspector.DOMNode, this._pullNode, this);
  this._pullNode();
}
WebInspector.AccessibilitySidebarView.prototype = {
  node: function () {
    return this._node;
  },
  doUpdate: function () {
    function accessibilityNodeCallback(accessibilityNode) {
      if (this._axNodeSubPane)
        this._axNodeSubPane.setAXNode(accessibilityNode);
    }
    var node = this.node();
    return WebInspector.AccessibilityModel.fromTarget(node.target()).getAXNode(node.id).then(accessibilityNodeCallback.bind(this))
  },
  wasShown: function () {
    WebInspector.ThrottledWidget.prototype.wasShown.call(this);
    if (!this._sidebarPaneStack) {
      this._axNodeSubPane = new WebInspector.AXNodeSubPane();
      this._axNodeSubPane.setNode(this.node());
      this._axNodeSubPane.show(this.element);
      this._axNodeSubPane.expand();
      this._sidebarPaneStack = new WebInspector.SidebarPaneStack();
      this._sidebarPaneStack.element.classList.add("flex-auto");
      this._sidebarPaneStack.show(this.element);
      this._sidebarPaneStack.addPane(this._axNodeSubPane);
    }
    WebInspector.targetManager.addModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.AttrModified, this._onAttrChange, this);
    WebInspector.targetManager.addModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.AttrRemoved, this._onAttrChange, this);
    WebInspector.targetManager.addModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.CharacterDataModified, this._onNodeChange, this);
    WebInspector.targetManager.addModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.ChildNodeCountUpdated, this._onNodeChange, this);
  },
  willHide: function () {
    WebInspector.targetManager.removeModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.AttrModified, this._onAttrChange, this);
    WebInspector.targetManager.removeModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.AttrRemoved, this._onAttrChange, this);
    WebInspector.targetManager.removeModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.CharacterDataModified, this._onNodeChange, this);
    WebInspector.targetManager.removeModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.ChildNodeCountUpdated, this._onNodeChange, this);
  },
  _pullNode: function () {
    this._node = WebInspector.context.flavor(WebInspector.DOMNode);
    if (this._axNodeSubPane)
      this._axNodeSubPane.setNode(this._node);
    this.update();
  },
  _onAttrChange: function (event) {
    if (!this.node())
      return;
    var node = event.data.node;
    if (this.node() !== node)
      return;
    this.update();
  },
  _onNodeChange: function (event) {
    if (!this.node())
      return;
    var node = event.data;
    if (this.node() !== node)
      return;
    this.update();
  },
  __proto__: WebInspector.ThrottledWidget.prototype
};
WebInspector.AccessibilitySubPane = function (name) {
  WebInspector.SidebarPane.call(this, name);
  this._axNode = null;
  this.registerRequiredCSS("accessibility/accessibilityNode.css");
}
WebInspector.AccessibilitySubPane.prototype = {
  setAXNode: function (axNode) {},
  node: function () {
    return this._node;
  },
  setNode: function (node) {
    this._node = node;
  },
  createInfo: function (textContent, className) {
    var classNameOrDefault = className || "info";
    var info = this.element.createChild("div", classNameOrDefault);
    info.textContent = textContent;
    return info;
  },
  createTreeOutline: function () {
    var treeOutline = new TreeOutlineInShadow();
    treeOutline.registerRequiredCSS("accessibility/accessibilityNode.css");
    treeOutline.registerRequiredCSS("components/objectValue.css");
    treeOutline.element.classList.add("hidden");
    this.element.appendChild(treeOutline.element);
    return treeOutline;
  },
  __proto__: WebInspector.SidebarPane.prototype
};
WebInspector.AXNodeSubPane = function () {
  WebInspector.AccessibilitySubPane.call(this, WebInspector.UIString("Computed Properties"));
  this._noNodeInfo = this.createInfo(WebInspector.UIString("No accessibility node"));
  this._ignoredInfo = this.createInfo(WebInspector.UIString("Accessibility node not exposed"), "ax-ignored-info hidden");
  this._treeOutline = this.createTreeOutline();
  this._ignoredReasonsTree = this.createTreeOutline();
};
WebInspector.AXNodeSubPane.prototype = {
  setAXNode: function (axNode) {
    if (this._axNode === axNode)
      return;
    this._axNode = axNode;
    var treeOutline = this._treeOutline;
    treeOutline.removeChildren();
    var ignoredReasons = this._ignoredReasonsTree;
    ignoredReasons.removeChildren();
    var target = this.node().target();
    if (!axNode) {
      treeOutline.element.classList.add("hidden");
      this._ignoredInfo.classList.add("hidden");
      ignoredReasons.element.classList.add("hidden");
      this._noNodeInfo.classList.remove("hidden");
      this.element.classList.add("ax-ignored-node-pane");
      return;
    } else if (axNode.ignored) {
      this._noNodeInfo.classList.add("hidden");
      treeOutline.element.classList.add("hidden");
      this.element.classList.add("ax-ignored-node-pane");
      this._ignoredInfo.classList.remove("hidden");
      ignoredReasons.element.classList.remove("hidden");

      function addIgnoredReason(property) {
        ignoredReasons.appendChild(new WebInspector.AXNodeIgnoredReasonTreeElement(property, axNode, target));
      }
      var ignoredReasonsArray = (axNode.ignoredReasons);
      for (var reason of ignoredReasonsArray)
        addIgnoredReason(reason);
      if (!ignoredReasons.firstChild())
        ignoredReasons.element.classList.add("hidden");
      return;
    }
    this.element.classList.remove("ax-ignored-node-pane");
    this._ignoredInfo.classList.add("hidden");
    ignoredReasons.element.classList.add("hidden");
    this._noNodeInfo.classList.add("hidden");
    treeOutline.element.classList.remove("hidden");

    function addProperty(property) {
      treeOutline.appendChild(new WebInspector.AXNodePropertyTreePropertyElement(property, target));
    }
    for (var propertyName of["name", "description", "help", "value"]) {
      if (propertyName in axNode) {
        var defaultProperty = ({
          name: propertyName,
          value: axNode[propertyName]
        });
        addProperty(defaultProperty);
      }
    }
    var roleProperty = ({
      name: "role",
      value: axNode.role
    });
    addProperty(roleProperty);
    var propertyMap = {};
    var propertiesArray = (axNode.properties);
    for (var property of propertiesArray)
      propertyMap[property.name] = property;
    for (var propertySet of[AccessibilityAgent.AXWidgetAttributes, AccessibilityAgent.AXWidgetStates, AccessibilityAgent.AXGlobalStates, AccessibilityAgent.AXLiveRegionAttributes, AccessibilityAgent.AXRelationshipAttributes]) {
      for (var propertyKey in propertySet) {
        var property = propertySet[propertyKey];
        if (property in propertyMap)
          addProperty(propertyMap[property]);
      }
    }
  },
  __proto__: WebInspector.AccessibilitySubPane.prototype
};
WebInspector.AXNodePropertyTreeElement = function (target) {
  this._target = target;
  TreeElement.call(this, "");
};
WebInspector.AXNodePropertyTreeElement.createSimpleValueElement = function (type, value) {
  var valueElement;
  var AXValueType = AccessibilityAgent.AXValueType;
  if (!type || type === AXValueType.ValueUndefined || type === AXValueType.ComputedString)
    valueElement = createElement("span");
  else
    valueElement = createElementWithClass("span", "monospace");
  var valueText;
  var isStringProperty = type && WebInspector.AXNodePropertyTreeElement.StringProperties.has(type);
  if (isStringProperty) {
    valueText = "\"" + value.replace(/\n/g, "↵") + "\"";
    valueElement._originalTextContent = value;
  } else {
    valueText = String(value);
  }
  if (type && type in WebInspector.AXNodePropertyTreeElement.TypeStyles)
    valueElement.classList.add(WebInspector.AXNodePropertyTreeElement.TypeStyles[type]);
  valueElement.setTextContentTruncatedIfNeeded(valueText || "");
  valueElement.title = String(value) || "";
  return valueElement;
};
WebInspector.AXNodePropertyTreeElement.createExclamationMark = function (tooltip) {
  var exclamationElement = createElement("label", "dt-icon-label");
  exclamationElement.type = "warning-icon";
  exclamationElement.title = tooltip;
  return exclamationElement;
};
WebInspector.AXNodePropertyTreeElement.TypeStyles = {
  attribute: "ax-value-string",
  boolean: "object-value-boolean",
  booleanOrUndefined: "object-value-boolean",
  computedString: "ax-readable-string",
  idref: "ax-value-string",
  idrefList: "ax-value-string",
  integer: "object-value-number",
  internalRole: "ax-internal-role",
  number: "ax-value-number",
  role: "ax-role",
  string: "ax-value-string",
  tristate: "object-value-boolean",
  valueUndefined: "ax-value-undefined"
};
WebInspector.AXNodePropertyTreeElement.StringProperties = new Set([AccessibilityAgent.AXValueType.String, AccessibilityAgent.AXValueType.ComputedString, AccessibilityAgent.AXValueType.IdrefList, AccessibilityAgent.AXValueType.Idref]);
WebInspector.AXNodePropertyTreeElement.prototype = {
  appendNameElement: function (name) {
    var nameElement = createElement("span");
    var AXAttributes = WebInspector.AccessibilityStrings.AXAttributes;
    if (name in AXAttributes) {
      nameElement.textContent = WebInspector.UIString(AXAttributes[name].name);
      nameElement.title = AXAttributes[name].description;
      nameElement.classList.add("ax-readable-name");
    } else {
      nameElement.textContent = name;
      nameElement.classList.add("ax-name");
      nameElement.classList.add("monospace");
    }
    this.listItemElement.appendChild(nameElement);
  },
  appendValueElement: function (value) {
    var AXValueType = AccessibilityAgent.AXValueType;
    if (value.type === AXValueType.Idref || value.type === AXValueType.Node || value.type === AXValueType.IdrefList || value.type === AXValueType.NodeList) {
      this.appendRelatedNodeListValueElement(value);
      if (!value.value)
        return null;
    } else if (value.sources) {
      var sources = value.sources;
      for (var i = 0; i < sources.length; i++) {
        var source = sources[i];
        var child = new WebInspector.AXValueSourceTreeElement(source, this._target);
        this.appendChild(child);
      }
      this.expand();
    }
    var element = WebInspector.AXNodePropertyTreeElement.createSimpleValueElement(value.type, String(value.value));
    this.listItemElement.appendChild(element);
    return element;
  },
  appendRelatedNode: function (relatedNode, index) {
    var deferredNode = new WebInspector.DeferredDOMNode(this._target, relatedNode.backendNodeId);
    var nodeTreeElement = new WebInspector.AXRelatedNodeSourceTreeElement({
      deferredNode: deferredNode
    }, relatedNode);
    this.appendChild(nodeTreeElement);
  },
  appendRelatedNodeInline: function (relatedNode) {
    var deferredNode = new WebInspector.DeferredDOMNode(this._target, relatedNode.backendNodeId);
    var linkedNode = new WebInspector.AXRelatedNodeElement({
      deferredNode: deferredNode
    }, relatedNode);
    this.listItemElement.appendChild(linkedNode.render());
  },
  appendRelatedNodeListValueElement: function (value) {
    if (value.relatedNodes.length === 1 && !value.value) {
      this.appendRelatedNodeInline(value.relatedNodes[0]);
      return;
    }
    value.relatedNodes.forEach(this.appendRelatedNode, this);
    if (value.relatedNodes.length <= 3)
      this.expand();
    else
      this.collapse();
  },
  __proto__: TreeElement.prototype
};
WebInspector.AXNodePropertyTreePropertyElement = function (property, target) {
  this._property = property;
  this.toggleOnClick = true;
  this.selectable = false;
  WebInspector.AXNodePropertyTreeElement.call(this, target);
  this.listItemElement.classList.add("property");
}
WebInspector.AXNodePropertyTreePropertyElement.prototype = {
  onattach: function () {
    this._update();
  },
  _update: function () {
    this.listItemElement.removeChildren();
    this.appendNameElement(this._property.name);
    this.listItemElement.createChild("span", "separator").textContent = ": ";
    var valueElement = this.appendValueElement(this._property.value);
    if (this._property.name === "name")
      valueElement.classList.add("ax-computed-text");
  },
  __proto__: WebInspector.AXNodePropertyTreeElement.prototype
};
WebInspector.AXValueSourceTreeElement = function (source, target) {
  this._source = source;
  WebInspector.AXNodePropertyTreeElement.call(this, target);
  this.selectable = false;
}
WebInspector.AXValueSourceTreeElement.prototype = {
  onattach: function () {
    this._update();
  },
  appendRelatedNodeWithIdref: function (relatedNode, index, idref) {
    var deferredNode = new WebInspector.DeferredDOMNode(this._target, relatedNode.backendNodeId);
    var nodeTreeElement = new WebInspector.AXRelatedNodeSourceTreeElement({
      deferredNode: deferredNode,
      idref: idref
    }, relatedNode);
    this.appendChild(nodeTreeElement);
  },
  appendIDRefValueElement: function (value) {
    var relatedNodes = value.relatedNodes;
    var numNodes = relatedNodes.length;
    var valueElement;
    var idrefs = value.value.trim().split(/\s+/);
    if (idrefs.length === 1) {
      var idref = idrefs[0];
      var matchingNode = relatedNodes.find(node => node.idref === idref);
      if (matchingNode) {
        this.appendRelatedNodeWithIdref(matchingNode, 0, idref);
      } else {
        this.listItemElement.appendChild(new WebInspector.AXRelatedNodeElement({
          idref: idref
        }).render());
      }
    } else {
      for (var i = 0; i < idrefs.length; ++i) {
        var idref = idrefs[i];
        var matchingNode = relatedNodes.find(node => node.idref === idref);
        if (matchingNode) {
          this.appendRelatedNodeWithIdref(matchingNode, i, idref);
        } else {
          this.appendChild(new WebInspector.AXRelatedNodeSourceTreeElement({
            idref: idref
          }));
        }
      }
    }
  },
  appendRelatedNodeListValueElement: function (value) {
    var relatedNodes = value.relatedNodes;
    var numNodes = relatedNodes.length;
    if (value.type === AccessibilityAgent.AXValueType.IdrefList || value.type === AccessibilityAgent.AXValueType.Idref) {
      this.appendIDRefValueElement(value);
    } else {
      WebInspector.AXNodePropertyTreeElement.prototype.appendRelatedNodeListValueElement.call(this, value);
    }
    if (numNodes <= 3)
      this.expand();
    else
      this.collapse();
  },
  appendSourceNameElement: function (source) {
    var nameElement = createElement("span");
    var AXValueSourceType = AccessibilityAgent.AXValueSourceType;
    var type = source.type;
    var name;
    switch (type) {
    case AXValueSourceType.Attribute:
    case AXValueSourceType.Placeholder:
    case AXValueSourceType.RelatedElement:
      if (source.nativeSource) {
        var AXNativeSourceTypes = WebInspector.AccessibilityStrings.AXNativeSourceTypes;
        var nativeSource = source.nativeSource;
        nameElement.textContent = WebInspector.UIString(AXNativeSourceTypes[nativeSource].name);
        nameElement.title = WebInspector.UIString(AXNativeSourceTypes[nativeSource].description);
        nameElement.classList.add("ax-readable-name");
        break;
      }
      nameElement.textContent = source.attribute;
      nameElement.classList.add("ax-name");
      nameElement.classList.add("monospace");
      break;
    default:
      var AXSourceTypes = WebInspector.AccessibilityStrings.AXSourceTypes;
      if (type in AXSourceTypes) {
        nameElement.textContent = WebInspector.UIString(AXSourceTypes[type].name);
        nameElement.title = WebInspector.UIString(AXSourceTypes[type].description);
        nameElement.classList.add("ax-readable-name");
      } else {
        console.warn(type, "not in AXSourceTypes");
        nameElement.textContent = WebInspector.UIString(type);
      }
    }
    this.listItemElement.appendChild(nameElement);
  },
  _update: function () {
    this.listItemElement.removeChildren();
    if (this._source.invalid) {
      var exclamationMark = WebInspector.AXNodePropertyTreeElement.createExclamationMark(WebInspector.UIString("Invalid source."));
      this.listItemElement.appendChild(exclamationMark);
      this.listItemElement.classList.add("ax-value-source-invalid");
    } else if (this._source.superseded) {
      this.listItemElement.classList.add("ax-value-source-unused");
    }
    this.appendSourceNameElement(this._source);
    this.listItemElement.createChild("span", "separator").textContent = ": ";
    if (this._source.attributeValue) {
      this.appendValueElement(this._source.attributeValue);
      this.listItemElement.createTextChild(" ");
    } else if (this._source.nativeSourceValue) {
      this.appendValueElement(this._source.nativeSourceValue);
      this.listItemElement.createTextChild(" ");
    } else if (this._source.value) {
      this.appendValueElement(this._source.value);
    } else {
      var valueElement = WebInspector.AXNodePropertyTreeElement.createSimpleValueElement(AccessibilityAgent.AXValueType.ValueUndefined, WebInspector.UIString("Not specified"));
      this.listItemElement.appendChild(valueElement);
      this.listItemElement.classList.add("ax-value-source-unused");
    }
    if (this._source.value && this._source.superseded)
      this.listItemElement.classList.add("ax-value-source-superseded");
  },
  appendValueElement: function (value) {
    var element = WebInspector.AXNodePropertyTreeElement.prototype.appendValueElement.call(this, value);
    if (!element) {
      element = WebInspector.AXNodePropertyTreeElement.createSimpleValueElement(value.type, String(value.value));
      this.listItemElement.appendChild(element);
    }
    return element;
  },
  __proto__: WebInspector.AXNodePropertyTreeElement.prototype
};
WebInspector.AXRelatedNodeSourceTreeElement = function (node, value) {
  this._value = value;
  this._axRelatedNodeElement = new WebInspector.AXRelatedNodeElement(node, value);
  TreeElement.call(this, "");
  this.selectable = false;
};
WebInspector.AXRelatedNodeSourceTreeElement.prototype = {
  onattach: function () {
    this.listItemElement.appendChild(this._axRelatedNodeElement.render());
    if (!this._value)
      return;
    if (this._value.text)
      this.listItemElement.appendChild(WebInspector.AXNodePropertyTreeElement.createSimpleValueElement(AccessibilityAgent.AXValueType.ComputedString, this._value.text));
  },
  __proto__: TreeElement.prototype
};
WebInspector.AXRelatedNodeElement = function (node, value) {
  this._deferredNode = node.deferredNode;
  this._idref = node.idref;
  this._value = value;
};
WebInspector.AXRelatedNodeElement.prototype = {
  render: function () {
    var element = createElement("span");
    var valueElement;

    function onNodeResolved(node) {
      valueElement.appendChild(WebInspector.DOMPresentationUtils.linkifyNodeReference(node, this._idref));
    }
    if (this._deferredNode) {
      valueElement = createElement("span");
      element.appendChild(valueElement);
      this._deferredNode.resolve(onNodeResolved.bind(this));
    } else if (this._idref) {
      element.classList.add("invalid");
      valueElement = WebInspector.AXNodePropertyTreeElement.createExclamationMark(WebInspector.UIString("No node with this ID."));
      valueElement.createTextChild(this._idref);
      element.appendChild(valueElement);
    }
    return element;
  }
};
WebInspector.AXNodeIgnoredReasonTreeElement = function (property, axNode, target) {
  this._property = property;
  this._axNode = axNode;
  WebInspector.AXNodePropertyTreeElement.call(this, target);
  this.toggleOnClick = true;
  this.selectable = false;
}
WebInspector.AXNodeIgnoredReasonTreeElement.prototype = {
  onattach: function () {
    this.listItemElement.removeChildren();
    this._reasonElement = WebInspector.AXNodeIgnoredReasonTreeElement.createReasonElement(this._property.name, this._axNode);
    this.listItemElement.appendChild(this._reasonElement);
    var value = this._property.value;
    if (value.type === AccessibilityAgent.AXValueType.Idref)
      this.appendRelatedNodeListValueElement(value);
  },
  __proto__: WebInspector.AXNodePropertyTreeElement.prototype
};
WebInspector.AXNodeIgnoredReasonTreeElement.createReasonElement = function (reason, axNode) {
  var reasonElement = null;
  switch (reason) {
  case "activeModalDialog":
    reasonElement = WebInspector.formatLocalized("Element is hidden by active modal dialog: ", []);
    break;
  case "ancestorDisallowsChild":
    reasonElement = WebInspector.formatLocalized("Element is not permitted as child of ", []);
    break;
  case "ancestorIsLeafNode":
    reasonElement = WebInspector.formatLocalized("Ancestor's children are all presentational: ", []);
    break;
  case "ariaHidden":
    var ariaHiddenSpan = createElement("span", "source-code").textContent = "aria-hidden";
    reasonElement = WebInspector.formatLocalized("Element is %s.", [ariaHiddenSpan]);
    break;
  case "ariaHiddenRoot":
    var ariaHiddenSpan = createElement("span", "source-code").textContent = "aria-hidden";
    var trueSpan = createElement("span", "source-code").textContent = "true";
    reasonElement = WebInspector.formatLocalized("%s is %s on ancestor: ", [ariaHiddenSpan, trueSpan]);
    break;
  case "emptyAlt":
    reasonElement = WebInspector.formatLocalized("Element has empty alt text.", []);
    break;
  case "emptyText":
    reasonElement = WebInspector.formatLocalized("No text content.", []);
    break;
  case "inert":
    reasonElement = WebInspector.formatLocalized("Element is inert.", []);
    break;
  case "inheritsPresentation":
    reasonElement = WebInspector.formatLocalized("Element inherits presentational role from ", []);
    break;
  case "labelContainer":
    reasonElement = WebInspector.formatLocalized("Part of label element: ", []);
    break;
  case "labelFor":
    reasonElement = WebInspector.formatLocalized("Label for ", []);
    break;
  case "notRendered":
    reasonElement = WebInspector.formatLocalized("Element is not rendered.", []);
    break;
  case "notVisible":
    reasonElement = WebInspector.formatLocalized("Element is not visible.", []);
    break;
  case "presentationalRole":
    var rolePresentationSpan = createElement("span", "source-code").textContent = "role=" + axNode.role.value;
    reasonElement = WebInspector.formatLocalized("Element has %s.", [rolePresentationSpan]);
    break;
  case "probablyPresentational":
    reasonElement = WebInspector.formatLocalized("Element is presentational.", []);
    break;
  case "staticTextUsedAsNameFor":
    reasonElement = WebInspector.formatLocalized("Static text node is used as name for ", []);
    break;
  case "uninteresting":
    reasonElement = WebInspector.formatLocalized("Element not interesting for accessibility.", []);
    break;
  }
  if (reasonElement)
    reasonElement.classList.add("ax-reason");
  return reasonElement;
};;
WebInspector.AccessibilityStrings = {};
WebInspector.AccessibilityStrings.AXAttributes = {
  "disabled": {
    name: "Disabled",
    description: "If true, this element currently cannot be interacted with.",
    group: "AXGlobalStates"
  },
  "invalid": {
    name: "Invalid user entry",
    description: "If true, this element's user-entered value does not conform to validation requirement.",
    group: "AXGlobalStates"
  },
  "live": {
    name: "Live region",
    description: "Whether and what priority of live updates may be expected for this element.",
    group: "AXLiveRegionAttributes"
  },
  "atomic": {
    name: "Atomic (live regions)",
    description: "If this element may receive live updates, whether the entire live region should be presented to the user on changes, or only changed nodes.",
    group: "AXLiveRegionAttributes"
  },
  "relevant": {
    name: "Relevant (live regions)",
    description: "If this element may receive live updates, what type of updates should trigger a notification.",
    group: "AXLiveRegionAttributes"
  },
  "busy": {
    name: "Busy (live regions)",
    description: "Whether this element or its subtree are currently being updated (and thus may be in an inconsistent state).",
    group: "AXLiveRegionAttributes"
  },
  "root": {
    name: "Live region root",
    description: "If this element may receive live updates, the root element of the containing live region.",
    group: "AXLiveRegionAttributes"
  },
  "autocomplete": {
    name: "Has autocomplete",
    description: "Whether and what type of autocomplete suggestions are currently provided by this element.",
    group: "AXWidgetAttributes"
  },
  "haspopup": {
    name: "Has popup",
    description: "Whether this element has caused some kind of pop-up (such as a menu) to appear.",
    group: "AXWidgetAttributes"
  },
  "level": {
    name: "Level",
    description: "The hierarchical level of this element.",
    group: "AXWidgetAttributes"
  },
  "multiselectable": {
    name: "Multi-selectable",
    description: "Whether a user may select more than one option from this widget.",
    group: "AXWidgetAttributes"
  },
  "orientation": {
    name: "Orientation",
    description: "Whether this linear element's orientation is horizontal or vertical.",
    group: "AXWidgetAttributes"
  },
  "multiline": {
    name: "Multi-line",
    description: "Whether this textbox may have more than one line.",
    group: "AXWidgetAttributes"
  },
  "readonly": {
    name: "Read-only",
    description: "If true, this element may be interacted with, but its value cannot be changed.",
    group: "AXWidgetAttributes"
  },
  "required": {
    name: "Required",
    description: "Whether this element is a required field in a form.",
    group: "AXWidgetAttributes"
  },
  "valuemin": {
    name: "Minimum value",
    description: "For a range widget, the minimum allowed value.",
    group: "AXWidgetAttributes"
  },
  "valuemax": {
    name: "Maximum value",
    description: "For a range widget, the maximum allowed value.",
    group: "AXWidgetAttributes"
  },
  "valuetext": {
    name: "Value description",
    description: "A human-readable version of the value of a range widget (where necessary).",
    group: "AXWidgetAttributes"
  },
  "checked": {
    name: "Checked",
    description: "Whether this checkbox, radio button or tree item is checked, unchecked, or mixed (e.g. has both checked and un-checked children).",
    group: "AXWidgetStates"
  },
  "expanded": {
    name: "Expanded",
    description: "Whether this element, or another grouping element it controls, is expanded.",
    group: "AXWidgetStates"
  },
  "pressed": {
    name: "Pressed",
    description: "Whether this toggle button is currently in a pressed state.",
    group: "AXWidgetStates"
  },
  "selected": {
    name: "Selected",
    description: "Whether the option represented by this element is currently selected.",
    group: "AXWidgetStates"
  },
  "activedescendant": {
    name: "Active descendant",
    description: "The descendant of this element which is active; i.e. the element to which focus should be delegated.",
    group: "AXRelationshipAttributes"
  },
  "flowto": {
    name: "Flows to",
    description: "Element to which the user may choose to navigate after this one, instead of the next element in the DOM order.",
    group: "AXRelationshipAttributes"
  },
  "controls": {
    name: "Controls",
    description: "Element or elements whose content or presence is/are controlled by this widget.",
    group: "AXRelationshipAttributes"
  },
  "describedby": {
    name: "Described by",
    description: "Element or elements which form the description of this element.",
    group: "AXRelationshipAttributes"
  },
  "labelledby": {
    name: "Labeled by",
    description: "Element or elements which may form the name of this element.",
    group: "AXRelationshipAttributes"
  },
  "owns": {
    name: "Owns",
    description: "Element or elements which should be considered descendants of this element, despite not being descendants in the DOM.",
    group: "AXRelationshipAttributes"
  },
  "name": {
    name: "Name",
    description: "The computed name of this element.",
    group: "Default"
  },
  "role": {
    name: "Role",
    description: "Indicates the purpose of this element, such as a user interface idiom for a widget, or structural role within a document.",
    group: "Default"
  },
  "value": {
    name: "Value",
    description: "The value of this element; this may be user-provided or developer-provided, depending on the element.",
    group: "Default"
  },
  "help": {
    name: "Help",
    description: "The computed help text for this element.",
    group: "Default"
  },
  "description": {
    name: "Description",
    description: "The accessible description for this element.",
    group: "Default"
  }
};
WebInspector.AccessibilityStrings.AXSourceTypes = {
  "attribute": {
    name: "From attribute",
    description: "Value from attribute."
  },
  "implicit": {
    name: "Implicit",
    description: "Implicit value.",
  },
  "style": {
    name: "From style",
    description: "Value from style."
  },
  "contents": {
    name: "Contents",
    description: "Value from element contents."
  },
  "placeholder": {
    name: "From placeholder attribute",
    description: "Value from placeholder attribute."
  },
  "relatedElement": {
    name: "Related element",
    description: "Value from related element."
  }
}
WebInspector.AccessibilityStrings.AXNativeSourceTypes = {
  "figcaption": {
    name: "From caption",
    description: "Value from figcaption element."
  },
  "label": {
    name: "From label",
    description: "Value from label element."
  },
  "labelfor": {
    name: "From label (for)",
    description: "Value from label element with for= attribute."
  },
  "labelwrapped": {
    name: "From label (wrapped)",
    description: "Value from label element wrapped."
  },
  "tablecaption": {
    name: "From caption",
    description: "Value from table caption."
  },
  "other": {
    name: "From native HTML",
    description: "Value from native HTML (unknown source)."
  },
};
Runtime.cachedResources["accessibility/accessibilityNode.css"] = "/*\n * Copyright 2015 The Chromium Authors. All rights reserved.\n * Use of this source code is governed by a BSD-style license that can be\n * found in the LICENSE file.\n */\n\n.ax-computed-text {\n    background-image: url(Images/speech.png);\n    background-repeat: no-repeat;\n    background-position: 0px center;\n    background-size: 12px;\n    padding-left: 17px;\n}\n\n.ax-computed-text div {\n    display: inline-block;\n    padding: 2px;\n    width: 100%;\n    text-overflow: ellipsis;\n    white-space: nowrap;\n    overflow: hidden;\n    width: 100%;\n}\n\ndiv.ax-text-alternatives {\n    margin-bottom: 3px;\n    border-bottom: 1px solid #BFBFBF;\n}\n\n.ax-name {\n    color: rgb(153, 69, 0);\n    flex-shrink: 0;\n}\n\n.ax-readable-name {\n    flex-shrink: 0;\n    padding-left: 2px;\n}\n\n.ax-readable-string {\n    font-style: italic;\n}\n\nspan.ax-role {\n    font-weight: bold;\n}\n\nspan.ax-internal-role {\n    font-style: italic;\n}\n\n.ax-ignored-info {\n    padding: 6px;\n}\n\n.ax-ignored-node-pane {\n    background-color: hsl(0, 0%, 96%);\n}\n\n.tree-outline li {\n    padding-left: 1px;\n    align-items: baseline;\n}\n\n.tree-outline li.property {\n    color: rgb(33, 33, 33);\n}\n\n.tree-outline li.invalid {\n    position: relative;\n    left: -2px;\n}\n\n.invalid {\n    text-decoration: line-through;\n}\n\n.tree-outline label[is=dt-icon-label] {\n    position: relative;\n    left: -11px;\n}\n\nspan.ax-value-undefined {\n    font-style: italic;\n}\n\n.ax-value-source-unused {\n    opacity: 0.5;\n}\n\n.ax-value-source-superseded,\n.ax-value-source-invalid {\n    text-decoration: line-through;\n}\n\n.tree-outline label[is=dt-icon-label] + .ax-name {\n    margin-left: -11px;\n}\n\n.ax-value-string {\n    color: rgb(200, 0, 0);\n}\n\n.sidebar-pane-stack .sidebar-pane {\n    padding-left: 4px;\n}\n\n/*# sourceURL=accessibility/accessibilityNode.css */";