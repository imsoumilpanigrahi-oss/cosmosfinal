/* Cosmos app.js
   Features (client-side): habit CRUD, toggle, logs, analytics, adaptive weekly challenges, badges, local reminders,
   encrypted export (AES-GCM via WebCrypto), PWA-friendly behaviors.
*/

const STORAGE_KEY = 'cosmos_v2_state';
let state = {habits:[], logs:[], badges:[], settings:{reminders:false}, lastAction:null, challenges:{weekStart:null, items:[]}};
const todayKey = d=>{ const z=new Date(d.getFullYear(),d.getMonth(),d.getDate()); return z.toISOString().slice(0,10); };
const id = ()=>Math.random().toString(36).slice(2,9);
const el = id => document.getElementById(id);

// Init / persistence
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function load(){ const s = localStorage.getItem(STORAGE_KEY); if(s){ state = JSON.parse(s); } else seed(); }
function seed(){
  state.habits = [
    {id:id(), name:'Morning walk', emoji:'🚶', priority:3, color:'#7bdff6'},
    {id:id(), name:'Guitar practice', emoji:'🎸', priority:4, color:'#a78bfa'},
    {id:id(), name:'Read 20 min', emoji:'📚', priority:2, color:'#ffd6a5'}
  ];
  state.badges = [];
  save();
}

// Render
function render(){
  renderHabits();
  renderAnalytics();
  renderHeatmap();
  renderChallenges();
  renderBadges();
  renderConstellation();
  renderInsights();
  renderTrendChart();
}

function rankHabits(){
  return state.habits.map(h=>{
    const total = state.logs.filter(l=>l.habit==h.id).length;
    const recent = state.logs.filter(l=>l.habit==h.id && (new Date(l.day) > daysAgo(14))).length;
    const recencyScore = recent/Math.max(1,total+1);
    const score = (h.priority||1)*2 + recencyScore*3 + total*0.1;
    return {...h, score, total};
  }).sort((a,b)=>b.score-a.score);
}

// Habits UI
function renderHabits(){
  const container = el('habits'); container.innerHTML = '';
  const focus = document.getElementById('focusToggle').checked;
  const ranked = rankHabits();
  const list = focus? ranked.slice(0,3) : ranked;
  list.forEach(h=>{
    const d = document.createElement('div'); d.className='habit';
    const btn = document.createElement('button'); btn.className='btn'; btn.textContent=h.emoji;
    const done = state.logs.some(l=>l.habit==h.id && l.day==todayKey(new Date()));
    btn.style.background = done? h.color : 'transparent'; btn.style.border = done? 'none':'1px solid rgba(255,255,255,0.04)';
    btn.onclick = ()=> toggle(h.id);
    const info = document.createElement('div'); info.className='info';
    info.innerHTML = `<div style="font-weight:600">${h.name} <span class="small">${'★'.repeat(h.priority||1)}</span></div><div class="small">${done? 'Done today • Nice':'Not done'}</div>`;
    d.appendChild(btn); d.appendChild(info); container.appendChild(d);
  });
}

function toggle(hid){
  const day = todayKey(new Date());
  const exists = state.logs.find(l=>l.habit==hid && l.day==day);
  if(exists){ state.logs = state.logs.filter(l=>!(l.habit==hid && l.day==day)); state.lastAction={type:'undo', habit:hid, day}; }
  else { state.logs.push({habit:hid, day, ts:Date.now()}); state.lastAction={type:'mark', habit:hid, day}; fireCelebration(); }
  save(); render();
}

// Analytics
function renderAnalytics(){
  const uniq = [...new Set(state.logs.map(l=>l.day))].sort();
  const totalSpan = uniq.length ? ((new Date(uniq[uniq.length-1]) - new Date(uniq[0]))/(24*3600*1000) + 1) : 0;
  const daysWith = new Set(state.logs.map(l=>l.day)).size;
  const consistency = totalSpan? Math.round(daysWith/Math.max(1,totalSpan) * 100) : Math.round(daysWith*100);
  el('consistency').textContent = consistency + '%';

  // streaks over last 180 days
  const dayList = generateDateRange(daysAgo(180), daysAgo(0));
  let cur=0,longest=0,temp=0;
  dayList.forEach(d=>{
    const k = todayKey(d);
    const there = state.logs.some(l=>l.day==k);
    if(there){ temp++; cur=temp; longest=Math.max(longest,temp);} else temp=0;
  });
  el('curStreak').textContent = cur + 'd'; el('longStreak').textContent = longest + 'd';
}

