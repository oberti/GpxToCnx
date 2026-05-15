var APP_VERSION = '1.0.3';

// ═══════════════════════════════════════════════════════════
// GPX to CNX Converter + Water Finder
// Credits: LudvvigB/GPXtoCNXConverter, sidkurt/GPXtoCNXConverter, jsleroy/thirsty
// ═══════════════════════════════════════════════════════════

var POI_TYPES = [
  {id:'0',label:'Waypoint'},{id:'1',label:'Sprint Point'},{id:'2',label:'HC Climb'},
  {id:'3',label:'Level 1 Climb'},{id:'4',label:'Level 2 Climb'},{id:'5',label:'Level 3 Climb'},
  {id:'6',label:'Level 4 Climb'},{id:'7',label:'Supply Point'},{id:'8',label:'Garbage Recycle Area'},
  {id:'9',label:'Restroom'},{id:'10',label:'Service Point'},{id:'11',label:'Medical Aid Station'},
  {id:'12',label:'Equipment Area'},{id:'13',label:'Shop'},{id:'14',label:'Meeting Point'},
  {id:'15',label:'Viewing Platform'},{id:'16',label:'Instagram-Worthy Location'},{id:'17',label:'Tunnel'},
  {id:'18',label:'Valley'},{id:'19',label:'Dangerous Road'},{id:'20',label:'Sharp Turn'},
  {id:'21',label:'Steep Slope'},{id:'22',label:'Intersection'}
];
var POI_LABELS = POI_TYPES.map(function(t){return t.label;});

// AMENITIES ported exactly from jsleroy/thirsty core.py
var AMENITIES = {
  'water':          ['node[amenity=drinking_water]'],
  'point':          ['node[amenity=water_point][drinking_water=yes]'],
  'tap':            ['node[man_made=water_tap][drinking_water=yes]'],
  'spring':         ['node[natural=spring][drinking_water=yes]'],
  'fountain':       ['node[amenity=fountain][drinking_water=yes]'],
  'watering_place': ['node[amenity=watering_place][drinking_water=yes]'],
  'non-potable': [
    'node[amenity=watering_place][drinking_water!~yes]',
    'node[amenity=water_point][drinking_water!~yes]',
    'node[man_made=water_tap][drinking_water!~yes]',
    'node[natural=spring][drinking_water!~yes]',
    'node[amenity=fountain][drinking_water!~yes]'
  ]
};
var OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.nchc.org.tw/api/interpreter'
];

// ── State ────────────────────────────────────────────────────
var currentMode   = 'single';
var parsedData    = null;
var bulkFiles     = [];
var _waterResults = [];
var _waterLayers  = [];

// ── Mode tabs ────────────────────────────────────────────────
document.querySelectorAll('.mode-tab').forEach(function(tab) {
  tab.addEventListener('click', function() {
    document.querySelectorAll('.mode-tab').forEach(function(t){t.classList.remove('active');});
    tab.classList.add('active');
    currentMode = tab.dataset.mode;
    document.getElementById('dropTitle').textContent =
      currentMode==='bulk' ? 'Drop multiple GPX files' : 'Drop GPX file here';
    document.getElementById('fileInput').multiple = (currentMode==='bulk');
    resetAll();
  });
});

// ── Drag & Drop ──────────────────────────────────────────────
var dz = document.getElementById('dropzone');
dz.addEventListener('dragover',  function(e){e.preventDefault(); dz.classList.add('drag-over');});
dz.addEventListener('dragleave', function(){dz.classList.remove('drag-over');});
dz.addEventListener('drop', function(e) {
  e.preventDefault(); dz.classList.remove('drag-over');
  var files = Array.from(e.dataTransfer.files).filter(function(f){return f.name.toLowerCase().endsWith('.gpx');});
  if (!files.length) { showToast('No GPX files found','error'); return; }
  handleFiles(files);
});
dz.addEventListener('click', function(){document.getElementById('fileInput').click();});
document.getElementById('browseLink').addEventListener('click', function(e){
  e.stopPropagation(); document.getElementById('fileInput').click();
});
document.getElementById('fileInput').addEventListener('change', function(e) {
  if (e.target.files.length) handleFiles(Array.from(e.target.files));
  e.target.value = '';
});

function handleFiles(files) {
  if (currentMode === 'single') loadSingleFile(files[0]);
  else loadBulkFiles(files);
}

// ── Single file ──────────────────────────────────────────────
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
      showToast('Error: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

// ── Bulk files ───────────────────────────────────────────────
function loadBulkFiles(files) {
  bulkFiles = []; _waterResults = [];
  ['statsBar','trackNameRow','elevSection','poiSection','waterSection','step2header'].forEach(function(id){
    document.getElementById(id).style.display = 'none';
  });
  destroyMap();
  var fl = document.getElementById('fileList');
  fl.innerHTML = ''; fl.style.display = 'flex';
  var pending = files.length;
  files.forEach(function(file) {
    var sid = 'bf_' + file.name.replace(/\W/g,'_');
    var chip = document.createElement('div');
    chip.className = 'file-chip fade-in';
    chip.innerHTML = '<span>&#128193;</span>'
      + '<span class="file-chip-name">' + escHtml(file.name) + '</span>'
      + '<span class="file-chip-status" id="' + sid + '">Parsing&#8230;</span>';
    fl.appendChild(chip);
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var data = parseGPX(ev.target.result, file.name);
        data.filename = file.name; bulkFiles.push({name: file.name, data: data, waterAdded: false});
        document.getElementById(sid).textContent = '\u2713 Ready';
        document.getElementById(sid).className = 'file-chip-status ok';
      } catch(err) {
        document.getElementById(sid).textContent = '\u2715 ' + err.message;
        document.getElementById(sid).className = 'file-chip-status err';
      }
      pending--;
      if (pending === 0) renderBulkUI();
    };
    reader.readAsText(file);
  });
}

function renderBulkUI() {
  var ready = bulkFiles.filter(function(f){ return f.data; });
  if (!ready.length) { showToast('No valid GPX files','error'); return; }
  var ws = document.getElementById('waterSection');
  ws.style.display = 'block'; ws.classList.add('fade-in');
  document.getElementById('waterResults').style.display = 'none';
  document.getElementById('step2header').style.display = 'block';
  var actions = document.getElementById('actions');
  actions.style.display = 'flex'; actions.classList.add('fade-in');
  document.getElementById('saveGpxBtn').style.display = 'none';
  document.getElementById('convertBtn').textContent = '\u2b07 Download All CNX (' + ready.length + ')';
  document.getElementById('convertInfo').textContent = ready.length + ' files ready';
  renderBulkTable();
}

function renderBulkTable() {
  var ps = document.getElementById('poiSection');
  ps.style.display = 'block';
  document.querySelector('#poiSection .section-title').textContent = 'Files to Convert';
  document.getElementById('poiCount').textContent = bulkFiles.length + ' files';
  var thead = document.querySelector('.poi-table thead tr');
  thead.innerHTML = '<th>#</th><th>File</th><th>Distance</th><th>POIs</th><th>Water Score</th><th></th>';
  var tbody = document.getElementById('poiBody');
  tbody.innerHTML = '';
  bulkFiles.forEach(function(item, i) {
    if (!item.data) return;
    var tr = document.createElement('tr');
    var dist = (item.data.stats.dist/1000).toFixed(2);

    // Water Score for this file (only if water search was done)
    var scoreHtml = '<span style="font-size:11px;color:var(--text3)">&#8212; search first</span>';
    if (item.waterAdded || item.data.waypoints.some(function(w){return w._water;})) {
      var waterPois = _waterResults.filter(function(p){ return p._bulkFileIdx === i; });
      if (waterPois.length) {
        var ws = calcWaterScore(waterPois, item.data.trackpoints,
          parseInt(document.getElementById('waterDist').value)||100);
        var color = ws.score>=8?'#39ff14':ws.score>=6?'#00e5ff':ws.score>=4?'#ff9900':'#ff3b3b';
        var filled  = Array(Math.round(ws.score)+1).join('\u2588');
        var unfilled= Array(10-Math.round(ws.score)+1).join('\u2591');
        scoreHtml = '<div style="display:flex;align-items:center;gap:6px">'
          +'<span style="font-family:var(--mono);font-size:11px;color:'+color+';letter-spacing:-1px">'+filled+unfilled+'</span>'
          +'<span style="font-size:12px;font-weight:500;color:'+color+'">'+ws.score+'</span>'
          +'</div>';
      }
    }

    tr.innerHTML =
      '<td class="poi-index">'+(i<9?'0':'')+(i+1)+'</td>'
      +'<td style="font-size:12px;color:var(--text2);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+escHtml(buildCnxFilename(item.data))+'">'+escHtml(buildCnxFilename(item.data))+'</td>'
      +'<td class="poi-coords">'+dist+' km</td>'
      +'<td class="poi-coords">'+item.data.waypoints.length+(item.data.waypoints.some(function(w){return w._water;})?'  &#128167;':'')+'</td>'
      +'<td>'+scoreHtml+'</td>'
      +'<td><button class="out-btn sec" style="padding:5px 10px;font-size:10px;font-family:var(--mono);letter-spacing:1px" onclick="downloadSingleBulkCNX('+i+')">\u2b07 CNX</button></td>';
    tbody.appendChild(tr);
  });
}

function downloadSingleBulkCNX(idx) {
  var item = bulkFiles[idx];
  if (!item||!item.data) return;
  var fname = buildCnxFilename(item.data);
  if (downloadFile(fname, generateCNX(item.data, item.data.name)))
    showToast('Downloaded: '+fname,'success');
  else showToast('Download blocked','error');
}

