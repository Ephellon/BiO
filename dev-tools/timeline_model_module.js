WebInspector.TracingLayerPayload;WebInspector.TracingLayerTile;WebInspector.LayerTreeModel=function(target)
{WebInspector.SDKModel.call(this,WebInspector.LayerTreeModel,target);target.registerLayerTreeDispatcher(new WebInspector.LayerTreeDispatcher(this));WebInspector.targetManager.addEventListener(WebInspector.TargetManager.Events.MainFrameNavigated,this._onMainFrameNavigated,this);this._layerTree=null;}
WebInspector.LayerTreeModel.Events={LayerTreeChanged:"LayerTreeChanged",LayerPainted:"LayerPainted",}
WebInspector.LayerTreeModel.ScrollRectType={NonFastScrollable:{name:"NonFastScrollable",description:"Non fast scrollable"},TouchEventHandler:{name:"TouchEventHandler",description:"Touch event handler"},WheelEventHandler:{name:"WheelEventHandler",description:"Wheel event handler"},RepaintsOnScroll:{name:"RepaintsOnScroll",description:"Repaints on scroll"}}
WebInspector.LayerTreeModel.prototype={disable:function()
{if(!this._enabled)
return;this._enabled=false;this._layerTree=null;this.target().layerTreeAgent().disable();},enable:function()
{if(this._enabled)
return;this._enabled=true;this._forceEnable();},_forceEnable:function()
{this._layerTree=new WebInspector.AgentLayerTree(this.target());this._lastPaintRectByLayerId={};this.target().layerTreeAgent().enable();},setLayerTree:function(layerTree)
{this.disable();this._layerTree=layerTree;this.dispatchEventToListeners(WebInspector.LayerTreeModel.Events.LayerTreeChanged);},layerTree:function()
{return this._layerTree;},_layerTreeChanged:function(layers)
{if(!this._enabled)
return;var layerTree=(this._layerTree);layerTree.setLayers(layers,onLayersSet.bind(this));function onLayersSet()
{for(var layerId in this._lastPaintRectByLayerId){var lastPaintRect=this._lastPaintRectByLayerId[layerId];var layer=layerTree.layerById(layerId);if(layer)
layer._lastPaintRect=lastPaintRect;}
this._lastPaintRectByLayerId={};this.dispatchEventToListeners(WebInspector.LayerTreeModel.Events.LayerTreeChanged);}},_layerPainted:function(layerId,clipRect)
{if(!this._enabled)
return;var layerTree=(this._layerTree);var layer=layerTree.layerById(layerId);if(!layer){this._lastPaintRectByLayerId[layerId]=clipRect;return;}
layer._didPaint(clipRect);this.dispatchEventToListeners(WebInspector.LayerTreeModel.Events.LayerPainted,layer);},_onMainFrameNavigated:function()
{if(this._enabled)
this._forceEnable();},__proto__:WebInspector.SDKModel.prototype}
WebInspector.LayerTreeBase=function(target)
{this._target=target;this._domModel=target?WebInspector.DOMModel.fromTarget(target):null;this._layersById={};this._backendNodeIdToNode=new Map();this._reset();}
WebInspector.LayerTreeBase.prototype={_reset:function()
{this._root=null;this._contentRoot=null;this._layers=null;},target:function()
{return this._target;},root:function()
{return this._root;},contentRoot:function()
{return this._contentRoot;},layers:function()
{return this._layers;},forEachLayer:function(callback,root)
{if(!root){root=this.root();if(!root)
return false;}
return callback(root)||root.children().some(this.forEachLayer.bind(this,callback));},layerById:function(id)
{return this._layersById[id]||null;},_resolveBackendNodeIds:function(requestedNodeIds,callback)
{if(!requestedNodeIds.size||!this._domModel){callback();return;}
if(this._domModel)
this._domModel.pushNodesByBackendIdsToFrontend(requestedNodeIds,populateBackendNodeMap.bind(this));function populateBackendNodeMap(nodesMap)
{if(nodesMap){for(var nodeId of nodesMap.keysArray())
this._backendNodeIdToNode.set(nodeId,nodesMap.get(nodeId)||null);}
callback();}},setViewportSize:function(viewportSize)
{this._viewportSize=viewportSize;},viewportSize:function()
{return this._viewportSize;},_nodeForId:function(id)
{return this._domModel?this._domModel.nodeForId(id):null;}}
WebInspector.TracingLayerTree=function(target)
{WebInspector.LayerTreeBase.call(this,target);this._tileById=new Map();}
WebInspector.TracingLayerTree.prototype={setLayers:function(root,layers,callback)
{var idsToResolve=new Set();if(root){this._extractNodeIdsToResolve(idsToResolve,{},root);}else{for(var i=0;i<layers.length;++i)
this._extractNodeIdsToResolve(idsToResolve,{},layers[i]);}
this._resolveBackendNodeIds(idsToResolve,onBackendNodeIdsResolved.bind(this));function onBackendNodeIdsResolved()
{var oldLayersById=this._layersById;this._layersById={};this._contentRoot=null;if(root){this._root=this._innerSetLayers(oldLayersById,root);}else{this._layers=layers.map(this._innerSetLayers.bind(this,oldLayersById));this._root=this._contentRoot;for(var i=0;i<this._layers.length;++i){if(this._layers[i].id()!==this._contentRoot.id()){this._contentRoot.addChild(this._layers[i]);}}}
callback();}},setTiles:function(tiles)
{this._tileById=new Map();for(var tile of tiles)
this._tileById.set(tile.id,tile);},tileById:function(id)
{return this._tileById.get(id)||null;},_innerSetLayers:function(oldLayersById,payload)
{var layer=(oldLayersById[payload.layer_id]);if(layer)
layer._reset(payload);else
layer=new WebInspector.TracingLayer(payload);this._layersById[payload.layer_id]=layer;if(payload.owner_node)
layer._setNode(this._backendNodeIdToNode.get(payload.owner_node)||null);if(!this._contentRoot&&layer.drawsContent())
this._contentRoot=layer;for(var i=0;payload.children&&i<payload.children.length;++i)
layer.addChild(this._innerSetLayers(oldLayersById,payload.children[i]));return layer;},_extractNodeIdsToResolve:function(nodeIdsToResolve,seenNodeIds,payload)
{var backendNodeId=payload.owner_node;if(backendNodeId&&!this._backendNodeIdToNode.has(backendNodeId))
nodeIdsToResolve.add(backendNodeId);for(var i=0;payload.children&&i<payload.children.length;++i)
this._extractNodeIdsToResolve(nodeIdsToResolve,seenNodeIds,payload.children[i]);},__proto__:WebInspector.LayerTreeBase.prototype}
WebInspector.AgentLayerTree=function(target)
{WebInspector.LayerTreeBase.call(this,target);}
WebInspector.AgentLayerTree.prototype={setLayers:function(payload,callback)
{if(!payload){onBackendNodeIdsResolved.call(this);return;}
var idsToResolve=new Set();for(var i=0;i<payload.length;++i){var backendNodeId=payload[i].backendNodeId;if(!backendNodeId||this._backendNodeIdToNode.has(backendNodeId))
continue;idsToResolve.add(backendNodeId);}
this._resolveBackendNodeIds(idsToResolve,onBackendNodeIdsResolved.bind(this));function onBackendNodeIdsResolved()
{this._innerSetLayers(payload);callback();}},_innerSetLayers:function(layers)
{this._reset();if(!layers)
return;var oldLayersById=this._layersById;this._layersById={};for(var i=0;i<layers.length;++i){var layerId=layers[i].layerId;var layer=oldLayersById[layerId];if(layer)
layer._reset(layers[i]);else
layer=new WebInspector.AgentLayer(this._target,layers[i]);this._layersById[layerId]=layer;var backendNodeId=layers[i].backendNodeId;if(backendNodeId)
layer._setNode(this._backendNodeIdToNode.get(backendNodeId));if(!this._contentRoot&&layer.drawsContent())
this._contentRoot=layer;var parentId=layer.parentId();if(parentId){var parent=this._layersById[parentId];if(!parent)
console.assert(parent,"missing parent "+parentId+" for layer "+layerId);parent.addChild(layer);}else{if(this._root)
console.assert(false,"Multiple root layers");this._root=layer;}}
if(this._root)
this._root._calculateQuad(new WebKitCSSMatrix());},__proto__:WebInspector.LayerTreeBase.prototype}
WebInspector.Layer=function()
{}
WebInspector.Layer.prototype={id:function(){},parentId:function(){},parent:function(){},isRoot:function(){},children:function(){},addChild:function(child){},node:function(){},nodeForSelfOrAncestor:function(){},offsetX:function(){},offsetY:function(){},width:function(){},height:function(){},transform:function(){},quad:function(){},anchorPoint:function(){},invisible:function(){},paintCount:function(){},lastPaintRect:function(){},scrollRects:function(){},gpuMemoryUsage:function(){},requestCompositingReasons:function(callback){},drawsContent:function(){}}
WebInspector.AgentLayer=function(target,layerPayload)
{this._target=target;this._reset(layerPayload);}
WebInspector.AgentLayer.prototype={id:function()
{return this._layerPayload.layerId;},parentId:function()
{return this._layerPayload.parentLayerId;},parent:function()
{return this._parent;},isRoot:function()
{return!this.parentId();},children:function()
{return this._children;},addChild:function(child)
{if(child._parent)
console.assert(false,"Child already has a parent");this._children.push(child);child._parent=this;},_setNode:function(node)
{this._node=node;},node:function()
{return this._node;},nodeForSelfOrAncestor:function()
{for(var layer=this;layer;layer=layer._parent){if(layer._node)
return layer._node;}
return null;},offsetX:function()
{return this._layerPayload.offsetX;},offsetY:function()
{return this._layerPayload.offsetY;},width:function()
{return this._layerPayload.width;},height:function()
{return this._layerPayload.height;},transform:function()
{return this._layerPayload.transform;},quad:function()
{return this._quad;},anchorPoint:function()
{return[this._layerPayload.anchorX||0,this._layerPayload.anchorY||0,this._layerPayload.anchorZ||0,];},invisible:function()
{return this._layerPayload.invisible;},paintCount:function()
{return this._paintCount||this._layerPayload.paintCount;},lastPaintRect:function()
{return this._lastPaintRect;},scrollRects:function()
{return this._scrollRects;},requestCompositingReasons:function(callback)
{if(!this._target){callback([]);return;}
var wrappedCallback=InspectorBackend.wrapClientCallback(callback,"LayerTreeAgent.reasonsForCompositingLayer(): ",undefined,[]);this._target.layerTreeAgent().compositingReasons(this.id(),wrappedCallback);},drawsContent:function()
{return this._layerPayload.drawsContent;},gpuMemoryUsage:function()
{var bytesPerPixel=4;return this.drawsContent()?this.width()*this.height()*bytesPerPixel:0;},requestSnapshot:function(callback)
{if(!this._target){callback();return;}
var wrappedCallback=InspectorBackend.wrapClientCallback(callback,"LayerTreeAgent.makeSnapshot(): ",WebInspector.PaintProfilerSnapshot.bind(null,this._target));this._target.layerTreeAgent().makeSnapshot(this.id(),wrappedCallback);},_didPaint:function(rect)
{this._lastPaintRect=rect;this._paintCount=this.paintCount()+1;this._image=null;},_reset:function(layerPayload)
{this._node=null;this._children=[];this._parent=null;this._paintCount=0;this._layerPayload=layerPayload;this._image=null;this._scrollRects=this._layerPayload.scrollRects||[];},_matrixFromArray:function(a)
{function toFixed9(x){return x.toFixed(9);}
return new WebKitCSSMatrix("matrix3d("+a.map(toFixed9).join(",")+")");},_calculateTransformToViewport:function(parentTransform)
{var offsetMatrix=new WebKitCSSMatrix().translate(this._layerPayload.offsetX,this._layerPayload.offsetY);var matrix=offsetMatrix;if(this._layerPayload.transform){var transformMatrix=this._matrixFromArray(this._layerPayload.transform);var anchorVector=new WebInspector.Geometry.Vector(this._layerPayload.width*this.anchorPoint()[0],this._layerPayload.height*this.anchorPoint()[1],this.anchorPoint()[2]);var anchorPoint=WebInspector.Geometry.multiplyVectorByMatrixAndNormalize(anchorVector,matrix);var anchorMatrix=new WebKitCSSMatrix().translate(-anchorPoint.x,-anchorPoint.y,-anchorPoint.z);matrix=anchorMatrix.inverse().multiply(transformMatrix.multiply(anchorMatrix.multiply(matrix)));}
matrix=parentTransform.multiply(matrix);return matrix;},_createVertexArrayForRect:function(width,height)
{return[0,0,0,width,0,0,width,height,0,0,height,0];},_calculateQuad:function(parentTransform)
{var matrix=this._calculateTransformToViewport(parentTransform);this._quad=[];var vertices=this._createVertexArrayForRect(this._layerPayload.width,this._layerPayload.height);for(var i=0;i<4;++i){var point=WebInspector.Geometry.multiplyVectorByMatrixAndNormalize(new WebInspector.Geometry.Vector(vertices[i*3],vertices[i*3+1],vertices[i*3+2]),matrix);this._quad.push(point.x,point.y);}
function calculateQuadForLayer(layer)
{layer._calculateQuad(matrix);}
this._children.forEach(calculateQuadForLayer);}}
WebInspector.TracingLayer=function(payload)
{this._reset(payload);}
WebInspector.TracingLayer.prototype={_reset:function(payload)
{this._node=null;this._layerId=String(payload.layer_id);this._offsetX=payload.position[0];this._offsetY=payload.position[1];this._width=payload.bounds.width;this._height=payload.bounds.height;this._children=[];this._parentLayerId=null;this._parent=null;this._quad=payload.layer_quad||[];this._createScrollRects(payload);this._compositingReasons=payload.compositing_reasons||[];this._drawsContent=!!payload.draws_content;this._gpuMemoryUsage=payload.gpu_memory_usage;},id:function()
{return this._layerId;},parentId:function()
{return this._parentLayerId;},parent:function()
{return this._parent;},isRoot:function()
{return!this.parentId();},children:function()
{return this._children;},addChild:function(child)
{if(child._parent)
console.assert(false,"Child already has a parent");this._children.push(child);child._parent=this;child._parentLayerId=this._layerId;},_setNode:function(node)
{this._node=node;},node:function()
{return this._node;},nodeForSelfOrAncestor:function()
{for(var layer=this;layer;layer=layer._parent){if(layer._node)
return layer._node;}
return null;},offsetX:function()
{return this._offsetX;},offsetY:function()
{return this._offsetY;},width:function()
{return this._width;},height:function()
{return this._height;},transform:function()
{return null;},quad:function()
{return this._quad;},anchorPoint:function()
{return[0.5,0.5,0];},invisible:function()
{return false;},paintCount:function()
{return 0;},lastPaintRect:function()
{return null;},scrollRects:function()
{return this._scrollRects;},gpuMemoryUsage:function()
{return this._gpuMemoryUsage;},_scrollRectsFromParams:function(params,type)
{return{rect:{x:params[0],y:params[1],width:params[2],height:params[3]},type:type};},_createScrollRects:function(payload)
{this._scrollRects=[];if(payload.non_fast_scrollable_region)
this._scrollRects.push(this._scrollRectsFromParams(payload.non_fast_scrollable_region,WebInspector.LayerTreeModel.ScrollRectType.NonFastScrollable.name));if(payload.touch_event_handler_region)
this._scrollRects.push(this._scrollRectsFromParams(payload.touch_event_handler_region,WebInspector.LayerTreeModel.ScrollRectType.TouchEventHandler.name));if(payload.wheel_event_handler_region)
this._scrollRects.push(this._scrollRectsFromParams(payload.wheel_event_handler_region,WebInspector.LayerTreeModel.ScrollRectType.WheelEventHandler.name));if(payload.scroll_event_handler_region)
this._scrollRects.push(this._scrollRectsFromParams(payload.scroll_event_handler_region,WebInspector.LayerTreeModel.ScrollRectType.RepaintsOnScroll.name));},requestCompositingReasons:function(callback)
{callback(this._compositingReasons);},drawsContent:function()
{return this._drawsContent;}}
WebInspector.DeferredLayerTree=function(target)
{this._target=target;}
WebInspector.DeferredLayerTree.prototype={resolve:function(callback){},target:function()
{return this._target;}};WebInspector.LayerTreeDispatcher=function(layerTreeModel)
{this._layerTreeModel=layerTreeModel;}
WebInspector.LayerTreeDispatcher.prototype={layerTreeDidChange:function(layers)
{this._layerTreeModel._layerTreeChanged(layers||null);},layerPainted:function(layerId,clipRect)
{this._layerTreeModel._layerPainted(layerId,clipRect);}}
WebInspector.LayerTreeModel.fromTarget=function(target)
{if(!target.isPage())
return null;var model=(target.model(WebInspector.LayerTreeModel));if(!model)
model=new WebInspector.LayerTreeModel(target);return model;};WebInspector.TimelineModel=function(eventFilter)
{this._eventFilter=eventFilter;this.reset();}
WebInspector.TimelineModel.RecordType={Task:"Task",Program:"Program",EventDispatch:"EventDispatch",GPUTask:"GPUTask",Animation:"Animation",RequestMainThreadFrame:"RequestMainThreadFrame",BeginFrame:"BeginFrame",NeedsBeginFrameChanged:"NeedsBeginFrameChanged",BeginMainThreadFrame:"BeginMainThreadFrame",ActivateLayerTree:"ActivateLayerTree",DrawFrame:"DrawFrame",HitTest:"HitTest",ScheduleStyleRecalculation:"ScheduleStyleRecalculation",RecalculateStyles:"RecalculateStyles",UpdateLayoutTree:"UpdateLayoutTree",InvalidateLayout:"InvalidateLayout",Layout:"Layout",UpdateLayer:"UpdateLayer",UpdateLayerTree:"UpdateLayerTree",PaintSetup:"PaintSetup",Paint:"Paint",PaintImage:"PaintImage",Rasterize:"Rasterize",RasterTask:"RasterTask",ScrollLayer:"ScrollLayer",CompositeLayers:"CompositeLayers",ScheduleStyleInvalidationTracking:"ScheduleStyleInvalidationTracking",StyleRecalcInvalidationTracking:"StyleRecalcInvalidationTracking",StyleInvalidatorInvalidationTracking:"StyleInvalidatorInvalidationTracking",LayoutInvalidationTracking:"LayoutInvalidationTracking",LayerInvalidationTracking:"LayerInvalidationTracking",PaintInvalidationTracking:"PaintInvalidationTracking",ScrollInvalidationTracking:"ScrollInvalidationTracking",ParseHTML:"ParseHTML",ParseAuthorStyleSheet:"ParseAuthorStyleSheet",TimerInstall:"TimerInstall",TimerRemove:"TimerRemove",TimerFire:"TimerFire",XHRReadyStateChange:"XHRReadyStateChange",XHRLoad:"XHRLoad",CompileScript:"v8.compile",EvaluateScript:"EvaluateScript",CommitLoad:"CommitLoad",MarkLoad:"MarkLoad",MarkDOMContent:"MarkDOMContent",MarkFirstPaint:"MarkFirstPaint",TimeStamp:"TimeStamp",ConsoleTime:"ConsoleTime",UserTiming:"UserTiming",ResourceSendRequest:"ResourceSendRequest",ResourceReceiveResponse:"ResourceReceiveResponse",ResourceReceivedData:"ResourceReceivedData",ResourceFinish:"ResourceFinish",FunctionCall:"FunctionCall",GCEvent:"GCEvent",MajorGC:"MajorGC",MinorGC:"MinorGC",JSFrame:"JSFrame",JSSample:"JSSample",V8Sample:"V8Sample",JitCodeAdded:"JitCodeAdded",JitCodeMoved:"JitCodeMoved",ParseScriptOnBackground:"v8.parseOnBackground",UpdateCounters:"UpdateCounters",RequestAnimationFrame:"RequestAnimationFrame",CancelAnimationFrame:"CancelAnimationFrame",FireAnimationFrame:"FireAnimationFrame",RequestIdleCallback:"RequestIdleCallback",CancelIdleCallback:"CancelIdleCallback",FireIdleCallback:"FireIdleCallback",WebSocketCreate:"WebSocketCreate",WebSocketSendHandshakeRequest:"WebSocketSendHandshakeRequest",WebSocketReceiveHandshakeResponse:"WebSocketReceiveHandshakeResponse",WebSocketDestroy:"WebSocketDestroy",EmbedderCallback:"EmbedderCallback",SetLayerTreeId:"SetLayerTreeId",TracingStartedInPage:"TracingStartedInPage",TracingSessionIdForWorker:"TracingSessionIdForWorker",DecodeImage:"Decode Image",ResizeImage:"Resize Image",DrawLazyPixelRef:"Draw LazyPixelRef",DecodeLazyPixelRef:"Decode LazyPixelRef",LazyPixelRef:"LazyPixelRef",LayerTreeHostImplSnapshot:"cc::LayerTreeHostImpl",PictureSnapshot:"cc::Picture",DisplayItemListSnapshot:"cc::DisplayItemList",LatencyInfo:"LatencyInfo",LatencyInfoFlow:"LatencyInfo.Flow",InputLatencyMouseMove:"InputLatency::MouseMove",InputLatencyMouseWheel:"InputLatency::MouseWheel",ImplSideFling:"InputHandlerProxy::HandleGestureFling::started",GCIdleLazySweep:"ThreadState::performIdleLazySweep",GCCompleteSweep:"ThreadState::completeSweep",GCCollectGarbage:"BlinkGCMarking",CpuProfile:"CpuProfile"}
WebInspector.TimelineModel.Category={Console:"blink.console",UserTiming:"blink.user_timing",LatencyInfo:"latencyInfo"};WebInspector.TimelineModel.WarningType={ForcedStyle:"ForcedStyle",ForcedLayout:"ForcedLayout",IdleDeadlineExceeded:"IdleDeadlineExceeded",V8Deopt:"V8Deopt"}
WebInspector.TimelineModel.MainThreadName="main";WebInspector.TimelineModel.WorkerThreadName="DedicatedWorker Thread";WebInspector.TimelineModel.RendererMainThreadName="CrRendererMain";WebInspector.TimelineModel.AsyncEventGroup={animation:Symbol("animation"),console:Symbol("console"),userTiming:Symbol("userTiming"),input:Symbol("input")};WebInspector.TimelineModel.forEachEvent=function(events,onStartEvent,onEndEvent,onInstantEvent,startTime,endTime)
{startTime=startTime||0;endTime=endTime||Infinity;var stack=[];for(var i=0;i<events.length;++i){var e=events[i];if((e.endTime||e.startTime)<startTime)
continue;if(e.startTime>=endTime)
break;if(WebInspector.TracingModel.isAsyncPhase(e.phase)||WebInspector.TracingModel.isFlowPhase(e.phase))
continue;while(stack.length&&stack.peekLast().endTime<=e.startTime)
onEndEvent(stack.pop());if(e.duration){onStartEvent(e);stack.push(e);}else{onInstantEvent&&onInstantEvent(e,stack.peekLast()||null);}}
while(stack.length)
onEndEvent(stack.pop());}
WebInspector.TimelineModel.DevToolsMetadataEvent={TracingStartedInBrowser:"TracingStartedInBrowser",TracingStartedInPage:"TracingStartedInPage",TracingSessionIdForWorker:"TracingSessionIdForWorker",};WebInspector.TimelineModel.VirtualThread=function(name)
{this.name=name;this.events=[];this.asyncEventsByGroup=new Map();}
WebInspector.TimelineModel.VirtualThread.prototype={isWorker:function()
{return this.name===WebInspector.TimelineModel.WorkerThreadName;}}
WebInspector.TimelineModel.Record=function(traceEvent)
{this._event=traceEvent;this._children=[];}
WebInspector.TimelineModel.Record._compareStartTime=function(a,b)
{return a.startTime()<=b.startTime()?-1:1;}
WebInspector.TimelineModel.Record.prototype={target:function()
{var threadName=this._event.thread.name();return threadName===WebInspector.TimelineModel.RendererMainThreadName?WebInspector.targetManager.targets()[0]||null:null;},children:function()
{return this._children;},startTime:function()
{return this._event.startTime;},endTime:function()
{return this._event.endTime||this._event.startTime;},thread:function()
{if(this._event.thread.name()===WebInspector.TimelineModel.RendererMainThreadName)
return WebInspector.TimelineModel.MainThreadName;return this._event.thread.name();},type:function()
{return WebInspector.TimelineModel._eventType(this._event);},getUserObject:function(key)
{if(key==="TimelineUIUtils::preview-element")
return this._event.previewElement;throw new Error("Unexpected key: "+key);},setUserObject:function(key,value)
{if(key!=="TimelineUIUtils::preview-element")
throw new Error("Unexpected key: "+key);this._event.previewElement=(value);},traceEvent:function()
{return this._event;},_addChild:function(child)
{this._children.push(child);child.parent=this;}}
WebInspector.TimelineModel.MetadataEvents;WebInspector.TimelineModel._eventType=function(event)
{if(event.hasCategory(WebInspector.TimelineModel.Category.Console))
return WebInspector.TimelineModel.RecordType.ConsoleTime;if(event.hasCategory(WebInspector.TimelineModel.Category.UserTiming))
return WebInspector.TimelineModel.RecordType.UserTiming;if(event.hasCategory(WebInspector.TimelineModel.Category.LatencyInfo))
return WebInspector.TimelineModel.RecordType.LatencyInfo;return(event.name);}
WebInspector.TimelineModel.prototype={forAllRecords:function(preOrderCallback,postOrderCallback)
{function processRecords(records,depth)
{for(var i=0;i<records.length;++i){var record=records[i];if(preOrderCallback&&preOrderCallback(record,depth))
return true;if(processRecords(record.children(),depth+1))
return true;if(postOrderCallback&&postOrderCallback(record,depth))
return true;}
return false;}
return processRecords(this._records,0);},forAllFilteredRecords:function(filters,callback)
{function processRecord(record,depth)
{var visible=WebInspector.TimelineModel.isVisible(filters,record.traceEvent());if(visible&&callback(record,depth))
return true;for(var i=0;i<record.children().length;++i){if(processRecord.call(this,record.children()[i],visible?depth+1:depth))
return true;}
return false;}
for(var i=0;i<this._records.length;++i)
processRecord.call(this,this._records[i],0);},records:function()
{return this._records;},cpuProfiles:function()
{return this._cpuProfiles;},sessionId:function()
{return this._sessionId;},target:function()
{return WebInspector.targetManager.targets()[0];},setEvents:function(tracingModel,produceTraceStartedInPage)
{this.reset();this._resetProcessingState();this._minimumRecordTime=tracingModel.minimumRecordTime();this._maximumRecordTime=tracingModel.maximumRecordTime();var metadataEvents=this._processMetadataEvents(tracingModel,!!produceTraceStartedInPage);var startTime=0;for(var i=0,length=metadataEvents.page.length;i<length;i++){var metaEvent=metadataEvents.page[i];var process=metaEvent.thread.process();var endTime=i+1<length?metadataEvents.page[i+1].startTime:Infinity;this._currentPage=metaEvent.args["data"]&&metaEvent.args["data"]["page"];for(var thread of process.sortedThreads()){if(thread.name()===WebInspector.TimelineModel.WorkerThreadName&&!metadataEvents.workers.some(function(e){return e.args["data"]["workerThreadId"]===thread.id();}))
continue;this._processThreadEvents(startTime,endTime,metaEvent.thread,thread);}
startTime=endTime;}
this._inspectedTargetEvents.sort(WebInspector.TracingModel.Event.compareStartTime);this._processBrowserEvents(tracingModel);this._buildTimelineRecords();this._buildGPUEvents(tracingModel);this._insertFirstPaintEvent();this._resetProcessingState();},_processMetadataEvents:function(tracingModel,produceTraceStartedInPage)
{var metadataEvents=tracingModel.devToolsMetadataEvents();var pageDevToolsMetadataEvents=[];var workersDevToolsMetadataEvents=[];for(var event of metadataEvents){if(event.name===WebInspector.TimelineModel.DevToolsMetadataEvent.TracingStartedInPage){pageDevToolsMetadataEvents.push(event);}else if(event.name===WebInspector.TimelineModel.DevToolsMetadataEvent.TracingSessionIdForWorker){workersDevToolsMetadataEvents.push(event);}else if(event.name===WebInspector.TimelineModel.DevToolsMetadataEvent.TracingStartedInBrowser){console.assert(!this._mainFrameNodeId,"Multiple sessions in trace");this._mainFrameNodeId=event.args["frameTreeNodeId"];}}
if(!pageDevToolsMetadataEvents.length){var pageMetaEvent=produceTraceStartedInPage?this._makeMockPageMetadataEvent(tracingModel):null;if(!pageMetaEvent){console.error(WebInspector.TimelineModel.DevToolsMetadataEvent.TracingStartedInPage+" event not found.");return{page:[],workers:[]};}
pageDevToolsMetadataEvents.push(pageMetaEvent);}
var sessionId=pageDevToolsMetadataEvents[0].args["sessionId"]||pageDevToolsMetadataEvents[0].args["data"]["sessionId"];this._sessionId=sessionId;var mismatchingIds=new Set();function checkSessionId(event)
{var args=event.args;if(args["data"])
args=args["data"];var id=args["sessionId"];if(id===sessionId)
return true;mismatchingIds.add(id);return false;}
var result={page:pageDevToolsMetadataEvents.filter(checkSessionId).sort(WebInspector.TracingModel.Event.compareStartTime),workers:workersDevToolsMetadataEvents.filter(checkSessionId).sort(WebInspector.TracingModel.Event.compareStartTime)};if(mismatchingIds.size)
WebInspector.console.error("Timeline recording was started in more than one page simultaneously. Session id mismatch: "+this._sessionId+" and "+mismatchingIds.valuesArray()+".");return result;},_makeMockPageMetadataEvent:function(tracingModel)
{var rendererMainThreadName=WebInspector.TimelineModel.RendererMainThreadName;var process=Object.values(tracingModel.sortedProcesses()).filter(function(p){return p.threadByName(rendererMainThreadName);})[0];var thread=process&&process.threadByName(rendererMainThreadName);if(!thread)
return null;var pageMetaEvent=new WebInspector.TracingModel.Event(WebInspector.TracingModel.DevToolsMetadataEventCategory,WebInspector.TimelineModel.DevToolsMetadataEvent.TracingStartedInPage,WebInspector.TracingModel.Phase.Metadata,tracingModel.minimumRecordTime(),thread);pageMetaEvent.addArgs({"data":{"sessionId":"mockSessionId"}});return pageMetaEvent;},_insertFirstPaintEvent:function()
{if(!this._firstCompositeLayers)
return;var recordTypes=WebInspector.TimelineModel.RecordType;var i=this._inspectedTargetEvents.lowerBound(this._firstCompositeLayers,WebInspector.TracingModel.Event.compareStartTime);for(;i<this._inspectedTargetEvents.length&&this._inspectedTargetEvents[i].name!==recordTypes.DrawFrame;++i){}
if(i>=this._inspectedTargetEvents.length)
return;var drawFrameEvent=this._inspectedTargetEvents[i];var firstPaintEvent=new WebInspector.TracingModel.Event(drawFrameEvent.categoriesString,recordTypes.MarkFirstPaint,WebInspector.TracingModel.Phase.Instant,drawFrameEvent.startTime,drawFrameEvent.thread);this._mainThreadEvents.splice(this._mainThreadEvents.lowerBound(firstPaintEvent,WebInspector.TracingModel.Event.compareStartTime),0,firstPaintEvent);var firstPaintRecord=new WebInspector.TimelineModel.Record(firstPaintEvent);this._eventDividerRecords.splice(this._eventDividerRecords.lowerBound(firstPaintRecord,WebInspector.TimelineModel.Record._compareStartTime),0,firstPaintRecord);},_processBrowserEvents:function(tracingModel)
{var browserMain=tracingModel.threadByName("Browser","CrBrowserMain");if(!browserMain)
return;browserMain.events().forEach(this._processBrowserEvent,this);var asyncEventsByGroup=new Map();this._processAsyncEvents(asyncEventsByGroup,browserMain.asyncEvents());this._mergeAsyncEvents(this._mainThreadAsyncEventsByGroup,asyncEventsByGroup);},_buildTimelineRecords:function()
{var topLevelRecords=this._buildTimelineRecordsForThread(this.mainThreadEvents());for(var i=0;i<topLevelRecords.length;i++){var record=topLevelRecords[i];if(WebInspector.TracingModel.isTopLevelEvent(record.traceEvent()))
this._mainThreadTasks.push(record);}
function processVirtualThreadEvents(virtualThread)
{var threadRecords=this._buildTimelineRecordsForThread(virtualThread.events);topLevelRecords=topLevelRecords.mergeOrdered(threadRecords,WebInspector.TimelineModel.Record._compareStartTime);}
this.virtualThreads().forEach(processVirtualThreadEvents.bind(this));this._records=topLevelRecords;},_buildGPUEvents:function(tracingModel)
{var thread=tracingModel.threadByName("GPU Process","CrGpuMain");if(!thread)
return;var gpuEventName=WebInspector.TimelineModel.RecordType.GPUTask;this._gpuEvents=thread.events().filter(event=>event.name===gpuEventName);},_buildTimelineRecordsForThread:function(threadEvents)
{var recordStack=[];var topLevelRecords=[];for(var i=0,size=threadEvents.length;i<size;++i){var event=threadEvents[i];for(var top=recordStack.peekLast();top&&top._event.endTime<=event.startTime;top=recordStack.peekLast())
recordStack.pop();if(event.phase===WebInspector.TracingModel.Phase.AsyncEnd||event.phase===WebInspector.TracingModel.Phase.NestableAsyncEnd)
continue;var parentRecord=recordStack.peekLast();if(WebInspector.TracingModel.isAsyncBeginPhase(event.phase)&&parentRecord&&event.endTime>parentRecord._event.endTime)
continue;var record=new WebInspector.TimelineModel.Record(event);if(WebInspector.TimelineModel.isMarkerEvent(event))
this._eventDividerRecords.push(record);if(!this._eventFilter.accept(event)&&!WebInspector.TracingModel.isTopLevelEvent(event))
continue;if(parentRecord)
parentRecord._addChild(record);else
topLevelRecords.push(record);if(event.endTime)
recordStack.push(record);}
return topLevelRecords;},_resetProcessingState:function()
{this._asyncEventTracker=new WebInspector.TimelineAsyncEventTracker();this._invalidationTracker=new WebInspector.InvalidationTracker();this._layoutInvalidate={};this._lastScheduleStyleRecalculation={};this._paintImageEventByPixelRefId={};this._lastPaintForLayer={};this._lastRecalculateStylesEvent=null;this._currentScriptEvent=null;this._eventStack=[];this._hadCommitLoad=false;this._firstCompositeLayers=null;this._knownInputEvents=new Set();this._currentPage=null;},_processThreadEvents:function(startTime,endTime,mainThread,thread)
{var events=thread.events();var asyncEvents=thread.asyncEvents();var jsSamples;if(Runtime.experiments.isEnabled("timelineTracingJSProfile")){jsSamples=WebInspector.TimelineJSProfileProcessor.processRawV8Samples(events);}else{var cpuProfileEvent=events.peekLast();if(cpuProfileEvent&&cpuProfileEvent.name===WebInspector.TimelineModel.RecordType.CpuProfile){var cpuProfile=cpuProfileEvent.args["data"]["cpuProfile"];if(cpuProfile){var jsProfileModel=new WebInspector.CPUProfileDataModel(cpuProfile);this._cpuProfiles.push(jsProfileModel);jsSamples=WebInspector.TimelineJSProfileProcessor.generateTracingEventsFromCpuProfile(jsProfileModel,thread);}}}
if(jsSamples&&jsSamples.length)
events=events.mergeOrdered(jsSamples,WebInspector.TracingModel.Event.orderedCompareStartTime);if(jsSamples||events.some(function(e){return e.name===WebInspector.TimelineModel.RecordType.JSSample;})){var jsFrameEvents=WebInspector.TimelineJSProfileProcessor.generateJSFrameEvents(events);if(jsFrameEvents&&jsFrameEvents.length)
events=jsFrameEvents.mergeOrdered(events,WebInspector.TracingModel.Event.orderedCompareStartTime);}
var threadEvents;var threadAsyncEventsByGroup;if(thread===mainThread){threadEvents=this._mainThreadEvents;threadAsyncEventsByGroup=this._mainThreadAsyncEventsByGroup;}else{var virtualThread=new WebInspector.TimelineModel.VirtualThread(thread.name());this._virtualThreads.push(virtualThread);threadEvents=virtualThread.events;threadAsyncEventsByGroup=virtualThread.asyncEventsByGroup;}
this._eventStack=[];var i=events.lowerBound(startTime,function(time,event){return time-event.startTime});var length=events.length;for(;i<length;i++){var event=events[i];if(endTime&&event.startTime>=endTime)
break;if(!this._processEvent(event))
continue;threadEvents.push(event);this._inspectedTargetEvents.push(event);}
this._processAsyncEvents(threadAsyncEventsByGroup,asyncEvents,startTime,endTime);if(thread.name()==="Compositor"){this._mergeAsyncEvents(this._mainThreadAsyncEventsByGroup,threadAsyncEventsByGroup);threadAsyncEventsByGroup.clear();}},_processAsyncEvents:function(asyncEventsByGroup,asyncEvents,startTime,endTime)
{var i=startTime?asyncEvents.lowerBound(startTime,function(time,asyncEvent){return time-asyncEvent.startTime}):0;for(;i<asyncEvents.length;++i){var asyncEvent=asyncEvents[i];if(endTime&&asyncEvent.startTime>=endTime)
break;var asyncGroup=this._processAsyncEvent(asyncEvent);if(!asyncGroup)
continue;var groupAsyncEvents=asyncEventsByGroup.get(asyncGroup);if(!groupAsyncEvents){groupAsyncEvents=[];asyncEventsByGroup.set(asyncGroup,groupAsyncEvents);}
groupAsyncEvents.push(asyncEvent);}},_processEvent:function(event)
{var eventStack=this._eventStack;while(eventStack.length&&eventStack.peekLast().endTime<=event.startTime)
eventStack.pop();var recordTypes=WebInspector.TimelineModel.RecordType;if(this._currentScriptEvent&&event.startTime>this._currentScriptEvent.endTime)
this._currentScriptEvent=null;var eventData=event.args["data"]||event.args["beginData"]||{};if(eventData&&eventData["stackTrace"])
event.stackTrace=eventData["stackTrace"];if(eventStack.length&&eventStack.peekLast().name===recordTypes.EventDispatch)
eventStack.peekLast().hasChildren=true;this._asyncEventTracker.processEvent(event);if(event.initiator&&event.initiator.url)
event.url=event.initiator.url;switch(event.name){case recordTypes.ResourceSendRequest:case recordTypes.WebSocketCreate:event.url=event.args["data"]["url"];event.initiator=eventStack.peekLast()||null;break;case recordTypes.ScheduleStyleRecalculation:this._lastScheduleStyleRecalculation[event.args["data"]["frame"]]=event;break;case recordTypes.UpdateLayoutTree:case recordTypes.RecalculateStyles:this._invalidationTracker.didRecalcStyle(event);if(event.args["beginData"])
event.initiator=this._lastScheduleStyleRecalculation[event.args["beginData"]["frame"]];this._lastRecalculateStylesEvent=event;if(this._currentScriptEvent)
event.warning=WebInspector.TimelineModel.WarningType.ForcedStyle;break;case recordTypes.ScheduleStyleInvalidationTracking:case recordTypes.StyleRecalcInvalidationTracking:case recordTypes.StyleInvalidatorInvalidationTracking:case recordTypes.LayoutInvalidationTracking:case recordTypes.LayerInvalidationTracking:case recordTypes.PaintInvalidationTracking:case recordTypes.ScrollInvalidationTracking:this._invalidationTracker.addInvalidation(new WebInspector.InvalidationTrackingEvent(event));break;case recordTypes.InvalidateLayout:var layoutInitator=event;var frameId=event.args["data"]["frame"];if(!this._layoutInvalidate[frameId]&&this._lastRecalculateStylesEvent&&this._lastRecalculateStylesEvent.endTime>event.startTime)
layoutInitator=this._lastRecalculateStylesEvent.initiator;this._layoutInvalidate[frameId]=layoutInitator;break;case recordTypes.Layout:this._invalidationTracker.didLayout(event);var frameId=event.args["beginData"]["frame"];event.initiator=this._layoutInvalidate[frameId];if(event.args["endData"]){event.backendNodeId=event.args["endData"]["rootNode"];event.highlightQuad=event.args["endData"]["root"];}
this._layoutInvalidate[frameId]=null;if(this._currentScriptEvent)
event.warning=WebInspector.TimelineModel.WarningType.ForcedLayout;break;case recordTypes.EvaluateScript:case recordTypes.FunctionCall:if(!this._currentScriptEvent)
this._currentScriptEvent=event;break;case recordTypes.SetLayerTreeId:this._inspectedTargetLayerTreeId=event.args["layerTreeId"]||event.args["data"]["layerTreeId"];break;case recordTypes.Paint:this._invalidationTracker.didPaint(event);event.highlightQuad=event.args["data"]["clip"];event.backendNodeId=event.args["data"]["nodeId"];if(!event.args["data"]["layerId"])
break;var layerId=event.args["data"]["layerId"];this._lastPaintForLayer[layerId]=event;break;case recordTypes.DisplayItemListSnapshot:case recordTypes.PictureSnapshot:var layerUpdateEvent=this._findAncestorEvent(recordTypes.UpdateLayer);if(!layerUpdateEvent||layerUpdateEvent.args["layerTreeId"]!==this._inspectedTargetLayerTreeId)
break;var paintEvent=this._lastPaintForLayer[layerUpdateEvent.args["layerId"]];if(paintEvent)
paintEvent.picture=event;break;case recordTypes.ScrollLayer:event.backendNodeId=event.args["data"]["nodeId"];break;case recordTypes.PaintImage:event.backendNodeId=event.args["data"]["nodeId"];event.url=event.args["data"]["url"];break;case recordTypes.DecodeImage:case recordTypes.ResizeImage:var paintImageEvent=this._findAncestorEvent(recordTypes.PaintImage);if(!paintImageEvent){var decodeLazyPixelRefEvent=this._findAncestorEvent(recordTypes.DecodeLazyPixelRef);paintImageEvent=decodeLazyPixelRefEvent&&this._paintImageEventByPixelRefId[decodeLazyPixelRefEvent.args["LazyPixelRef"]];}
if(!paintImageEvent)
break;event.backendNodeId=paintImageEvent.backendNodeId;event.url=paintImageEvent.url;break;case recordTypes.DrawLazyPixelRef:var paintImageEvent=this._findAncestorEvent(recordTypes.PaintImage);if(!paintImageEvent)
break;this._paintImageEventByPixelRefId[event.args["LazyPixelRef"]]=paintImageEvent;event.backendNodeId=paintImageEvent.backendNodeId;event.url=paintImageEvent.url;break;case recordTypes.MarkDOMContent:case recordTypes.MarkLoad:var page=eventData["page"];if(page&&page!==this._currentPage)
return false;break;case recordTypes.CommitLoad:var page=eventData["page"];if(page&&page!==this._currentPage)
return false;if(!eventData["isMainFrame"])
break;this._hadCommitLoad=true;this._firstCompositeLayers=null;break;case recordTypes.CompositeLayers:if(!this._firstCompositeLayers&&this._hadCommitLoad)
this._firstCompositeLayers=event;break;case recordTypes.FireIdleCallback:if(event.duration>eventData["allottedMilliseconds"]){event.warning=WebInspector.TimelineModel.WarningType.IdleDeadlineExceeded;}
break;}
if(WebInspector.TracingModel.isAsyncPhase(event.phase))
return true;var duration=event.duration;if(!duration)
return true;if(eventStack.length){var parent=eventStack.peekLast();parent.selfTime-=duration;if(parent.selfTime<0){var epsilon=1e-3;if(parent.selfTime<-epsilon)
console.error("Children are longer than parent at "+event.startTime+" ("+(event.startTime-this.minimumRecordTime()).toFixed(3)+") by "+parent.selfTime.toFixed(3));parent.selfTime=0;}}
event.selfTime=duration;eventStack.push(event);return true;},_processBrowserEvent:function(event)
{if(event.name!==WebInspector.TimelineModel.RecordType.LatencyInfoFlow)
return;var frameId=event.args["frameTreeNodeId"];if(typeof frameId==="number"&&frameId===this._mainFrameNodeId)
this._knownInputEvents.add(event.bind_id);},_processAsyncEvent:function(asyncEvent)
{var groups=WebInspector.TimelineModel.AsyncEventGroup;if(asyncEvent.hasCategory(WebInspector.TimelineModel.Category.Console))
return groups.console;if(asyncEvent.hasCategory(WebInspector.TimelineModel.Category.UserTiming))
return groups.userTiming;if(asyncEvent.name===WebInspector.TimelineModel.RecordType.Animation)
return groups.animation;if(asyncEvent.hasCategory(WebInspector.TimelineModel.Category.LatencyInfo)||asyncEvent.name===WebInspector.TimelineModel.RecordType.ImplSideFling){var lastStep=asyncEvent.steps.peekLast();if(lastStep.phase!==WebInspector.TracingModel.Phase.AsyncEnd)
return null;var data=lastStep.args["data"];asyncEvent.causedFrame=!!(data&&data["INPUT_EVENT_LATENCY_RENDERER_SWAP_COMPONENT"]);if(asyncEvent.hasCategory(WebInspector.TimelineModel.Category.LatencyInfo)){if(!this._knownInputEvents.has(lastStep.id))
return null;if(asyncEvent.name===WebInspector.TimelineModel.RecordType.InputLatencyMouseMove&&!asyncEvent.causedFrame)
return null;var rendererMain=data["INPUT_EVENT_LATENCY_RENDERER_MAIN_COMPONENT"];if(rendererMain){var time=rendererMain["time"]/1000;asyncEvent.steps[0].timeWaitingForMainThread=time-asyncEvent.steps[0].startTime;}}
return groups.input;}
return null;},_findAncestorEvent:function(name)
{for(var i=this._eventStack.length-1;i>=0;--i){var event=this._eventStack[i];if(event.name===name)
return event;}
return null;},_mergeAsyncEvents:function(target,source)
{for(var group of source.keys()){var events=target.get(group)||[];events=events.mergeOrdered(source.get(group)||[],WebInspector.TracingModel.Event.compareStartAndEndTime);target.set(group,events);}},reset:function()
{this._virtualThreads=[];this._mainThreadEvents=[];this._mainThreadAsyncEventsByGroup=new Map();this._inspectedTargetEvents=[];this._records=[];this._mainThreadTasks=[];this._gpuEvents=[];this._eventDividerRecords=[];this._sessionId=null;this._mainFrameNodeId=null;this._cpuProfiles=[];this._minimumRecordTime=0;this._maximumRecordTime=0;},minimumRecordTime:function()
{return this._minimumRecordTime;},maximumRecordTime:function()
{return this._maximumRecordTime;},inspectedTargetEvents:function()
{return this._inspectedTargetEvents;},mainThreadEvents:function()
{return this._mainThreadEvents;},_setMainThreadEvents:function(events)
{this._mainThreadEvents=events;},mainThreadAsyncEvents:function()
{return this._mainThreadAsyncEventsByGroup;},virtualThreads:function()
{return this._virtualThreads;},isEmpty:function()
{return this.minimumRecordTime()===0&&this.maximumRecordTime()===0;},mainThreadTasks:function()
{return this._mainThreadTasks;},gpuEvents:function()
{return this._gpuEvents;},eventDividerRecords:function()
{return this._eventDividerRecords;},networkRequests:function()
{var requests=new Map();var requestsList=[];var zeroStartRequestsList=[];var types=WebInspector.TimelineModel.RecordType;var resourceTypes=new Set([types.ResourceSendRequest,types.ResourceReceiveResponse,types.ResourceReceivedData,types.ResourceFinish]);var events=this.mainThreadEvents();for(var i=0;i<events.length;++i){var e=events[i];if(!resourceTypes.has(e.name))
continue;var id=e.args["data"]["requestId"];var request=requests.get(id);if(request){request.addEvent(e);}else{request=new WebInspector.TimelineModel.NetworkRequest(e);requests.set(id,request);if(request.startTime)
requestsList.push(request);else
zeroStartRequestsList.push(request);}}
return zeroStartRequestsList.concat(requestsList);},}
WebInspector.TimelineModel.isVisible=function(filters,event)
{for(var i=0;i<filters.length;++i){if(!filters[i].accept(event))
return false;}
return true;}
WebInspector.TimelineModel.isMarkerEvent=function(event)
{var recordTypes=WebInspector.TimelineModel.RecordType;switch(event.name){case recordTypes.TimeStamp:case recordTypes.MarkFirstPaint:return true;case recordTypes.MarkDOMContent:case recordTypes.MarkLoad:return event.args["data"]["isMainFrame"];default:return false;}}
WebInspector.TimelineModel.NetworkRequest=function(event)
{this.startTime=event.name===WebInspector.TimelineModel.RecordType.ResourceSendRequest?event.startTime:0;this.endTime=Infinity;this.children=[];this.addEvent(event);}
WebInspector.TimelineModel.NetworkRequest.prototype={addEvent:function(event)
{this.children.push(event);var recordType=WebInspector.TimelineModel.RecordType;this.startTime=Math.min(this.startTime,event.startTime);var eventData=event.args["data"];if(eventData["mimeType"])
this.mimeType=eventData["mimeType"];if("priority"in eventData)
this.priority=eventData["priority"];if(event.name===recordType.ResourceFinish)
this.endTime=event.startTime;if(!this.responseTime&&(event.name===recordType.ResourceReceiveResponse||event.name===recordType.ResourceReceivedData))
this.responseTime=event.startTime;if(!this.url)
this.url=eventData["url"];if(!this.requestMethod)
this.requestMethod=eventData["requestMethod"];}}
WebInspector.TimelineModel.Filter=function()
{}
WebInspector.TimelineModel.Filter.prototype={accept:function(event)
{return true;}}
WebInspector.TimelineVisibleEventsFilter=function(visibleTypes)
{WebInspector.TimelineModel.Filter.call(this);this._visibleTypes=new Set(visibleTypes);}
WebInspector.TimelineVisibleEventsFilter.prototype={accept:function(event)
{return this._visibleTypes.has(WebInspector.TimelineModel._eventType(event));},__proto__:WebInspector.TimelineModel.Filter.prototype}
WebInspector.ExclusiveNameFilter=function(excludeNames)
{WebInspector.TimelineModel.Filter.call(this);this._excludeNames=new Set(excludeNames);}
WebInspector.ExclusiveNameFilter.prototype={accept:function(event)
{return!this._excludeNames.has(event.name);},__proto__:WebInspector.TimelineModel.Filter.prototype}
WebInspector.ExcludeTopLevelFilter=function()
{WebInspector.TimelineModel.Filter.call(this);}
WebInspector.ExcludeTopLevelFilter.prototype={accept:function(event)
{return!WebInspector.TracingModel.isTopLevelEvent(event);},__proto__:WebInspector.TimelineModel.Filter.prototype}
WebInspector.InvalidationTrackingEvent=function(event)
{this.type=event.name;this.startTime=event.startTime;this._tracingEvent=event;var eventData=event.args["data"];this.frame=eventData["frame"];this.nodeId=eventData["nodeId"];this.nodeName=eventData["nodeName"];this.paintId=eventData["paintId"];this.invalidationSet=eventData["invalidationSet"];this.invalidatedSelectorId=eventData["invalidatedSelectorId"];this.changedId=eventData["changedId"];this.changedClass=eventData["changedClass"];this.changedAttribute=eventData["changedAttribute"];this.changedPseudo=eventData["changedPseudo"];this.selectorPart=eventData["selectorPart"];this.extraData=eventData["extraData"];this.invalidationList=eventData["invalidationList"];this.cause={reason:eventData["reason"],stackTrace:eventData["stackTrace"]};if(!this.cause.reason&&this.cause.stackTrace&&this.type===WebInspector.TimelineModel.RecordType.LayoutInvalidationTracking)
this.cause.reason="Layout forced";}
WebInspector.InvalidationCause;WebInspector.InvalidationTracker=function()
{this._initializePerFrameState();}
WebInspector.InvalidationTracker.prototype={addInvalidation:function(invalidation)
{this._startNewFrameIfNeeded();if(!invalidation.nodeId&&!invalidation.paintId){console.error("Invalidation lacks node information.");console.error(invalidation);return;}
var recordTypes=WebInspector.TimelineModel.RecordType;if(invalidation.type===recordTypes.PaintInvalidationTracking&&invalidation.nodeId){var invalidations=this._invalidationsByNodeId[invalidation.nodeId]||[];for(var i=0;i<invalidations.length;++i)
invalidations[i].paintId=invalidation.paintId;return;}
if(invalidation.type===recordTypes.StyleRecalcInvalidationTracking&&invalidation.cause.reason==="StyleInvalidator")
return;var styleRecalcInvalidation=(invalidation.type===recordTypes.ScheduleStyleInvalidationTracking||invalidation.type===recordTypes.StyleInvalidatorInvalidationTracking||invalidation.type===recordTypes.StyleRecalcInvalidationTracking);if(styleRecalcInvalidation){var duringRecalcStyle=invalidation.startTime&&this._lastRecalcStyle&&invalidation.startTime>=this._lastRecalcStyle.startTime&&invalidation.startTime<=this._lastRecalcStyle.endTime;if(duringRecalcStyle)
this._associateWithLastRecalcStyleEvent(invalidation);}
if(this._invalidations[invalidation.type])
this._invalidations[invalidation.type].push(invalidation);else
this._invalidations[invalidation.type]=[invalidation];if(invalidation.nodeId){if(this._invalidationsByNodeId[invalidation.nodeId])
this._invalidationsByNodeId[invalidation.nodeId].push(invalidation);else
this._invalidationsByNodeId[invalidation.nodeId]=[invalidation];}},didRecalcStyle:function(recalcStyleEvent)
{this._lastRecalcStyle=recalcStyleEvent;var types=[WebInspector.TimelineModel.RecordType.ScheduleStyleInvalidationTracking,WebInspector.TimelineModel.RecordType.StyleInvalidatorInvalidationTracking,WebInspector.TimelineModel.RecordType.StyleRecalcInvalidationTracking];for(var invalidation of this._invalidationsOfTypes(types))
this._associateWithLastRecalcStyleEvent(invalidation);},_associateWithLastRecalcStyleEvent:function(invalidation)
{if(invalidation.linkedRecalcStyleEvent)
return;var recordTypes=WebInspector.TimelineModel.RecordType;var recalcStyleFrameId=this._lastRecalcStyle.args["beginData"]["frame"];if(invalidation.type===recordTypes.StyleInvalidatorInvalidationTracking){this._addSyntheticStyleRecalcInvalidations(this._lastRecalcStyle,recalcStyleFrameId,invalidation);}else if(invalidation.type===recordTypes.ScheduleStyleInvalidationTracking){}else{this._addInvalidationToEvent(this._lastRecalcStyle,recalcStyleFrameId,invalidation);}
invalidation.linkedRecalcStyleEvent=true;},_addSyntheticStyleRecalcInvalidations:function(event,frameId,styleInvalidatorInvalidation)
{if(!styleInvalidatorInvalidation.invalidationList){this._addSyntheticStyleRecalcInvalidation(styleInvalidatorInvalidation._tracingEvent,styleInvalidatorInvalidation);return;}
if(!styleInvalidatorInvalidation.nodeId){console.error("Invalidation lacks node information.");console.error(invalidation);return;}
for(var i=0;i<styleInvalidatorInvalidation.invalidationList.length;i++){var setId=styleInvalidatorInvalidation.invalidationList[i]["id"];var lastScheduleStyleRecalculation;var nodeInvalidations=this._invalidationsByNodeId[styleInvalidatorInvalidation.nodeId]||[];for(var j=0;j<nodeInvalidations.length;j++){var invalidation=nodeInvalidations[j];if(invalidation.frame!==frameId||invalidation.invalidationSet!==setId||invalidation.type!==WebInspector.TimelineModel.RecordType.ScheduleStyleInvalidationTracking)
continue;lastScheduleStyleRecalculation=invalidation;}
if(!lastScheduleStyleRecalculation){console.error("Failed to lookup the event that scheduled a style invalidator invalidation.");continue;}
this._addSyntheticStyleRecalcInvalidation(lastScheduleStyleRecalculation._tracingEvent,styleInvalidatorInvalidation);}},_addSyntheticStyleRecalcInvalidation:function(baseEvent,styleInvalidatorInvalidation)
{var invalidation=new WebInspector.InvalidationTrackingEvent(baseEvent);invalidation.type=WebInspector.TimelineModel.RecordType.StyleRecalcInvalidationTracking;invalidation.synthetic=true;if(styleInvalidatorInvalidation.cause.reason)
invalidation.cause.reason=styleInvalidatorInvalidation.cause.reason;if(styleInvalidatorInvalidation.selectorPart)
invalidation.selectorPart=styleInvalidatorInvalidation.selectorPart;this.addInvalidation(invalidation);if(!invalidation.linkedRecalcStyleEvent)
this._associateWithLastRecalcStyleEvent(invalidation);},didLayout:function(layoutEvent)
{var layoutFrameId=layoutEvent.args["beginData"]["frame"];for(var invalidation of this._invalidationsOfTypes([WebInspector.TimelineModel.RecordType.LayoutInvalidationTracking])){if(invalidation.linkedLayoutEvent)
continue;this._addInvalidationToEvent(layoutEvent,layoutFrameId,invalidation);invalidation.linkedLayoutEvent=true;}},didPaint:function(paintEvent)
{this._didPaint=true;var layerId=paintEvent.args["data"]["layerId"];if(layerId)
this._lastPaintWithLayer=paintEvent;if(!this._lastPaintWithLayer){console.error("Failed to find a paint container for a paint event.");return;}
var effectivePaintId=this._lastPaintWithLayer.args["data"]["nodeId"];var paintFrameId=paintEvent.args["data"]["frame"];var types=[WebInspector.TimelineModel.RecordType.StyleRecalcInvalidationTracking,WebInspector.TimelineModel.RecordType.LayoutInvalidationTracking,WebInspector.TimelineModel.RecordType.PaintInvalidationTracking,WebInspector.TimelineModel.RecordType.ScrollInvalidationTracking];for(var invalidation of this._invalidationsOfTypes(types)){if(invalidation.paintId===effectivePaintId)
this._addInvalidationToEvent(paintEvent,paintFrameId,invalidation);}},_addInvalidationToEvent:function(event,eventFrameId,invalidation)
{if(eventFrameId!==invalidation.frame)
return;if(!event.invalidationTrackingEvents)
event.invalidationTrackingEvents=[invalidation];else
event.invalidationTrackingEvents.push(invalidation);},_invalidationsOfTypes:function(types)
{var invalidations=this._invalidations;if(!types)
types=Object.keys(invalidations);function*generator()
{for(var i=0;i<types.length;++i){var invalidationList=invalidations[types[i]]||[];for(var j=0;j<invalidationList.length;++j)
yield invalidationList[j];}}
return generator();},_startNewFrameIfNeeded:function()
{if(!this._didPaint)
return;this._initializePerFrameState();},_initializePerFrameState:function()
{this._invalidations={};this._invalidationsByNodeId={};this._lastRecalcStyle=undefined;this._lastPaintWithLayer=undefined;this._didPaint=false;}}
WebInspector.TimelineAsyncEventTracker=function()
{WebInspector.TimelineAsyncEventTracker._initialize();this._initiatorByType=new Map();for(var initiator of WebInspector.TimelineAsyncEventTracker._asyncEvents.keys())
this._initiatorByType.set(initiator,new Map());}
WebInspector.TimelineAsyncEventTracker._initialize=function()
{if(WebInspector.TimelineAsyncEventTracker._asyncEvents)
return;var events=new Map();var type=WebInspector.TimelineModel.RecordType;events.set(type.TimerInstall,{causes:[type.TimerFire],joinBy:"timerId"});events.set(type.ResourceSendRequest,{causes:[type.ResourceReceiveResponse,type.ResourceReceivedData,type.ResourceFinish],joinBy:"requestId"});events.set(type.RequestAnimationFrame,{causes:[type.FireAnimationFrame],joinBy:"id"});events.set(type.RequestIdleCallback,{causes:[type.FireIdleCallback],joinBy:"id"});events.set(type.WebSocketCreate,{causes:[type.WebSocketSendHandshakeRequest,type.WebSocketReceiveHandshakeResponse,type.WebSocketDestroy],joinBy:"identifier"});WebInspector.TimelineAsyncEventTracker._asyncEvents=events;WebInspector.TimelineAsyncEventTracker._typeToInitiator=new Map();for(var entry of events){var types=entry[1].causes;for(type of types)
WebInspector.TimelineAsyncEventTracker._typeToInitiator.set(type,entry[0]);}}
WebInspector.TimelineAsyncEventTracker.prototype={processEvent:function(event)
{var initiatorType=WebInspector.TimelineAsyncEventTracker._typeToInitiator.get((event.name));var isInitiator=!initiatorType;if(!initiatorType)
initiatorType=(event.name);var initiatorInfo=WebInspector.TimelineAsyncEventTracker._asyncEvents.get(initiatorType);if(!initiatorInfo)
return;var id=event.args["data"][initiatorInfo.joinBy];if(!id)
return;var initiatorMap=this._initiatorByType.get(initiatorType);if(isInitiator)
initiatorMap.set(id,event);else
event.initiator=initiatorMap.get(id)||null;}};WebInspector.TimelineIRModel=function()
{this.reset();}
WebInspector.TimelineIRModel.Phases={Idle:"Idle",Response:"Response",Scroll:"Scroll",Fling:"Fling",Drag:"Drag",Animation:"Animation",Uncategorized:"Uncategorized"};WebInspector.TimelineIRModel.InputEvents={Char:"Char",Click:"GestureClick",ContextMenu:"ContextMenu",FlingCancel:"GestureFlingCancel",FlingStart:"GestureFlingStart",ImplSideFling:WebInspector.TimelineModel.RecordType.ImplSideFling,KeyDown:"KeyDown",KeyDownRaw:"RawKeyDown",KeyUp:"KeyUp",LatencyScrollUpdate:"ScrollUpdate",MouseDown:"MouseDown",MouseMove:"MouseMove",MouseUp:"MouseUp",MouseWheel:"MouseWheel",PinchBegin:"GesturePinchBegin",PinchEnd:"GesturePinchEnd",PinchUpdate:"GesturePinchUpdate",ScrollBegin:"GestureScrollBegin",ScrollEnd:"GestureScrollEnd",ScrollUpdate:"GestureScrollUpdate",ScrollUpdateRenderer:"ScrollUpdate",ShowPress:"GestureShowPress",Tap:"GestureTap",TapCancel:"GestureTapCancel",TapDown:"GestureTapDown",TouchCancel:"TouchCancel",TouchEnd:"TouchEnd",TouchMove:"TouchMove",TouchStart:"TouchStart"};WebInspector.TimelineIRModel._mergeThresholdsMs={animation:1,mouse:40,};WebInspector.TimelineIRModel._eventIRPhase=Symbol("eventIRPhase");WebInspector.TimelineIRModel.phaseForEvent=function(event)
{return event[WebInspector.TimelineIRModel._eventIRPhase];}
WebInspector.TimelineIRModel.prototype={populate:function(inputLatencies,animations)
{var eventTypes=WebInspector.TimelineIRModel.InputEvents;var phases=WebInspector.TimelineIRModel.Phases;this.reset();if(!inputLatencies)
return;this._processInputLatencies(inputLatencies);if(animations)
this._processAnimations(animations);var range=new WebInspector.SegmentedRange();range.appendRange(this._drags);range.appendRange(this._cssAnimations);range.appendRange(this._scrolls);range.appendRange(this._responses);this._segments=range.segments();},_processInputLatencies:function(events)
{var eventTypes=WebInspector.TimelineIRModel.InputEvents;var phases=WebInspector.TimelineIRModel.Phases;var thresholdsMs=WebInspector.TimelineIRModel._mergeThresholdsMs;var scrollStart;var flingStart;var touchStart;var firstTouchMove;var mouseWheel;var mouseDown;var mouseMove;for(var i=0;i<events.length;++i){var event=events[i];if(i>0&&events[i].startTime<events[i-1].startTime)
console.assert(false,"Unordered input events");var type=this._inputEventType(event.name);switch(type){case eventTypes.ScrollBegin:this._scrolls.append(this._segmentForEvent(event,phases.Scroll));scrollStart=event;break;case eventTypes.ScrollEnd:if(scrollStart)
this._scrolls.append(this._segmentForEventRange(scrollStart,event,phases.Scroll));else
this._scrolls.append(this._segmentForEvent(event,phases.Scroll));scrollStart=null;break;case eventTypes.ScrollUpdate:touchStart=null;this._scrolls.append(this._segmentForEvent(event,phases.Scroll));break;case eventTypes.FlingStart:if(flingStart){WebInspector.console.error(WebInspector.UIString("Two flings at the same time? %s vs %s",flingStart.startTime,event.startTime));break;}
flingStart=event;break;case eventTypes.FlingCancel:if(!flingStart)
break;this._scrolls.append(this._segmentForEventRange(flingStart,event,phases.Fling));flingStart=null;break;case eventTypes.ImplSideFling:this._scrolls.append(this._segmentForEvent(event,phases.Fling));break;case eventTypes.ShowPress:case eventTypes.Tap:case eventTypes.KeyDown:case eventTypes.KeyDownRaw:case eventTypes.KeyUp:case eventTypes.Char:case eventTypes.Click:case eventTypes.ContextMenu:this._responses.append(this._segmentForEvent(event,phases.Response));break;case eventTypes.TouchStart:if(touchStart){WebInspector.console.error(WebInspector.UIString("Two touches at the same time? %s vs %s",touchStart.startTime,event.startTime));break;}
touchStart=event;event.steps[0][WebInspector.TimelineIRModel._eventIRPhase]=phases.Response;firstTouchMove=null;break;case eventTypes.TouchCancel:touchStart=null;break;case eventTypes.TouchMove:if(firstTouchMove){this._drags.append(this._segmentForEvent(event,phases.Drag));}else if(touchStart){firstTouchMove=event;this._responses.append(this._segmentForEventRange(touchStart,event,phases.Response));}
break;case eventTypes.TouchEnd:touchStart=null;break;case eventTypes.MouseDown:mouseDown=event;mouseMove=null;break;case eventTypes.MouseMove:if(mouseDown&&!mouseMove&&mouseDown.startTime+thresholdsMs.mouse>event.startTime){this._responses.append(this._segmentForEvent(mouseDown,phases.Response));this._responses.append(this._segmentForEvent(event,phases.Response));}else if(mouseDown){this._drags.append(this._segmentForEvent(event,phases.Drag));}
mouseMove=event;break;case eventTypes.MouseUp:this._responses.append(this._segmentForEvent(event,phases.Response));mouseDown=null;break;case eventTypes.MouseWheel:if(mouseWheel&&canMerge(thresholdsMs.mouse,mouseWheel,event))
this._scrolls.append(this._segmentForEventRange(mouseWheel,event,phases.Scroll));else
this._scrolls.append(this._segmentForEvent(event,phases.Scroll));mouseWheel=event;break;}}
function canMerge(threshold,first,second)
{return first.endTime<second.startTime&&second.startTime<first.endTime+threshold;}},_processAnimations:function(events)
{for(var i=0;i<events.length;++i)
this._cssAnimations.append(this._segmentForEvent(events[i],WebInspector.TimelineIRModel.Phases.Animation));},_segmentForEvent:function(event,phase)
{this._setPhaseForEvent(event,phase);return new WebInspector.Segment(event.startTime,event.endTime,phase);},_segmentForEventRange:function(startEvent,endEvent,phase)
{this._setPhaseForEvent(startEvent,phase);this._setPhaseForEvent(endEvent,phase);return new WebInspector.Segment(startEvent.startTime,endEvent.endTime,phase);},_setPhaseForEvent:function(asyncEvent,phase)
{asyncEvent.steps[0][WebInspector.TimelineIRModel._eventIRPhase]=phase;},interactionRecords:function()
{return this._segments;},reset:function()
{var thresholdsMs=WebInspector.TimelineIRModel._mergeThresholdsMs;this._segments=[];this._drags=new WebInspector.SegmentedRange(merge.bind(null,thresholdsMs.mouse));this._cssAnimations=new WebInspector.SegmentedRange(merge.bind(null,thresholdsMs.animation));this._responses=new WebInspector.SegmentedRange(merge.bind(null,0));this._scrolls=new WebInspector.SegmentedRange(merge.bind(null,thresholdsMs.animation));function merge(threshold,first,second)
{return first.end+threshold>=second.begin&&first.data===second.data?first:null;}},_inputEventType:function(eventName)
{var prefix="InputLatency::";if(!eventName.startsWith(prefix)){if(eventName===WebInspector.TimelineIRModel.InputEvents.ImplSideFling)
return(eventName);console.error("Unrecognized input latency event: "+eventName);return null;}
return(eventName.substr(prefix.length));}};;WebInspector.TimelineJSProfileProcessor={};WebInspector.TimelineJSProfileProcessor.generateTracingEventsFromCpuProfile=function(jsProfileModel,thread)
{var idleNode=jsProfileModel.idleNode;var programNode=jsProfileModel.programNode;var gcNode=jsProfileModel.gcNode;var samples=jsProfileModel.samples;var timestamps=jsProfileModel.timestamps;var jsEvents=[];var nodeToStackMap=new Map();nodeToStackMap.set(programNode,[]);for(var i=0;i<samples.length;++i){var node=jsProfileModel.nodeByIndex(i);if(!node){console.error(`Node with unknown id ${samples[i]}at index ${i}`);continue;}
if(node===gcNode||node===idleNode)
continue;var callFrames=nodeToStackMap.get(node);if(!callFrames){callFrames=(new Array(node.depth+1));nodeToStackMap.set(node,callFrames);for(var j=0;node.parent;node=node.parent)
callFrames[j++]=(node);}
var jsSampleEvent=new WebInspector.TracingModel.Event(WebInspector.TracingModel.DevToolsTimelineEventCategory,WebInspector.TimelineModel.RecordType.JSSample,WebInspector.TracingModel.Phase.Instant,timestamps[i],thread);jsSampleEvent.args["data"]={stackTrace:callFrames};jsEvents.push(jsSampleEvent);}
return jsEvents;}
WebInspector.TimelineJSProfileProcessor.generateJSFrameEvents=function(events)
{function equalFrames(frame1,frame2)
{return frame1.scriptId===frame2.scriptId&&frame1.functionName===frame2.functionName;}
function eventEndTime(e)
{return e.endTime||e.startTime;}
function isJSInvocationEvent(e)
{switch(e.name){case WebInspector.TimelineModel.RecordType.FunctionCall:case WebInspector.TimelineModel.RecordType.EvaluateScript:return true;}
return false;}
var jsFrameEvents=[];var jsFramesStack=[];var lockedJsStackDepth=[];var ordinal=0;var filterNativeFunctions=!WebInspector.moduleSetting("showNativeFunctionsInJSProfile").get();function onStartEvent(e)
{e.ordinal=++ordinal;extractStackTrace(e);lockedJsStackDepth.push(jsFramesStack.length);}
function onInstantEvent(e,parent)
{e.ordinal=++ordinal;if(parent&&isJSInvocationEvent(parent))
extractStackTrace(e);}
function onEndEvent(e)
{truncateJSStack(lockedJsStackDepth.pop(),e.endTime);}
function truncateJSStack(depth,time)
{if(lockedJsStackDepth.length){var lockedDepth=lockedJsStackDepth.peekLast();if(depth<lockedDepth){console.error("Child stack is shallower ("+depth+") than the parent stack ("+lockedDepth+") at "+time);depth=lockedDepth;}}
if(jsFramesStack.length<depth){console.error("Trying to truncate higher than the current stack size at "+time);depth=jsFramesStack.length;}
for(var k=0;k<jsFramesStack.length;++k)
jsFramesStack[k].setEndTime(time);jsFramesStack.length=depth;}
function filterStackFrames(stack)
{for(var i=0,j=0;i<stack.length;++i){var url=stack[i].url;if(url&&url.startsWith("native "))
continue;stack[j++]=stack[i];}
stack.length=j;}
function extractStackTrace(e)
{var recordTypes=WebInspector.TimelineModel.RecordType;var callFrames;if(e.name===recordTypes.JSSample){var eventData=e.args["data"]||e.args["beginData"];callFrames=(eventData&&eventData["stackTrace"]);}else{callFrames=(jsFramesStack.map(frameEvent=>frameEvent.args["data"]).reverse());}
if(filterNativeFunctions)
filterStackFrames(callFrames);var endTime=eventEndTime(e);var numFrames=callFrames.length;var minFrames=Math.min(numFrames,jsFramesStack.length);var i;for(i=lockedJsStackDepth.peekLast()||0;i<minFrames;++i){var newFrame=callFrames[numFrames-1-i];var oldFrame=jsFramesStack[i].args["data"];if(!equalFrames(newFrame,oldFrame))
break;jsFramesStack[i].setEndTime(Math.max(jsFramesStack[i].endTime,endTime));}
truncateJSStack(i,e.startTime);for(;i<numFrames;++i){var frame=callFrames[numFrames-1-i];var jsFrameEvent=new WebInspector.TracingModel.Event(WebInspector.TracingModel.DevToolsTimelineEventCategory,recordTypes.JSFrame,WebInspector.TracingModel.Phase.Complete,e.startTime,e.thread);jsFrameEvent.ordinal=e.ordinal;jsFrameEvent.addArgs({data:frame});jsFrameEvent.setEndTime(endTime);jsFramesStack.push(jsFrameEvent);jsFrameEvents.push(jsFrameEvent);}}
function findFirstTopLevelEvent(events)
{for(var i=0;i<events.length;++i){if(WebInspector.TracingModel.isTopLevelEvent(events[i]))
return events[i];}
return null;}
var firstTopLevelEvent=findFirstTopLevelEvent(events);if(firstTopLevelEvent)
WebInspector.TimelineModel.forEachEvent(events,onStartEvent,onEndEvent,onInstantEvent,firstTopLevelEvent.startTime);return jsFrameEvents;}
WebInspector.TimelineJSProfileProcessor.CodeMap=function()
{this._banks=new Map();}
WebInspector.TimelineJSProfileProcessor.CodeMap.Entry=function(address,size,callFrame)
{this.address=address;this.size=size;this.callFrame=callFrame;}
WebInspector.TimelineJSProfileProcessor.CodeMap.comparator=function(address,entry)
{return address-entry.address;}
WebInspector.TimelineJSProfileProcessor.CodeMap.prototype={addEntry:function(addressHex,size,callFrame)
{var entry=new WebInspector.TimelineJSProfileProcessor.CodeMap.Entry(this._getAddress(addressHex),size,callFrame);this._addEntry(addressHex,entry);},moveEntry:function(oldAddressHex,newAddressHex,size)
{var entry=this._getBank(oldAddressHex).removeEntry(this._getAddress(oldAddressHex));if(!entry){console.error("Entry at address "+oldAddressHex+" not found");return;}
entry.address=this._getAddress(newAddressHex);entry.size=size;this._addEntry(newAddressHex,entry);},lookupEntry:function(addressHex)
{return this._getBank(addressHex).lookupEntry(this._getAddress(addressHex));},_addEntry:function(addressHex,entry)
{this._getBank(addressHex).addEntry(entry);},_getBank:function(addressHex)
{addressHex=addressHex.slice(2);var bankSizeHexDigits=13;var maxHexDigits=16;var bankName=addressHex.slice(-maxHexDigits,-bankSizeHexDigits);var bank=this._banks.get(bankName);if(!bank){bank=new WebInspector.TimelineJSProfileProcessor.CodeMap.Bank();this._banks.set(bankName,bank);}
return bank;},_getAddress:function(addressHex)
{var bankSizeHexDigits=13;addressHex=addressHex.slice(2);return parseInt(addressHex.slice(-bankSizeHexDigits),16);}}
WebInspector.TimelineJSProfileProcessor.CodeMap.Bank=function()
{this._entries=[];}
WebInspector.TimelineJSProfileProcessor.CodeMap.Bank.prototype={removeEntry:function(address)
{var index=this._entries.lowerBound(address,WebInspector.TimelineJSProfileProcessor.CodeMap.comparator);var entry=this._entries[index];if(!entry||entry.address!==address)
return null;this._entries.splice(index,1);return entry;},lookupEntry:function(address)
{var index=this._entries.upperBound(address,WebInspector.TimelineJSProfileProcessor.CodeMap.comparator)-1;var entry=this._entries[index];return entry&&address<entry.address+entry.size?entry.callFrame:null;},addEntry:function(newEntry)
{var endAddress=newEntry.address+newEntry.size;var lastIndex=this._entries.lowerBound(endAddress,WebInspector.TimelineJSProfileProcessor.CodeMap.comparator);var index;for(index=lastIndex-1;index>=0;--index){var entry=this._entries[index];var entryEndAddress=entry.address+entry.size;if(entryEndAddress<=newEntry.address)
break;}
++index;this._entries.splice(index,lastIndex-index,newEntry);}}
WebInspector.TimelineJSProfileProcessor._buildCallFrame=function(name,scriptId)
{function createFrame(functionName,url,scriptId,line,column,isNative)
{return({"functionName":functionName,"url":url||"","scriptId":scriptId||"0","lineNumber":line||0,"columnNumber":column||0,"isNative":isNative||false});}
var rePrefix=/^(\w*:)?[*~]?(.*)$/m;var tokens=rePrefix.exec(name);var prefix=tokens[1];var body=tokens[2];var rawName;var rawUrl;if(prefix==="Script:"){rawName="";rawUrl=body;}else{var spacePos=body.lastIndexOf(" ");rawName=spacePos!==-1?body.substr(0,spacePos):body;rawUrl=spacePos!==-1?body.substr(spacePos+1):"";}
var nativeSuffix=" native";var isNative=rawName.endsWith(nativeSuffix);var functionName=isNative?rawName.slice(0,-nativeSuffix.length):rawName;var urlData=WebInspector.ParsedURL.splitLineAndColumn(rawUrl);var url=urlData.url||"";var line=urlData.lineNumber||0;var column=urlData.columnNumber||0;return createFrame(functionName,url,String(scriptId),line,column,isNative);}
WebInspector.TimelineJSProfileProcessor.processRawV8Samples=function(events)
{var missingAddesses=new Set();function convertRawFrame(address)
{var entry=codeMap.lookupEntry(address);if(entry)
return entry.isNative?null:entry;if(!missingAddesses.has(address)){missingAddesses.add(address);console.error("Address "+address+" has missing code entry");}
return null;}
var recordTypes=WebInspector.TimelineModel.RecordType;var samples=[];var codeMap=new WebInspector.TimelineJSProfileProcessor.CodeMap();for(var i=0;i<events.length;++i){var e=events[i];var data=e.args["data"];switch(e.name){case recordTypes.JitCodeAdded:var frame=WebInspector.TimelineJSProfileProcessor._buildCallFrame(data["name"],data["script_id"]);codeMap.addEntry(data["code_start"],data["code_len"],frame);break;case recordTypes.JitCodeMoved:codeMap.moveEntry(data["code_start"],data["new_code_start"],data["code_len"]);break;case recordTypes.V8Sample:var rawStack=data["stack"];if(data["vm_state"]==="js"&&!rawStack.length)
break;var stack=rawStack.map(convertRawFrame);stack.remove(null);var sampleEvent=new WebInspector.TracingModel.Event(WebInspector.TracingModel.DevToolsTimelineEventCategory,WebInspector.TimelineModel.RecordType.JSSample,WebInspector.TracingModel.Phase.Instant,e.startTime,e.thread);sampleEvent.ordinal=e.ordinal;sampleEvent.args={"data":{"stackTrace":stack}};samples.push(sampleEvent);break;}}
return samples;};WebInspector.TimelineFrameModel=function(categoryMapper)
{this._categoryMapper=categoryMapper;this.reset();}
WebInspector.TimelineFrameModel._mainFrameMarkers=[WebInspector.TimelineModel.RecordType.ScheduleStyleRecalculation,WebInspector.TimelineModel.RecordType.InvalidateLayout,WebInspector.TimelineModel.RecordType.BeginMainThreadFrame,WebInspector.TimelineModel.RecordType.ScrollLayer];WebInspector.TimelineFrameModel.prototype={frames:function()
{return this._frames;},filteredFrames:function(startTime,endTime)
{function compareStartTime(value,object)
{return value-object.startTime;}
function compareEndTime(value,object)
{return value-object.endTime;}
var frames=this._frames;var firstFrame=frames.lowerBound(startTime,compareEndTime);var lastFrame=frames.lowerBound(endTime,compareStartTime);return frames.slice(firstFrame,lastFrame);},hasRasterTile:function(rasterTask)
{var data=rasterTask.args["tileData"];if(!data)
return false;var frameId=data["sourceFrameNumber"];var frame=frameId&&this._frameById[frameId];if(!frame||!frame.layerTree)
return false;return true;},requestRasterTile:function(rasterTask,callback)
{var target=this._target;if(!target){callback(null,null);return;}
var data=rasterTask.args["tileData"];var frameId=data["sourceFrameNumber"];var frame=frameId&&this._frameById[frameId];if(!frame||!frame.layerTree){callback(null,null);return;}
var tileId=data["tileId"]&&data["tileId"]["id_ref"];var fragments=[];var tile=null;var x0=Infinity;var y0=Infinity;frame.layerTree.resolve(layerTreeResolved);function layerTreeResolved(layerTree)
{tile=tileId&&((layerTree)).tileById("cc::Tile/"+tileId);if(!tile){console.error("Tile "+tileId+" missing in frame "+frameId);callback(null,null);return;}
var fetchPictureFragmentsBarrier=new CallbackBarrier();for(var paint of frame.paints){if(tile.layer_id===paint.layerId())
paint.loadPicture(fetchPictureFragmentsBarrier.createCallback(pictureLoaded));}
fetchPictureFragmentsBarrier.callWhenDone(allPicturesLoaded);}
function segmentsOverlap(a1,a2,b1,b2)
{console.assert(a1<=a2&&b1<=b2,"segments should be specified as ordered pairs");return a2>b1&&a1<b2;}
function rectsOverlap(a,b)
{return segmentsOverlap(a[0],a[0]+a[2],b[0],b[0]+b[2])&&segmentsOverlap(a[1],a[1]+a[3],b[1],b[1]+b[3]);}
function pictureLoaded(rect,picture)
{if(!rect||!picture)
return;if(!rectsOverlap(rect,tile.content_rect))
return;var x=rect[0];var y=rect[1];x0=Math.min(x0,x);y0=Math.min(y0,y);fragments.push({x:x,y:y,picture:picture});}
function allPicturesLoaded()
{if(!fragments.length){callback(null,null);return;}
var rectArray=tile.content_rect;var rect={x:rectArray[0]-x0,y:rectArray[1]-y0,width:rectArray[2],height:rectArray[3]};WebInspector.PaintProfilerSnapshot.loadFromFragments(target,fragments,callback.bind(null,rect));}},reset:function()
{this._minimumRecordTime=Infinity;this._frames=[];this._frameById={};this._lastFrame=null;this._lastLayerTree=null;this._mainFrameCommitted=false;this._mainFrameRequested=false;this._framePendingCommit=null;this._lastBeginFrame=null;this._lastNeedsBeginFrame=null;this._framePendingActivation=null;this._lastTaskBeginTime=null;this._target=null;this._sessionId=null;this._currentTaskTimeByCategory={};},handleBeginFrame:function(startTime)
{if(!this._lastFrame)
this._startFrame(startTime);this._lastBeginFrame=startTime;},handleDrawFrame:function(startTime)
{if(!this._lastFrame){this._startFrame(startTime);return;}
if(this._mainFrameCommitted||!this._mainFrameRequested){if(this._lastNeedsBeginFrame){var idleTimeEnd=this._framePendingActivation?this._framePendingActivation.triggerTime:(this._lastBeginFrame||this._lastNeedsBeginFrame);if(idleTimeEnd>this._lastFrame.startTime){this._lastFrame.idle=true;this._startFrame(idleTimeEnd);if(this._framePendingActivation)
this._commitPendingFrame();this._lastBeginFrame=null;}
this._lastNeedsBeginFrame=null;}
this._startFrame(startTime);}
this._mainFrameCommitted=false;},handleActivateLayerTree:function()
{if(!this._lastFrame)
return;if(this._framePendingActivation&&!this._lastNeedsBeginFrame)
this._commitPendingFrame();},handleRequestMainThreadFrame:function()
{if(!this._lastFrame)
return;this._mainFrameRequested=true;},handleCompositeLayers:function()
{if(!this._framePendingCommit)
return;this._framePendingActivation=this._framePendingCommit;this._framePendingCommit=null;this._mainFrameRequested=false;this._mainFrameCommitted=true;},handleLayerTreeSnapshot:function(layerTree)
{this._lastLayerTree=layerTree;},handleNeedFrameChanged:function(startTime,needsBeginFrame)
{if(needsBeginFrame)
this._lastNeedsBeginFrame=startTime;},_startFrame:function(startTime)
{if(this._lastFrame)
this._flushFrame(this._lastFrame,startTime);this._lastFrame=new WebInspector.TimelineFrame(startTime,startTime-this._minimumRecordTime);},_flushFrame:function(frame,endTime)
{frame._setLayerTree(this._lastLayerTree);frame._setEndTime(endTime);if(this._frames.length&&(frame.startTime!==this._frames.peekLast().endTime||frame.startTime>frame.endTime))
console.assert(false,`Inconsistent frame time for frame ${this._frames.length}(${frame.startTime}-${frame.endTime})`);this._frames.push(frame);if(typeof frame._mainFrameId==="number")
this._frameById[frame._mainFrameId]=frame;},_commitPendingFrame:function()
{this._lastFrame._addTimeForCategories(this._framePendingActivation.timeByCategory);this._lastFrame.paints=this._framePendingActivation.paints;this._lastFrame._mainFrameId=this._framePendingActivation.mainFrameId;this._framePendingActivation=null;},_findRecordRecursively:function(types,record)
{if(types.indexOf(record.type())>=0)
return record;if(!record.children())
return null;for(var i=0;i<record.children().length;++i){var result=this._findRecordRecursively(types,record.children()[i]);if(result)
return result;}
return null;},addTraceEvents:function(target,events,sessionId)
{this._target=target;this._sessionId=sessionId;if(!events.length)
return;if(events[0].startTime<this._minimumRecordTime)
this._minimumRecordTime=events[0].startTime;for(var i=0;i<events.length;++i)
this._addTraceEvent(events[i]);},_addTraceEvent:function(event)
{var eventNames=WebInspector.TimelineModel.RecordType;if(event.name===eventNames.SetLayerTreeId){var sessionId=event.args["sessionId"]||event.args["data"]["sessionId"];if(this._sessionId===sessionId)
this._layerTreeId=event.args["layerTreeId"]||event.args["data"]["layerTreeId"];}else if(event.name===eventNames.TracingStartedInPage){this._mainThread=event.thread;}else if(event.phase===WebInspector.TracingModel.Phase.SnapshotObject&&event.name===eventNames.LayerTreeHostImplSnapshot&&parseInt(event.id,0)===this._layerTreeId){var snapshot=(event);this.handleLayerTreeSnapshot(new WebInspector.DeferredTracingLayerTree(snapshot,this._target));}else{this._processCompositorEvents(event);if(event.thread===this._mainThread)
this._addMainThreadTraceEvent(event);else if(this._lastFrame&&event.selfTime&&!WebInspector.TracingModel.isTopLevelEvent(event))
this._lastFrame._addTimeForCategory(this._categoryMapper(event),event.selfTime);}},_processCompositorEvents:function(event)
{var eventNames=WebInspector.TimelineModel.RecordType;if(event.args["layerTreeId"]!==this._layerTreeId)
return;var timestamp=event.startTime;if(event.name===eventNames.BeginFrame)
this.handleBeginFrame(timestamp);else if(event.name===eventNames.DrawFrame)
this.handleDrawFrame(timestamp);else if(event.name===eventNames.ActivateLayerTree)
this.handleActivateLayerTree();else if(event.name===eventNames.RequestMainThreadFrame)
this.handleRequestMainThreadFrame();else if(event.name===eventNames.NeedsBeginFrameChanged)
this.handleNeedFrameChanged(timestamp,event.args["data"]&&event.args["data"]["needsBeginFrame"]);},_addMainThreadTraceEvent:function(event)
{var eventNames=WebInspector.TimelineModel.RecordType;var timestamp=event.startTime;var selfTime=event.selfTime||0;if(WebInspector.TracingModel.isTopLevelEvent(event)){this._currentTaskTimeByCategory={};this._lastTaskBeginTime=event.startTime;}
if(!this._framePendingCommit&&WebInspector.TimelineFrameModel._mainFrameMarkers.indexOf(event.name)>=0)
this._framePendingCommit=new WebInspector.PendingFrame(this._lastTaskBeginTime||event.startTime,this._currentTaskTimeByCategory);if(!this._framePendingCommit){this._addTimeForCategory(this._currentTaskTimeByCategory,event);return;}
this._addTimeForCategory(this._framePendingCommit.timeByCategory,event);if(event.name===eventNames.BeginMainThreadFrame&&event.args["data"]&&event.args["data"]["frameId"])
this._framePendingCommit.mainFrameId=event.args["data"]["frameId"];if(event.name===eventNames.Paint&&event.args["data"]["layerId"]&&event.picture&&this._target)
this._framePendingCommit.paints.push(new WebInspector.LayerPaintEvent(event,this._target));if(event.name===eventNames.CompositeLayers&&event.args["layerTreeId"]===this._layerTreeId)
this.handleCompositeLayers();},_addTimeForCategory:function(timeByCategory,event)
{if(!event.selfTime)
return;var categoryName=this._categoryMapper(event);timeByCategory[categoryName]=(timeByCategory[categoryName]||0)+event.selfTime;},}
WebInspector.DeferredTracingLayerTree=function(snapshot,target)
{WebInspector.DeferredLayerTree.call(this,target);this._snapshot=snapshot;}
WebInspector.DeferredTracingLayerTree.prototype={resolve:function(callback)
{this._snapshot.requestObject(onGotObject.bind(this));function onGotObject(result)
{if(!result)
return;var viewport=result["device_viewport_size"];var tiles=result["active_tiles"];var rootLayer=result["active_tree"]["root_layer"];var layers=result["active_tree"]["layers"];var layerTree=new WebInspector.TracingLayerTree(this._target);layerTree.setViewportSize(viewport);layerTree.setTiles(tiles);layerTree.setLayers(rootLayer,layers,callback.bind(null,layerTree));}},__proto__:WebInspector.DeferredLayerTree.prototype};WebInspector.TimelineFrame=function(startTime,startTimeOffset)
{this.startTime=startTime;this.startTimeOffset=startTimeOffset;this.endTime=this.startTime;this.duration=0;this.timeByCategory={};this.cpuTime=0;this.idle=false;this.layerTree=null;this.paints=[];this._mainFrameId=undefined;}
WebInspector.TimelineFrame.prototype={hasWarnings:function()
{var longFrameDurationThresholdMs=22;return!this.idle&&this.duration>longFrameDurationThresholdMs;},_setEndTime:function(endTime)
{this.endTime=endTime;this.duration=this.endTime-this.startTime;},_setLayerTree:function(layerTree)
{this.layerTree=layerTree;},_addTimeForCategories:function(timeByCategory)
{for(var category in timeByCategory)
this._addTimeForCategory(category,timeByCategory[category]);},_addTimeForCategory:function(category,time)
{this.timeByCategory[category]=(this.timeByCategory[category]||0)+time;this.cpuTime+=time;},}
WebInspector.LayerPaintEvent=function(event,target)
{this._event=event;this._target=target;}
WebInspector.LayerPaintEvent.prototype={layerId:function()
{return this._event.args["data"]["layerId"];},event:function()
{return this._event;},loadPicture:function(callback)
{this._event.picture.requestObject(onGotObject);function onGotObject(result)
{if(!result||!result["skp64"]){callback(null,null);return;}
var rect=result["params"]&&result["params"]["layer_rect"];callback(rect,result["skp64"]);}},loadSnapshot:function(callback)
{this.loadPicture(onGotPicture.bind(this));function onGotPicture(rect,picture)
{if(!rect||!picture||!this._target){callback(null,null);return;}
WebInspector.PaintProfilerSnapshot.load(this._target,picture,callback.bind(null,rect));}}};WebInspector.PendingFrame=function(triggerTime,timeByCategory)
{this.timeByCategory=timeByCategory;this.paints=[];this.mainFrameId=undefined;this.triggerTime=triggerTime;};WebInspector.TimelineProfileTree={};WebInspector.TimelineProfileTree.Node=function()
{this.totalTime;this.selfTime;this.id;this.event;this.children;this.parent;this._isGroupNode=false;}
WebInspector.TimelineProfileTree.Node.prototype={isGroupNode:function()
{return this._isGroupNode;}}
WebInspector.TimelineProfileTree.buildTopDown=function(events,filters,startTime,endTime,eventIdCallback)
{var initialTime=1e7;var root=new WebInspector.TimelineProfileTree.Node();root.totalTime=initialTime;root.selfTime=initialTime;root.children=(new Map());var parent=root;function onStartEvent(e)
{if(!WebInspector.TimelineModel.isVisible(filters,e))
return;var time=e.endTime?Math.min(endTime,e.endTime)-Math.max(startTime,e.startTime):0;var id=eventIdCallback?eventIdCallback(e):Symbol("uniqueEventId");if(!parent.children)
parent.children=(new Map());var node=parent.children.get(id);if(node){node.selfTime+=time;node.totalTime+=time;}else{node=new WebInspector.TimelineProfileTree.Node();node.totalTime=time;node.selfTime=time;node.parent=parent;node.id=id;node.event=e;parent.children.set(id,node);}
parent.selfTime-=time;if(parent.selfTime<0){console.log("Error: Negative self of "+parent.selfTime,e);parent.selfTime=0;}
if(e.endTime)
parent=node;}
function onEndEvent(e)
{if(!WebInspector.TimelineModel.isVisible(filters,e))
return;parent=parent.parent;}
var instantEventCallback=eventIdCallback?undefined:onStartEvent;WebInspector.TimelineModel.forEachEvent(events,onStartEvent,onEndEvent,instantEventCallback,startTime,endTime);root.totalTime-=root.selfTime;root.selfTime=0;return root;}
WebInspector.TimelineProfileTree.buildBottomUp=function(topDownTree,groupingCallback)
{var buRoot=new WebInspector.TimelineProfileTree.Node();buRoot.selfTime=0;buRoot.totalTime=0;buRoot.children=new Map();var nodesOnStack=(new Set());if(topDownTree.children)
topDownTree.children.forEach(processNode);buRoot.totalTime=topDownTree.totalTime;function processNode(tdNode)
{var buParent=groupingCallback&&groupingCallback(tdNode)||buRoot;if(buParent!==buRoot){buRoot.children.set(buParent.id,buParent);buParent.parent=buRoot;}
appendNode(tdNode,buParent);var hadNode=nodesOnStack.has(tdNode.id);if(!hadNode)
nodesOnStack.add(tdNode.id);if(tdNode.children)
tdNode.children.forEach(processNode);if(!hadNode)
nodesOnStack.delete(tdNode.id);}
function appendNode(tdNode,buParent)
{var selfTime=tdNode.selfTime;var totalTime=tdNode.totalTime;buParent.selfTime+=selfTime;buParent.totalTime+=selfTime;while(tdNode.parent){if(!buParent.children)
buParent.children=(new Map());var id=tdNode.id;var buNode=buParent.children.get(id);if(!buNode){buNode=new WebInspector.TimelineProfileTree.Node();buNode.selfTime=selfTime;buNode.totalTime=totalTime;buNode.event=tdNode.event;buNode.id=id;buNode.parent=buParent;buParent.children.set(id,buNode);}else{buNode.selfTime+=selfTime;if(!nodesOnStack.has(id))
buNode.totalTime+=totalTime;}
tdNode=tdNode.parent;buParent=buNode;}}
var rootChildren=buRoot.children;for(var item of rootChildren.entries()){if(item[1].selfTime===0)
rootChildren.delete((item[0]));}
return buRoot;}
WebInspector.TimelineProfileTree.eventURL=function(event)
{var data=event.args["data"]||event.args["beginData"];if(data&&data["url"])
return data["url"];var frame=WebInspector.TimelineProfileTree.eventStackFrame(event);while(frame){var url=frame["url"];if(url)
return url;frame=frame.parent;}
return null;}
WebInspector.TimelineProfileTree.eventStackFrame=function(event)
{if(event.name===WebInspector.TimelineModel.RecordType.JSFrame)
return event.args["data"];var topFrame=event.stackTrace&&event.stackTrace[0];if(topFrame)
return topFrame;var initiator=event.initiator;return initiator&&initiator.stackTrace&&initiator.stackTrace[0]||null;}
WebInspector.TimelineAggregator=function(titleMapper,categoryMapper)
{this._titleMapper=titleMapper;this._categoryMapper=categoryMapper;this._groupNodes=new Map();}
WebInspector.TimelineAggregator.GroupBy={None:"None",EventName:"EventName",Category:"Category",Domain:"Domain",Subdomain:"Subdomain",URL:"URL"}
WebInspector.TimelineAggregator.eventId=function(event)
{if(event.name===WebInspector.TimelineModel.RecordType.JSFrame){var data=event.args["data"];return"f:"+data["functionName"]+"@"+(data["scriptId"]||data["url"]||"");}
return event.name+":@"+WebInspector.TimelineProfileTree.eventURL(event);}
WebInspector.TimelineAggregator._extensionInternalPrefix="extensions::";WebInspector.TimelineAggregator._groupNodeFlag=Symbol("groupNode");WebInspector.TimelineAggregator.isExtensionInternalURL=function(url)
{return url.startsWith(WebInspector.TimelineAggregator._extensionInternalPrefix);}
WebInspector.TimelineAggregator.prototype={groupFunction:function(groupBy)
{var idMapper=this._nodeToGroupIdFunction(groupBy);return idMapper&&this._nodeToGroupNode.bind(this,idMapper);},performGrouping:function(root,groupBy)
{var nodeMapper=this.groupFunction(groupBy);if(!nodeMapper)
return root;for(var node of root.children.values()){var groupNode=nodeMapper(node);groupNode.parent=root;groupNode.selfTime+=node.selfTime;groupNode.totalTime+=node.totalTime;groupNode.children.set(node.id,node);node.parent=root;}
root.children=this._groupNodes;return root;},_nodeToGroupIdFunction:function(groupBy)
{function groupByURL(node)
{return WebInspector.TimelineProfileTree.eventURL(node.event)||"";}
function groupByDomain(groupSubdomains,node)
{var url=WebInspector.TimelineProfileTree.eventURL(node.event)||"";if(WebInspector.TimelineAggregator.isExtensionInternalURL(url))
return WebInspector.TimelineAggregator._extensionInternalPrefix;var parsedURL=url.asParsedURL();if(!parsedURL)
return"";if(parsedURL.scheme==="chrome-extension")
return parsedURL.scheme+"://"+parsedURL.host;if(!groupSubdomains)
return parsedURL.host;if(/^[.0-9]+$/.test(parsedURL.host))
return parsedURL.host;var domainMatch=/([^.]*\.)?[^.]*$/.exec(parsedURL.host);return domainMatch&&domainMatch[0]||"";}
switch(groupBy){case WebInspector.TimelineAggregator.GroupBy.None:return null;case WebInspector.TimelineAggregator.GroupBy.EventName:return node=>node.event?this._titleMapper(node.event):"";case WebInspector.TimelineAggregator.GroupBy.Category:return node=>node.event?this._categoryMapper(node.event):"";case WebInspector.TimelineAggregator.GroupBy.Subdomain:return groupByDomain.bind(null,false);case WebInspector.TimelineAggregator.GroupBy.Domain:return groupByDomain.bind(null,true);case WebInspector.TimelineAggregator.GroupBy.URL:return groupByURL;default:return null;}},_buildGroupNode:function(id,event)
{var groupNode=new WebInspector.TimelineProfileTree.Node();groupNode.id=id;groupNode.selfTime=0;groupNode.totalTime=0;groupNode.children=new Map();groupNode.event=event;groupNode._isGroupNode=true;this._groupNodes.set(id,groupNode);return groupNode;},_nodeToGroupNode:function(nodeToGroupId,node)
{var id=nodeToGroupId(node);return this._groupNodes.get(id)||this._buildGroupNode(id,node.event);},};