function daysAgo(n){ const d=new Date(); d.setDate(d.getDate()-n); return d; }
function generateDateRange(from,to){ const arr=[]; for(let d=new Date(from); d<=to; d.setDate(d.getDate()+1)) arr.push(new Date(d)); return arr; }

// Heatmap
function renderHeatmap(){
  const node = el('heatmap'); node.innerHTML='';
  const days = 90; const today = new Date();
  for(let i=days-1;i>=0;i--){
    const d = new Date(); d.setDate(today.getDate()-i);
    const k = todayKey(d);
    const count = state.logs.filter(l=>l.day==k).length;
    const div = document.createElement('div'); div.className='day level-'+clamp(levelForCount(count),0,4);
    div.title = `${k} — ${count} tasks`; node.appendChild(div);
  }
}
function levelForCount(c){ if(c==0) return 0; if(c==1) return 1; if(c==2) return 2; if(c<5) return 3; return 4; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

// Challenges
function weekStartDate(date){ const d=new Date(date); const day=d.getDay(); d.setDate(d.getDate()-day); d.setHours(0,0,0,0); return d; }
function generateChallenges(){
  const start = weekStartDate(new Date());
  state.challenges.weekStart = start.toISOString().slice(0,10);
  const ranked = rankHabits();
  const lowPerformers = ranked.filter(h=>h.total < 5).slice(0,4);
  const challenges = [];
  lowPerformers.slice(0,2).forEach(h=>{
    challenges.push({id:id(), text:`Micro: Do 2 minutes of "${h.name}" on 5 days this week`, habit:h.id, type:'micro'});
  });
  if(state.habits.length>3) challenges.push({id:id(), text:`Bundle: Pair a short habit + 5 pushups, do 4 times this week`, type:'bundle'});
  if(ranked[0]) challenges.push({id:id(), text:`Sprint: Do "${ranked[0].name}" first thing 6 days this week`, habit:ranked[0].id, type:'sprint'});
  challenges.push({id:id(), text:`Social: Share a small win from this week with a friend`, type:'social'});
  state.challenges.items = challenges;
  save();
}
function renderChallenges(){
  const out = el('challenges'); out.innerHTML='';
  if(!state.challenges.weekStart) generateChallenges();
  const wk = new Date(state.challenges.weekStart);
  el('weekRange').textContent = `${wk.toDateString()} - ${new Date(wk.getTime()+6*86400000).toDateString()}`;
  state.challenges.items.forEach(c=>{
    const d = document.createElement('div'); d.style.padding='8px'; d.style.borderRadius='8px'; d.style.marginBottom='8px'; d.style.background='rgba(255,255,255,0.02)';
    const done = !!c.completed;
    d.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div><strong>${c.text}</strong><div class="small">${c.type}</div></div><div><button class="btn-ghost">${done? 'Completed':'Mark'}</button></div></div>`;
    d.querySelector('button').onclick = ()=>{ c.completed = !c.completed; if(c.completed) awardBadge(c); save(); render(); };
    out.appendChild(d);
  });
}
function awardBadge(challenge){ state.badges.push({id:id(), title:'Challenge Complete', note:challenge.text, date:todayKey(new Date())}); }

// Badges
function renderBadges(){
  const node = el('badges'); node.innerHTML='';
  if(state.badges.length===0){ node.innerHTML='<div class="small">No badges yet — complete weekly challenges to earn cosmic badges.</div>'; return; }
  state.badges.forEach(b=>{ const d=document.createElement('div'); d.style.marginBottom='6px'; d.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div><strong>${b.title}</strong><div class="small">${b.note}</div></div><div class="small">${b.date}</div></div>`; node.appendChild(d); });
}

// Insights
function renderInsights(){
  const node = el('insights'); node.innerHTML='';
  const ranked = rankHabits();
  const out=[];
  if(ranked.length===0){ node.textContent='Add some habits to get insights.'; return; }
  const top = ranked[0], low = ranked[ranked.length-1];
  if(top && top.total>10) out.push(`You're strongest at "${top.name}" (${top.total} times). Use it to chain new habits.`);
  if(low && low.total<3) out.push(`"${low.name}" barely appears. Try a 1-2 minute micro-version this week.`);
  const dowCounts={}; state.logs.forEach(l=>{ const d=new Date(l.day); const k=d.getDay(); dowCounts[k]=(dowCounts[k]||0)+1; });
  const bestDay = Object.keys(dowCounts).sort((a,b)=>dowCounts[b]-dowCounts[a])[0];
  if(bestDay!==undefined) out.push(`You're most active on ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][bestDay]}. Place high-effort tasks there.`);
  node.innerHTML = out.map(x=>`<div style="margin-bottom:6px">• ${x}</div>`).join('');
}

// Trend chart (simple)
function renderTrendChart(){
  const c = el('trendChart'); const ctx = c.getContext('2d'); c.width = c.clientWidth; c.height = 120; ctx.clearRect(0,0,c.width,c.height);
  const days = 30; const today = new Date(); const counts=[];
  for(let i=days-1;i>=0;i--){ const d=new Date(); d.setDate(today.getDate()-i); const k=todayKey(d); counts.push(state.logs.filter(l=>l.day==k).length); }
  const max = Math.max(1,...counts); const step = c.width / counts.length;
  ctx.beginPath(); ctx.moveTo(0, c.height - (counts[0]/max)*c.height);
  for(let i=1;i<counts.length;i++) ctx.lineTo(i*step, c.height - (counts[i]/max)*c.height);
  ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 2; ctx.stroke();
}

// Constellation
function renderConstellation(){
  const canvas = el('stars'); const ctx = canvas.getContext('2d'); canvas.width = canvas.clientWidth; canvas.height = 120; ctx.clearRect(0,0,canvas.width,canvas.height);
  const ranked = rankHabits(); const centerY = canvas.height/2; const spacing = canvas.width / Math.max(1, ranked.length+1);
  ranked.forEach((h,i)=>{ const x=(i+1)*spacing; const y=centerY + Math.sin(i)*20; const size = clamp(6 + (h.total/5),6,24); ctx.fillStyle = h.color; ctx.beginPath(); ctx.arc(x,y,size,0,Math.PI*2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font='10px sans-serif'; ctx.fillText(h.emoji, x-6, y+4); if(i>0){ const prev = (i)*spacing; ctx.beginPath(); ctx.moveTo(prev, centerY + Math.sin(i-1)*20); ctx.lineTo(x,y); ctx.strokeStyle='rgba(167,139,250,0.12)'; ctx.stroke(); } });
  el('priorityList').innerHTML = ranked.slice(0,5).map(h=>`${h.emoji} ${h.name} (${h.total})`).join('<br>');
}

// Celebrate
function fireCelebration(){
  const c = document.createElement('canvas'); c.style.position='fixed'; c.style.left=0; c.style.top=0; c.width=window.innerWidth; c.height=window.innerHeight/3; document.body.appendChild(c);
  const ctx = c.getContext('2d'); let parts=[]; for(let i=0;i<80;i++) parts.push({x:Math.random()*c.width,y:Math.random()*c.height/2,vx:(Math.random()-0.5)*6,vy:Math.random()*6+2,s:Math.random()*6+4,c:['#7bdff6','#a78bfa','#ffd6a5','#ff7ab6'][Math.floor(Math.random()*4)]});
  let t=0; const idt = setInterval(()=>{ ctx.clearRect(0,0,c.width,c.height); t++; parts.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; p.vy+=0.15; ctx.fillStyle=p.c; ctx.fillRect(p.x,p.y,p.s,p.s/1.5); }); if(t>80){ clearInterval(idt); document.body.removeChild(c); } },16);
}

