// Probabilistic league predictor (tier-based)
function byId(id){return document.getElementById(id)}

function parseSim2(text){
  const lines = text.split(/\r?\n/).map(l=>l.trim());
  let mode = null; const teams = {}; const matches = []; let currentDate=null;
  const tiers = {};
  for(const raw of lines){
    if(!raw) continue;
    if(raw.startsWith('[')){
      if(raw.toUpperCase().includes('LEAGUE')) mode='LEAGUE';
      else if(raw.toUpperCase().includes('CLUB TIER')) mode='TIER';
      else if(raw.toUpperCase().includes('FUTURE')) mode='FUTURE';
      else mode=null; continue;
    }
    if(mode==='LEAGUE'){
      const m = raw.match(/^(.+?)\s*:\s*(\d+)$/);
      if(m){ teams[m[1].trim()] = parseInt(m[2],10); }
      continue;
    }
    if(mode==='TIER'){
      // format: 1 : Persib,Persija
      const m = raw.match(/^(\d)\s*:\s*(.+)$/);
      if(m){ const t = parseInt(m[1],10); const names = m[2].split(',').map(s=>s.trim()).filter(Boolean); for(const n of names) tiers[n]=t; }
      continue;
    }
    if(mode==='FUTURE'){
      const dateMatch = raw.match(/^([0-9]{1,2}\s+\w+(?:\s+\w+)?)(\s*:\s*)?$/);
      if(dateMatch){ currentDate = dateMatch[1].trim(); continue; }
      const mm = raw.match(/^(.+?)\s*-\s*(.+)$/);
      if(mm && currentDate){ matches.push({date:currentDate,home:mm[1].trim(),away:mm[2].trim()}); if(!(mm[1].trim() in teams)) teams[mm[1].trim()]=0; if(!(mm[2].trim() in teams)) teams[mm[2].trim()]=0; }
    }
  }
  // ensure tiers default to 2
  for(const t of Object.keys(teams)) if(!(t in tiers)) tiers[t]=2;
  return {teams,tiers,matches};
}

function pickOutcomeByTier(homeTier, awayTier){
  // returns 'home','away' or 'draw' chosen by random with probabilities based on tiers
  const d = homeTier - awayTier; // negative => home stronger
  let probs = {home:33.333,draw:33.334,away:33.333};
  // determine which side is stronger
  if(d===0){ probs = {home:33.33,draw:33.34,away:33.33}; }
  else {
    const homeStronger = d < 0;
    const strongerTier = Math.min(homeTier, awayTier);
    const weakerTier = Math.max(homeTier, awayTier);
    const diff = weakerTier - strongerTier; // 1 or 2
    // interpret: if one side is tier 1 and other 2 -> strong vs normal
    // if diff >=2 (1 vs 3) => strong vs weak
    let strongWin, drawP, strongLose;
    if(diff >= 2){ strongWin = 50; drawP = 20; strongLose = 30; }
    else { strongWin = 45; drawP = 20; strongLose = 35; }
    if(homeStronger){ probs = {home:strongWin, draw:drawP, away:strongLose}; }
    else { probs = {home:strongLose, draw:drawP, away:strongWin}; }
  }
  const r = Math.random()*100;
  if(r < probs.home) return 'home';
  if(r < probs.home + probs.draw) return 'draw';
  return 'away';
}

function simulateProb(parsed){
  const teams = {...parsed.teams};
  const results = []; // per match with outcome
  const snapshots = []; // standings after each matchday (per date)
  // group matches by date order
  const byDate = {};
  for(const m of parsed.matches){ if(!byDate[m.date]) byDate[m.date]=[]; byDate[m.date].push(m); }
  const dates = Object.keys(byDate);
  for(const d of dates){
    const dayMatches = byDate[d];
    const dayResults = [];
    for(const m of dayMatches){
      const ht = parsed.tiers[m.home]||2; const at = parsed.tiers[m.away]||2;
      const out = pickOutcomeByTier(ht, at);
      if(out==='home'){ teams[m.home] = (teams[m.home]||0) + 3; }
      else if(out==='away'){ teams[m.away] = (teams[m.away]||0) + 3; }
      else { teams[m.home] = (teams[m.home]||0) + 1; teams[m.away] = (teams[m.away]||0) + 1; }
      dayResults.push({date:d,home:m.home,away:m.away,outcome:out});
    }
    // snapshot standings after this date
    const snap = Object.entries(teams).map(([team,pts])=>({team,pts})).sort((a,b)=>b.pts - a.pts || a.team.localeCompare(b.team));
    snapshots.push({date:d, standings:snap});
    results.push(...dayResults);
  }
  return {results,snapshots,final:teams};
}