// ═══════════════════════════════════════════════════════════
// GPX PARSER — merge ALL trk/trkseg/trkpt (sidkurt logic)
// ═══════════════════════════════════════════════════════════
function parseGPX(xmlStr, filename) {
  var parser = new DOMParser();
  var doc = parser.parseFromString(xmlStr, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Invalid XML');
  function getAll(p,t){return Array.from(p.getElementsByTagNameNS('*',t));}
  function getFirst(p,t){return getAll(p,t)[0]||null;}
  function getText(el){return el&&el.textContent?el.textContent.trim():'';}

  var name='';
  var firstTrk=getFirst(doc,'trk'),firstRte=getFirst(doc,'rte');
  if(firstTrk){var _n=getFirst(firstTrk,'name');if(_n)name=getText(_n);}
  if(!name&&firstRte){var _n=getFirst(firstRte,'name');if(_n)name=getText(_n);}
  if(!name){var _m=getFirst(doc,'metadata');if(_m){var _n=getFirst(_m,'name');if(_n)name=getText(_n);}}
  if(!name)name=filename.replace(/\.gpx$/i,'');

  var trackpoints=[];
  getAll(doc,'trk').forEach(function(trk){
    getAll(trk,'trkseg').forEach(function(seg){
      getAll(seg,'trkpt').forEach(function(tp){
        var latStr=tp.getAttribute('lat'),lonStr=tp.getAttribute('lon');
        if(!latStr||!lonStr)return;
        var lat=parseFloat(latStr),lon=parseFloat(lonStr);
        if(isNaN(lat)||isNaN(lon))return;
        var eleEl=getFirst(tp,'ele');
        var ele=eleEl?parseFloat(getText(eleEl)):0;
        if(isNaN(ele))ele=0;
        trackpoints.push({lat:lat,lon:lon,ele:ele,latStr:latStr.trim(),lonStr:lonStr.trim()});
      });
    });
  });
  if(!trackpoints.length){
    getAll(doc,'rte').forEach(function(rte){
      getAll(rte,'rtept').forEach(function(tp){
        var latStr=tp.getAttribute('lat'),lonStr=tp.getAttribute('lon');
        if(!latStr||!lonStr)return;
        var lat=parseFloat(latStr),lon=parseFloat(lonStr);
        if(isNaN(lat)||isNaN(lon))return;
        var eleEl=getFirst(tp,'ele');
        var ele=eleEl?parseFloat(getText(eleEl)):0;
        if(isNaN(ele))ele=0;
        trackpoints.push({lat:lat,lon:lon,ele:ele,latStr:latStr.trim(),lonStr:lonStr.trim()});
      });
    });
  }
  if(!trackpoints.length)throw new Error('No trackpoints found in GPX');

  // Fix 6: remove invalid coordinates (0,0 = no GPS fix) and statistical outliers
  // Step 1: remove exact 0,0 points
  trackpoints = trackpoints.filter(function(p){
    return !(p.lat===0 && p.lon===0);
  });

  // Step 2: remove points more than 100km from the median center (GPS glitches)
  if(trackpoints.length > 2){
    var sortedLats = trackpoints.map(function(p){return p.lat;}).slice().sort(function(a,b){return a-b;});
    var sortedLons = trackpoints.map(function(p){return p.lon;}).slice().sort(function(a,b){return a-b;});
    var medLat = sortedLats[Math.floor(sortedLats.length/2)];
    var medLon = sortedLons[Math.floor(sortedLons.length/2)];
    var MAX_DIST_M = 200000; // 200km — generous to allow long routes
    trackpoints = trackpoints.filter(function(p){
      var dlat=(p.lat-medLat)*Math.PI/180*6371000;
      var dlon=(p.lon-medLon)*Math.PI/180*6371000*Math.cos(medLat*Math.PI/180);
      return Math.sqrt(dlat*dlat+dlon*dlon) < MAX_DIST_M;
    });
  }

  if(!trackpoints.length)throw new Error('No valid trackpoints after filtering');

  var waypoints=[];
  getAll(doc,'wpt').forEach(function(wpt,i){
    var latStr=wpt.getAttribute('lat'),lonStr=wpt.getAttribute('lon');
    if(!latStr||!lonStr)return;
    var lat=parseFloat(latStr),lon=parseFloat(lonStr);
    if(isNaN(lat)||isNaN(lon))return;
    var nameEl=getFirst(wpt,'name');
    var wname=nameEl?getText(nameEl):'WPT'+(i+1);
    waypoints.push({lat:lat,lon:lon,latStr:latStr.trim(),lonStr:lonStr.trim(),name:wname,type:'0',_water:false});
  });

  var stats=calcStats(trackpoints);
  waypoints.forEach(function(wpt){
    var bestI=0,bestD=Infinity;
    for(var i=0;i<trackpoints.length;i++){
      var dd=Math.abs(trackpoints[i].lat-wpt.lat)+Math.abs(trackpoints[i].lon-wpt.lon);
      if(dd<bestD){bestD=dd;bestI=i;}
    }
    wpt._tpIdx=bestI;
  });
  waypoints.sort(function(a,b){return a._tpIdx-b._tpIdx;});
  return {name:name,filename:filename,trackpoints:trackpoints,waypoints:waypoints,stats:stats};
}

// ═══════════════════════════════════════════════════════════
// MATH / STATS
// ═══════════════════════════════════════════════════════════
function haversineM(lat1,lon1,lat2,lon2){
  var R=6371000,phi1=lat1*Math.PI/180,phi2=lat2*Math.PI/180,
      dphi=(lat2-lat1)*Math.PI/180,dlam=(lon2-lon1)*Math.PI/180,
      a=Math.sin(dphi/2)*Math.sin(dphi/2)+Math.cos(phi1)*Math.cos(phi2)*Math.sin(dlam/2)*Math.sin(dlam/2);
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function calc3DDist(p1,p2){
  var h=haversineM(p1.lat,p1.lon,p2.lat,p2.lon);
  return Math.sqrt(h*h+(p2.ele-p1.ele)*(p2.ele-p1.ele));
}
function calcStats(tps){
  var dist=0,asc=0,des=0;
  for(var i=1;i<tps.length;i++){
    dist+=calc3DDist(tps[i-1],tps[i]);
    var de=tps[i].ele-tps[i-1].ele;
    if(de>0)asc+=de;else des+=de;
  }
  return {dist:dist,asc:asc,des:des};
}
function calcStatsRounded(tps){
  var dist=0,asc=0,des=0;
  for(var i=1;i<tps.length;i++){
    dist+=calc3DDist(tps[i-1],tps[i]); dist=Math.round(dist*100)/100;
    var de=tps[i].ele-tps[i-1].ele;
    if(de>0){asc+=de;asc=Math.round(asc*100)/100;}
    else{des+=de;des=Math.round(des*100)/100;}
  }
  return {dist:dist.toFixed(2),asc:asc.toFixed(2),des:des.toFixed(2)};
}

// ── Distance from point to nearest SEGMENT (point-to-segment, not point-to-point) ──
function minDistToTrack(lat,lon,tps){
  if(!tps.length)return Infinity;
  if(tps.length===1)return haversineM(lat,lon,tps[0].lat,tps[0].lon);
  var R=6371000,cosLat=Math.cos(lat*Math.PI/180),minD=Infinity;
  for(var i=0;i<tps.length-1;i++){
    var d=_distToSegment(lat,lon,cosLat,tps[i],tps[i+1],R);
    if(d<minD){minD=d;if(minD<1)break;}
  }
  return minD;
}
function _distToSegment(plat,plon,cosLat,a,b,R){
  var px=(plon-a.lon)*cosLat*Math.PI/180*R,py=(plat-a.lat)*Math.PI/180*R;
  var bx=(b.lon-a.lon)*cosLat*Math.PI/180*R,by=(b.lat-a.lat)*Math.PI/180*R;
  var segLen2=bx*bx+by*by;
  if(segLen2<0.0001)return Math.sqrt(px*px+py*py);
  var t=Math.max(0,Math.min(1,(px*bx+py*by)/segLen2));
  return Math.sqrt((px-t*bx)*(px-t*bx)+(py-t*by)*(py-t*by));
}

// ═══════════════════════════════════════════════════════════
// CNX ENCODER (LudvvigB/GPXtoCNXConverter port)
// ═══════════════════════════════════════════════════════════
function encodeTracks(tps){
  if(!tps.length)return'';
  var pts=[],lat0=tps[0].latStr||String(tps[0].lat),lon0=tps[0].lonStr||String(tps[0].lon);
  pts.push(lat0+','+lon0+','+Math.round(tps[0].ele*100));
  if(tps.length===1)return pts.join(';')+';';
  var fd=[];
  for(var i=1;i<tps.length;i++){
    fd.push([(tps[i].lat-tps[i-1].lat)*10000000,
             (tps[i].lon-tps[i-1].lon)*10000000,
             Math.round(tps[i].ele*100)-Math.round(tps[i-1].ele*100)]);
  }
  pts.push(Math.round(fd[0][0])+','+Math.round(fd[0][1])+','+fd[0][2]);
  for(var i=1;i<fd.length;i++)
    pts.push(Math.round(fd[i][0]-fd[i-1][0])+','+Math.round(fd[i][1]-fd[i-1][1])+','+fd[i][2]);
  return pts.join(';')+';';
}
function xmlEsc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
// Build CNX filename from original GPX filename + _H2O suffix if water added
function buildCnxFilename(data){
  var base = (data.filename || data.name)
    .replace(/\.gpx$/i, '')   // remove .gpx extension
    .replace(/[^\w\-]/g, '_') // sanitize
    .replace(/_+/g, '_')       // collapse multiple underscores
    .replace(/^_|_$/g, '');   // trim leading/trailing underscores
  var hasWater = data.waypoints.some(function(w){ return w._water; });
  return base + (hasWater ? '_H2O' : '') + '.cnx';
}

function generateCNX(data,customName){
  var tps=data.trackpoints,wpts=data.waypoints;
  var id=xmlEsc((customName||data.name).substring(0,18));
  var dist=calcStatsRounded(tps);
  var pointsXml='';
  for(var i=0;i<wpts.length;i++){
    var w=wpts[i],lat=w.latStr||String(w.lat),lon=w.lonStr||String(w.lon);
    pointsXml+='    <Point>\n      <Lat>'+lat+'</Lat>\n      <Lng>'+lon+'</Lng>\n      <Type>'+w.type+'</Type>\n      <Descr>'+xmlEsc(w.name)+'</Descr>\n    </Point>\n';
  }
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    +'<Route>\n  <Id>'+id+'</Id>\n  <Distance>'+dist.dist+'</Distance>\n'
    +'  <Duration>\n  </Duration>\n  <Ascent>'+dist.asc+'</Ascent>\n  <Descent>'+dist.des+'</Descent>\n'
    +'  <Encode>2</Encode>\n  <Lang>0</Lang>\n  <TracksCount>'+tps.length+'</TracksCount>\n'
    +'  <Tracks>'+encodeTracks(tps)+'</Tracks>\n  <Navs />\n  <PointsCount>'+wpts.length+'</PointsCount>\n'
    +(wpts.length?'  <Points>\n'+pointsXml+'  </Points>\n':'  <Points/>\n')
    +'</Route>';
}

// ═══════════════════════════════════════════════════════════
// ELEVATION FETCH (Open-Elevation API)
// ═══════════════════════════════════════════════════════════
function hasElevation(tps){
  return tps.some(function(p){return p.ele!==0;});
}
function fetchElevation(tps,onDone){
  var BATCH=200,batches=[],results=new Array(tps.length);
  for(var i=0;i<tps.length;i+=BATCH)batches.push(tps.slice(i,i+BATCH));
  document.getElementById('elevFetchStatus').textContent='Fetching elevation (0/'+batches.length+')...';
  function fetchBatch(bIdx){
    if(bIdx>=batches.length){
      for(var k=0;k<tps.length;k++)tps[k].ele=results[k]||0;
      document.getElementById('elevFetchStatus').textContent='';
      document.getElementById('elevFetchBanner').style.display='none';
      onDone();return;
    }
    var batch=batches[bIdx];
    var locations=batch.map(function(p){return{latitude:p.lat,longitude:p.lon};});
    fetch('https://api.open-elevation.com/api/v1/lookup',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({locations:locations})
    })
    .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
    .then(function(data){
      var offset=bIdx*BATCH;
      (data.results||[]).forEach(function(r,i){results[offset+i]=r.elevation||0;});
      document.getElementById('elevFetchStatus').textContent='Fetching elevation ('+(bIdx+1)+'/'+batches.length+')...';
      setTimeout(function(){fetchBatch(bIdx+1);},300);
    })
    .catch(function(){
      document.getElementById('elevFetchStatus').textContent='Partial error, continuing...';
      setTimeout(function(){fetchBatch(bIdx+1);},300);
    });
  }
  fetchBatch(0);
}
function dismissElevBanner(){
  document.getElementById('elevFetchBanner').style.display='none';
}

// ═══════════════════════════════════════════════════════════
// WATER FINDER (jsleroy/thirsty port)
// ═══════════════════════════════════════════════════════════
function buildOverpassQuery(bbox,types){
  var bboxStr='('+bbox[0]+','+bbox[1]+','+bbox[2]+','+bbox[3]+')';
  var parts=[];
  types.forEach(function(t){if(AMENITIES[t])AMENITIES[t].forEach(function(f){parts.push(f+bboxStr+';');});});
  return '[out:json][timeout:25];('+parts.join('')+');out center;';
}
function getSelectedWaterTypes(){
  var checked=[];
  document.querySelectorAll('#waterSection .wchk input:checked').forEach(function(cb){checked.push(cb.value);});
  return checked;
}
function getWaterIcon(poi){
  var tags=poi.tags||{};
  if(tags.amenity==='drinking_water')return'&#128167;';
  if(tags.amenity==='fountain')return'&#9975;';
  if(tags.amenity==='water_point')return'&#127890;';
  if(tags.amenity==='watering_place')return'&#128052;';
  if(tags.natural==='spring')return'&#127956;';
  if(tags.man_made==='water_tap')return'&#128268;';
  return'&#128167;';
}
function getWaterLabel(poi){
  var tags=poi.tags||{},name=tags.name||tags['name:en']||tags['name:it']||'';
  if(tags.amenity==='drinking_water')return name||'Drinking Fountain';
  if(tags.amenity==='fountain')return name||'Fountain';
  if(tags.amenity==='water_point')return name||'Water Point';
  if(tags.amenity==='watering_place')return name||'Watering Place';
  if(tags.natural==='spring')return name||'Spring';
  if(tags.man_made==='water_tap')return name||'Water Tap';
  return name||'Water';
}
function queryOverpassWithFallback(query,endpoints,cb,onStatus,_total){
  var total=_total||endpoints.length;
  if(!endpoints.length){cb(new Error('All '+total+' servers tried. Please retry.'));return;}
  var url=endpoints[0],rest=endpoints.slice(1);
  var serverNo=total-rest.length;
  var TIMEOUT_MS=60000,MAX_RETRIES=1;
  if(onStatus)onStatus('Server '+serverNo+'/'+total+'...');
  function tryFetch(retriesLeft){
    var controller=typeof AbortController!=='undefined'?new AbortController():null;
    var timer=controller?setTimeout(function(){controller.abort();},TIMEOUT_MS):null;
    fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(query),signal:controller?controller.signal:undefined})
    .then(function(r){clearTimeout(timer);if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
    .then(function(json){
      if(json.remark&&(!json.elements||!json.elements.length))throw new Error('Server busy');
      if(json.error)throw new Error(json.error);
      cb(null,json);
    })
    .catch(function(err){
      clearTimeout(timer);
      var isTimeout=err.name==='AbortError';
      if(!isTimeout&&retriesLeft>0){
        if(onStatus)onStatus('Server '+serverNo+'/'+total+' retry '+(MAX_RETRIES-retriesLeft+1)+'/'+MAX_RETRIES+'...');
        setTimeout(function(){tryFetch(retriesLeft-1);},2000);
      } else {
        if(rest.length){
          if(onStatus)onStatus('Server '+serverNo+' failed, trying '+(serverNo+1)+'/'+total+'...');
          queryOverpassWithFallback(query,rest,cb,onStatus,total);
        } else {
          cb(new Error('All '+total+' servers tried. Please retry.'));
        }
      }
    });
  }
  tryFetch(MAX_RETRIES);
}

// ── Shared filter (identical for single and bulk) ────────────
function _filterWaterPOIs(elements,tps,maxDist){
  var pois=(elements||[]).filter(function(poi){
    var lat=poi.lat||(poi.center&&poi.center.lat);
    var lon=poi.lon||(poi.center&&poi.center.lon);
    if(!lat||!lon)return false;
    poi.lat=lat;poi.lon=lon;
    poi._dist=minDistToTrack(lat,lon,tps);
    return poi._dist<=maxDist;
  });
  pois.sort(function(a,b){return a._dist-b._dist;});
  return pois;
}

// ── Shared UI helpers ────────────────────────────────────────
function _waterSearchStart(){
  var btn=document.getElementById('waterSearchBtn'),icon=document.getElementById('waterBtnIcon');
  btn.disabled=true;icon.className='spinning';icon.textContent='\u27f3';
  document.getElementById('waterStatus').innerHTML='';
  return{btn:btn,icon:icon};
}
function _waterSearchEnd(ui){
  ui.btn.disabled=false;ui.icon.className='';ui.icon.textContent='💧';
}
function _waterSearchError(ui,msg){
  _waterSearchEnd(ui);
  showToast(msg,'error');
  document.getElementById('waterStatus').textContent='\u26a0 '+msg;
}
function _buildBbox(tps){
  return[
    Math.min.apply(null,tps.map(function(p){return p.lat;}))-0.002,
    Math.min.apply(null,tps.map(function(p){return p.lon;}))-0.002,
    Math.max.apply(null,tps.map(function(p){return p.lat;}))+0.002,
    Math.max.apply(null,tps.map(function(p){return p.lon;}))+0.002
  ];
}

function findWater(){
  if(currentMode==='bulk'){findWaterBulk();return;}
  if(!parsedData){showToast('Please load a GPX file first','error');return;}
  var types=getSelectedWaterTypes();
  if(!types.length){showToast('Select at least one water type','error');return;}
  var maxDist=parseInt(document.getElementById('waterDist').value)||100;
  var ui=_waterSearchStart();
  var tps=parsedData.trackpoints;
  queryOverpassWithFallback(
    buildOverpassQuery(_buildBbox(tps),types),OVERPASS_ENDPOINTS.slice(),
    function(err,json){
      if(err){_waterSearchError(ui,err.message);return;}
      _waterSearchEnd(ui);
      document.getElementById('waterStatus').innerHTML='';
      var pois=_filterWaterPOIs(json.elements,tps,maxDist);
      _waterResults=pois;
      showWaterResults(pois,maxDist);
      showToast(pois.length+' water points found','water');
    },
    function(msg){ var el=document.getElementById('waterStatus'); el.innerHTML+='<div>▶ '+escHtml(msg)+'</div>'; }
  );
}

function findWaterBulk(){
  var types=getSelectedWaterTypes();
  if(!types.length){showToast('Select at least one water type','error');return;}
  var maxDist=parseInt(document.getElementById('waterDist').value)||100;
  var ready=bulkFiles.filter(function(f){return f.data;});
  if(!ready.length){showToast('No files loaded','error');return;}

  var ui=_waterSearchStart();

  // ONE merged bbox query covering ALL files — avoids N sequential requests
  // and the Overpass rate limiting that causes errors on 2nd/3rd file.
  // We use a single lightweight union query, then filter client-side per file.
  var allLats=[], allLons=[];
  ready.forEach(function(f){
    f.data.trackpoints.forEach(function(p){ allLats.push(p.lat); allLons.push(p.lon); });
  });
  var S = Math.min.apply(null,allLats)-0.002;
  var W = Math.min.apply(null,allLons)-0.002;
  var N = Math.max.apply(null,allLats)+0.002;
  var E = Math.max.apply(null,allLons)+0.002;
  var bbox = '('+S+','+W+','+N+','+E+')';

  // Build query from selected types
  var parts=[];
  types.forEach(function(t){
    if(AMENITIES[t]) AMENITIES[t].forEach(function(f){ parts.push(f+bbox+';'); });
  });
  var query='[out:json][timeout:60];('+parts.join('')+');out center;';

  document.getElementById('waterStatus').innerHTML='<div>▶ Querying Overpass (1 request for all routes)...</div>';

  queryOverpassWithFallback(query, OVERPASS_ENDPOINTS.slice(),
    function(err, json){
      if(err){ _waterSearchError(ui, err.message); return; }
      _waterSearchEnd(ui);
      document.getElementById('waterStatus').innerHTML='';

      // Filter each POI against each file
      var allPois=[];
      (json.elements||[]).forEach(function(poi){
        var lat=poi.lat||(poi.center&&poi.center.lat);
        var lon=poi.lon||(poi.center&&poi.center.lon);
        if(!lat||!lon) return;
        poi.lat=lat; poi.lon=lon;
        // Assign to every file whose track is within maxDist
        ready.forEach(function(fileItem, fileIdx){
          var d=minDistToTrack(lat, lon, fileItem.data.trackpoints);
          if(d<=maxDist){
            allPois.push(Object.assign({}, poi, {_dist:d, _bulkFileIdx:fileIdx}));
          }
        });
      });
      allPois.sort(function(a,b){ return a._dist-b._dist; });
      _waterResults=allPois;
      showWaterResults(allPois, maxDist);
      showToast(allPois.length+' water points found across '+ready.length+' routes','water');
    },
    function(msg){ var el=document.getElementById('waterStatus'); el.innerHTML+='<div>▶ '+escHtml(msg)+'</div>'; }
  );
}

function calcWaterScore(pois, tps, maxDist) {
  if (!pois.length || !tps.length) return {score:0, label:'None', coverage:0, gapKm:0, potablePct:0};

  // A — Coverage: % of track within maxDist of at least one source
  var step = Math.max(1, Math.floor(tps.length / 200)); // sample 200 points max
  var covered = 0, total = 0;
  for (var i = 0; i < tps.length; i += step) {
    total++;
    for (var j = 0; j < pois.length; j++) {
      var d = minDistToTrack(pois[j].lat, pois[j].lon, [tps[i]]);
      if (d <= maxDist) { covered++; break; }
    }
  }
  var coveragePct = total > 0 ? covered / total : 0;

  // B — Average gap between sources along track (km)
  // Sort pois by position along track
  var poisWithIdx = pois.map(function(poi) {
    var bestI = 0, bestD = Infinity;
    for (var i = 0; i < tps.length; i++) {
      var dd = Math.abs(tps[i].lat - poi.lat) + Math.abs(tps[i].lon - poi.lon);
      if (dd < bestD) { bestD = dd; bestI = i; }
    }
    return { poi: poi, tpIdx: bestI };
  });
  poisWithIdx.sort(function(a, b){ return a.tpIdx - b.tpIdx; });

  // Cumulative distance along track
  function hav2(p1,p2){var R=6371000,f1=p1.lat*Math.PI/180,f2=p2.lat*Math.PI/180,df=(p2.lat-p1.lat)*Math.PI/180,dl=(p2.lon-p1.lon)*Math.PI/180,a=Math.sin(df/2)*Math.sin(df/2)+Math.cos(f1)*Math.cos(f2)*Math.sin(dl/2)*Math.sin(dl/2);return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
  var cumDist = [0];
  for (var i = 1; i < tps.length; i++) cumDist.push(cumDist[i-1] + hav2(tps[i-1], tps[i]));
  var totalDistKm = cumDist[tps.length-1] / 1000;

  var avgGapKm = 0;
  if (poisWithIdx.length > 1) {
    var gaps = [];
    for (var i = 1; i < poisWithIdx.length; i++) {
      var gapM = cumDist[poisWithIdx[i].tpIdx] - cumDist[poisWithIdx[i-1].tpIdx];
      gaps.push(gapM / 1000);
    }
    avgGapKm = gaps.reduce(function(s,v){return s+v;},0) / gaps.length;
  } else {
    avgGapKm = totalDistKm; // only 1 source = gap = full route
  }

  // C — Quality: % of potable sources
  var potable = pois.filter(function(p){
    var t=p.tags||{};
    return t.drinking_water==='yes'||t.amenity==='drinking_water';
  }).length;
  var potablePct = pois.length > 0 ? potable / pois.length : 0;

  // Score: A(40%) + B(40%) + C(20%)
  // Coverage: 1.0 = 10pts, 0.0 = 0pts
  var scoreA = coveragePct * 10;

  // Gap: <5km=10, 5-10=8, 10-20=6, 20-30=4, 30-50=2, >50=0
  var scoreB = avgGapKm < 5  ? 10 :
               avgGapKm < 10 ? 8  :
               avgGapKm < 20 ? 6  :
               avgGapKm < 30 ? 4  :
               avgGapKm < 50 ? 2  : 0;

  var scoreC = potablePct * 10;

  var score = Math.round((scoreA * 0.4 + scoreB * 0.4 + scoreC * 0.2) * 10) / 10;

  var label = score >= 8 ? 'Excellent' :
              score >= 6 ? 'Good'      :
              score >= 4 ? 'Fair'      :
              score >= 2 ? 'Poor'      : 'Critical';

  return { score: score, label: label, coverage: Math.round(coveragePct*100),
           gapKm: avgGapKm.toFixed(1), potablePct: Math.round(potablePct*100) };
}

function renderWaterScore(ws) {
  var color = ws.score >= 8 ? '#39ff14' :
              ws.score >= 6 ? '#00e5ff' :
              ws.score >= 4 ? '#ff9900' :
              ws.score >= 2 ? '#ff6b00' : '#ff3b3b';
  var bars = Math.round(ws.score);
  var filled   = '█'.repeat(bars);
  var unfilled = '░'.repeat(10 - bars);
  return '<div id="waterScore" style="margin-bottom:14px;padding:14px 16px;background:var(--bg3);border:1px solid var(--border);border-left:3px solid '+color+';border-radius:2px">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
    + '<span style="font-family:var(--display);font-size:14px;font-weight:700;letter-spacing:2px;color:var(--text)">&#128167; Water Score</span>'
    + '<span style="font-family:var(--mono);font-size:20px;color:'+color+';font-weight:bold">'+ws.score+'<span style="font-size:12px;color:var(--text3)">/10</span></span>'
    + '</div>'
    + '<div style="font-family:var(--mono);font-size:14px;letter-spacing:2px;color:'+color+';margin-bottom:10px">'+filled+unfilled+'&nbsp;<span style="font-size:11px">'+ws.label+'</span></div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">'
    + _wsFact('Coverage', ws.coverage+'%')+_wsFact('Avg gap', ws.gapKm+' km')+_wsFact('Potable', ws.potablePct+'%')
    + '</div>'
    + '</div>';
}

function _wsFact(label, value) {
  return '<div style="text-align:center;background:var(--panel);border:1px solid var(--border);border-radius:2px;padding:6px 4px">'
    + '<div style="font-family:var(--mono);font-size:14px;color:var(--accent)">'+value+'</div>'
    + '<div style="font-family:var(--mono);font-size:9px;color:var(--text3);letter-spacing:1px;text-transform:uppercase">'+label+'</div>'
    + '</div>';
}

function showWaterResults(pois,maxDist){
  var res=document.getElementById('waterResults'),list=document.getElementById('waterList'),count=document.getElementById('waterCount');
  clearWaterMapMarkers();
  if(!pois.length){count.textContent='No water points within '+maxDist+'m of the route';list.innerHTML='';res.style.display='block';return;}
  count.textContent=pois.length+' water points found within '+maxDist+'m';

  // Water Score (only in single mode with parsedData)
  var scoreHtml = '';
  if (parsedData && parsedData.trackpoints) {
    var ws = calcWaterScore(pois, parsedData.trackpoints, maxDist);
    scoreHtml = renderWaterScore(ws);
  }

  list.innerHTML = scoreHtml;
  pois.forEach(function(poi,idx){
    var icon=getWaterIcon(poi),label=getWaterLabel(poi);
    var distStr=poi._dist<1000?Math.round(poi._dist)+'m':(poi._dist/1000).toFixed(1)+'km';
    var potable=(poi.tags||{}).drinking_water==='yes'||(poi.tags||{}).amenity==='drinking_water';
    var item=document.createElement('div');
    item.className='water-item';item.id='witem_'+idx;
    item.innerHTML='<span class="water-item-icon">'+icon+'</span>'
      +'<div class="water-item-info"><div class="water-item-name">'+escHtml(label)+'</div>'
      +'<div class="water-item-meta">'+poi.lat.toFixed(5)+', '+poi.lon.toFixed(5)
      +(potable?' &nbsp;\u2713 potable':' &nbsp;\u26a0 non-potable')+'</div></div>'
      +'<span class="water-item-dist">'+distStr+'</span>'
      +'<button class="btn-add-water" id="wbtn_'+idx+'" onclick="addOneWaterToRoute('+idx+')">+ Add</button>';
    list.appendChild(item);
    addWaterMarkerToMap(poi,idx,icon,label,distStr,potable);
  });
  res.style.display='block';
  document.getElementById('legendWater').style.display='flex';
}
function addWaterMarkerToMap(poi,idx,icon,label,distStr,potable){
  if(!_map)return;
  var color=potable?'#00bfff':'#ff9900';
  var divIcon=L.divIcon({className:'',html:'<div style="width:26px;height:26px;border-radius:50%;background:'+color+';border:2px solid #fff;box-shadow:0 0 8px '+color+'80;display:flex;align-items:center;justify-content:center;font-size:13px">'+icon+'</div>',iconSize:[26,26],iconAnchor:[13,13]});
  var marker=L.marker([poi.lat,poi.lon],{icon:divIcon})
    .bindPopup('<div class="pp-name">'+escHtml(label)+'</div><div class="pp-water">'+(potable?'\u2713 Potable':'\u26a0 Non-potable')+'</div><div class="pp-coords">'+poi.lat.toFixed(6)+', '+poi.lon.toFixed(6)+'</div><div class="pp-water" style="margin-top:6px">'+distStr+' from route</div><br><button onclick="addOneWaterToRoute('+idx+')" style="font-family:var(--mono);font-size:11px;background:#00bfff;color:#000;border:none;padding:5px 10px;cursor:pointer;border-radius:2px;letter-spacing:1px">+ Add to route</button>')
    .addTo(_map);
  _waterLayers.push(marker);
}
function clearWaterMapMarkers(){
  _waterLayers.forEach(function(m){if(_map)_map.removeLayer(m);});
  _waterLayers=[];
  var lw=document.getElementById('legendWater');if(lw)lw.style.display='none';
}
function addOneWaterToRoute(idx){
  var poi=_waterResults[idx];if(!poi)return;
  var label=getWaterLabel(poi);
  var newWpt={lat:poi.lat,lon:poi.lon,name:label.substring(0,32),type:'7',_water:true};
  if(currentMode==='bulk'&&poi._bulkFileIdx!==undefined){
    var fileItem=bulkFiles.filter(function(f){return f.data;})[poi._bulkFileIdx];
    if(fileItem&&fileItem.data){
      var tps=fileItem.data.trackpoints;
      var bestI=0,bestD=Infinity;
      for(var k=0;k<tps.length;k++){var dd=Math.abs(tps[k].lat-poi.lat)+Math.abs(tps[k].lon-poi.lon);if(dd<bestD){bestD=dd;bestI=k;}}
      newWpt._tpIdx=bestI;
      fileItem.data.waypoints.push(newWpt);
      fileItem.data.waypoints.sort(function(a,b){return(a._tpIdx||0)-(b._tpIdx||0);});
      fileItem.waterAdded=true;
      renderBulkTable();
    }
  } else if(parsedData){
    var tps2=parsedData.trackpoints;
    var bestI2=0,bestD2=Infinity;
    for(var k=0;k<tps2.length;k++){var dd2=Math.abs(tps2[k].lat-poi.lat)+Math.abs(tps2[k].lon-poi.lon);if(dd2<bestD2){bestD2=dd2;bestI2=k;}}
    newWpt._tpIdx=bestI2;
    parsedData.waypoints.push(newWpt);
    sortWaypointsByTrack();
    renderPOITable(parsedData.waypoints);
    document.getElementById('statWP').textContent=parsedData.waypoints.length;
    document.getElementById('poiCount').textContent=parsedData.waypoints.length+' POIs';
    drawElevation(parsedData.trackpoints,parsedData.waypoints);
    refreshRouteMarkers();
    updateSaveGpxBtn();
  }
  var btn=document.getElementById('wbtn_'+idx),item=document.getElementById('witem_'+idx);
  if(btn){btn.textContent='\u2713 Added';btn.className='btn-add-water added';btn.disabled=true;}
  if(item)item.classList.add('added-item');
  showToast('"'+label+'" added to route','water');
}
function addAllWaterToRoute(){
  if(!_waterResults.length)return;
  var added=0;
  if(currentMode==='bulk'){
    var readyFiles=bulkFiles.filter(function(f){return f.data;});
    _waterResults.forEach(function(poi,idx){
      if(poi._bulkFileIdx===undefined)return;
      var fileItem=readyFiles[poi._bulkFileIdx];
      if(!fileItem||!fileItem.data)return;
      var already=fileItem.data.waypoints.some(function(w){return Math.abs(w.lat-poi.lat)<0.00001&&Math.abs(w.lon-poi.lon)<0.00001;});
      if(!already){
        var tps=fileItem.data.trackpoints,bestI=0,bestD=Infinity;
        for(var k=0;k<tps.length;k++){var dd=Math.abs(tps[k].lat-poi.lat)+Math.abs(tps[k].lon-poi.lon);if(dd<bestD){bestD=dd;bestI=k;}}
        fileItem.data.waypoints.push({lat:poi.lat,lon:poi.lon,name:getWaterLabel(poi).substring(0,32),type:'7',_water:true,_tpIdx:bestI});
        fileItem.data.waypoints.sort(function(a,b){return(a._tpIdx||0)-(b._tpIdx||0);});
        fileItem.waterAdded=true;added++;
      }
      var btn=document.getElementById('wbtn_'+idx),item=document.getElementById('witem_'+idx);
      if(btn){btn.textContent='\u2713 Added';btn.className='btn-add-water added';btn.disabled=true;}
      if(item)item.classList.add('added-item');
    });
    renderBulkTable();
    showToast(added+' water points added across routes','water');
    return;
  }
  if(!parsedData)return;
  _waterResults.forEach(function(poi,idx){
    var label=getWaterLabel(poi);
    var already=parsedData.waypoints.some(function(w){return Math.abs(w.lat-poi.lat)<0.00001&&Math.abs(w.lon-poi.lon)<0.00001;});
    if(!already){parsedData.waypoints.push({lat:poi.lat,lon:poi.lon,name:label.substring(0,32),type:'7',_water:true});added++;}
    var btn=document.getElementById('wbtn_'+idx),item=document.getElementById('witem_'+idx);
    if(btn){btn.textContent='\u2713 Added';btn.className='btn-add-water added';btn.disabled=true;}
    if(item)item.classList.add('added-item');
  });
  sortWaypointsByTrack();
  renderPOITable(parsedData.waypoints);
  document.getElementById('statWP').textContent=parsedData.waypoints.length;
  document.getElementById('poiCount').textContent=parsedData.waypoints.length+' POIs';
  drawElevation(parsedData.trackpoints,parsedData.waypoints);
  refreshRouteMarkers();
  updateSaveGpxBtn();
  showToast(added+' water points added to route','water');
}
function clearWaterResults(){
  _waterResults=[];
  document.getElementById('waterResults').style.display='none';
  clearWaterMapMarkers();
}
function sortWaypointsByTrack(){
  var tps=parsedData.trackpoints;
  parsedData.waypoints.forEach(function(wpt){
    var bestI=0,bestD=Infinity;
    for(var i=0;i<tps.length;i++){var dd=Math.abs(tps[i].lat-wpt.lat)+Math.abs(tps[i].lon-wpt.lon);if(dd<bestD){bestD=dd;bestI=i;}}
    wpt._tpIdx=bestI;
  });
  parsedData.waypoints.sort(function(a,b){return a._tpIdx-b._tpIdx;});
}

// ═══════════════════════════════════════════════════════════
// LEAFLET MAP
// ═══════════════════════════════════════════════════════════
var _map=null,_routeMarkers=[];
function mkIcon(color,label){
  var size=label?22:14;
  var inner=label
    ?'<div style="width:'+size+'px;height:'+size+'px;border-radius:50%;background:'+color+';border:2px solid #fff;box-shadow:0 0 10px '+color+'80;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#000;font-family:monospace">'+label+'</div>'
    :'<div style="width:'+size+'px;height:'+size+'px;border-radius:50%;background:'+color+';border:2px solid #fff;box-shadow:0 0 10px '+color+'"></div>';
  return L.divIcon({className:'',html:inner,iconSize:[size,size],iconAnchor:[size/2,size/2]});
}
function renderMap(trackpoints,waypoints){
  var sec=document.getElementById('mapSection');sec.style.display='block';sec.classList.add('fade-in');
  if(_map){_map.remove();_map=null;_routeMarkers=[];_waterLayers=[];}
  _map=L.map('mapContainer',{zoomControl:true,attributionControl:true,preferCanvas:true});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19}).addTo(_map);
  var latlngs=trackpoints.map(function(p){return[p.lat,p.lon];});
  L.polyline(latlngs,{color:'#0066ff',weight:10,opacity:0.18}).addTo(_map);
  L.polyline(latlngs,{color:'#0055ee',weight:4,opacity:0.95}).addTo(_map);
  var tp0=trackpoints[0],tpN=trackpoints[trackpoints.length-1];
  L.marker(latlngs[0],{icon:mkIcon('#39ff14',null)}).bindPopup('<div class="pp-name">Start</div><div class="pp-coords">'+tp0.lat.toFixed(6)+', '+tp0.lon.toFixed(6)+'</div><div class="pp-ele">'+Math.round(tp0.ele)+' m</div>').addTo(_map);
  L.marker(latlngs[latlngs.length-1],{icon:mkIcon('#ff3b3b',null)}).bindPopup('<div class="pp-name">End</div><div class="pp-coords">'+tpN.lat.toFixed(6)+', '+tpN.lon.toFixed(6)+'</div><div class="pp-ele">'+Math.round(tpN.ele)+' m</div>').addTo(_map);
  _routeMarkers=[];addRouteWaypointMarkers(waypoints);
  _map.fitBounds(L.latLngBounds(latlngs),{padding:[28,28]});
  document.getElementById('mapInfo').textContent=trackpoints.length.toLocaleString()+' pts'+(waypoints.length?' \u00b7 '+waypoints.length+' waypoints':'');
  setTimeout(function(){_map.invalidateSize();},80);
}
function addRouteWaypointMarkers(waypoints){
  _routeMarkers.forEach(function(m){if(_map)_map.removeLayer(m);});_routeMarkers=[];
  waypoints.forEach(function(wpt,i){
    var color=wpt._water?'#00bfff':'#ff6b00';
    var lbl=POI_LABELS[parseInt(wpt.type)||0]||'WPT';
    var marker=L.marker([wpt.lat,wpt.lon],{icon:mkIcon(color,i+1)})
      .bindPopup('<div class="pp-name">'+escHtml(wpt.name)+'</div><div class="pp-type">'+lbl+'</div><div class="pp-coords">'+wpt.lat.toFixed(6)+', '+wpt.lon.toFixed(6)+'</div>'+(wpt._water?'<div class="pp-water">&#128167; Water point</div>':''))
      .addTo(_map);
    // Marker click → highlight table row
    marker.on('click', function(){
      highlightPoiRow(i);
    });
    _routeMarkers.push(marker);
  });
}

