const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const rooms = new Map();
const names = ['Death-Overs Finisher', 'Mystery Spinner', 'Hamstring Rupture Trap', 'Powerplay Captain', 'Yorker Specialist', 'Rain-Shortened Chase', 'Boundary Machine', 'Wrist-Spin Wizard', 'Dugout Whisperer', 'Super Over Specialist', 'Opening Blitz', 'Knuckleball Mystery', 'Last-Ball Heartbreak', 'Golden Arm All-Rounder', 'Pitch-Cracking Seamer'];
const json = (res, data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(data)); };
function cleanRoom(room, viewer) {
  return { code: room.code, hostId: room.hostId, mode: room.mode, phase: room.phase, round: room.round, roundsTotal: room.roundsTotal,
    players: room.players.map(p => ({ id: p.id, name: p.name, balance: p.balance, score: p.score, wins: p.wins, connected: room.online.has(p.id), baitBonus: p.baitBonus })),
    cards: room.cards.map(c => ({ id: c.id, label: c.label, tier: c.tier, revealed: c.revealed, type: c.revealed ? c.type : undefined, points: c.revealed ? c.points : undefined, multiplier: c.revealed ? c.multiplier : undefined, soldTo: c.soldTo, price: c.price })),
    current: room.current, currentBid: room.bid, deadline: room.deadline, timerCap: room.timerCap, intel: room.intel[viewer] || null, winner: room.winner,
    log: room.log.slice(-8), canStart: room.phase === 'lobby' && room.players.length >= 2 };
}
function addLog(room, message) { room.log.push(message); if (room.log.length > 30) room.log.shift(); }
function drawCards(round) {
  const pool = [...names].sort(() => Math.random() - .5);
  return ['A', 'B', 'C'].map((id, i) => {
    const trap = Math.random() < .34, multiplier = Math.random() < .2 ? 2 : 1;
    return { id, label: pool[(round * 3 + i) % pool.length], tier: ['ELITE PICK', 'AUCTION LOT', 'SCOUT REPORT'][i], type: trap ? 'trap' : 'star', points: trap ? -20 : 50, multiplier, soldTo: null, price: 0, revealed: false };
  });
}
function makeIntel(room) {
  room.intel = {};
  room.players.forEach((p, i) => {
    const c = room.cards[(i + room.round - 1) % 3];
    const clue = c.type === 'trap' ? `${c.id} is a trap. Walk away.` : c.multiplier === 2 ? `${c.id} is worth 2× points.` : `${c.id} is a safe Star Player: +50 points.`;
    room.intel[p.id] = { card: c.id, text: clue, kind: c.type, points: c.points, multiplier: c.multiplier };
  });
}
function startRound(room) {
  room.phase = 'auction'; room.cards = drawCards(room.round); room.current = 0; room.bid = null; room.timerCap = Date.now() + 18000; room.deadline = Date.now() + 15000; makeIntel(room);
  addLog(room, `ROUND ${room.round} · Intel is in. Auction is live!`); schedule(room);
}
function finishLot(room) {
  const c = room.cards[room.current];
  if (room.bid) {
    const buyer = room.players.find(p => p.id === room.bid.playerId);
    if (buyer) { buyer.balance -= room.bid.amount; c.soldTo = buyer.id; c.price = room.bid.amount; buyer.wins++; }
    const baiters = room.players.filter(p => p.id !== room.bid.playerId && room.intel[p.id]?.card === c.id && room.intel[p.id]?.kind === 'trap' && (room.bidsByCard[c.id] || []).some(b => b.playerId === p.id));
    baiters.forEach(p => { p.score += 10; p.baitBonus += 10; addLog(room, `${p.name} earned a +10 Bluff Bait Bonus!`); });
    addLog(room, `${buyer?.name || 'A bidder'} bought ${c.label} for ₹${room.bid.amount}M.`);
  } else addLog(room, `${c.label} went unsold.`);
  room.current++;
  if (room.current >= 3) { room.phase = 'reveal'; room.deadline = null; room.cards.forEach(card => { card.revealed = true; if (card.soldTo) { const p = room.players.find(x => x.id === card.soldTo); const value = card.points * card.multiplier; p.score += value; addLog(room, `${p.name}: ${value > 0 ? '+' : ''}${value} pts · ${card.label}`); } }); }
  else { room.bid = null; room.timerCap = Date.now() + 18000; room.deadline = Date.now() + 15000; schedule(room); }
}
function schedule(room) { clearTimeout(room.timer); if (room.phase === 'auction') room.timer = setTimeout(() => { if (Date.now() >= room.deadline) finishLot(room); else schedule(room); }, Math.max(50, room.deadline - Date.now() + 20)); }
async function readBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10000) throw new Error('Request body is too large.');
  }
  try { return JSON.parse(body || '{}'); }
  catch { throw new Error('Request body must be valid JSON.'); }
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }); return res.end(); }
  if (url.pathname.startsWith('/api/')) {
    try {
      if (req.method === 'POST' && url.pathname === '/api/create') {
        const body = await readBody(req), id = String(body.playerId || crypto.randomUUID()), name = String(body.name || 'Captain').trim().slice(0, 18) || 'Captain';
        const code = crypto.randomBytes(3).toString('hex').toUpperCase();
        const room = { code, hostId: id, mode: body.mode === 3 ? 3 : 5, roundsTotal: body.mode === 3 ? 3 : 5, phase: 'lobby', round: 0, players: [{ id, name, balance: 100, score: 0, wins: 0, baitBonus: 0 }], online: new Set([id]), cards: [], current: 0, bid: null, bidsByCard: {}, intel: {}, deadline: null, timerCap: null, log: ['Room created · ₹100M purse each'], winner: null };
        rooms.set(code, room); return json(res, cleanRoom(room, id));
      }
      if (req.method === 'POST' && url.pathname === '/api/join') {
        const body = await readBody(req), code = String(body.code || '').toUpperCase(), id = String(body.playerId || crypto.randomUUID()), room = rooms.get(code);
        if (!room) return json(res, { error: 'Room code not found. Check it and try again.' }, 404);
        if (room.phase !== 'lobby' && !room.players.some(p => p.id === id)) return json(res, { error: 'This match has already started.' }, 409);
        if (!room.players.some(p => p.id === id)) { if (room.players.length >= 8) return json(res, { error: 'Room is full (8 players).' }, 409); room.players.push({ id, name: String(body.name || 'Captain').trim().slice(0, 18) || 'Captain', balance: 100, score: 0, wins: 0, baitBonus: 0 }); addLog(room, `${body.name || 'A captain'} joined the room.`); }
        room.online.add(id); return json(res, cleanRoom(room, id));
      }
      const code = String(url.searchParams.get('code') || '').toUpperCase(), id = url.searchParams.get('playerId') || '', room = rooms.get(code);
      if (!room) return json(res, { error: 'Room not found.' }, 404);
      if (req.method === 'GET' && url.pathname === '/api/state') { if (id) room.online.add(id); return json(res, cleanRoom(room, id)); }
      if (req.method === 'POST') {
        const body = await readBody(req), player = room.players.find(p => p.id === body.playerId);
        if (!player) return json(res, { error: 'Player not in room.' }, 403);
        room.online.add(player.id);
        if (url.pathname === '/api/start') { if (player.id !== room.hostId || room.phase !== 'lobby' || room.players.length < 2) return json(res, { error: 'Need two players; only the host can start.' }, 409); room.round = 1; room.bidsByCard = {}; startRound(room); }
        else if (url.pathname === '/api/bid') {
          if (room.phase !== 'auction') return json(res, { error: 'Auction is not active.' }, 409);
          if (room.current >= 3) return json(res, { error: 'This lot has closed.' }, 409);
          if (Date.now() >= room.deadline) { finishLot(room); return json(res, { error: 'The bidding clock just expired.' }, 409); }
          const card = room.cards[room.current], amount = Number(body.amount), minimum = room.bid ? room.bid.amount + 1 : 1;
          if (!Number.isInteger(amount) || amount < minimum || amount > player.balance) return json(res, { error: `Bid must be at least ₹${minimum}M and within your remaining budget.` }, 409);
          const old = room.bid; room.bid = { playerId: player.id, amount }; (room.bidsByCard[card.id] ||= []).push({ playerId: player.id, amount });
          addLog(room, `${player.name} bid ₹${amount}M on ${card.id}.`);
          const left = room.deadline - Date.now(); if (left <= 3000 && room.deadline < room.timerCap) room.deadline = Math.min(room.timerCap, room.deadline + 3000);
        }
        else if (url.pathname === '/api/next') { if (player.id !== room.hostId || room.phase !== 'reveal') return json(res, { error: 'Only the host can continue after reveal.' }, 409); if (room.round >= room.roundsTotal) { room.phase = 'finished'; const ranked = [...room.players].sort((a, b) => b.score - a.score || b.balance - a.balance || b.wins - a.wins); const best = ranked[0]; room.winner = ranked.filter(p => p.score === best.score && p.balance === best.balance && p.wins === best.wins).map(p => p.id); addLog(room, `FULL TIME · ${ranked.filter(p => room.winner.includes(p.id)).map(p => p.name).join(' & ')} take the trophy!`); } else { room.round++; startRound(room); } }
        else if (url.pathname === '/api/leave') { room.online.delete(player.id); }
        else return json(res, { error: 'Unknown action.' }, 404);
        return json(res, cleanRoom(room, player.id));
      }
      return json(res, { error: 'Not found.' }, 404);
    } catch (e) { console.error('API request failed:', e.stack || e); return json(res, { error: e.message || 'Server error.' }, 400); }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end('Bad request'); }
  if (pathname === '/') pathname = '/index.html';
  const file = path.resolve(ROOT, `.${pathname}`);
  const relative = path.relative(ROOT, file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) { res.writeHead(403); return res.end('Forbidden'); }
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2' };
  fs.stat(file, (statErr, stat) => {
    if (statErr || !stat.isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': stat.size, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).on('error', () => { if (!res.headersSent) res.writeHead(500); res.end('Read error'); }).pipe(res);
  });
});
server.listen(PORT, '0.0.0.0', () => console.log(`Franchise Auction Bluff is live at http://localhost:${PORT} (LAN port ${PORT})`));