function renderPredicted(results){
  const el = byId('predicted-list'); el.innerHTML='';
  // group by date
  const byDate = {};
  for(const r of results) { if(!byDate[r.date]) byDate[r.date]=[]; byDate[r.date].push(r); }
  for(const d of Object.keys(byDate)){
    const h = document.createElement('h3'); h.textContent = d; el.appendChild(h);
    for(const m of byDate[d]){
      const div = document.createElement('div');
      const outText = m.outcome==='home' ? `${m.home} wins` : m.outcome==='away' ? `${m.away} wins` : 'Draw';
      div.textContent = `${m.home} - ${m.away} → ${outText}`;
      el.appendChild(div);
    }
  }
}

function renderFinal(parsed, finalTeams){
  const el = byId('final-table'); el.innerHTML='';
  // compute W/D/L from future matches
  const stats = {};
  for(const t of Object.keys(parsed.teams)) stats[t] = {current: parsed.teams[t]||0, w:0,d:0,l:0, final: finalTeams[t]||0};
  // replay results to count
  for(const m of parsed._results){
    if(m.outcome==='home'){ stats[m.home].w++; stats[m.away].l++; }
    else if(m.outcome==='away'){ stats[m.away].w++; stats[m.home].l++; }
    else { stats[m.home].d++; stats[m.away].d++; }
  }
  const rows = Object.entries(stats).map(([team,s])=>({team,current:s.current,final:s.final,w:s.w,d:s.d,l:s.l}));
  rows.sort((a,b)=>b.final - a.final || a.team.localeCompare(b.team));

  const table = document.createElement('table'); table.style.width='100%'; table.style.borderCollapse='collapse';
  const thead = document.createElement('thead'); thead.innerHTML = '<tr><th style="text-align:left;padding:6px;border-bottom:1px solid #ddd">Team</th><th style="padding:6px;border-bottom:1px solid #ddd">Current pts</th><th style="padding:6px;border-bottom:1px solid #ddd">Final pts</th><th style="padding:6px;border-bottom:1px solid #ddd">W</th><th style="padding:6px;border-bottom:1px solid #ddd">D</th><th style="padding:6px;border-bottom:1px solid #ddd">L</th></tr>';
  table.appendChild(thead);
  const tb = document.createElement('tbody');
  for(const r of rows){ const tr = document.createElement('tr'); tr.innerHTML = `<td style="padding:6px;border-bottom:1px solid #f0f0f0">${r.team}</td><td style="padding:6px;border-bottom:1px solid #f0f0f0;text-align:right">${r.current}</td><td style="padding:6px;border-bottom:1px solid #f0f0f0;text-align:right">${r.final}</td><td style="padding:6px;border-bottom:1px solid #f0f0f0;text-align:center">${r.w}</td><td style="padding:6px;border-bottom:1px solid #f0f0f0;text-align:center">${r.d}</td><td style="padding:6px;border-bottom:1px solid #f0f0f0;text-align:center">${r.l}</td>`; tb.appendChild(tr); }
  table.appendChild(tb); el.appendChild(table);
}