// Undo / Export / Import / Notifications
document.getElementById('undo').addEventListener('click', ()=>{ if(!state.lastAction) return alert('No action to undo'); const a = state.lastAction; if(a.type=='mark') state.logs = state.logs.filter(l=>!(l.habit==a.habit && l.day==a.day)); else if(a.type=='undo') state.logs.push({habit:a.habit, day:a.day, ts:Date.now()}); state.lastAction = null; save(); render(); });

document.getElementById('export').addEventListener('click', ()=>{ navigator.clipboard.writeText(JSON.stringify(state,null,2)).then(()=>alert('Copied JSON to clipboard')) });

document.getElementById('import').addEventListener('click', ()=>{ const t = prompt('Paste JSON export'); try{ const parsed = JSON.parse(t); state = parsed; save(); render(); alert('Imported'); }catch(e){ alert('Invalid JSON'); } });

document.getElementById('regenChallenges').addEventListener('click', ()=>{ generateChallenges(); render(); });

document.getElementById('addHabit').addEventListener('click', ()=>{ const name = prompt('Habit name (short)'); if(!name) return; const emoji = prompt('Emoji (optional)')||'✅'; const pr = parseInt(prompt('Priority 1-5','3'))||3; state.habits.push({id:id(), name:name.slice(0,40), emoji, priority:pr, color: randomColor()}); save(); render(); });

