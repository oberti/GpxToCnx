// ── POI Types (poi_types_list.txt from LudvvigB/GPXtoCNXConverter) ──
var POI_TYPES = [
  {id:'0', label:'Waypoint'},
  {id:'1', label:'Sprint Point'},
  {id:'2', label:'HC Climb'},
  {id:'3', label:'Level 1 Climb'},
  {id:'4', label:'Level 2 Climb'},
  {id:'5', label:'Level 3 Climb'},
  {id:'6', label:'Level 4 Climb'},
  {id:'7', label:'Supply Point'},
  {id:'8', label:'Garbage Recycle Area'},
  {id:'9', label:'Restroom'},
  {id:'10',label:'Service Point'},
  {id:'11',label:'Medical Aid Station'},
  {id:'12',label:'Equipment Area'},
  {id:'13',label:'Shop'},
  {id:'14',label:'Meeting Point'},
  {id:'15',label:'Viewing Platform'},
  {id:'16',label:'Instagram-Worthy Location'},
  {id:'17',label:'Tunnel'},
  {id:'18',label:'Valley'},
  {id:'19',label:'Dangerous Road'},
  {id:'20',label:'Sharp Turn'},
  {id:'21',label:'Steep Slope'},
  {id:'22',label:'Intersection'}
];

var POI_LABELS = POI_TYPES.map(function(t){return t.label.split(' ')[0];});

// ── State ──────────────────────────────────────────────────────────────
var currentMode = 'single';
var parsedData  = null;
var bulkFiles   = [];

// ── Mode tabs ──────────────────────────────────────────────────────────
document.querySelectorAll('.mode-tab').forEach(function(tab) {
  tab.addEventListener('click', function() {
    document.querySelectorAll('.mode-tab').forEach(function(t){t.classList.remove('active');});
    tab.classList.add('active');
    currentMode = tab.dataset.mode;
    var isBulk = (currentMode === 'bulk');
    document.getElementById('dropTitle').textContent = isBulk ? 'Drop multiple GPX files' : 'Drop GPX file here';
    document.getElementById('fileInput').multiple = isBulk;
    resetAll();
  });
});

// ── Drag & Drop ────────────────────────────────────────────────────────
var dz = document.getElementById('dropzone');
dz.addEventListener('dragover',  function(e){e.preventDefault(); dz.classList.add('drag-over');});
dz.addEventListener('dragleave', function(){dz.classList.remove('drag-over');});
dz.addEventListener('drop', function(e) {
  e.preventDefault(); dz.classList.remove('drag-over');
  var files = Array.from(e.dataTransfer.files).filter(function(f){return f.name.toLowerCase().endsWith('.gpx');});
  if (!files.length){showToast('No GPX files found','error'); return;}
  handleFiles(files);
});
dz.addEventListener('click', function(){document.getElementById('fileInput').click();});
document.getElementById('browseLink').addEventListener('click', function(e){
  e.stopPropagation();
  document.getElementById('fileInput').click();
});
document.getElementById('fileInput').addEventListener('change', function(e) {
  if (e.target.files.length) handleFiles(Array.from(e.target.files));
  e.target.value = '';
});

function handleFiles(files) {
  if (currentMode === 'single') loadSingleFile(files[0]);
  else loadBulkFiles(files);
}

