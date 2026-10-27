const $ = s => document.querySelector(s);
const playerKey = 'boundarybid-player', roomKey = 'boundarybid-room';
let playerId = localStorage.getItem(playerKey) || crypto.randomUUID(); localStorage.setItem(playerKey, playerId);
let state = null, selectedMode = 5, poller = null, joining = false;
const nameInput = $('#nameInput'), codeInput = $('#codeInput'), entryError = $('#entryError'), landing = $('#landing'), roomEl = $('#room');
document.querySelectorAll('.mode-option').forEach(b => b.onclick = () => { selectedMode = Number(b.dataset.mode); document.querySelectorAll('.mode-option').forEach(x => x.classList.toggle('active', x === b)); });
async function api(url, data) {
  let res;
  try { res = await fetch(url, data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, playerId }) } : undefined); }
  catch { throw new Error('Cannot reach the game server. Open this game at http://localhost:3000 and try again.'); }
  let payload;
  try { payload = await res.json(); } catch { throw new Error('The game server sent an unreadable response. Refresh the page and try again.'); }
  if (!res.ok) throw new Error(payload.error || 'Something went wrong.');
  return payload;
}
const displayError = (msg, target = entryError) => { target.textContent = msg; };
async function createRoom() { try { entryError.textContent = ''; const s = await api('/api/create', { name: nameInput.value || 'Captain', mode: selectedMode }); enterRoom(s); } catch (e) { displayError(e.message); } }
async function joinRoom() {
  if (joining) return;
  entryError.textContent = '';
  const code = codeInput.value.trim().toUpperCase();
  if (!/^[A-F0-9]{6}$/.test(code)) { displayError('Enter the 6-character room code.'); codeInput.focus(); return; }
  joining = true;
  const button = $('#joinBtn');
  if (button) { button.disabled = true; button.textContent = 'JOINING…'; }
  try { const s = await api('./api/join', { name: nameInput.value.trim() || 'Captain', code }); enterRoom(s); }
  catch (e) { displayError(e.message); }
  finally { joining = false; if (button) { button.disabled = false; button.textContent = 'JOIN'; } }
}
function enterRoom(s) { state = s; localStorage.setItem(roomKey, s.code); landing.classList.add('hidden'); roomEl.classList.remove('hidden'); paint(); clearInterval(poller); poller = setInterval(refresh, 800); }
async function refresh() { if (!state) return; try { const s = await api(`/api/state?code=${state.code}&playerId=${encodeURIComponent(playerId)}`); state = s; paint(); } catch (e) { clearInterval(poller); displayError(e.message); } }
async function act(action, data = {}) { const toast = $('.error-toast'); if (toast) toast.textContent = ''; try { const s = await api(`/api/${action}?code=${state.code}`, data); state = s; paint(); } catch (e) { const t = $('.error-toast'); if (t) t.textContent = e.message; else displayError(e.message); } }
$('#createBtn')?.addEventListener('click', createRoom); $('#joinBtn')?.addEventListener('click', joinRoom);
codeInput?.addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
$('#rulesBtn')?.addEventListener('click', () => $('#rulesDialog')?.showModal()); $('#closeRules')?.addEventListener('click', () => $('#rulesDialog')?.close());
async function copyCode() { try { await navigator.clipboard.writeText(state.code); const n = $('.copy-toast'); if (n) { n.textContent = 'COPIED'; setTimeout(() => n.textContent = '', 1100); } } catch {} }
function paint() {
  if (!state) return;
  const me = state.players.find(p => p.id === playerId), host = playerId === state.hostId;
  const phaseName = state.phase === 'lobby' ? 'DRESSING ROOM' : state.phase === 'auction' ? 'LIVE AUCTION' : state.phase === 'reveal' ? 'SCORECARD' : 'FULL TIME';
  let content = `<div class="room-head"><div class="room-title"><div class="status-kicker">FRANCHISE AUCTION / ${phaseName}</div><h2>${state.phase === 'lobby' ? 'THE DRESSING ROOM' : state.phase === 'finished' ? 'THE FINAL WHISTLE' : `MATCH ${String(state.round).padStart(2, '0')}`}</h2><div class="room-sub">${state.mode}-ROUND FORMAT · ₹100M STARTING PURSE</div></div><div class="room-code"><small>ROOM CODE</small><button class="code-box" title="Copy room code">${state.code}</button><span class="copy-toast"></span></div></div>`;
  if (state.phase === 'lobby') {
    content += `<div class="waiting-panel"><div class="eyebrow" style="justify-content:center">${state.mode === 3 ? 'QUICK MATCH · 3 ROUNDS' : 'SEASON · 5 ROUNDS'}</div><h2>Waiting for the<br><em>rest of the squad.</em></h2><p>Share the room code with 1–7 friends. They can join from a phone or laptop on the same Wi-Fi.</p><div class="room-code"><button class="code-box">${state.code}</button></div><div class="waiting-players">${state.players.length} / 8 CAPTAINS IN THE ROOM</div>${host ? `<button class="primary-btn center-btn" ${state.players.length < 2 ? 'disabled' : ''} data-action="start">START AUCTION <span>↗</span></button><div class="bottom-note">YOU NEED AT LEAST 2 PLAYERS TO START</div>` : '<div class="phase-box">THE HOST WILL START THE MATCH</div>'}<div class="error-toast"></div></div>`;
  } else if (state.phase === 'finished') {
    const ranked = [...state.players].sort((a, b) => b.score - a.score || b.balance - a.balance || b.wins - a.wins);
    const winners = state.winner?.map(id => state.players.find(p => p.id === id)?.name).filter(Boolean) || [];
    content += `<div class="finished-panel"><div class="winner-mark">🏆</div><div class="eyebrow" style="justify-content:center">${state.roundsTotal} ROUNDS · THE SEASON IS OVER</div><h2>THE TROPHY<br><em>GOES TO</em></h2><div class="winner-line">${winners.map(esc).join(' & ')}</div><div class="result-stamp">${ranked[0].score} POINTS</div><div class="finished-list">${ranked.map((p,i)=>`<div class="finished-person"><b>${i+1}. ${esc(p.name)}</b><span>${p.score} PTS · ₹${p.balance}M LEFT</span></div>`).join('')}</div><button class="primary-btn center-btn" onclick="localStorage.removeItem('boundarybid-room');location.reload()">BACK TO THE LOBBY</button></div>`;
  } else if (state.phase === 'reveal') {
    const myIntel = state.intel;
    content += `<div class="reveal-panel"><div class="eyebrow" style="justify-content:center">ROUND ${state.round} COMPLETE</div><h2>THE CARDS ARE<br><em>ON THE TABLE.</em></h2><p>Star Player +50 · Trap −20 · Doubled cards multiply their outcome. Bid spend reduces your purse, not your points.</p><div class="lot-grid">${state.cards.map(card=>`<article class="lot-card revealed"><div class="lot-tier">${card.tier}</div><div class="lot-letter">${card.id}</div><h3>${esc(card.label)}</h3><div class="lot-result ${card.type==='trap'?'bad':''}">${card.type==='trap'?'TRAP':'STAR PLAYER'} · ${card.points*card.multiplier>0?'+':''}${card.points*card.multiplier} PTS</div><div class="lot-foot">${card.soldTo?`BOUGHT BY ${esc(state.players.find(p=>p.id===card.soldTo)?.name||'CAPTAIN')} · ₹${card.price}M`:'UNSOLD'}</div></article>`).join('')}</div><div class="reveal-score">YOUR SCORE: ${me?.score ?? 0} PTS · ₹${me?.balance ?? 0}M LEFT${me?.baitBonus ? ` · +${me.baitBonus} BAIT BONUS` : ''}</div>${host ? `<button class="primary-btn center-btn" data-action="next">${state.round >= state.roundsTotal ? 'DECLARE THE WINNER' : 'NEXT ROUND'} <span>↗</span></button>` : '<div class="phase-box">WAITING FOR THE HOST TO CONTINUE</div>'}<div class="error-toast"></div></div>`;
  } else {
    const c = state.cards[state.current], bid = state.currentBid || null, intel = state.intel;
    const remaining = Math.max(0, Math.ceil((state.deadline - Date.now())/1000));
    const cards = state.cards.map((card,i) => `<article class="lot-card ${i === state.current ? 'current' : ''} ${card.revealed ? 'revealed' : ''} ${card.soldTo ? 'sold' : ''}"><div class="lot-tier">${card.tier}</div><div class="lot-letter">${card.id}</div><h3>${esc(card.label)}</h3>${card.revealed ? `<div class="lot-result ${card.type==='trap'?'bad':''}">${card.type==='trap'?'TRAP':'STAR PLAYER'} · ${card.points*card.multiplier>0?'+':''}${card.points*card.multiplier} PTS</div><div class="lot-foot">${card.soldTo ? `BOUGHT BY ${esc(state.players.find(p=>p.id===card.soldTo)?.name||'CAPTAIN')} · ₹${card.price}M` : 'UNSOLD'}</div>` : `<div class="lot-foot">${card.soldTo ? 'SOLD' : i < state.current ? 'LOT CLOSED' : 'VALUE UNKNOWN · BID TO WIN'}</div>`}</article>`).join('');
    const min = bid ? bid.amount + 1 : 1, myTurn = bid?.playerId === playerId;
    content += `<div class="room-layout"><section class="auction-area"><div class="auction-top"><span class="phase-label">${state.phase === 'auction' ? `LOTS · ${state.current+1} / 3` : 'ROUND SCORECARD'}</span><span class="round-pill">ROUND ${state.round} / ${state.roundsTotal}</span></div>${intel ? `<div class="intel-banner"><span class="intel-icon">◈</span><div><div class="intel-tag">YOUR PRIVATE SCOUT REPORT · ONLY YOU CAN SEE THIS</div><div class="intel-copy"><b>LOT ${intel.card}</b> &nbsp; ${esc(intel.text)}</div></div></div>` : ''}<div class="lot-grid">${cards}</div>${state.phase === 'auction' ? `<div class="bid-panel"><div class="timer-wrap"><div class="timer-num">${remaining}</div></div><div class="bid-info"><h3>${c ? `LOT ${c.id} · ${esc(c.label)}` : 'AUCTION LIVE'}</h3><div class="bid-caption">LATE BID RESET +3 SEC · 18 SEC MAX</div><div class="bid-current">${bid ? `₹${bid.amount}M <span style="font:9px var(--sans);color:#9ba796">BY ${esc(state.players.find(p=>p.id===bid.playerId)?.name||'CAPTAIN')}</span>` : 'OPENING BID · ₹1M'}</div></div><div class="bid-controls"><input class="bid-input" id="bidInput" type="number" min="${min}" max="${me?.balance||0}" step="1" value="${Math.min(Math.max(min, bid ? bid.amount + 1 : 1), me?.balance||1)}" ${myTurn?'disabled':''}><button class="bid-button" data-action="bid" ${myTurn||!me||me.balance<min?'disabled':''}>${myTurn?'YOU’RE HIGH BIDDER':'RAISE BID'}</button></div><div class="error-toast" style="width:100%"></div></div>` : `<div class="phase-box">ROUND COMPLETE · RESULTS BELOW</div>`}<div class="bottom-note">BIDS ARE PUBLIC · INTEL IS PRIVATE · PLAY THE ROOM</div></section><aside class="room-side"><div class="side-card"><div class="side-heading"><span>THE DUGOUT</span><span>${state.players.length} / 8</span></div>${[...state.players].sort((a,b)=>b.score-a.score||b.balance-a.balance).map((p,i)=>`<div class="player-row"><div class="player-rank">${String(i+1).padStart(2,'0')}</div><div class="player-name">${p.connected?'<i class="online-dot"></i>':''}${esc(p.name)} ${p.id===playerId?'<span class="you-tag">YOU</span>':''}</div><div class="player-money">₹${p.balance}M<span class="player-score">${p.score} PTS</span></div></div>`).join('')}</div><div class="side-card"><div class="side-heading"><span>AUCTION FEED</span><span>LIVE</span></div><div class="log-list">${[...state.log].reverse().map(x=>`<div class="log-item">› ${esc(x)}</div>`).join('')}</div></div></aside></div>`;
  }
  roomEl.innerHTML = content;
  roomEl.querySelectorAll('.code-box').forEach(b => b.onclick = copyCode);
  roomEl.querySelectorAll('[data-action]').forEach(b => b.onclick = () => { const action = b.dataset.action; if (action === 'bid') act('bid', { amount: Number($('#bidInput')?.value) }); else act(action); });
}
function esc(s) { return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const prior = localStorage.getItem(roomKey);
if (prior) api(`/api/state?code=${prior}&playerId=${encodeURIComponent(playerId)}`).then(s=>enterRoom(s)).catch(()=>localStorage.removeItem(roomKey));
window.addEventListener('beforeunload', () => { if (state) navigator.sendBeacon(`/api/leave?code=${state.code}`, new Blob([JSON.stringify({ playerId })], { type: 'application/json' })); });
