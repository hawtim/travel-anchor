(() => {
  const STATE_KEY = 'travel-anchor-p03-state';
  const CONFIG_KEY = 'travel-anchor-runtime-override';
  const INTERESTS = ['Photography','Hiking','Food','Roadtrip','Diving','Motorcycle','Citywalk','Nightlife','Museums','Nature'];
  const JAPAN_CITIES = ['tokyo','kyoto','osaka','nara','fukuoka','sapporo','hokkaido','okinawa','hiroshima','nagoya','kobe','yokohama'];
  const uid = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-5);
  const nextYear = new Date().getFullYear() + 1;
  const future = (m,d) => `${nextYear}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const $ = (id) => document.getElementById(id);
  const esc = (s='') => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

  function seed() {
    const personas = [
      {id:'p-charles',nickname:'Charles',age:'30–34',gender:'Man',city:'Shantou',pace:'Medium',social:'Medium',independence:'High',budget:'Normal',interests:['Photography','Hiking','Roadtrip','Motorcycle','Citywalk'],bio:'Independent traveller who likes meaningful encounters, photography and long walks. Happy to share a few days, not the entire trip.',socialProof:'xiaohongshu.com/user/profile/577a971c82ec39653297895b'},
      {id:'p-alice',nickname:'Alice',age:'25–29',gender:'Woman',city:'Shanghai',pace:'Slow',social:'Medium',independence:'High',budget:'Normal',interests:['Photography','Hiking','Food','Citywalk'],bio:'Slow travel, photo walks and nature. I like having my own space and meeting people for specific days.',socialProof:''},
      {id:'p-claire',nickname:'Claire',age:'30–34',gender:'Woman',city:'Guangzhou',pace:'Medium',social:'Low',independence:'High',budget:'Normal',interests:['Hiking','Roadtrip','Nature','Photography'],bio:'Outdoors first, quiet evenings, strong hiker. Prefer a small group and independent plans.',socialProof:''},
      {id:'p-bob',nickname:'Bob',age:'25–29',gender:'Man',city:'Beijing',pace:'Fast',social:'High',independence:'Medium',budget:'Budget',interests:['Food','Nightlife','Citywalk'],bio:'Fast-paced city trips, cheap eats, bars, meeting lots of people.',socialProof:''}
    ];
    const trips = [
      {id:'t1',userId:'p-charles',destination:'Tokyo',status:'Confirmed',start:future(4,12),end:future(4,20),flex:'Fixed',activities:['Photography','Motorcycle','Citywalk'],description:'A few Tokyo days, then flexible side trips.'},
      {id:'t2',userId:'p-alice',destination:'Tokyo',status:'Flexible',start:future(4,1),end:future(5,10),flex:'±1 month',activities:['Photography','Food','Citywalk'],description:'Japan in spring. Dates can move if there are good people to meet.'},
      {id:'t3',userId:'p-claire',destination:'Tokyo',status:'Confirmed',start:future(4,15),end:future(4,24),flex:'±3 days',activities:['Hiking','Nature','Photography'],description:'Tokyo plus day hikes. Quiet evenings.'},
      {id:'t4',userId:'p-bob',destination:'Tokyo',status:'Confirmed',start:future(4,16),end:future(4,22),flex:'Fixed',activities:['Food','Nightlife','Citywalk'],description:'Food crawl and nightlife.'},
      {id:'t5',userId:'p-charles',destination:'Bali',status:'Flexible',start:future(6,1),end:future(6,30),flex:'±1 week',activities:['Diving','Photography','Nature'],description:'A month-ish base for slow travel and creator experiments.'}
    ];
    return { activeId:'p-charles', personas, trips, connections:[], chat:[] };
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STATE_KEY));
      if (parsed?.personas?.length && parsed?.trips) return parsed;
    } catch (_) {}
    return seed();
  }

  function loadConfig() {
    let override = {};
    try { override = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}'); } catch (_) {}
    return { ...(window.TRAVEL_ANCHOR_CONFIG || {}), ...override };
  }

  let state = loadState();
  let config = loadConfig();
  let sb = null;
  let cloudUser = null;
  let cloudProfiles = [];
  let cloudTrips = [];
  let cloudConnections = [];
  let cloudReady = false;
  let aiReady = false;
  let syncing = false;

  const active = () => state.personas.find(p => p.id === state.activeId) || state.personas[0];
  const localTripsFor = (id) => state.trips.filter(t => t.userId === id);
  const personById = (id) => state.personas.find(p => p.id === id);

  function saveState() {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    renderAll();
  }

  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2200);
  }

  function openModal(id) { $(id)?.classList.add('show'); }
  function closeModal(id) { $(id)?.classList.remove('show'); }
  function go(tab) {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === tab));
    document.querySelectorAll('.panel').forEach(x => x.classList.toggle('active', x.id === `panel-${tab}`));
    window.scrollTo({ top: 150, behavior: 'smooth' });
  }

  function days(a,b) {
    const ms = new Date(b) - new Date(a);
    return Math.max(0, Math.floor(ms / 86400000) + 1);
  }

  function overlapDays(a,b) {
    const s = new Date(Math.max(new Date(a.start), new Date(b.start)));
    const e = new Date(Math.min(new Date(a.end), new Date(b.end)));
    return e >= s ? days(s,e) : 0;
  }

  function completeness(p) {
    const fields = ['nickname','age','gender','city','bio','pace','social','independence','budget'];
    let hit = fields.filter(k => p?.[k]).length;
    let total = fields.length + 2;
    if ((p?.interests || []).length >= 3) hit++;
    if (p?.socialProof) hit++;
    return Math.round(hit / total * 100);
  }

  function similarity(a,b) { return a && b && a === b ? 1 : 0.45; }

  function scorePair(me, other, myTrip, otherTrip) {
    const od = overlapDays(myTrip, otherTrip);
    const aa = new Set(myTrip.activities || []);
    const bb = new Set(otherTrip.activities || []);
    const common = [...aa].filter(x => bb.has(x));
    const union = new Set([...aa, ...bb]);
    const activity = union.size ? common.length / union.size : 0.5;
    const time = Math.min(1, (od || 1) / Math.min(Math.max(days(myTrip.start,myTrip.end),1), 7));
    const score = Math.round(100 * (
      time * .28 +
      activity * .24 +
      similarity(me.pace, other.pace) * .14 +
      similarity(me.social, other.social) * .10 +
      similarity(me.independence, other.independence) * .16 +
      similarity(me.budget, other.budget) * .08
    ));
    const confBase = (completeness(me) + completeness(other)) / 2;
    const confidence = confBase >= 82 ? 'High' : confBase >= 62 ? 'Medium' : 'Low';
    const why = [];
    const friction = [];
    if (od) why.push(`${od} day${od > 1 ? 's' : ''} of date overlap`);
    if (common.length) why.push(`Shared interests: ${common.slice(0,3).join(', ')}`);
    if (me.pace === other.pace) why.push(`Similar travel pace (${me.pace.toLowerCase()})`);
    if (me.independence === other.independence) why.push(`Similar independence level`);
    if (me.pace !== other.pace) friction.push(`Different pace: ${me.pace} vs ${other.pace}`);
    if (me.social !== other.social) friction.push('Different social intensity');
    if (me.budget !== other.budget) friction.push('Different budget style');
    return { score, confidence, overlapDays:od, common, why:why.slice(0,4), friction:friction.slice(0,2) };
  }

  function localNetwork() {
    return {
      profiles: state.personas.map(p => ({
        id:p.id,nickname:p.nickname,age_range:p.age,gender:p.gender,city:p.city,pace:p.pace,social:p.social,
        independence:p.independence,budget:p.budget,interests:p.interests,bio:p.bio,social_proof:p.socialProof
      })),
      trips: state.trips.map(t => ({
        id:t.id,user_id:t.userId,client_id:t.id,destination:t.destination,status:t.status,start_date:t.start,end_date:t.end,
        flex:t.flex,activities:t.activities,description:t.description
      }))
    };
  }

  function mergedNetwork() {
    if (cloudReady && cloudTrips.length) return { profiles: cloudProfiles, trips: cloudTrips };
    return localNetwork();
  }

  function normalizedProfile(p) {
    if (!p) return null;
    return {
      id:p.id,
      nickname:p.nickname || 'Traveller',
      age:p.age || p.age_range || '',
      gender:p.gender || '',
      city:p.city || '',
      pace:p.pace || 'Medium',
      social:p.social || 'Medium',
      independence:p.independence || 'Medium',
      budget:p.budget || 'Normal',
      interests:p.interests || [],
      bio:p.bio || '',
      socialProof:p.socialProof || p.social_proof || ''
    };
  }

  function normalizedTrip(t) {
    return {
      id:t.id,
      userId:t.userId || t.user_id,
      destination:t.destination,
      status:t.status,
      start:t.start || t.start_date,
      end:t.end || t.end_date,
      flex:t.flex || '',
      activities:t.activities || [],
      description:t.description || ''
    };
  }

  function currentNetworkProfile() {
    if (cloudReady && cloudUser) {
      const p = cloudProfiles.find(x => x.id === cloudUser.id);
      return normalizedProfile(p) || active();
    }
    return active();
  }

  function currentNetworkTrips() {
    if (cloudReady && cloudUser) return cloudTrips.filter(t => t.user_id === cloudUser.id).map(normalizedTrip);
    return localTripsFor(active().id);
  }

  function rankedMatches() {
    const net = mergedNetwork();
    const me = currentNetworkProfile();
    const myTrips = currentNetworkTrips();
    const out = [];
    for (const myTrip of myTrips) {
      for (const rawTrip of net.trips) {
        const otherTrip = normalizedTrip(rawTrip);
        if (otherTrip.userId === (cloudReady && cloudUser ? cloudUser.id : active().id)) continue;
        if ((otherTrip.destination || '').toLowerCase() !== (myTrip.destination || '').toLowerCase()) continue;
        const otherRaw = net.profiles.find(p => p.id === otherTrip.userId);
        if (!otherRaw) continue;
        const other = normalizedProfile(otherRaw);
        const scored = scorePair(me, other, myTrip, otherTrip);
        if (!scored.overlapDays && myTrip.status === 'Confirmed' && otherTrip.status === 'Confirmed') continue;
        out.push({ myTrip, otherTrip, other, ...scored });
      }
    }
    return out.sort((a,b) => b.score - a.score);
  }

  function destinationNames() {
    return [...new Set(mergedNetwork().trips.map(t => t.destination).filter(Boolean))].sort();
  }

  function densityData(destOrScope, includeFlexible=true) {
    const net = mergedNetwork();
    const scope = String(destOrScope || '').toLowerCase();
    const isJapan = scope === 'japan' || scope === '日本';
    const trips = net.trips.filter(raw => {
      const t = normalizedTrip(raw);
      const d = (t.destination || '').toLowerCase();
      const destinationMatch = isJapan ? JAPAN_CITIES.some(c => d.includes(c)) : d === scope;
      return destinationMatch && (t.status === 'Confirmed' || (includeFlexible && t.status === 'Flexible'));
    }).map(normalizedTrip);
    if (!trips.length) return [];

    const min = new Date(Math.min(...trips.map(t => +new Date(t.start))));
    const max = new Date(Math.max(...trips.map(t => +new Date(t.end))));
    const rows = [];
    const cursor = new Date(min);
    cursor.setHours(0,0,0,0);
    while (cursor <= max && rows.length < 60) {
      const start = new Date(cursor);
      const end = new Date(cursor);
      end.setDate(end.getDate() + 6);
      let confirmed = 0, flexible = 0;
      for (const t of trips) {
        if (new Date(t.end) >= start && new Date(t.start) <= end) {
          if (t.status === 'Confirmed') confirmed++;
          if (t.status === 'Flexible') flexible++;
        }
      }
      rows.push({
        start:start.toISOString().slice(0,10),
        end:end.toISOString().slice(0,10),
        label:`${start.toLocaleDateString(undefined,{month:'short',day:'numeric'})}–${end.toLocaleDateString(undefined,{month:'short',day:'numeric'})}`,
        confirmed, flexible, total:confirmed + flexible
      });
      cursor.setDate(cursor.getDate() + 7);
    }
    return rows;
  }

  function bestDestination() {
    return currentNetworkTrips()[0]?.destination || destinationNames()[0] || 'Tokyo';
  }

  function tripCard(t, editable=false) {
    return `<div class="trip"><div class="trip-top"><div><b>${esc(t.destination)}</b><div class="meta">${esc(t.start)} → ${esc(t.end)} · ${esc(t.flex || '')}</div></div><span class="pill ${String(t.status).toLowerCase()}">${esc(t.status)}</span></div><div class="tags">${(t.activities || []).map(x => `<span class="tag">${esc(x)}</span>`).join('')}</div>${t.description ? `<div class="meta" style="margin-top:8px">${esc(t.description)}</div>` : ''}${editable && !cloudReady ? `<div class="inline" style="margin-top:9px"><button class="btn small danger" data-delete-trip="${esc(t.id)}">Delete</button></div>` : ''}</div>`;
  }

  function matchCard(m, compact=false) {
    const cloudTarget = cloudReady ? m.other.id : '';
    const tripId = cloudReady ? m.otherTrip.id : m.otherTrip.id;
    return `<div class="match"><div class="match-top"><div style="display:flex;gap:9px"><div class="avatar">${esc((m.other.nickname || '?')[0])}</div><div><b>${esc(m.other.nickname)}</b><div class="meta">${esc(m.other.age || '')} · ${esc(m.other.city || '')}</div><div class="meta">${esc(m.otherTrip.destination)} · ${esc(m.otherTrip.start)} → ${esc(m.otherTrip.end)}</div></div></div><div style="text-align:right"><div class="score">${m.score}%</div><span class="pill ${m.confidence.toLowerCase()}">${m.confidence} confidence</span></div></div><div class="tags">${(m.otherTrip.activities || []).map(x => `<span class="tag">${esc(x)}</span>`).join('')}</div>${compact ? '' : `<ul class="why">${m.why.map(x => `<li>${esc(x)}</li>`).join('')}</ul>${m.friction.length ? `<ul class="why friction">${m.friction.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}<div class="inline"><button class="btn small primary" data-connect="${esc(cloudTarget || m.other.id)}" data-trip="${esc(tripId)}">Request to connect</button>${m.other.socialProof ? '<span class="tiny">Social proof provided</span>' : ''}</div>`}</div>`;
  }

  function renderChecks(id, selected=[]) {
    const set = new Set(selected || []);
    $(id).innerHTML = INTERESTS.map(x => `<button type="button" class="check ${set.has(x) ? 'on' : ''}" data-check="${x}">${x}</button>`).join('');
  }

  function readChecks(id) { return [...$(id).querySelectorAll('.check.on')].map(x => x.dataset.check); }

  function renderPersonas() {
    $('personaBar').innerHTML = state.personas.map(p => `<button class="persona ${p.id === state.activeId ? 'active' : ''}" data-persona="${p.id}"><span class="avatar">${esc(p.nickname[0])}</span><span><b>${esc(p.nickname)}</b><span class="tiny">${esc(p.age)} · ${esc(p.gender)}</span></span></button>`).join('');
  }

  function renderStats() {
    const net = mergedNetwork();
    $('statTravellers').textContent = net.profiles.length;
    $('statTrips').textContent = net.trips.length;
    $('statMatches').textContent = rankedMatches().length;
  }

  function renderProfile() {
    const p = active();
    $('profileText').value = p.bio || '';
    $('nicknameInput').value = p.nickname || '';
    $('ageInput').value = p.age || '30–34';
    $('genderInput').value = p.gender || 'Prefer not to say';
    $('cityInput').value = p.city || '';
    $('paceInput').value = p.pace || 'Medium';
    $('socialInput').value = p.social || 'Medium';
    $('independenceInput').value = p.independence || 'Medium';
    $('budgetInput').value = p.budget || 'Normal';
    $('socialProofInput').value = p.socialProof || '';
    renderChecks('profileInterests', p.interests || []);
  }

  function renderTrips() {
    const mine = localTripsFor(active().id);
    $('myTrips').innerHTML = mine.length ? mine.map(t => tripCard(t,true)).join('') : '<div class="empty">No trip yet.</div>';
    renderChecks('tripInterests', []);
  }

  function renderDensity(targetId, destination) {
    const rows = densityData(destination);
    if (!rows.length) { $(targetId).innerHTML = '<div class="empty">No density yet.</div>'; return; }
    const max = Math.max(...rows.map(x => x.total), 1);
    $(targetId).innerHTML = rows.map(r => `<div class="density"><span class="tiny">${esc(r.label)}</span><div class="bar"><span style="width:${Math.round(r.total/max*100)}%"></span></div><span class="tiny">${r.confirmed}C ${r.flexible}F</span></div>`).join('');
  }

  function renderDiscover() {
    const names = destinationNames();
    const current = $('discoverDestination').value || bestDestination();
    $('discoverDestination').innerHTML = names.map(x => `<option ${x === current ? 'selected' : ''}>${esc(x)}</option>`).join('');
    const dest = $('discoverDestination').value || names[0] || 'Tokyo';
    renderDensity('densityList', dest);
    const matches = rankedMatches().filter(m => m.otherTrip.destination.toLowerCase() === dest.toLowerCase());
    $('candidateCount').textContent = `${matches.length} candidates`;
    $('matchesList').innerHTML = matches.length ? matches.map(m => matchCard(m)).join('') : '<div class="empty">No matching travellers yet.</div>';
  }

  function renderHome() {
    const matches = rankedMatches().slice(0,3);
    $('homeMatches').innerHTML = matches.length ? matches.map(m => matchCard(m,true)).join('') : '<div class="empty">Create a trip to discover overlap.</div>';
    const mine = localTripsFor(active().id).slice(0,3);
    $('homeTrips').innerHTML = mine.length ? mine.map(t => tripCard(t)).join('') : '<div class="empty">No future trip yet.</div>';
    renderDensity('homeDensity', bestDestination());
  }

  function renderConnections() {
    let list = [];
    if (cloudReady && cloudUser) {
      list = cloudConnections.map(c => ({...c, mode:'cloud'}));
    } else {
      list = state.connections.map(c => ({...c, mode:'local'}));
    }
    $('requestsList').innerHTML = list.length ? list.map(c => {
      if (c.mode === 'cloud') {
        const incoming = c.receiver_id === cloudUser.id;
        const otherId = incoming ? c.requester_id : c.receiver_id;
        const other = normalizedProfile(cloudProfiles.find(p => p.id === otherId));
        return `<div class="request"><b>${incoming ? 'From' : 'To'} ${esc(other?.nickname || 'Traveller')}</b><div class="meta">${esc(c.intent || '')} · ${esc(c.status)}</div>${incoming && c.status === 'Requested' ? `<div class="inline" style="margin-top:8px"><button class="btn small primary" data-cloud-accept="${c.id}">Accept</button><button class="btn small" data-cloud-decline="${c.id}">Decline</button></div>` : ''}</div>`;
      }
      const otherId = c.from === active().id ? c.to : c.from;
      const other = personById(otherId);
      return `<div class="request"><b>${esc(other?.nickname || 'Traveller')}</b><div class="meta">${esc(c.intent || '')} · ${esc(c.status)}</div></div>`;
    }).join('') : '<div class="empty">No connection requests.</div>';
  }

  function renderChat() {
    if (!state.chat.length) state.chat = [{role:'assistant',content:'可以直接问我：日本什么时候人最多、某个时间有哪些人、或者谁和你的旅行方式更匹配。'}];
    $('chatMessages').innerHTML = state.chat.map(m => `<div class="message ${m.role}">${esc(m.content)}</div>`).join('');
    $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
  }

  function renderStatus() {
    $('networkChip').textContent = cloudReady ? 'Supabase network' : 'Local demo';
    $('dataStatus').textContent = cloudReady ? 'Supabase' : 'Local demo';
    $('dataStatus').className = cloudReady ? 'ok' : 'warn';
    $('aiStatus').textContent = aiReady ? 'Luna via Render' : 'Local fallback';
    $('aiStatus').className = aiReady ? 'ok' : 'warn';
    $('identityStatus').textContent = cloudReady ? 'Anonymous Supabase user' : 'Test persona';
    $('chatModelChip').textContent = aiReady ? 'GPT-5.6 Luna' : 'fallback';
  }

  function renderAll() {
    renderPersonas();
    renderStats();
    renderProfile();
    renderTrips();
    renderHome();
    renderDiscover();
    renderConnections();
    renderChat();
    renderStatus();
  }

  function saveProfile() {
    const p = active();
    Object.assign(p, {
      nickname:$('nicknameInput').value.trim() || p.nickname,
      age:$('ageInput').value,
      gender:$('genderInput').value,
      city:$('cityInput').value.trim(),
      pace:$('paceInput').value,
      social:$('socialInput').value,
      independence:$('independenceInput').value,
      budget:$('budgetInput').value,
      interests:readChecks('profileInterests'),
      bio:$('profileText').value.trim(),
      socialProof:$('socialProofInput').value.trim()
    });
    saveState();
    syncActiveToCloud().catch(console.error);
    toast('Profile saved');
  }

  function analyzeProfile() {
    const txt = $('profileText').value.toLowerCase();
    if (/slow|relax|佛系|慢/.test(txt)) $('paceInput').value = 'Slow';
    else if (/fast|packed|特种兵|赶/.test(txt)) $('paceInput').value = 'Fast';
    else $('paceInput').value = 'Medium';
    if (/alone|space|independent|各玩各|独处|独立/.test(txt)) $('independenceInput').value = 'High';
    if (/party|bar|nightlife|夜店|酒吧/.test(txt)) $('socialInput').value = 'High';
    else if (/quiet|small group|安静|小群/.test(txt)) $('socialInput').value = 'Low';
    const map = {Photography:/photo|camera|摄影|拍照/,Hiking:/hike|walk|徒步|爬山/,Food:/food|restaurant|吃|美食/,Roadtrip:/roadtrip|drive|自驾/,Diving:/dive|diving|潜水/,Motorcycle:/motor|bike|摩托/,Citywalk:/citywalk|city walk|城市/,Nightlife:/nightlife|bar|club|酒吧|夜店/,Museums:/museum|gallery|博物馆|美术馆/,Nature:/nature|mountain|beach|自然|海|山/};
    renderChecks('profileInterests', Object.entries(map).filter(([,re]) => re.test(txt)).map(([k]) => k));
    $('analysisHint').textContent = 'Structured locally; chat reasoning can use Luna.';
  }

  function createTrip() {
    const destination = $('tripDestination').value.trim();
    const start = $('tripStart').value;
    const end = $('tripEnd').value;
    if (!destination || !start || !end) return toast('Destination and dates are required');
    if (new Date(end) < new Date(start)) return toast('End date must be after start date');
    state.trips.push({
      id:'t-' + uid(), userId:active().id, destination, status:$('tripStatus').value, start, end,
      flex:$('tripFlex').value, activities:readChecks('tripInterests'), description:$('tripDescription').value.trim()
    });
    $('tripDestination').value = '';
    $('tripDescription').value = '';
    saveState();
    syncActiveToCloud().catch(console.error);
    toast('Trip published');
  }

  function createPersona() {
    const style = $('newPersonaStyle').value.trim();
    const p = {
      id:'p-' + uid(), nickname:$('newPersonaName').value.trim() || 'Traveller', age:'25–29', gender:$('newPersonaGender').value,
      city:'', pace:/slow|慢/i.test(style)?'Slow':/fast|快|特种兵/i.test(style)?'Fast':'Medium', social:'Medium',
      independence:/independent|独立|space|独处/i.test(style)?'High':'Medium', budget:'Normal', interests:INTERESTS.filter(x => new RegExp(x,'i').test(style)),
      bio:style, socialProof:''
    };
    state.personas.push(p);
    state.activeId = p.id;
    closeModal('personaModal');
    saveState();
    toast('Local test persona created');
  }

  async function requestConnect(userId, tripId) {
    if (cloudReady && sb && cloudUser && /^[0-9a-f-]{36}$/i.test(userId)) {
      const { error } = await sb.from('connections').insert({ requester_id:cloudUser.id, receiver_id:userId, trip_id:tripId, intent:'Travel together' });
      if (error) return toast(`Connection failed: ${error.message}`);
      await refreshCloud();
      toast('Connection request sent');
      return;
    }
    if (state.connections.some(c => c.from === active().id && c.to === userId && c.tripId === tripId)) return toast('Request already exists');
    state.connections.push({id:'c-' + uid(),from:active().id,to:userId,tripId,intent:'Travel together',status:'Requested'});
    saveState();
    toast('Local connection request sent');
  }

  async function updateCloudConnection(id, status) {
    if (!sb) return;
    const { error } = await sb.from('connections').update({status,updated_at:new Date().toISOString()}).eq('id',id).eq('receiver_id',cloudUser.id);
    if (error) return toast(error.message);
    await refreshCloud();
  }

  function inferScope(question) {
    const q = question.toLowerCase();
    if (q.includes('日本') || q.includes('japan')) return 'Japan';
    for (const d of destinationNames()) if (q.includes(d.toLowerCase())) return d;
    if (q.includes('东京')) return 'Tokyo';
    if (q.includes('京都')) return 'Kyoto';
    if (q.includes('大阪')) return 'Osaka';
    return bestDestination();
  }

  function buildChatContext(question) {
    const scope = inferScope(question);
    const density = densityData(scope).sort((a,b) => b.total - a.total).slice(0,8);
    const matches = rankedMatches().filter(m => {
      if (scope === 'Japan') return JAPAN_CITIES.some(c => m.otherTrip.destination.toLowerCase().includes(c));
      return m.otherTrip.destination.toLowerCase() === scope.toLowerCase();
    }).slice(0,8).map(m => ({
      traveller:m.other.nickname,
      destination:m.otherTrip.destination,
      dates:[m.otherTrip.start,m.otherTrip.end],
      status:m.otherTrip.status,
      compatibility:m.score,
      confidence:m.confidence,
      overlapDays:m.overlapDays,
      reasons:m.why,
      friction:m.friction,
      activities:m.otherTrip.activities
    }));
    return {
      generatedAt:new Date().toISOString(),
      networkMode:cloudReady ? 'shared-supabase' : 'local-demo',
      destinationScope:scope,
      activeTraveller:{nickname:currentNetworkProfile()?.nickname,pace:currentNetworkProfile()?.pace,social:currentNetworkProfile()?.social,independence:currentNetworkProfile()?.independence,budget:currentNetworkProfile()?.budget,interests:currentNetworkProfile()?.interests},
      activeTrips:currentNetworkTrips().map(t => ({destination:t.destination,status:t.status,start:t.start,end:t.end,activities:t.activities})),
      travellerCount:mergedNetwork().profiles.length,
      tripCount:mergedNetwork().trips.length,
      density,
      topMatches:matches
    };
  }

  function localChatAnswer(question, context) {
    const scope = context.destinationScope;
    const peak = context.density[0];
    const matches = context.topMatches || [];
    const parts = [];
    if (peak) parts.push(`${scope} 目前最密集的窗口是 ${peak.start} 到 ${peak.end}：${peak.confirmed} 位 Confirmed，${peak.flexible} 位 Flexible。`);
    else parts.push(`目前没有足够的 ${scope} 行程数据形成密度判断。`);
    if (matches.length) parts.push(`与你当前资料最接近的候选是 ${matches.slice(0,3).map(x => `${x.traveller}（${x.compatibility}%）`).join('、')}。`);
    if (/改|调整|日期|when|时间/.test(question) && peak) parts.push(`如果你的日期可调整，可以优先围绕这个窗口继续看具体匹配，但这里仍只是当前网络数据，不代表旅行质量保证。`);
    parts.push(aiReady ? '' : '当前回答来自本地 fallback；配置 Render API 后会由 Luna 根据同一份结构化事实生成解释。');
    return parts.filter(Boolean).join('\n\n');
  }

  async function sendChat() {
    const question = $('chatInput').value.trim();
    if (!question) return;
    $('chatInput').value = '';
    state.chat.push({role:'user',content:question});
    renderChat();
    const context = buildChatContext(question);
    let answer;
    try {
      if (config.apiBaseUrl) {
        const response = await fetch(`${config.apiBaseUrl.replace(/\/$/,'')}/chat`, {
          method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question,context})
        });
        if (!response.ok) throw new Error(`API ${response.status}`);
        const data = await response.json();
        answer = data.answer;
      }
    } catch (e) {
      console.warn('AI API unavailable, using fallback', e);
    }
    if (!answer) answer = localChatAnswer(question, context);
    state.chat.push({role:'assistant',content:answer});
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    renderChat();
  }

  async function initSupabase() {
    if (!config.supabaseUrl || !config.supabasePublishableKey || !window.supabase?.createClient) return;
    try {
      sb = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, { auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true} });
      let { data:{ session } } = await sb.auth.getSession();
      if (!session) {
        const result = await sb.auth.signInAnonymously();
        if (result.error) throw result.error;
        session = result.data.session;
      }
      cloudUser = session.user;
      cloudReady = true;
      await syncActiveToCloud();
      await refreshCloud();
    } catch (error) {
      console.error('Supabase init failed', error);
      cloudReady = false;
      toast('Supabase unavailable; using local demo');
    }
    renderAll();
  }

  async function syncActiveToCloud() {
    if (!cloudReady || !sb || !cloudUser || syncing) return;
    syncing = true;
    try {
      const p = active();
      const { error:profileError } = await sb.from('profiles').upsert({
        id:cloudUser.id,nickname:p.nickname,age_range:p.age,gender:p.gender,city:p.city,pace:p.pace,social:p.social,
        independence:p.independence,budget:p.budget,interests:p.interests || [],bio:p.bio,social_proof:p.socialProof,updated_at:new Date().toISOString()
      });
      if (profileError) throw profileError;
      const mine = localTripsFor(p.id);
      for (const t of mine) {
        const { error } = await sb.from('trips').upsert({
          user_id:cloudUser.id,client_id:t.id,destination:t.destination,status:t.status,start_date:t.start,end_date:t.end,flex:t.flex,
          activities:t.activities || [],description:t.description,visibility:'network',updated_at:new Date().toISOString()
        }, { onConflict:'user_id,client_id' });
        if (error) throw error;
      }
    } finally {
      syncing = false;
    }
  }

  async function refreshCloud() {
    if (!cloudReady || !sb) return;
    const [{data:profiles,error:pe},{data:trips,error:te}] = await Promise.all([
      sb.from('profiles').select('*'),
      sb.from('trips').select('*').eq('visibility','network')
    ]);
    if (pe) throw pe;
    if (te) throw te;
    cloudProfiles = profiles || [];
    cloudTrips = trips || [];
    if (cloudUser) {
      const {data:connections,error:ce} = await sb.from('connections').select('*').or(`requester_id.eq.${cloudUser.id},receiver_id.eq.${cloudUser.id}`).order('created_at',{ascending:false});
      if (!ce) cloudConnections = connections || [];
    }
    renderAll();
  }

  async function checkAI() {
    aiReady = false;
    if (!config.apiBaseUrl) return renderStatus();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const r = await fetch(`${config.apiBaseUrl.replace(/\/$/,'')}/health`, {signal:controller.signal});
      clearTimeout(timer);
      const data = await r.json();
      aiReady = Boolean(r.ok && data.ok && data.copilotConfigured);
    } catch (_) {}
    renderStatus();
  }

  function fillSetup() {
    $('cfgSupabaseUrl').value = config.supabaseUrl || '';
    $('cfgSupabaseKey').value = config.supabasePublishableKey || '';
    $('cfgApiUrl').value = config.apiBaseUrl || '';
  }

  function saveConfig() {
    const value = {
      supabaseUrl:$('cfgSupabaseUrl').value.trim(),
      supabasePublishableKey:$('cfgSupabaseKey').value.trim(),
      apiBaseUrl:$('cfgApiUrl').value.trim()
    };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(value));
    location.reload();
  }

  function clearConfig() {
    localStorage.removeItem(CONFIG_KEY);
    location.reload();
  }

  document.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.matches('.tab')) go(t.dataset.tab);
    if (t.dataset.go) go(t.dataset.go);
    if (t.dataset.persona) { state.activeId = t.dataset.persona; saveState(); }
    if (t.dataset.check) t.classList.toggle('on');
    if (t.dataset.close) closeModal(t.dataset.close);
    if (t.dataset.deleteTrip) { state.trips = state.trips.filter(x => x.id !== t.dataset.deleteTrip); saveState(); }
    if (t.dataset.connect) await requestConnect(t.dataset.connect, t.dataset.trip);
    if (t.dataset.cloudAccept) await updateCloudConnection(t.dataset.cloudAccept, 'Accepted');
    if (t.dataset.cloudDecline) await updateCloudConnection(t.dataset.cloudDecline, 'Declined');
    if (t.matches('.suggestion')) { $('chatInput').value = t.textContent; await sendChat(); }
  });

  $('setupBtn').onclick = () => { fillSetup(); openModal('setupModal'); };
  $('saveConfigBtn').onclick = saveConfig;
  $('clearConfigBtn').onclick = clearConfig;
  $('newPersonaBtn').onclick = () => openModal('personaModal');
  $('createPersonaConfirm').onclick = createPersona;
  $('saveProfileBtn').onclick = saveProfile;
  $('analyzeBtn').onclick = analyzeProfile;
  $('createTripBtn').onclick = createTrip;
  $('discoverDestination').onchange = renderDiscover;
  $('chatSendBtn').onclick = sendChat;
  $('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } });

  renderAll();
  initSupabase();
  checkAI();
})();