// ── Single file ────────────────────────────────────────────────────────
function loadSingleFile(file) {
  showProgress(true);
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      parsedData = parseGPX(e.target.result, file.name);
      renderSingleUI();
      showProgress(false);
      showToast('Loaded: ' + file.name, 'success');
    } catch(err) {
      showProgress(false);
      showToast('Parse error: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

// ── Bulk files ─────────────────────────────────────────────────────────
function loadBulkFiles(files) {
  bulkFiles = [];
  var fl = document.getElementById('fileList');
  fl.innerHTML = ''; fl.style.display = 'flex';
  ['statsBar','trackNameRow','elevSection','poiSection'].forEach(function(id){
    document.getElementById(id).style.display = 'none';
  });
  document.getElementById('actions').style.display = 'flex';
  document.getElementById('convertBtn').textContent = 'Download All CNX';
  document.getElementById('convertInfo').textContent = files.length + ' files queued';
  document.getElementById('outputPanel').style.display = 'none';

  files.forEach(function(file) {
    var sid = file.name.replace(/\W/g, '_');
    var chip = document.createElement('div');
    chip.className = 'file-chip fade-in';
    chip.innerHTML = '<span class="poi-index">&#128193;</span>'
      + '<span class="file-chip-name">' + escHtml(file.name) + '</span>'
      + '<span class="file-chip-status" id="s_' + sid + '">Pending</span>';
    fl.appendChild(chip);
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var data = parseGPX(ev.target.result, file.name);
        bulkFiles.push({name: file.name, data: data});
        document.getElementById('s_' + sid).textContent = 'Ready';
        document.getElementById('s_' + sid).className = 'file-chip-status ok';
      } catch(err) {
        document.getElementById('s_' + sid).textContent = 'Error: ' + err.message;
        document.getElementById('s_' + sid).className = 'file-chip-status err';
      }
    };
    reader.readAsText(file);
  });
}

