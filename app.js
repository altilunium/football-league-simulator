// Football League Predictor / Simulator
// Basic strategy: for each club, compute maximum points if it wins all its remaining matches.
// Then try a backtracking assignment (greedy ordering + pruning) for other matches where we prune
// whenever any opponent's points would exceed the target's maximum. Time-limited per club.

function byId(id){return document.getElementById(id)}

function parseSim(text){
  const lines = text.split(/\r?\n/).map(l=>l.trim()).filter((l,i,arr)=>!(l==='' && (arr[i-1]===undefined || arr[i-1]==='')));
  let mode = null;
  const teams = {};
  const matches = [];
  let currentDate = null;
  for(const raw of lines){
    if(raw.startsWith('[')){
      if(raw.toUpperCase().includes('LEAGUE')) mode='LEAGUE';
      else if(raw.toUpperCase().includes('FUTURE')) mode='FUTURE';
      else mode = null;
      continue;
    }
    if(mode==='LEAGUE'){
      const m = raw.match(/^(.+?)\s*:\s*(\d+)$/);
      if(m){ teams[m[1].trim()] = parseInt(m[2],10); }
      continue;
    }
    if(mode==='FUTURE'){
      // date line like '30 Dec :' or '12 Jan' or '4 Jan :'
      const dateMatch = raw.match(/^([0-9]{1,2}\s+\w+(?:\s+\w+)?)(\s*:\s*)?$/);
      if(dateMatch){ currentDate = dateMatch[1].trim(); continue; }
      // match line e.g. 'Arema - Persita'
      const mm = raw.match(/^(.+?)\s*-\s*(.+)$/);
      if(mm && currentDate){
        matches.push({date: currentDate, home:mm[1].trim(), away:mm[2].trim()});
        // ensure teams exist in map
        if(!(mm[1].trim() in teams)) teams[mm[1].trim()] = 0;
        if(!(mm[2].trim() in teams)) teams[mm[2].trim()] = 0;
      }
    }
  }
  return {teams,matches};
}

function simulateAll(parsed){
  const clubs = Object.keys(parsed.teams).sort((a,b)=>parsed.teams[b]-parsed.teams[a]);
  const results = {};
  for(const club of clubs){
    const res = simulateForClub(club, parsed.teams, parsed.matches);
    results[club] = res;
  }
  return results;
}

function simulateForClub(club, teamsPointsOrig, matchesOrig){
  const teams = {...teamsPointsOrig};
  // normalize team names as they appear — keys are as-is
  const matches = matchesOrig.map(m=>({date:m.date,home:m.home,away:m.away}));

  // count remaining matches for club
  const clubRemaining = matches.filter(m=>m.home===club || m.away===club).length;
  const targetMax = teams[club] + 3*clubRemaining;

  // quick impossible check: if some other team already has more points than targetMax
  const others = Object.keys(teams).filter(t=>t!==club);
  for(const o of others){ if(teams[o] > targetMax) {
      return {possible:false,reason:`Even if ${club} wins all remaining matches, they can reach ${targetMax}, but ${o} already has ${teams[o]} points.`};
  }}

  // assign all matches involving club as wins for club (optimistic)
  const assigned = new Map();
  for(const m of matches){
    if(m.home===club || m.away===club){
      // club wins
      teams[club] += 3;
      assigned.set(m, {winner:club});
    }
  }

  // remaining matches to decide
  const remaining = matches.filter(m=>!assigned.has(m));

  // order matches to help pruning: those involving currently strong teams first
  remaining.sort((a,b)=>{
    const maxA = Math.max(teams[a.home]||0, teams[a.away]||0);
    const maxB = Math.max(teams[b.home]||0, teams[b.away]||0);
    return maxB - maxA;
  });

  // DFS/backtracking with pruning and time limit
  const start = performance.now();
  const timeLimit = 1400; // ms per club

  function dfs(idx, points, assignments){
    if(performance.now()-start > timeLimit) return null;
    // prune: if any other team already exceeds targetMax
    for(const t of Object.keys(points)){
      if(t===club) continue;
      if(points[t] > targetMax) return null;
    }
    if(idx>=remaining.length){
      // finished assignments — check strict first place
      const bestOther = Math.max(...Object.keys(points).filter(t=>t!==club).map(t=>points[t]));
      if(points[club] > bestOther) return assignments.slice();
      return null;
    }
    const m = remaining[idx];
    const home = m.home, away = m.away;
    // try outcomes in order that favors keeping rivals low: prefer win for currently weaker team
    const order = ['home','draw','away'];
    // but choose ordering by current points
    const hv = points[home]||0, av = points[away]||0;
    // prefer giving 3 to the smaller one
    if(hv>av) order.splice(0,1,'away');

    for(const o of order){
      const np = {...points};
      if(o==='home') np[home] = (np[home]||0) + 3;
      else if(o==='away') np[away] = (np[away]||0) + 3;
      else { np[home] = (np[home]||0) + 1; np[away] = (np[away]||0) + 1; }
      // quick prune: if any exceeds targetMax
      let bad=false;
      for(const t of Object.keys(np)){
        if(t===club) continue;
        if(np[t] > targetMax){ bad=true; break; }
      }
      if(bad) continue;
      assignments.push({match:m,outcome:o});
      const r = dfs(idx+1,np,assignments);
      if(r) return r;
      assignments.pop();
    }
    return null;
  }

  const initPoints = {...teams};
  const assignments = [];
  const solution = dfs(0, initPoints, assignments);
  if(solution){
    // Build full schedule results including target wins
    const plan = [];
    // include assigned target match wins
    for(const m of matches){
      let out = null;
      if(m.home===club || m.away===club) out = {winner:club};
      else {
        const s = solution.find(x=>x.match.date===m.date && x.match.home===m.home && x.match.away===m.away);
        if(s) out = {outcome:s.outcome};
      }
      plan.push({date:m.date,home:m.home,away:m.away,decision:out});
    }
    return {possible:true,scenario:plan,explain:`Found a constructive scenario where ${club} wins all its remaining matches and finishes first.`};
  }

  // fallback impossible explanation using simple upper bound
  // compute each rival's upper bound if they won all remaining matches not against the club
  const rivalBounds = {};
  for(const r of others){
    const remAgainstClub = matches.filter(m=>(m.home===r && m.away===club)||(m.away===r && m.home===club)).length;
    const remTotal = matches.filter(m=>m.home===r || m.away===r).length;
    const ub = teamsPointsOrig[r] + 3*(remTotal - remAgainstClub);
    rivalBounds[r] = ub;
  }
  const worst = Object.entries(rivalBounds).sort((a,b)=>b[1]-a[1])[0];
  const reason = worst ? `${club} max points ${targetMax}, but ${worst[0]} could still reach ${worst[1]} in remaining matches (upper bound).` : 'Could not find a constructive scenario within time limit.';
  return {possible:false,reason};
}