// Highlight a POI table row and scroll it into view
function highlightPoiRow(idx){
  var tbody = document.getElementById('poiBody');
  if (!tbody) return;
  // Remove previous highlight
  Array.from(tbody.querySelectorAll('tr.poi-active')).forEach(function(r){
    r.classList.remove('poi-active');
  });
  var rows = tbody.querySelectorAll('tr');
  if (rows[idx]) {
    rows[idx].classList.add('poi-active');
    rows[idx].scrollIntoView({behavior:'smooth', block:'nearest'});
  }
}

// Click on table row → pan map to marker + open popup
function focusMarkerOnMap(idx){
  if (!_map || !_routeMarkers[idx]) return;
  var marker = _routeMarkers[idx];
  var zoom = Math.max(_map.getZoom(), 15);
  // Pan so marker sits in lower-center of map (popup visible above it)
  _map.setView(marker.getLatLng(), zoom, {animate:true});
  // After animation settles, shift up so popup isn't cut off
  setTimeout(function(){
    var mapH = _map.getSize().y;
    _map.panBy([0, -Math.round(mapH * 0.25)], {animate:true});
    marker.openPopup();
  }, 350);
  highlightPoiRow(idx);
}
function refreshRouteMarkers(){if(_map&&parsedData)addRouteWaypointMarkers(parsedData.waypoints);}
function destroyMap(){
  if(_map){_map.remove();_map=null;_routeMarkers=[];_waterLayers=[];}
  document.getElementById('mapSection').style.display='none';
  var lw=document.getElementById('legendWater');if(lw)lw.style.display='none';
}