// ── GPX Parser ─────────────────────────────────────────────────────────
function parseGPX(xmlStr, filename) {
  var parser = new DOMParser();
  var doc = parser.parseFromString(xmlStr, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Invalid XML');

  function getAll(parent, tag){return Array.from(parent.getElementsByTagNameNS('*', tag));}

  // Route name
  var name = '';
  var trk = getAll(doc,'trk')[0];
  var rte = getAll(doc,'rte')[0];
  if (trk){var n=getAll(trk,'name')[0]; if(n)name=n.textContent.trim();}
  if (!name && rte){var n=getAll(rte,'name')[0]; if(n)name=n.textContent.trim();}
  if (!name){var mn=getAll(doc,'metadata')[0]; if(mn){var n=getAll(mn,'name')[0]; if(n)name=n.textContent.trim();}}
  if (!name) name = filename.replace(/\.gpx$/i,'');

  // Trackpoints
  var trkpts = getAll(doc,'trkpt');
  if (!trkpts.length) trkpts = getAll(doc,'rtept');
  if (!trkpts.length) throw new Error('No trackpoints found');

  var trackpoints = trkpts.map(function(tp) {
    var lat = parseFloat(tp.getAttribute('lat'));
    var lon = parseFloat(tp.getAttribute('lon'));
    var eleEl = getAll(tp,'ele')[0];
    var ele = eleEl ? parseFloat(eleEl.textContent) : 0;
    if (isNaN(lat) || isNaN(lon)) return null;
    return {lat:lat, lon:lon, ele:isNaN(ele)?0:ele};
  }).filter(Boolean);

  if (!trackpoints.length) throw new Error('No valid trackpoints');

  // Waypoints
  var wptEls = getAll(doc,'wpt');
  var waypoints = wptEls.map(function(wpt, i) {
    var lat = parseFloat(wpt.getAttribute('lat'));
    var lon = parseFloat(wpt.getAttribute('lon'));
    var nameEl = getAll(wpt,'name')[0];
    var wname = nameEl ? nameEl.textContent.trim() : 'WPT'+(i+1);
    if (isNaN(lat) || isNaN(lon)) return null;
    return {lat:lat, lon:lon, name:wname, type:'0'};
  }).filter(Boolean);

  var stats = calcStats(trackpoints);

  // Sort waypoints by distance along track (nearest trackpoint index)
  waypoints.forEach(function(wpt) {
    var bestI=0, bestD=Infinity;
    for (var i=0; i<trackpoints.length; i++) {
      var dd = Math.abs(trackpoints[i].lat-wpt.lat)+Math.abs(trackpoints[i].lon-wpt.lon);
      if (dd<bestD){bestD=dd; bestI=i;}
    }
    wpt._tpIdx = bestI;
  });
  waypoints.sort(function(a,b){return a._tpIdx - b._tpIdx;});

  return {name:name, trackpoints:trackpoints, waypoints:waypoints, stats:stats};
}

// ── Stats: 3D distance (matches Python sqrt(hDist²+eleDiff²)) ─────────
function calc3DDist(p1, p2) {
  var R=6371000;
  var phi1=p1.lat*Math.PI/180, phi2=p2.lat*Math.PI/180;
  var dphi=(p2.lat-p1.lat)*Math.PI/180;
  var dlam=(p2.lon-p1.lon)*Math.PI/180;
  var a=Math.sin(dphi/2)*Math.sin(dphi/2)+Math.cos(phi1)*Math.cos(phi2)*Math.sin(dlam/2)*Math.sin(dlam/2);
  var hDist=R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  return Math.sqrt(hDist*hDist + (p2.ele-p1.ele)*(p2.ele-p1.ele));
}

function calcStats(tps) {
  var dist=0, asc=0, des=0;
  for (var i=1; i<tps.length; i++) {
    dist += calc3DDist(tps[i-1], tps[i]);
    var de = tps[i].ele - tps[i-1].ele;
    if (de>0) asc+=de; else des+=de; // des negative (matches Python)
  }
  return {dist:dist, asc:asc, des:des};
}

// ── CNX Track Encoding (exact port of Python) ──────────────────────────
// point[0] = "lat,lon,ele_cm"          (absolute)
// point[1] = first difference          (lat×1e7, lon×1e7, ele_cm), rounded
// point[2+]= second diff lat/lon, first diff ele, rounded
function encodeTracks(tps) {
  if (!tps.length) return '';
  var pts = [];
  pts.push(tps[0].lat + ',' + tps[0].lon + ',' + Math.round(tps[0].ele*100));
  if (tps.length === 1) return pts.join(';') + ';';

  var fd = [];
  for (var i=1; i<tps.length; i++) {
    fd.push([
      (tps[i].lat - tps[i-1].lat) * 10000000,
      (tps[i].lon - tps[i-1].lon) * 10000000,
       tps[i].ele * 100 - tps[i-1].ele * 100
    ]);
  }
  pts.push(Math.round(fd[0][0]) + ',' + Math.round(fd[0][1]) + ',' + Math.round(fd[0][2]));
  for (var i=1; i<fd.length; i++) {
    pts.push(
      Math.round(fd[i][0]-fd[i-1][0]) + ',' +
      Math.round(fd[i][1]-fd[i-1][1]) + ',' +
      Math.round(fd[i][2])
    );
  }
  return pts.join(';') + ';';
}

// ── CNX XML Generator (exact structure from Python source) ─────────────
function generateCNX(data, customName) {
  var tps  = data.trackpoints;
  var wpts = data.waypoints;
  var s    = data.stats;
  var rawName = (customName || data.name).substring(0,18);
  var id = rawName.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');

  var pointsXml = '';
  for (var i=0; i<wpts.length; i++) {
    var w = wpts[i];
    var descr = w.name.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    pointsXml += '  <Point>\n    <Lat>'+w.lat+'</Lat>\n    <Lng>'+w.lon+'</Lng>\n    <Type>'+w.type+'</Type>\n    <Descr>'+descr+'</Descr>\n  </Point>\n';
  }

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<Route>\n'
    + '  <Id>'+id+'</Id>\n'
    + '  <Distance>'+s.dist.toFixed(2)+'</Distance>\n'
    + '  <Duration>\n  </Duration>\n'
    + '  <Ascent>'+s.asc.toFixed(2)+'</Ascent>\n'
    + '  <Descent>'+s.des.toFixed(2)+'</Descent>\n'
    + '  <Encode>2</Encode>\n'
    + '  <Lang>0</Lang>\n'
    + '  <TracksCount>'+tps.length+'</TracksCount>\n'
    + '  <Tracks>'+encodeTracks(tps)+'</Tracks>\n'
    + '  <Navs />\n'
    + '  <PointsCount>'+wpts.length+'</PointsCount>\n'
    + '  <Points>\n'
    + pointsXml
    + '  </Points>\n'
    + '</Route>';
}

// ── Leaflet Map ────────────────────────────────────────────────────────
var _map = null;

function mkIcon(color, label) {
  var size = label ? 22 : 14;
  var inner = label
    ? '<div style="width:'+size+'px;height:'+size+'px;border-radius:50%;background:'+color+';border:2px solid #fff;box-shadow:0 0 10px '+color+'80;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#000;font-family:monospace">'+label+'</div>'
    : '<div style="width:'+size+'px;height:'+size+'px;border-radius:50%;background:'+color+';border:2px solid #fff;box-shadow:0 0 10px '+color+'"></div>';
  return L.divIcon({className:'', html:inner, iconSize:[size,size], iconAnchor:[size/2,size/2]});
}

function renderMap(trackpoints, waypoints) {
  var sec = document.getElementById('mapSection');
  sec.style.display = 'block';
  sec.classList.add('fade-in');
  if (_map){_map.remove(); _map=null;}

  _map = L.map('mapContainer', {zoomControl:true, attributionControl:true, preferCanvas:true});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:'&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom:19
  }).addTo(_map);

  var latlngs = trackpoints.map(function(p){return [p.lat, p.lon];});
  L.polyline(latlngs, {color:'#0066ff', weight:10, opacity:0.18}).addTo(_map);
  L.polyline(latlngs, {color:'#0055ee', weight:4,  opacity:0.95}).addTo(_map);

  var tp0=trackpoints[0], tpN=trackpoints[trackpoints.length-1];
  L.marker(latlngs[0], {icon:mkIcon('#39ff14',null)})
    .bindPopup('<div class="pp-name">Start</div><div class="pp-coords">'+tp0.lat.toFixed(6)+', '+tp0.lon.toFixed(6)+'</div><div class="pp-ele">'+Math.round(tp0.ele)+' m</div>')
    .addTo(_map);
  L.marker(latlngs[latlngs.length-1], {icon:mkIcon('#ff3b3b',null)})
    .bindPopup('<div class="pp-name">End</div><div class="pp-coords">'+tpN.lat.toFixed(6)+', '+tpN.lon.toFixed(6)+'</div><div class="pp-ele">'+Math.round(tpN.ele)+' m</div>')
    .addTo(_map);

  waypoints.forEach(function(wpt, i) {
    var lbl = POI_LABELS[parseInt(wpt.type)||0] || 'WPT';
    L.marker([wpt.lat,wpt.lon], {icon:mkIcon('#ff6b00', i+1)})
      .bindPopup('<div class="pp-name">'+escHtml(wpt.name)+'</div><div class="pp-type">'+lbl+'</div><div class="pp-coords">'+wpt.lat.toFixed(6)+', '+wpt.lon.toFixed(6)+'</div>')
      .addTo(_map);
  });

  _map.fitBounds(L.latLngBounds(latlngs), {padding:[28,28]});
  document.getElementById('mapInfo').textContent =
    trackpoints.length.toLocaleString()+' pts'+(waypoints.length?' · '+waypoints.length+' waypoints':'');
  setTimeout(function(){_map.invalidateSize();}, 80);
}