// UI wiring
document.addEventListener('DOMContentLoaded',()=>{
  const raw = byId('raw');
  const loadBtn = byId('load-file');
  const fileInput = byId('file-input');
  const simulateBtn = byId('simulate');
  const clubsList = byId('clubs-list');
  const summary = byId('summary');
  const scenarioPanel = byId('scenario');
  const scenarioClub = byId('scenario-club');
  const scenarioDetails = byId('scenario-details');
  const closeScenario = byId('close-scenario');

  loadBtn.addEventListener('click', async ()=>{
    try{
      const r = await fetch('sim.txt');
      const text = await r.text();
      raw.value = text;
    }catch(e){ alert('Failed to fetch sim.txt. Use file input or paste content.'); }
  });

  fileInput.addEventListener('change', e=>{
    const f = e.target.files[0];
    if(!f) return;
    const reader = new FileReader();
    reader.onload = ()=> raw.value = reader.result;
    reader.readAsText(f);
  });

  simulateBtn.addEventListener('click', ()=>{
    const text = raw.value.trim();
    if(!text){ alert('Paste or load sim.txt first.'); return; }
    const parsed = parseSim(text);
    // keep parsed globally so scenario view can compute final standings
    window._lastParsed = parsed;
    const results = simulateAll(parsed);
    clubsList.innerHTML='';
    let possibleCount=0;
    for(const [club,res] of Object.entries(results)){
      const li = document.createElement('li');
      const left = document.createElement('div'); left.innerHTML = `<strong>${club}</strong><div class="meta">Current points: ${parsed.teams[club]||0}</div>`;
      const right = document.createElement('div');
      if(res.possible){ possibleCount++; const b = document.createElement('button'); b.textContent='Show scenario'; b.addEventListener('click',()=>showScenario(club,res)); right.appendChild(b); }
      else { const span = document.createElement('span'); span.className='meta'; span.textContent = 'Not possible'; right.appendChild(span); }
      li.appendChild(left); li.appendChild(right);
      clubsList.appendChild(li);
      if(!res.possible){ const p = document.createElement('div'); p.className='meta'; p.textContent = res.reason; li.appendChild(p); }
    }
    summary.textContent = `Checked ${Object.keys(results).length} clubs — ${possibleCount} still have a constructive scenario found (within time limit).`;
  });

  function showScenario(club,res){
    scenarioPanel.classList.remove('hidden');
    scenarioClub.textContent = `${club} — ${res.explain||''}`;
    scenarioDetails.innerHTML = '';
    if(res.scenario){
      const byDate = {};
      for(const m of res.scenario){
        if(!byDate[m.date]) byDate[m.date]=[];
        byDate[m.date].push(m);
      }
      const keys = Object.keys(byDate);
      for(const d of keys){
        const h = document.createElement('h3'); h.textContent = d; scenarioDetails.appendChild(h);
        for(const m of byDate[d]){
          const div = document.createElement('div');
          let decText = 'undecided';
          if(m.decision){
            if(m.decision.winner){ decText = `${m.decision.winner} wins`; }
            else if(m.decision.outcome === 'home') decText = `${m.home} wins`;
            else if(m.decision.outcome === 'away') decText = `${m.away} wins`;
            else if(m.decision.outcome === 'draw') decText = `Draw`;
            else decText = String(m.decision.outcome);
          }
          div.textContent = `${m.home} - ${m.away}  →  ${decText}`;
          scenarioDetails.appendChild(div);
        }
      }

      // compute final standings after applying scenario decisions
      const parsed = window._lastParsed || {teams:{}};
      const final = {};
      // initialize
      for(const t of Object.keys(parsed.teams || {})) final[t] = parsed.teams[t] || 0;
      // apply each match decision
      for(const m of res.scenario){
        if(!m.decision) continue;
        if(m.decision.winner){ final[m.decision.winner] = (final[m.decision.winner]||0) + 3; }
        else if(m.decision.outcome === 'home'){ final[m.home] = (final[m.home]||0) + 3; }
        else if(m.decision.outcome === 'away'){ final[m.away] = (final[m.away]||0) + 3; }
        else if(m.decision.outcome === 'draw'){ final[m.home] = (final[m.home]||0) + 1; final[m.away] = (final[m.away]||0) + 1; }
      }

      // render final table with simulated W/D/L counts and current points
      const tableHeader = document.createElement('h3'); tableHeader.textContent = 'Final standings (scenario)'; scenarioDetails.appendChild(tableHeader);
      // initialize counters (track current and final points)
      const stats = {};
      for(const t of Object.keys(parsed.teams || {})) stats[t] = {current: parsed.teams[t]||0, final: final[t]||0, w:0, d:0, l:0};
      // apply simulated match results to counts
      for(const m of res.scenario){
        if(!m.decision) continue;
        if(m.decision.winner){
          const w = m.decision.winner;
          const loser = (w === m.home) ? m.away : m.home;
          stats[w].w += 1;
          stats[loser].l += 1;
        } else if(m.decision.outcome === 'home'){
          stats[m.home].w += 1;
          stats[m.away].l += 1;
        } else if(m.decision.outcome === 'away'){
          stats[m.away].w += 1;
          stats[m.home].l += 1;
        } else if(m.decision.outcome === 'draw'){
          stats[m.home].d += 1;
          stats[m.away].d += 1;
        }
      }

      const rows = Object.entries(stats).map(([team,s])=>({team,current:s.current,pts:s.final,w:s.w,d:s.d,l:s.l}));
      rows.sort((a,b)=>b.pts - a.pts || a.team.localeCompare(b.team));

      const table = document.createElement('table');
      table.style.width = '100%';
      table.style.borderCollapse = 'collapse';
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th style="text-align:left;padding:6px;border-bottom:1px solid #ddd">Team</th><th style="padding:6px;border-bottom:1px solid #ddd">Current pts</th><th style="padding:6px;border-bottom:1px solid #ddd">Final pts</th><th style="padding:6px;border-bottom:1px solid #ddd">Wins</th><th style="padding:6px;border-bottom:1px solid #ddd">Draws</th><th style="padding:6px;border-bottom:1px solid #ddd">Losses</th></tr>';
      table.appendChild(thead);
      const tb = document.createElement('tbody');
      for(const r of rows){
        const tr = document.createElement('tr');
        tr.innerHTML = `<td style="padding:6px;border-bottom:1px solid #f0f0f0">${r.team}</td><td style="padding:6px;border-bottom:1px solid #f0f0f0;text-align:right">${r.current}</td><td style="padding:6px;border-bottom:1px solid #f0f0f0;text-align:right">${r.pts}</td><td style="padding:6px;border-bottom:1px solid #f0f0f0;text-align:center">${r.w}</td><td style="padding:6px;border-bottom:1px solid #f0f0f0;text-align:center">${r.d}</td><td style="padding:6px;border-bottom:1px solid #f0f0f0;text-align:center">${r.l}</td>`;
        tb.appendChild(tr);
      }
      table.appendChild(tb);
      scenarioDetails.appendChild(table);
    } else {
      scenarioDetails.textContent = res.reason || 'No scenario available.';
    }
  }

  closeScenario.addEventListener('click',()=> scenarioPanel.classList.add('hidden') );
});