// ═══════════════════════════════════════════════════════════
// RENDER SINGLE UI
// ═══════════════════════════════════════════════════════════
function renderSingleUI(){
  var d=parsedData,s=d.stats;
  var sb=document.getElementById('statsBar');sb.style.display='grid';sb.classList.add('fade-in');
  document.getElementById('statDist').textContent=(s.dist/1000).toFixed(2);
  document.getElementById('statAsc').textContent=Math.round(s.asc);
  document.getElementById('statDes').textContent=Math.round(Math.abs(s.des));
  document.getElementById('statTP').textContent=d.trackpoints.length.toLocaleString();
  document.getElementById('statWP').textContent=d.waypoints.length;
  var tnr=document.getElementById('trackNameRow');tnr.style.display='flex';tnr.classList.add('fade-in');
  document.getElementById('trackNameInput').value=d.name.substring(0,50);
  updateCharCount();
  var ws=document.getElementById('waterSection');ws.style.display='block';ws.classList.add('fade-in');
  document.getElementById('waterResults').style.display='none';_waterResults=[];
  // Fix 1: check elevation
  var elevBanner=document.getElementById('elevFetchBanner');
  elevBanner.style.display=hasElevation(d.trackpoints)?'none':'flex';
  renderMap(d.trackpoints,d.waypoints);
  document.getElementById('step2header').style.display='block';
  var es=document.getElementById('elevSection');es.style.display='block';es.classList.add('fade-in');
  var eles=d.trackpoints.map(function(p){return p.ele;});
  document.getElementById('elevInfo').textContent=Math.round(Math.min.apply(null,eles))+'m - '+Math.round(Math.max.apply(null,eles))+'m';
  drawElevation(d.trackpoints,d.waypoints);
  var ps=document.getElementById('poiSection');ps.style.display='block';ps.classList.add('fade-in');
  document.getElementById('poiCount').textContent=d.waypoints.length+' POIs';
  renderPOITable(d.waypoints);
  var actions=document.getElementById('actions');actions.style.display='flex';actions.classList.add('fade-in');
  document.getElementById('convertBtn').textContent='\u2b07 Download CNX';
  updateConvertInfo();
  document.getElementById('fileList').style.display='none';
}
function updateCharCount(){
  var v=document.getElementById('trackNameInput').value;
  var cc=document.getElementById('charCounter');
  var len=v.length;
  if(len<=18){
    cc.textContent=len+'/18';
    cc.className='char-counter';
    cc.title='';
  } else {
    cc.textContent=len+'/18 \u2014 will be truncated to: "'+v.substring(0,18)+'"';
    cc.className='char-counter warn';
    cc.title='CNX supports max 18 characters. The name will be saved as: '+v.substring(0,18);
  }
  updateConvertInfo();
}
function updateConvertInfo(){
  if(!parsedData)return;
  var name=(document.getElementById('trackNameInput').value||parsedData.name).substring(0,18);
  document.getElementById('convertInfo').textContent='route_'+name.replace(/\s+/g,'_')+'.cnx';
}