function destroyMap() {
  if (_map){_map.remove(); _map=null;}
  document.getElementById('mapSection').style.display = 'none';
}

// ── Render single UI ───────────────────────────────────────────────────
function renderSingleUI() {
  var d=parsedData, s=d.stats;

  var sb=document.getElementById('statsBar');
  sb.style.display='grid'; sb.classList.add('fade-in');
  document.getElementById('statDist').textContent = (s.dist/1000).toFixed(2);
  document.getElementById('statAsc').textContent  = Math.round(s.asc);
  document.getElementById('statDes').textContent  = Math.round(Math.abs(s.des));
  document.getElementById('statTP').textContent   = d.trackpoints.length.toLocaleString();
  document.getElementById('statWP').textContent   = d.waypoints.length;

  var tnr=document.getElementById('trackNameRow');
  tnr.style.display='flex'; tnr.classList.add('fade-in');
  document.getElementById('trackNameInput').value = d.name.substring(0,50);
  updateCharCount();

  var es=document.getElementById('elevSection');
  es.style.display='block'; es.classList.add('fade-in');
  var eles=d.trackpoints.map(function(p){return p.ele;});
  document.getElementById('elevInfo').textContent =
    Math.round(Math.min.apply(null,eles))+'m - '+Math.round(Math.max.apply(null,eles))+'m';
  drawElevation(d.trackpoints, d.waypoints);

  var ps=document.getElementById('poiSection');
  ps.style.display='block'; ps.classList.add('fade-in');
  document.getElementById('poiCount').textContent = d.waypoints.length+' POIs';
  renderPOITable(d.waypoints);

  var actions=document.getElementById('actions');
  actions.style.display='flex'; actions.classList.add('fade-in');
  document.getElementById('convertBtn').textContent = 'Download CNX';
  updateConvertInfo();
  document.getElementById('fileList').style.display  = 'none';
  document.getElementById('outputPanel').style.display = 'none';

  renderMap(d.trackpoints, d.waypoints);
}