// Local reminders (works while browser/tab is active)
document.getElementById('notify').addEventListener('click', async ()=>{ if(!('Notification' in window)) return alert('Notifications not supported'); const p = await Notification.requestPermission(); if(p!=='granted') return alert('Permission denied'); state.settings.reminders = true; save(); scheduleLocalReminders(); alert('Local reminders enabled (works while browser is open)'); });

function scheduleLocalReminders(){ if(!state.settings.reminders) return; if(window._cosmosReminder) return; window._cosmosReminder = setInterval(()=>{ const top = rankHabits()[0]; if(top) new Notification('Cosmos reminder', {body:`Quick reminder: ${top.name}`}); }, 1000*60*60*8); }

// Encrypted backup (AES-GCM via WebCrypto)
async function deriveKey(pass){ const enc = new TextEncoder(); const salt = enc.encode('cosmos-salt-v2'); const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:120000, hash:'SHA-256'}, base, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']); }

async function encryptedExport(){
  const pass = prompt('Enter a passphrase to encrypt export (store it safely)');
  if(!pass) return;
  const key = await deriveKey(pass);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(state));
  const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, data);
  // Combine iv + ct
  const blob = new Blob([iv, new Uint8Array(ct)], {type:'application/octet-stream'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'cosmos-backup.bin'; a.click(); URL.revokeObjectURL(url);
  alert('Encrypted backup downloaded. Keep passphrase safe.');
}

document.getElementById('syncBtn').addEventListener('click', ()=>{ if(confirm('Export encrypted backup? OK=Export, Cancel=Show import instructions')) encryptedExport(); else alert('To import encrypted backups, contact the dev or use JSON import.'); });

// small helpers
function randomColor(){ const cols=['#7bdff6','#a78bfa','#ffd6a5','#ff7ab6','#8ef6a7']; return cols[Math.floor(Math.random()*cols.length)]; }

// Install prompt
let deferredPrompt;
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); deferredPrompt = e; document.getElementById('installBtn').style.display='inline-block'; });
document.getElementById('installBtn').addEventListener('click', async ()=>{
  if(deferredPrompt){ deferredPrompt.prompt(); const choice = await deferredPrompt.userChoice; deferredPrompt = null; document.getElementById('installBtn').style.display='none'; } else alert('Use browser menu to Add to Home screen.');
});

// bootstrap
load(); if(!state.challenges.weekStart) generateChallenges(); render(); scheduleLocalReminders();

// dev helper: press 'm' to mark first habit
window.addEventListener('keydown',(e)=>{ if(e.key==='m'){ if(state.habits[0]){ state.logs.push({habit:state.habits[0].id, day:todayKey(new Date()), ts:Date.now()}); save(); render(); } } });