// ═══════════════════════════════════════════════════════════
// ELEVATION CANVAS
// ═══════════════════════════════════════════════════════════
var _elevData=null;
function drawElevation(tps,wpts){
  wpts=wpts||[];
  var canvas=document.getElementById('elevationCanvas');
  if(!canvas.clientWidth){setTimeout(function(){drawElevation(tps,wpts);},30);return;}
  var dpr=window.devicePixelRatio||1,w=canvas.clientWidth,h=canvas.clientHeight;
  canvas.width=w*dpr;canvas.height=h*dpr;
  function hav(p1,p2){var R=6371000,f1=p1.lat*Math.PI/180,f2=p2.lat*Math.PI/180,df=(p2.lat-p1.lat)*Math.PI/180,dl=(p2.lon-p1.lon)*Math.PI/180,a=Math.sin(df/2)*Math.sin(df/2)+Math.cos(f1)*Math.cos(f2)*Math.sin(dl/2)*Math.sin(dl/2);return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
  var cumDist=[0];for(var i=1;i<tps.length;i++)cumDist.push(cumDist[i-1]+hav(tps[i-1],tps[i]));
  var totalDist=cumDist[tps.length-1]||1;
  var eles=tps.map(function(p){return p.ele;});
  var minE=Math.min.apply(null,eles),maxE=Math.max.apply(null,eles),range=maxE-minE||1;
  var pl=8,pr=8,pt=16,pb=20;
  function xOf(d){return pl+(d/totalDist)*(w-pl-pr);}
  function yOf(e){return pt+(1-(e-minE)/range)*(h-pt-pb);}
  var sortedWpts=wpts.slice().sort(function(a,b){return(a._tpIdx||0)-(b._tpIdx||0);});
  _elevData={tps:tps,wpts:sortedWpts,cumDist:cumDist,totalDist:totalDist,minE:minE,maxE:maxE,pl:pl,pr:pr,pt:pt,pb:pb,w:w,h:h,xOf:xOf,yOf:yOf};
  _drawElevationFrame(null);
  _attachElevationHover(canvas);
}
function _drawElevationFrame(hoverFrac){
  var canvas=document.getElementById('elevationCanvas'),ctx=canvas.getContext('2d'),dpr=window.devicePixelRatio||1,d=_elevData;
  if(!d)return;
  var w=d.w,h=d.h;if(!w||!h)return;
  var pl=d.pl,pr=d.pr,pt=d.pt,pb=d.pb,tps=d.tps,wpts=d.wpts,xOf=d.xOf,yOf=d.yOf;
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.scale(dpr,dpr);
  ctx.fillStyle='#0f1318';ctx.fillRect(0,0,w,h);
  var kmStep=d.totalDist>80000?20000:d.totalDist>40000?10000:d.totalDist>20000?5000:d.totalDist>8000?2000:1000;
  for(var km=kmStep;km<d.totalDist;km+=kmStep){
    var gx=xOf(km);ctx.strokeStyle='rgba(255,255,255,0.05)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(gx,pt);ctx.lineTo(gx,h-pb);ctx.stroke();
    ctx.fillStyle='rgba(61,90,115,0.7)';ctx.font='9px monospace';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillText((km/1000).toFixed(0)+'km',gx,h-1);
  }
  var pts=tps.map(function(p,i){return{x:xOf(d.cumDist[i]),y:yOf(p.ele)};});
  var grad=ctx.createLinearGradient(0,pt,0,h-pb);grad.addColorStop(0,'rgba(0,229,255,0.35)');grad.addColorStop(1,'rgba(0,229,255,0.03)');
  ctx.beginPath();ctx.moveTo(pts[0].x,h-pb);for(var i=0;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.lineTo(pts[pts.length-1].x,h-pb);ctx.closePath();ctx.fillStyle=grad;ctx.fill();
  ctx.beginPath();for(var i=0;i<pts.length;i++){if(i===0)ctx.moveTo(pts[i].x,pts[i].y);else ctx.lineTo(pts[i].x,pts[i].y);}ctx.strokeStyle='rgba(0,229,255,0.9)';ctx.lineWidth=2;ctx.lineJoin='round';ctx.stroke();
  ctx.fillStyle='rgba(0,229,255,0.55)';ctx.font='9px monospace';ctx.textAlign='left';ctx.textBaseline='top';ctx.fillText(Math.round(d.maxE)+'m',pl+2,pt);ctx.textBaseline='bottom';ctx.fillText(Math.round(d.minE)+'m',pl+2,h-pb);
  wpts.forEach(function(wpt,num){
    var tpIdx=0;
    if(wpt._tpIdx!==undefined&&wpt._tpIdx>=0&&wpt._tpIdx<tps.length){tpIdx=wpt._tpIdx;}
    else{var bestD=Infinity;for(var k=0;k<tps.length;k++){var dd=Math.abs(tps[k].lat-wpt.lat)+Math.abs(tps[k].lon-wpt.lon);if(dd<bestD){bestD=dd;tpIdx=k;}}}
    var wx=xOf(d.cumDist[tpIdx]),wy=yOf(tps[tpIdx].ele),color=wpt._water?'#00bfff':'#ff6b00';
    ctx.save();ctx.setLineDash([2,3]);ctx.strokeStyle=wpt._water?'rgba(0,191,255,0.5)':'rgba(255,107,0,0.5)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(wx,h-pb);ctx.lineTo(wx,wy+8);ctx.stroke();ctx.restore();
    ctx.beginPath();ctx.arc(wx,wy,8,0,Math.PI*2);ctx.fillStyle=wpt._water?'rgba(0,191,255,0.15)':'rgba(255,107,0,0.15)';ctx.fill();
    ctx.beginPath();ctx.arc(wx,wy,5,0,Math.PI*2);ctx.fillStyle=color;ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.fill();ctx.stroke();
    var bw=16,bh=13,bx=wx-bw/2,by=wy-bh-7;if(by<pt+1)by=wy+9;
    ctx.fillStyle=color;ctx.beginPath();if(ctx.roundRect)ctx.roundRect(bx,by,bw,bh,3);else ctx.rect(bx,by,bw,bh);ctx.fill();
    ctx.fillStyle='#fff';ctx.font='bold 8px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(num+1),wx,by+bh/2);
  });
  if(hoverFrac!==null&&hoverFrac>=0){
    var hx=xOf(hoverFrac*d.totalDist),hIdx=0,hBest=Infinity;
    for(var i=0;i<d.cumDist.length;i++){var dd2=Math.abs(d.cumDist[i]-hoverFrac*d.totalDist);if(dd2<hBest){hBest=dd2;hIdx=i;}}
    var hy=yOf(tps[hIdx].ele);
    ctx.save();ctx.strokeStyle='rgba(255,255,255,0.3)';ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(hx,pt);ctx.lineTo(hx,h-pb);ctx.stroke();ctx.restore();
    ctx.beginPath();ctx.arc(hx,hy,3.5,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();
  }
  ctx.restore();
}
var _elevHoverAttached=false;
function _attachElevationHover(canvas){
  if(_elevHoverAttached)return;_elevHoverAttached=true;
  var tt=document.getElementById('elevTooltip');
  if(!tt){tt=document.createElement('div');tt.id='elevTooltip';tt.style.cssText='position:absolute;background:var(--panel);border:1px solid var(--border2);border-radius:2px;padding:5px 10px;font-family:var(--mono);font-size:10px;color:var(--text);pointer-events:none;display:none;z-index:20;line-height:1.8;white-space:nowrap;top:4px';document.getElementById('elevSection').style.position='relative';document.getElementById('elevSection').appendChild(tt);}
  canvas.addEventListener('mousemove',function(e){
    if(!_elevData)return;
    var d=_elevData,rect=canvas.getBoundingClientRect(),mx=e.clientX-rect.left;
    var frac=Math.max(0,Math.min(1,(mx-d.pl)/(d.w-d.pl-d.pr))),dist=frac*d.totalDist;
    var hIdx=0,hBest=Infinity;for(var i=0;i<d.cumDist.length;i++){var dd=Math.abs(d.cumDist[i]-dist);if(dd<hBest){hBest=dd;hIdx=i;}}
    var ele=d.tps[hIdx].ele,nearWpt=null;
    for(var wi=0;wi<d.wpts.length;wi++){var bI=0,bD=Infinity;for(var i=0;i<d.tps.length;i++){var dd2=Math.abs(d.tps[i].lat-d.wpts[wi].lat)+Math.abs(d.tps[i].lon-d.wpts[wi].lon);if(dd2<bD){bD=dd2;bI=i;}}if(Math.abs(d.cumDist[bI]-dist)<d.totalDist*0.02){nearWpt={idx:wi,wpt:d.wpts[wi]};break;}}
    var html='<span style="color:var(--accent)">'+(dist/1000).toFixed(2)+' km</span>&nbsp;&nbsp;<span style="color:var(--text2)">'+Math.round(ele)+' m</span>';
    if(nearWpt){var c=nearWpt.wpt._water?'#00bfff':'#ff6b00';html+='<br><span style="color:'+c+'">\u25cf '+(nearWpt.idx+1)+' '+escHtml(nearWpt.wpt.name)+(nearWpt.wpt._water?' &#128167;':'')+'</span>';}
    tt.innerHTML=html;tt.style.display='block';
    var ttW=tt.offsetWidth||130,left=mx+10;if(left+ttW>d.w)left=mx-ttW-10;tt.style.left=left+'px';
    _drawElevationFrame(frac);
  });
  canvas.addEventListener('mouseleave',function(){if(!_elevData)return;document.getElementById('elevTooltip').style.display='none';_drawElevationFrame(null);});
}

// ═══════════════════════════════════════════════════════════
// GPX EXPORT
// ═══════════════════════════════════════════════════════════
function generateGPXwithWater(data){
  var tps=data.trackpoints,wpts=data.waypoints;
  var name=(document.getElementById('trackNameInput').value||data.name).substring(0,50);
  var safeName=xmlEsc(name),wptsXml='';
  wpts.forEach(function(w){wptsXml+='  <wpt lat="'+w.lat+'" lon="'+w.lon+'">\n    <name>'+xmlEsc(w.name)+'</name>\n    <sym>'+(w._water?'water-drop':'Waypoint')+'</sym>\n'+(w._water?'    <type>water</type>\n':'')+'  </wpt>\n';});
  var trkXml='';tps.forEach(function(p){trkXml+='      <trkpt lat="'+(p.latStr||p.lat)+'" lon="'+(p.lonStr||p.lon)+'"><ele>'+p.ele+'</ele></trkpt>\n';});
  return '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="GPX+H2O — pitstopper.net" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata><name>'+safeName+'</name></metadata>\n'+wptsXml+'  <trk>\n    <name>'+safeName+'</name>\n    <trkseg>\n'+trkXml+'    </trkseg>\n  </trk>\n</gpx>';
}
function saveGPXwithWater(){
  if(!parsedData){showToast('Please load a GPX file first','error');return;}
  var name=(document.getElementById('trackNameInput').value||parsedData.name).substring(0,50);
  var gpx=generateGPXwithWater(parsedData);
  var fname=name.replace(/\s+/g,'_').replace(/[^\w\-]/g,'')+'_H2O.gpx';
  var wCount=parsedData.waypoints.filter(function(w){return w._water;}).length;
  try{var blob=new Blob([gpx],{type:'application/gpx+xml;charset=utf-8'});var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download=fname;document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(function(){URL.revokeObjectURL(url);},2000);showToast('GPX saved with '+wCount+' water points!','water');}
  catch(e){var b64=btoa(unescape(encodeURIComponent(gpx)));var a=document.createElement('a');a.href='data:application/gpx+xml;charset=utf-8;base64,'+b64;a.download=fname;document.body.appendChild(a);a.click();document.body.removeChild(a);showToast('GPX saved!','water');}
}
function updateSaveGpxBtn(){
  var btn=document.getElementById('saveGpxBtn');if(!btn||!parsedData)return;
  btn.style.display=parsedData.waypoints.some(function(w){return w._water;})?'flex':'none';
}

// ═══════════════════════════════════════════════════════════
// POI TABLE
// ═══════════════════════════════════════════════════════════
function renderPOITable(waypoints){
  var tbody=document.getElementById('poiBody');tbody.innerHTML='';
  if(!waypoints.length){tbody.innerHTML='<tr><td colspan="5"><div class="empty-poi">// No waypoints in this GPX file</div></td></tr>';return;}
  var opts=POI_TYPES.map(function(t){return'<option value="'+t.id+'">'+t.label+'</option>';}).join('');
  waypoints.forEach(function(wpt,i){
    var tr=document.createElement('tr');
    if(wpt._water) tr.className='poi-water-row';
    tr.style.cursor='pointer';
    tr.title='Click to show on map';
    // Row click → focus map marker (but not when clicking input/select/button)
    tr.addEventListener('click', function(e){
      if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT'||e.target.tagName==='BUTTON') return;
      focusMarkerOnMap(i);
    });
    tr.innerHTML='<td class="poi-index">'+(i<9?'0':'')+(i+1)+'</td>'
      +'<td><input class="poi-name-input" value="'+escHtml(wpt.name)+'" onchange="parsedData.waypoints['+i+'].name=this.value"></td>'
      +'<td class="poi-coords">'+wpt.lat.toFixed(6)+', '+wpt.lon.toFixed(6)+'</td>'
      +'<td><select class="poi-type-select" onchange="parsedData.waypoints['+i+'].type=this.value">'+opts+'</select></td>'
      +'<td><button class="remove-btn" onclick="removeWaypoint('+i+')">\u2715</button></td>';
    tr.querySelector('select').value=wpt.type;
    tbody.appendChild(tr);
  });
}
function removeWaypoint(idx){
  parsedData.waypoints.splice(idx,1);renderPOITable(parsedData.waypoints);
  document.getElementById('statWP').textContent=parsedData.waypoints.length;
  document.getElementById('poiCount').textContent=parsedData.waypoints.length+' POIs';
  drawElevation(parsedData.trackpoints,parsedData.waypoints);
  refreshRouteMarkers();updateSaveGpxBtn();
}
function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// ═══════════════════════════════════════════════════════════
// CNX PREVIEW MODAL
// ═══════════════════════════════════════════════════════════
var _pendingCnxData=null;

function convertAndDownload(){
  if(currentMode==='bulk'){downloadBulk();return;}
  if(!parsedData){showToast('Please load a GPX file first','error');return;}
  showCnxPreview(parsedData);
}

function showCnxPreview(data){
  var fullName=(document.getElementById('trackNameInput').value||data.name);
  var name=fullName.substring(0,18);
  var truncated=fullName.length>18;
  var fname=buildCnxFilename(data);
  var cnx=generateCNX(data,name);
  _pendingCnxData={data:data,name:name,fname:fname,cnx:cnx};
  document.getElementById('previewFname').textContent=fname;
  // Show truncation warning if needed
  var truncWarn=document.getElementById('previewTruncWarn');
  if(truncWarn){
    if(truncated){
      truncWarn.textContent='\u26a0 Route name truncated to 18 chars: "'+name+'"';
      truncWarn.style.display='block';
    } else {
      truncWarn.style.display='none';
    }
  }
  var wWater=data.waypoints.filter(function(w){return w._water;}).length;
  var wPoi=data.waypoints.length-wWater;
  document.getElementById('previewStats').innerHTML=
    _mStat('Distance',(data.stats.dist/1000).toFixed(2),'km')+
    _mStat('Ascent',Math.round(data.stats.asc),'m up')+
    _mStat('Descent',Math.round(Math.abs(data.stats.des)),'m down')+
    _mStat('Trackpoints',data.trackpoints.length.toLocaleString(),'pts')+
    _mStat('Waypoints',data.waypoints.length,(wWater?wWater+' water + ':'')+wPoi+' POI');
  var wptTitle=document.getElementById('previewWptTitle');
  var wptList=document.getElementById('previewWptList');
  if(!data.waypoints.length){wptTitle.textContent='No waypoints';wptList.innerHTML='';} 
  else {
    wptTitle.textContent='Waypoints ('+data.waypoints.length+')';
    var tps=data.trackpoints;
    function hav2(p1,p2){var R=6371000,f1=p1.lat*Math.PI/180,f2=p2.lat*Math.PI/180,df=(p2.lat-p1.lat)*Math.PI/180,dl=(p2.lon-p1.lon)*Math.PI/180,a=Math.sin(df/2)*Math.sin(df/2)+Math.cos(f1)*Math.cos(f2)*Math.sin(dl/2)*Math.sin(dl/2);return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
    var cumDist=[0];for(var i=1;i<tps.length;i++)cumDist.push(cumDist[i-1]+hav2(tps[i-1],tps[i]));
    var header='<div class="modal-wpt-row modal-wpt-header">'
      +'<span class="modal-wpt-num">#</span>'
      +'<span class="modal-wpt-dist-col" style="color:var(--text3);font-size:9px;letter-spacing:1px">KM</span>'
      +'<span class="modal-wpt-name" style="color:var(--text3);font-size:9px;letter-spacing:1px">NAME</span>'
      +'<span class="modal-wpt-type" style="color:var(--text3);font-size:9px;letter-spacing:1px;background:none">TYPE</span>'
      +'</div>';
    var rows='';
    data.waypoints.forEach(function(wpt,i){
      var tpIdx=wpt._tpIdx!==undefined?wpt._tpIdx:0;
      var km=(cumDist[Math.min(tpIdx,cumDist.length-1)]/1000).toFixed(1);
      var typeClass=wpt._water?'water':'poi';
      var typeLabel=wpt._water?'Water':POI_LABELS[parseInt(wpt.type)||0]||'WPT';
      rows+='<div class="modal-wpt-row">'
        +'<span class="modal-wpt-num">'+(i+1)+'</span>'
        +'<span class="modal-wpt-dist-col">'+km+'</span>'
        +'<span class="modal-wpt-name">'+escHtml(wpt.name)+'</span>'
        +'<span class="modal-wpt-type '+typeClass+'">'+escHtml(typeLabel)+'</span>'
        +'</div>';
    });
    wptList.innerHTML=header+rows;
  }
  // Reset confirm button for single mode
  var confirmBtn=document.getElementById('cnxConfirmBtn');
  confirmBtn.onclick=confirmDownloadCnx;
  confirmBtn.textContent='\u2b07 Download CNX';
  document.getElementById('cnxPreviewModal').style.display='flex';
}

function _mStat(label,value,unit){
  return '<div class="modal-stat"><span class="modal-stat-label">'+label+'</span><span class="modal-stat-value">'+value+'</span><span class="modal-stat-unit">'+unit+'</span></div>';
}
function confirmDownloadCnx(){
  if(!_pendingCnxData) return;
  // Save data BEFORE closing (closeCnxPreview nulls _pendingCnxData)
  var fname = _pendingCnxData.fname;
  var cnx   = _pendingCnxData.cnx;
  closeCnxPreview();
  var ok = downloadFile(fname, cnx);
  if(ok) showToast('CNX downloaded: '+fname,'success');
  else   showToast('Download blocked by browser','error');
}
function closeCnxPreview(){
  document.getElementById('cnxPreviewModal').style.display='none';
  _pendingCnxData=null;
}

// ─── Fix 3: Bulk CNX Preview ─────────────────────────────────
function downloadBulk(){
  var ready=bulkFiles.filter(function(f){return f.data;});
  if(!ready.length){showToast('No files ready','error');return;}
  showBulkPreview(ready);
}
function showBulkPreview(ready){
  var totalDist=ready.reduce(function(t,f){return t+(f.data.stats.dist/1000);},0).toFixed(1);
  var totalWater=ready.reduce(function(t,f){return t+f.data.waypoints.filter(function(w){return w._water;}).length;},0);
  var totalWpt=ready.reduce(function(t,f){return t+f.data.waypoints.length;},0);
  document.getElementById('previewFname').textContent=ready.length+' files — '+totalDist+' km total';
  document.getElementById('previewStats').innerHTML=
    _mStat('Files',ready.length,'routes')+
    _mStat('Total dist',totalDist,'km')+
    _mStat('Water pts',totalWater,'pts')+
    _mStat('Total WPTs',totalWpt,'POIs');
  document.getElementById('previewWptTitle').textContent='Files to download ('+ready.length+')';
  var rows='<div class="modal-wpt-row" style="grid-template-columns:22px 1fr auto auto auto;font-family:var(--mono);font-size:9px;color:var(--text3);letter-spacing:1px">'
    +'<span>#</span><span>FILE</span><span>KM</span><span>ASC</span><span>WPTS</span></div>';
  ready.forEach(function(item,i){
    var dist=calcStatsRounded(item.data.trackpoints);
    var wWater=item.data.waypoints.filter(function(w){return w._water;}).length;
    var wCount=item.data.waypoints.length;
    var fname=buildCnxFilename(item.data);  // show actual output filename
    rows+='<div class="modal-wpt-row" style="grid-template-columns:22px 1fr auto auto auto">'
      +'<span class="modal-wpt-num">'+(i+1)+'</span>'
      +'<span class="modal-wpt-name" title="'+escHtml(fname)+'">'+escHtml(fname)+'</span>'
      +'<span class="modal-wpt-dist-col">'+dist.dist+'</span>'
      +'<span class="modal-wpt-dist-col" style="color:var(--green)">+'+Math.round(parseFloat(dist.asc))+'m</span>'
      +'<span class="modal-wpt-type '+(wWater?'water':'poi')+'">'+(wWater?wWater+' \ud83d\udca7':wCount+' POI')+'</span>'
      +'</div>';
  });
  document.getElementById('previewWptList').innerHTML=rows;
  var confirmBtn=document.getElementById('cnxConfirmBtn');
  confirmBtn.textContent='\u2b07 Download All CNX ('+ready.length+')';
  confirmBtn.onclick=function(){
    closeCnxPreview();
    var total=ready.length;
    var idx=0;
    var count=0;

    function downloadNext(){
      if(idx>=total){
        if(count>0)showToast('Downloaded '+count+'/'+total+' CNX files!','success');
        else showToast('Download blocked','error');
        document.getElementById('convertInfo').textContent='';
        return;
      }
      var item=ready[idx];
      var fname=buildCnxFilename(item.data);
      document.getElementById('convertInfo').textContent=
        'Downloading '+(idx+1)+'/'+total+': '+fname+'...';
      if(downloadFile(fname,generateCNX(item.data,item.data.name)))count++;
      idx++;
      setTimeout(downloadNext,600);
    }

    downloadNext();
  };
  document.getElementById('cnxPreviewModal').style.display='flex';
}

// ═══════════════════════════════════════════════════════════
// DOWNLOAD
// ═══════════════════════════════════════════════════════════
function downloadFile(filename,xmlContent){
  try{var BOM=new Uint8Array([0xEF,0xBB,0xBF]),xmlBytes=new TextEncoder().encode(xmlContent),blob=new Blob([BOM,xmlBytes],{type:'application/xml'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(function(){URL.revokeObjectURL(url);},2000);return true;}
  catch(e){try{var b64=btoa(unescape(encodeURIComponent('\uFEFF'+xmlContent))),a=document.createElement('a');a.href='data:application/xml;charset=utf-8;base64,'+b64;a.download=filename;document.body.appendChild(a);a.click();document.body.removeChild(a);return true;}catch(e2){return false;}}
}

// ═══════════════════════════════════════════════════════════
// RESET & UTILS
// ═══════════════════════════════════════════════════════════
function resetAll(){
  parsedData=null;bulkFiles=[];_waterResults=[];_elevData=null;_elevHoverAttached=false;
  ['statsBar','trackNameRow','elevSection','poiSection','actions','fileList','waterSection','step2header','elevFetchBanner'].forEach(function(id){document.getElementById(id).style.display='none';});
  document.getElementById('waterResults').style.display='none';
  document.getElementById('poiBody').innerHTML='';
  var thead=document.querySelector('.poi-table thead tr');
  if(thead)thead.innerHTML='<th>#</th><th>Name (Descr)</th><th>Coordinates</th><th>Type</th><th></th>';
  document.querySelector('#poiSection .section-title').textContent='Waypoints / POIs';
  var sg=document.getElementById('saveGpxBtn');if(sg)sg.style.display='none';
  destroyMap();
}
function showProgress(show){
  var pb=document.getElementById('progressBar'),pf=document.getElementById('progressFill');
  pb.style.display=show?'block':'none';
  if(show){pf.style.width='0%';setTimeout(function(){pf.style.width='60%';},50);setTimeout(function(){pf.style.width='100%';},200);}
}
var _toastTimer;
function showToast(msg,type){
  type=type||'info';var t=document.getElementById('toast');
  t.className='toast '+type;document.getElementById('toastMsg').textContent=msg;t.classList.add('show');
  clearTimeout(_toastTimer);_toastTimer=setTimeout(function(){t.classList.remove('show');},3500);
}
window.addEventListener('resize',function(){if(parsedData)drawElevation(parsedData.trackpoints,parsedData.waypoints);});