function updateCharCount() {
  var v=document.getElementById('trackNameInput').value;
  var cc=document.getElementById('charCounter');
  cc.textContent = v.length+'/18';
  cc.className = 'char-counter'+(v.length>18?' warn':'');
  updateConvertInfo();
}

function updateConvertInfo() {
  if (!parsedData) return;
  var name=(document.getElementById('trackNameInput').value||parsedData.name).substring(0,18);
  document.getElementById('convertInfo').textContent = 'route_'+name.replace(/\s+/g,'_')+'.cnx';
}

// ── Elevation canvas ───────────────────────────────────────────────────
var _elevData = null;

function drawElevation(tps, wpts) {
  wpts = wpts || [];
  var canvas=document.getElementById('elevationCanvas');
  var dpr=window.devicePixelRatio||1;
  var w=canvas.clientWidth, h=canvas.clientHeight;
  canvas.width=w*dpr; canvas.height=h*dpr;

  function hav(p1,p2){
    var R=6371000,f1=p1.lat*Math.PI/180,f2=p2.lat*Math.PI/180;
    var df=(p2.lat-p1.lat)*Math.PI/180,dl=(p2.lon-p1.lon)*Math.PI/180;
    var a=Math.sin(df/2)*Math.sin(df/2)+Math.cos(f1)*Math.cos(f2)*Math.sin(dl/2)*Math.sin(dl/2);
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }
  var cumDist=[0];
  for(var i=1;i<tps.length;i++) cumDist.push(cumDist[i-1]+hav(tps[i-1],tps[i]));
  var totalDist=cumDist[tps.length-1]||1;

  var eles=tps.map(function(p){return p.ele;});
  var minE=Math.min.apply(null,eles), maxE=Math.max.apply(null,eles);
  var range=maxE-minE||1;
  var pl=8,pr=8,pt=16,pb=20;

  function xOf(d){return pl+(d/totalDist)*(w-pl-pr);}
  function yOf(e){return pt+(1-(e-minE)/range)*(h-pt-pb);}

  _elevData={tps:tps,wpts:wpts,cumDist:cumDist,totalDist:totalDist,
             minE:minE,maxE:maxE,range:range,pl:pl,pr:pr,pt:pt,pb:pb,w:w,h:h,xOf:xOf,yOf:yOf};

  _drawElevationFrame(null);
  _attachElevationHover(canvas);
}