// Simple SVG rank chart: x = matchday index, y = rank (1..N). Draw polylines for each team.
function drawRankChart(parsed, snapshots){
  const svg = byId('rank-chart'); while(svg.firstChild) svg.removeChild(svg.firstChild);
  const teams = Object.keys(parsed.teams).sort();
  const dates = snapshots.map(s=>s.date);
  const width = svg.viewBox.baseVal.width || 900; const height = svg.viewBox.baseVal.height || 420;
  const padding = {l:120, r:160, t:20, b:40};
  const plotW = width - padding.l - padding.r; const plotH = height - padding.t - padding.b;
  const n = teams.length; const m = Math.max(1, snapshots.length);
  // map team -> array of ranks per snapshot
  const ranks = {};
  for(const t of teams) ranks[t]=[];
  for(const s of snapshots){
    for(let i=0;i<s.standings.length;i++){ const team = s.standings[i].team; ranks[team].push(i+1); }
  }
  // y scale: rank -> y
  const rankToY = r => padding.t + ((r-1)/(n-1||1)) * plotH;
  const xFor = idx => padding.l + (idx/(m-1||1)) * plotW;

  // axes
  const axisX = document.createElementNS('http://www.w3.org/2000/svg','line'); axisX.setAttribute('x1',padding.l); axisX.setAttribute('y1',padding.t+plotH); axisX.setAttribute('x2',padding.l+plotW); axisX.setAttribute('y2',padding.t+plotH); axisX.setAttribute('stroke','#ccc'); svg.appendChild(axisX);
  // date labels
  for(let i=0;i<m;i++){ const x = xFor(i); const txt = document.createElementNS('http://www.w3.org/2000/svg','text'); txt.setAttribute('x',x); txt.setAttribute('y',padding.t+plotH+16); txt.setAttribute('font-size',10); txt.setAttribute('text-anchor','middle'); txt.setAttribute('fill','#333'); txt.textContent = dates[i]; svg.appendChild(txt); }

  const colors = [];
  // assign colors
  for(let i=0;i<teams.length;i++){ const hue = Math.round((i/teams.length)*320); colors.push(`hsl(${hue} 70% 45%)`); }

  // draw polylines with interactive hover behaviour
  let idx = 0;
  const allPolys = [];
  const allLabels = [];
  for(const t of teams){
    const pts = ranks[t].map((r,i)=>`${xFor(i)},${rankToY(r)}`).join(' ');
    const poly = document.createElementNS('http://www.w3.org/2000/svg','polyline');
    poly.setAttribute('points',pts);
    poly.setAttribute('fill','none');
    poly.setAttribute('stroke',colors[idx%colors.length]);
    poly.setAttribute('stroke-width','2');
    poly.setAttribute('opacity',0.9);
    poly.classList.add('chart-line');
    poly.dataset.team = t;
    svg.appendChild(poly);
    allPolys.push(poly);

    // label last point
    const lastX = xFor(m-1);
    const lastY = rankToY(ranks[t][m-1]);
    const label = document.createElementNS('http://www.w3.org/2000/svg','text');
    label.setAttribute('x', lastX+8);
    label.setAttribute('y', lastY+4);
    label.setAttribute('font-size',11);
    label.setAttribute('fill',colors[idx%colors.length]);
    label.setAttribute('text-anchor','start');
    label.classList.add('chart-label');
    label.dataset.team = t;
    label.textContent = t;
    svg.appendChild(label);
    allLabels.push(label);

    // hover handlers to focus on this team
    const enter = ()=>{
      for(const p of allPolys){ if(p.dataset.team !== t) p.classList.add('dimmed'); else p.classList.add('highlight'); }
      for(const L of allLabels){ if(L.dataset.team !== t) L.classList.add('dimmed'); else L.classList.remove('dimmed'); };
    };
    const leave = ()=>{
      for(const p of allPolys){ p.classList.remove('dimmed'); p.classList.remove('highlight'); }
      for(const L of allLabels){ L.classList.remove('dimmed'); }
    };
    poly.addEventListener('mouseenter', enter);
    poly.addEventListener('mouseleave', leave);
    label.addEventListener('mouseenter', enter);
    label.addEventListener('mouseleave', leave);

    idx++;
  }

  // animated play head
  const playHead = document.createElementNS('http://www.w3.org/2000/svg','line'); playHead.setAttribute('y1',padding.t); playHead.setAttribute('y2',padding.t+plotH); playHead.setAttribute('stroke','#000'); playHead.setAttribute('stroke-width',1.2); playHead.setAttribute('opacity',0.6); svg.appendChild(playHead);
  // expose for controller
  return {svg, xFor, m, playHead};
}

document.addEventListener('DOMContentLoaded',()=>{
  const raw = byId('raw'); const loadBtn = byId('load-file'); const fileInput = byId('file-input'); const simulateBtn = byId('simulate');
  const rerunBtn = byId('rerun');

  loadBtn.addEventListener('click', async ()=>{ try{ const r = await fetch('sim2.txt'); raw.value = await r.text(); } catch(e){ alert('Failed to fetch sim2.txt. Paste or use file input.'); } });
  fileInput.addEventListener('change', e=>{ const f=e.target.files[0]; if(!f) return; const rd=new FileReader(); rd.onload=()=> raw.value=rd.result; rd.readAsText(f); });

  simulateBtn.addEventListener('click', ()=>{
    const text = raw.value.trim(); if(!text){ alert('Paste or load sim2.txt first'); return; }
    const parsed = parseSim2(text);
    // run simulation
    const out = simulateProb(parsed);
    // store results in parsed for rendering stats
    parsed._results = out.results;
    // show predicted
    renderPredicted(out.results);
    // show final table
    renderFinal(parsed, out.final);
    // draw chart (no autoplay). position playHead at first snapshot
    const chart = drawRankChart(parsed, out.snapshots);
    if(chart && chart.m>0){ const x0 = chart.xFor(0); chart.playHead.setAttribute('x1',x0); chart.playHead.setAttribute('x2',x0); }
    // wire rerun button to re-run the exact simulation
    if(rerunBtn){ rerunBtn.onclick = ()=> simulateBtn.click(); }
  });
});
