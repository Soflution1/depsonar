#!/usr/bin/env node

/**
 * depup dashboard: Visual web interface for dependency monitoring
 * 
 * Serves a lightweight dashboard on localhost:24681
 * Reads from ~/.depup-cache.json (written by checker)
 * Can trigger live scans via API
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { main as runChecker } from "./checker.js";

const PORT = 24681;
const CACHE_PATH = join(homedir(), ".depup-cache.json");

function readCache() {
  if (!existsSync(CACHE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
  } catch { return null; }
}

function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}

let scanning = false;

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = req.url || "/";

  if (url === "/api/status") {
    const cache = readCache();
    if (!cache) return json(res, { projects: [], updatedAt: null, scanning });
    return json(res, { ...cache, scanning });
  }

  if (url === "/api/scan" && req.method === "POST") {
    if (scanning) return json(res, { error: "Scan already in progress" }, 409);
    scanning = true;
    json(res, { started: true });
    try { await runChecker(); } catch (e) { console.error("[dashboard] Scan error:", e); }
    scanning = false;
    return;
  }

  // Serve dashboard HTML
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(DASHBOARD_HTML);
}

const server = createServer(handleRequest);
server.listen(PORT, "127.0.0.1", () => {
  console.error(`[depup] Dashboard running on http://127.0.0.1:${PORT}`);
});

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>depup — Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0a0a0a;--card:#141414;--border:#222;--text:#e5e5e5;--dim:#666;--ok:#22c55e;--warn:#f59e0b;--danger:#ef4444;--accent:#3b82f6;--radius:12px}
body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;padding:24px}
.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:32px;padding-bottom:16px;border-bottom:1px solid var(--border)}
h1{font-size:24px;font-weight:600;letter-spacing:-0.5px}
h1 span{color:var(--accent)}
.meta{color:var(--dim);font-size:13px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:32px}
.stat{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:20px;text-align:center}
.stat-val{font-size:36px;font-weight:700;line-height:1}
.stat-label{color:var(--dim);font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-top:8px}
.projects{display:grid;gap:12px}
.project{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:20px;display:grid;grid-template-columns:1fr auto auto auto;align-items:center;gap:16px;transition:border-color .15s}
.project:hover{border-color:#333}
.proj-name{font-size:16px;font-weight:600}
.proj-meta{color:var(--dim);font-size:13px;margin-top:4px}
.badge{padding:4px 12px;border-radius:20px;font-size:13px;font-weight:500}
.badge-ok{background:rgba(34,197,94,.15);color:var(--ok)}
.badge-warn{background:rgba(245,158,11,.15);color:var(--warn)}
.badge-danger{background:rgba(239,68,68,.15);color:var(--danger)}
.score{width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px}
.score-high{background:rgba(34,197,94,.15);color:var(--ok);border:2px solid var(--ok)}
.score-mid{background:rgba(245,158,11,.15);color:var(--warn);border:2px solid var(--warn)}
.score-low{background:rgba(239,68,68,.15);color:var(--danger);border:2px solid var(--danger)}
.outdated{font-size:14px;color:var(--dim);min-width:120px;text-align:right}
.outdated strong{color:var(--text)}
.btn{background:var(--accent);color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;transition:opacity .15s}
.btn:hover{opacity:.85}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn-outline{background:transparent;border:1px solid var(--border);color:var(--text)}
.btn-outline:hover{border-color:#444}
.actions{display:flex;gap:12px;align-items:center}
.empty{text-align:center;padding:80px 20px;color:var(--dim)}
.empty h2{font-size:20px;color:var(--text);margin-bottom:8px}
.spinner{display:inline-block;width:16px;height:16px;border:2px solid var(--dim);border-top-color:var(--accent);border-radius:50%;animation:spin .6s linear infinite;margin-right:8px;vertical-align:middle}
@keyframes spin{to{transform:rotate(360deg)}}
.lang-icon{display:inline-block;width:20px;height:20px;border-radius:4px;text-align:center;font-size:11px;line-height:20px;font-weight:700;margin-right:8px}
.lang-node{background:#3c873a;color:#fff}
.lang-python{background:#3776ab;color:#fff}
.lang-rust{background:#ce422b;color:#fff}
.lang-go{background:#00add8;color:#fff}
.lang-php{background:#777bb4;color:#fff}
.lang-ruby{background:#cc342d;color:#fff}
.lang-dart{background:#0175c2;color:#fff}
.lang-swift{background:#f05138;color:#fff}
.lang-kotlin{background:#7f52ff;color:#fff}
@media(max-width:768px){.stats{grid-template-columns:repeat(2,1fr)}.project{grid-template-columns:1fr;gap:12px}}
</style>
</head>
<body>
<div class="header">
  <div><h1><span>depup</span> dashboard</h1><div class="meta" id="updated">No scan data yet</div></div>
  <div class="actions">
    <button class="btn" id="scan-btn" onclick="triggerScan()">Scan Now</button>
    <button class="btn btn-outline" onclick="loadData()">Refresh</button>
  </div>
</div>

<div class="stats">
  <div class="stat"><div class="stat-val" id="s-total">0</div><div class="stat-label">Projects</div></div>
  <div class="stat"><div class="stat-val" id="s-ok" style="color:var(--ok)">0</div><div class="stat-label">Up to date</div></div>
  <div class="stat"><div class="stat-val" id="s-outdated" style="color:var(--warn)">0</div><div class="stat-label">Need updates</div></div>
  <div class="stat"><div class="stat-val" id="s-avg">—</div><div class="stat-label">Avg health</div></div>
</div>

<div class="projects" id="projects">
  <div class="empty"><h2>No scan data</h2><p>Click "Scan Now" to analyze your projects</p></div>
</div>

<script>
const langLabels={node:'JS',python:'PY',rust:'RS',go:'GO',php:'PHP',ruby:'RB',dart:'DT',swift:'SW',kotlin:'KT'};

async function loadData(){
  try{
    const r=await fetch('/api/status');
    const d=await r.json();
    render(d);
  }catch(e){console.error(e)}
}

function render(data){
  const projects=data.projects||[];
  if(data.updatedAt){
    const d=new Date(data.updatedAt);
    document.getElementById('updated').textContent='Last scan: '+d.toLocaleString();
  }
  if(data.scanning){
    document.getElementById('scan-btn').disabled=true;
    document.getElementById('scan-btn').innerHTML='<span class="spinner"></span>Scanning...';
  }else{
    document.getElementById('scan-btn').disabled=false;
    document.getElementById('scan-btn').textContent='Scan Now';
  }

  const ok=projects.filter(p=>p.outdatedCount===0).length;
  const outdated=projects.filter(p=>p.outdatedCount>0).length;
  const avgScore=projects.length?Math.round(projects.reduce((a,p)=>a+p.score,0)/projects.length):0;

  document.getElementById('s-total').textContent=projects.length;
  document.getElementById('s-ok').textContent=ok;
  document.getElementById('s-outdated').textContent=outdated;
  document.getElementById('s-avg').textContent=projects.length?avgScore:'—';

  const container=document.getElementById('projects');
  if(!projects.length){
    container.innerHTML='<div class="empty"><h2>No scan data</h2><p>Click "Scan Now" to analyze your projects</p></div>';
    return;
  }

  const sorted=[...projects].sort((a,b)=>a.score-b.score);
  container.innerHTML=sorted.map(p=>{
    const scoreClass=p.score>=80?'score-high':p.score>=50?'score-mid':'score-low';
    const badgeClass=p.outdatedCount===0?'badge-ok':p.majorCount>0?'badge-danger':'badge-warn';
    const badgeText=p.outdatedCount===0?'Up to date':p.majorCount>0?p.majorCount+' major':''+p.outdatedCount+' outdated';
    const lang=langLabels[p.language]||p.language;
    return '<div class="project">'+
      '<div><div class="proj-name"><span class="lang-icon lang-'+p.language+'">'+lang+'</span>'+p.project+'</div>'+
      '<div class="proj-meta">'+p.framework+' · '+p.path.replace(/\\/Users\\/[^/]+\\//,'~/')+'</div></div>'+
      '<div class="outdated"><strong>'+p.outdatedCount+'</strong> outdated'+(p.majorCount?' · <span style="color:var(--danger)">'+p.majorCount+' major</span>':'')+'</div>'+
      '<span class="badge '+badgeClass+'">'+badgeText+'</span>'+
      '<div class="score '+scoreClass+'">'+p.score+'</div>'+
      '</div>';
  }).join('');
}

async function triggerScan(){
  document.getElementById('scan-btn').disabled=true;
  document.getElementById('scan-btn').innerHTML='<span class="spinner"></span>Scanning...';
  try{
    await fetch('/api/scan',{method:'POST'});
    // Poll for completion
    const poll=setInterval(async()=>{
      const r=await fetch('/api/status');
      const d=await r.json();
      render(d);
      if(!d.scanning){clearInterval(poll);loadData();}
    },2000);
  }catch(e){console.error(e);document.getElementById('scan-btn').disabled=false;document.getElementById('scan-btn').textContent='Scan Now';}
}

loadData();
setInterval(loadData,30000);
</script>
</body></html>`;