function _drawElevationFrame(hoverFrac) {
  var canvas=document.getElementById('elevationCanvas');
  var ctx=canvas.getContext('2d');
  var dpr=window.devicePixelRatio||1;
  var d=_elevData;
  if(!d)return;
  var w=d.w,h=d.h,pl=d.pl,pr=d.pr,pt=d.pt,pb=d.pb;
  var tps=d.tps,wpts=d.wpts,xOf=d.xOf,yOf=d.yOf;

  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save();
  ctx.scale(dpr,dpr);

  // Background
  ctx.fillStyle='#0f1318';
  ctx.fillRect(0,0,w,h);

  // Grid lines + km labels
  var kmStep=d.totalDist>80000?20000:d.totalDist>40000?10000:d.totalDist>20000?5000:d.totalDist>8000?2000:1000;
  for(var km=kmStep;km<d.totalDist;km+=kmStep){
    var gx=xOf(km);
    ctx.strokeStyle='rgba(255,255,255,0.05)'; ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(gx,pt);ctx.lineTo(gx,h-pb);ctx.stroke();
    ctx.fillStyle='rgba(61,90,115,0.7)'; ctx.font='9px monospace';
    ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillText((km/1000).toFixed(0)+'km',gx,h-1);
  }

  // Gradient fill
  var pts=tps.map(function(p,i){return{x:xOf(d.cumDist[i]),y:yOf(p.ele)};});
  var grad=ctx.createLinearGradient(0,pt,0,h-pb);
  grad.addColorStop(0,'rgba(0,229,255,0.35)');
  grad.addColorStop(1,'rgba(0,229,255,0.03)');
  ctx.beginPath();
  ctx.moveTo(pts[0].x,h-pb);
  for(var i=0;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);
  ctx.lineTo(pts[pts.length-1].x,h-pb);
  ctx.closePath(); ctx.fillStyle=grad; ctx.fill();

  // Track line
  ctx.beginPath();
  for(var i=0;i<pts.length;i++){if(i===0)ctx.moveTo(pts[i].x,pts[i].y);else ctx.lineTo(pts[i].x,pts[i].y);}
  ctx.strokeStyle='rgba(0,229,255,0.9)'; ctx.lineWidth=2; ctx.lineJoin='round'; ctx.stroke();

  // Min/max labels
  ctx.fillStyle='rgba(0,229,255,0.5)'; ctx.font='9px monospace';
  ctx.textAlign='left'; ctx.textBaseline='top';
  ctx.fillText(Math.round(d.maxE)+'m',pl+2,pt);
  ctx.textBaseline='bottom';
  ctx.fillText(Math.round(d.minE)+'m',pl+2,h-pb);

  // Waypoint markers
  wpts.forEach(function(wpt,idx){
    var bestI=0,bestD=Infinity;
    for(var i=0;i<tps.length;i++){
      var dd=Math.abs(tps[i].lat-wpt.lat)+Math.abs(tps[i].lon-wpt.lon);
      if(dd<bestD){bestD=dd;bestI=i;}
    }
    var wx=xOf(d.cumDist[bestI]), wy=yOf(tps[bestI].ele);

    ctx.save();
    ctx.setLineDash([2,3]);
    ctx.strokeStyle='rgba(255,107,0,0.5)'; ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(wx,h-pb);ctx.lineTo(wx,wy+7);ctx.stroke();
    ctx.restore();

    ctx.beginPath();ctx.arc(wx,wy,5,0,Math.PI*2);
    ctx.fillStyle='#ff6b00'; ctx.strokeStyle='#fff'; ctx.lineWidth=1.5;
    ctx.fill();ctx.stroke();

    var bw=15,bh=12,bx=wx-bw/2,by=wy-bh-6;
    if(by<1)by=wy+8;
    ctx.fillStyle='#ff6b00';
    ctx.beginPath();
    if(ctx.roundRect)ctx.roundRect(bx,by,bw,bh,3);else ctx.rect(bx,by,bw,bh);
    ctx.fill();
    ctx.fillStyle='#fff'; ctx.font='bold 8px monospace';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(String(idx+1),wx,by+bh/2);
  });

  // Hover crosshair
  if(hoverFrac!==null && hoverFrac>=0){
    var hx=xOf(hoverFrac*d.totalDist);
    var hIdx=0,hBest=Infinity;
    for(var i=0;i<d.cumDist.length;i++){var dd2=Math.abs(d.cumDist[i]-hoverFrac*d.totalDist);if(dd2<hBest){hBest=dd2;hIdx=i;}}
    var hy=yOf(tps[hIdx].ele);
    ctx.save();
    ctx.strokeStyle='rgba(255,255,255,0.3)'; ctx.lineWidth=1;
    ctx.setLineDash([3,3]);
    ctx.beginPath();ctx.moveTo(hx,pt);ctx.lineTo(hx,h-pb);ctx.stroke();
    ctx.restore();
    ctx.beginPath();ctx.arc(hx,hy,3.5,0,Math.PI*2);
    ctx.fillStyle='#fff';ctx.fill();
  }

  ctx.restore();
}

var _elevHoverAttached=false;
function _attachElevationHover(canvas){
  if(_elevHoverAttached)return;
  _elevHoverAttached=true;

  var tt=document.getElementById('elevTooltip');
  if(!tt){
    tt=document.createElement('div');
    tt.id='elevTooltip';
    tt.style.cssText='position:absolute;background:var(--panel);border:1px solid var(--border2);border-radius:2px;padding:5px 10px;font-family:var(--mono);font-size:10px;color:var(--text);pointer-events:none;display:none;z-index:20;line-height:1.8;white-space:nowrap;top:4px';
    document.getElementById('elevSection').style.position='relative';
    document.getElementById('elevSection').appendChild(tt);
  }

  canvas.addEventListener('mousemove',function(e){
    if(!_elevData)return;
    var d=_elevData;
    var rect=canvas.getBoundingClientRect();
    var mx=e.clientX-rect.left;
    var frac=Math.max(0,Math.min(1,(mx-d.pl)/(d.w-d.pl-d.pr)));
    var dist=frac*d.totalDist;
    var hIdx=0,hBest=Infinity;
    for(var i=0;i<d.cumDist.length;i++){var dd=Math.abs(d.cumDist[i]-dist);if(dd<hBest){hBest=dd;hIdx=i;}}
    var ele=d.tps[hIdx].ele;

    var nearWpt=null;
    for(var wi=0;wi<d.wpts.length;wi++){
      var bestI=0,bD=Infinity;
      for(var i=0;i<d.tps.length;i++){var dd2=Math.abs(d.tps[i].lat-d.wpts[wi].lat)+Math.abs(d.tps[i].lon-d.wpts[wi].lon);if(dd2<bD){bD=dd2;bestI=i;}}
      if(Math.abs(d.cumDist[bestI]-dist)<d.totalDist*0.02){nearWpt={idx:wi,wpt:d.wpts[wi]};break;}
    }

    var html='<span style="color:var(--accent)">'+(dist/1000).toFixed(2)+' km</span>&nbsp;&nbsp;<span style="color:var(--text2)">'+Math.round(ele)+' m</span>';
    if(nearWpt)html+='<br><span style="color:#ff6b00">&#9679; '+(nearWpt.idx+1)+' '+escHtml(nearWpt.wpt.name)+'</span>';
    tt.innerHTML=html; tt.style.display='block';
    var ttW=tt.offsetWidth||130;
    var left=mx+10; if(left+ttW>d.w)left=mx-ttW-10;
    tt.style.left=left+'px';
    _drawElevationFrame(frac);
  });

  canvas.addEventListener('mouseleave',function(){
    if(!_elevData)return;
    document.getElementById('elevTooltip').style.display='none';
    _drawElevationFrame(null);
  });
}

// ── POI Table ──────────────────────────────────────────────────────────
function renderPOITable(waypoints) {
  var tbody=document.getElementById('poiBody');
  tbody.innerHTML='';
  if(!waypoints.length){
    tbody.innerHTML='<tr><td colspan="5"><div class="empty-poi">// No waypoints in this GPX file</div></td></tr>';
    return;
  }
  var opts=POI_TYPES.map(function(t){return '<option value="'+t.id+'">'+t.label+'</option>';}).join('');
  waypoints.forEach(function(wpt,i){
    var tr=document.createElement('tr');
    tr.innerHTML=
      '<td class="poi-index">'+(i<9?'0':'')+(i+1)+'</td>'
      +'<td><input class="poi-name-input" value="'+escHtml(wpt.name)+'" onchange="parsedData.waypoints['+i+'].name=this.value"></td>'
      +'<td class="poi-coords">'+wpt.lat.toFixed(6)+', '+wpt.lon.toFixed(6)+'</td>'
      +'<td><select class="poi-type-select" onchange="parsedData.waypoints['+i+'].type=this.value">'+opts+'</select></td>'
      +'<td><button class="remove-btn" onclick="removeWaypoint('+i+')">&#10005;</button></td>';
    tr.querySelector('select').value=wpt.type;
    tbody.appendChild(tr);
  });
}

function removeWaypoint(idx) {
  parsedData.waypoints.splice(idx,1);
  renderPOITable(parsedData.waypoints);
  document.getElementById('statWP').textContent=parsedData.waypoints.length;
  document.getElementById('poiCount').textContent=parsedData.waypoints.length+' POIs';
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Download ───────────────────────────────────────────────────────────
function convertAndDownload() {
  if(currentMode==='bulk'){downloadBulk();return;}
  if(!parsedData){showToast('No file loaded','error');return;}
  var name=(document.getElementById('trackNameInput').value||parsedData.name).substring(0,18);
  var cnx=generateCNX(parsedData,name);
  var fname='route_'+name.replace(/\s+/g,'_')+'.cnx';
  var ok=downloadFile(fname,'\uFEFF'+cnx);
  showOutputPanel(cnx,fname);
  if(ok)showToast('CNX downloaded!','success');
  else showToast('Download blocked - copy from panel below','error');
}

function downloadBulk() {
  if(!bulkFiles.length){showToast('No files ready','error');return;}
  var count=0;
  bulkFiles.forEach(function(item){
    var fname='route_'+item.data.name.substring(0,18).replace(/\s+/g,'_')+'.cnx';
    if(downloadFile(fname,'\uFEFF'+generateCNX(item.data,item.data.name)))count++;
  });
  if(count>0)showToast('Downloaded '+count+' CNX files!','success');
  else showToast('Download blocked - check browser settings','error');
}

function downloadFile(filename,content) {
  try{
    var b64=btoa(unescape(encodeURIComponent(content)));
    var a=document.createElement('a');
    a.href='data:application/xml;charset=utf-8;base64,'+b64;
    a.download=filename;
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    return true;
  }catch(e){console.error('Download error:',e);return false;}
}

function showOutputPanel(cnxContent,fname) {
  document.getElementById('outFname').textContent=fname;
  document.getElementById('outputText').value=cnxContent;
  document.getElementById('saveName').textContent=fname;
  document.getElementById('outputPanel').style.display='block';
  setTimeout(function(){document.getElementById('outputPanel').scrollIntoView({behavior:'smooth',block:'nearest'});},100);
}

function copyOutput() {
  var ta=document.getElementById('outputText');
  if(!ta)return;
  ta.select();
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(ta.value).then(function(){showToast('Copied!','success');}).catch(function(){document.execCommand('copy');showToast('Copied!','success');});
  }else{document.execCommand('copy');showToast('Copied!','success');}
}

function resetAll() {
  parsedData=null; bulkFiles=[];
  _elevData=null; _elevHoverAttached=false;
  ['statsBar','trackNameRow','elevSection','poiSection','actions','fileList'].forEach(function(id){
    document.getElementById(id).style.display='none';
  });
  document.getElementById('outputPanel').style.display='none';
  document.getElementById('poiBody').innerHTML='';
  destroyMap();
}

function showProgress(show) {
  var pb=document.getElementById('progressBar');
  var pf=document.getElementById('progressFill');
  pb.style.display=show?'block':'none';
  if(show){pf.style.width='0%';setTimeout(function(){pf.style.width='60%';},50);setTimeout(function(){pf.style.width='100%';},200);}
}

var toastTimer;
function showToast(msg,type) {
  type=type||'info';
  var t=document.getElementById('toast');
  t.className='toast '+type;
  document.getElementById('toastMsg').textContent=msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(function(){t.classList.remove('show');},3500);
}

window.addEventListener('resize',function(){
  if(parsedData)drawElevation(parsedData.trackpoints,parsedData.waypoints);
});
