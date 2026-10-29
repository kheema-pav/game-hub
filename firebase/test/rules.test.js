// Firestore security rules tests. Run with `npm test` (starts the emulator via firebase emulators:exec).
const { test, before, after, beforeEach } = require('node:test');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where } = require('firebase/firestore');
const { setLogLevel } = require('firebase/firestore');
setLogLevel('silent');
const fs = require('node:fs');
const path = require('node:path');

let env;
const RULES = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
const seat = (name, color) => ({ name: name || 'Ann', color: color || '#e4572e', joinedAt: 1 });
const db = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const roomDoc = (over) => Object.assign({
  game: 'codex', v: 1, host: 'host', seed: 12345, maxSeats: 3, status: 'open',
  seats: { host: seat('Host') }, createdAt: 111,
}, over || {});

async function seed(code, data, players) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, 'rooms', code), data);
    for (const [uid, p] of Object.entries(players || {})) await setDoc(doc(d, 'rooms', code, 'players', uid), p);
  });
}

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-game-hub', firestore: { rules: RULES } });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

/* ---------- create ---------- */
test('create: valid room by its host', async () => {
  await assertSucceeds(setDoc(doc(db('host'), 'rooms', '482619'), roomDoc()));
});
test('create: 4-seat room is fine, 2 is fine', async () => {
  await assertSucceeds(setDoc(doc(db('host'), 'rooms', '482619'), roomDoc({ maxSeats: 4 })));
  await assertSucceeds(setDoc(doc(db('host'), 'rooms', '482620'), roomDoc({ maxSeats: 2 })));
});
test('create: signed-out user is rejected', async () => {
  await assertFails(setDoc(doc(anon(), 'rooms', '482619'), roomDoc()));
});
test('create: bad codes are rejected (leading zero, 5 digits, 7 digits, letters)', async () => {
  for (const code of ['012345', '48261', '4826190', '48261a', ' 48261']) {
    await assertFails(setDoc(doc(db('host'), 'rooms', code), roomDoc()));
  }
});
test('create: host must be the caller', async () => {
  await assertFails(setDoc(doc(db('other'), 'rooms', '482619'), roomDoc()));
});
test('create: seats may only hold the caller', async () => {
  await assertFails(setDoc(doc(db('host'), 'rooms', '482619'), roomDoc({ seats: { host: seat(), x: seat() } })));
  await assertFails(setDoc(doc(db('host'), 'rooms', '482619'), roomDoc({ seats: { x: seat() } })));
});
test('create: maxSeats must be 2..4 and an int', async () => {
  for (const m of [1, 5, 0, '3', 2.5]) {
    await assertFails(setDoc(doc(db('host'), 'rooms', '482619'), roomDoc({ maxSeats: m })));
  }
});
test('create: must start open, seed must be int, no extra fields', async () => {
  await assertFails(setDoc(doc(db('host'), 'rooms', '482619'), roomDoc({ status: 'playing' })));
  await assertFails(setDoc(doc(db('host'), 'rooms', '482619'), roomDoc({ seed: 'x' })));
  await assertFails(setDoc(doc(db('host'), 'rooms', '482619'), roomDoc({ settings: {} })));
});
test('create: oversized seat name or colour is rejected', async () => {
  await assertFails(setDoc(doc(db('host'), 'rooms', '482619'), roomDoc({ seats: { host: seat('x'.repeat(17)) } })));
  await assertFails(setDoc(doc(db('host'), 'rooms', '482619'), roomDoc({ seats: { host: seat('Ann', 'c'.repeat(17)) } })));
  await assertSucceeds(setDoc(doc(db('host'), 'rooms', '482619'), roomDoc({ seats: { host: seat('x'.repeat(16)) } })));
});
test('create: seat with extra field is rejected', async () => {
  await assertFails(setDoc(doc(db('host'), 'rooms', '482619'), roomDoc({ seats: { host: Object.assign(seat(), { admin: true }) } })));
});
test('create: overwriting an existing room is rejected (it is an update then)', async () => {
  await seed('482619', roomDoc());
  await assertFails(setDoc(doc(db('host'), 'rooms', '482619'), roomDoc({ seed: 999 })));
});

/* ---------- join ---------- */
test('join: add only yourself to an open room', async () => {
  await seed('482619', roomDoc());
  await assertSucceeds(updateDoc(doc(db('p2'), 'rooms', '482619'), { 'seats.p2': seat('Bo') }));
});
test('join: cannot add someone else', async () => {
  await seed('482619', roomDoc());
  await assertFails(updateDoc(doc(db('p2'), 'rooms', '482619'), { 'seats.p3': seat('Bo') }));
});
test('join: cannot add two seats at once', async () => {
  await seed('482619', roomDoc());
  await assertFails(updateDoc(doc(db('p2'), 'rooms', '482619'), { 'seats.p2': seat('Bo'), 'seats.p3': seat('Cy') }));
});
test('join: cannot change an existing seat or host', async () => {
  await seed('482619', roomDoc());
  await assertFails(updateDoc(doc(db('p2'), 'rooms', '482619'), { 'seats.p2': seat('Bo'), 'seats.host': seat('Hacked') }));
  await assertFails(updateDoc(doc(db('p2'), 'rooms', '482619'), { 'seats.p2': seat('Bo'), host: 'p2' }));
  await assertFails(updateDoc(doc(db('p2'), 'rooms', '482619'), { 'seats.p2': seat('Bo'), maxSeats: 4 }));
  await assertFails(updateDoc(doc(db('p2'), 'rooms', '482619'), { 'seats.p2': seat('Bo'), seed: 1 }));
});
test('join: signed-out user is rejected', async () => {
  await seed('482619', roomDoc());
  await assertFails(updateDoc(doc(anon(), 'rooms', '482619'), { 'seats.p2': seat('Bo') }));
});
test('join: rejected when the room is full', async () => {
  await seed('482619', roomDoc({ maxSeats: 2, seats: { host: seat(), p2: seat('Bo') } }));
  await assertFails(updateDoc(doc(db('p3'), 'rooms', '482619'), { 'seats.p3': seat('Cy') }));
});
test('join: rejected when the room already started', async () => {
  await seed('482619', roomDoc({ status: 'playing', seats: { host: seat(), p2: seat('Bo') } }));
  await assertFails(updateDoc(doc(db('p3'), 'rooms', '482619'), { 'seats.p3': seat('Cy') }));
});
test('join: oversized name rejected', async () => {
  await seed('482619', roomDoc());
  await assertFails(updateDoc(doc(db('p2'), 'rooms', '482619'), { 'seats.p2': seat('x'.repeat(17)) }));
});
test('join the last seat: may also set status playing and startedAt', async () => {
  await seed('482619', roomDoc({ maxSeats: 2 }));
  await assertSucceeds(updateDoc(doc(db('p2'), 'rooms', '482619'), { 'seats.p2': seat('Bo'), status: 'playing', startedAt: 222 }));
});
test('join not the last seat: cannot also start the game', async () => {
  await seed('482619', roomDoc({ maxSeats: 3 }));
  await assertFails(updateDoc(doc(db('p2'), 'rooms', '482619'), { 'seats.p2': seat('Bo'), status: 'playing', startedAt: 222 }));
});
test('join the last seat: filling without starting is also allowed (client may start later)', async () => {
  await seed('482619', roomDoc({ maxSeats: 2 }));
  await assertSucceeds(updateDoc(doc(db('p2'), 'rooms', '482619'), { 'seats.p2': seat('Bo') }));
});
test('join: cannot sneak in other statuses', async () => {
  await seed('482619', roomDoc({ maxSeats: 2 }));
  await assertFails(updateDoc(doc(db('p2'), 'rooms', '482619'), { 'seats.p2': seat('Bo'), status: 'finished' }));
});

/* ---------- leave ---------- */
test('leave: a non-host removes their own seat while open', async () => {
  await seed('482619', roomDoc({ seats: { host: seat(), p2: seat('Bo') } }));
  const { deleteField } = require('firebase/firestore');
  await assertSucceeds(updateDoc(doc(db('p2'), 'rooms', '482619'), { 'seats.p2': deleteField() }));
});
test('leave: cannot remove someone else', async () => {
  await seed('482619', roomDoc({ seats: { host: seat(), p2: seat('Bo'), p3: seat('Cy') } }));
  const { deleteField } = require('firebase/firestore');
  await assertFails(updateDoc(doc(db('p2'), 'rooms', '482619'), { 'seats.p3': deleteField() }));
  await assertFails(updateDoc(doc(db('p2'), 'rooms', '482619'), { 'seats.host': deleteField() }));
});
test('leave: the host cannot leave', async () => {
  await seed('482619', roomDoc({ seats: { host: seat(), p2: seat('Bo') } }));
  const { deleteField } = require('firebase/firestore');
  await assertFails(updateDoc(doc(db('host'), 'rooms', '482619'), { 'seats.host': deleteField() }));
});
test('leave: not after the game started', async () => {
  await seed('482619', roomDoc({ status: 'playing', seats: { host: seat(), p2: seat('Bo') } }));
  const { deleteField } = require('firebase/firestore');
  await assertFails(updateDoc(doc(db('p2'), 'rooms', '482619'), { 'seats.p2': deleteField() }));
});
test('leave: cannot leave and change something else in the same write', async () => {
  await seed('482619', roomDoc({ seats: { host: seat(), p2: seat('Bo') } }));
  const { deleteField } = require('firebase/firestore');
  await assertFails(updateDoc(doc(db('p2'), 'rooms', '482619'), { 'seats.p2': deleteField(), maxSeats: 4 }));
});

/* ---------- start ---------- */
test('start: host with two seated may start', async () => {
  await seed('482619', roomDoc({ seats: { host: seat(), p2: seat('Bo') } }));
  await assertSucceeds(updateDoc(doc(db('host'), 'rooms', '482619'), { status: 'playing', startedAt: 222 }));
});
test('start: host alone (1 seated) may not start', async () => {
  await seed('482619', roomDoc());
  await assertFails(updateDoc(doc(db('host'), 'rooms', '482619'), { status: 'playing', startedAt: 222 }));
});
test('start: a non-host may not start', async () => {
  await seed('482619', roomDoc({ seats: { host: seat(), p2: seat('Bo') } }));
  await assertFails(updateDoc(doc(db('p2'), 'rooms', '482619'), { status: 'playing', startedAt: 222 }));
  await assertFails(updateDoc(doc(db('stranger'), 'rooms', '482619'), { status: 'playing', startedAt: 222 }));
});
test('start: host may not change other fields while starting', async () => {
  await seed('482619', roomDoc({ seats: { host: seat(), p2: seat('Bo') } }));
  await assertFails(updateDoc(doc(db('host'), 'rooms', '482619'), { status: 'playing', startedAt: 222, seed: 1 }));
  await assertFails(updateDoc(doc(db('host'), 'rooms', '482619'), { status: 'playing', startedAt: 222, 'seats.p3': seat('Cy') }));
});
test('start: cannot set an arbitrary status, and a started room cannot change again', async () => {
  await seed('482619', roomDoc({ seats: { host: seat(), p2: seat('Bo') } }));
  await assertFails(updateDoc(doc(db('host'), 'rooms', '482619'), { status: 'finished' }));
  await seed('482620', roomDoc({ status: 'playing', seats: { host: seat(), p2: seat('Bo') } }));
  await assertFails(updateDoc(doc(db('host'), 'rooms', '482620'), { status: 'open' }));
  await assertFails(updateDoc(doc(db('host'), 'rooms', '482620'), { startedAt: 5 }));
});

/* ---------- players ---------- */
const playingRoom = () => roomDoc({ status: 'playing', startedAt: 5, seats: { host: seat(), p2: seat('Bo') } });
const mv = (id) => ({ id, face: 'a', x: 0, y: 0, src: 'hand' });

test('players: a seated player creates their own doc once playing', async () => {
  await seed('482619', playingRoom());
  await assertSucceeds(setDoc(doc(db('p2'), 'rooms', '482619', 'players', 'p2'), { setup: { face: 'front', secret: 3 }, moves: [], turn: { phase: 'setup', next: null } }));
});
test('players: cannot write another player\'s doc', async () => {
  await seed('482619', playingRoom());
  await assertFails(setDoc(doc(db('p2'), 'rooms', '482619', 'players', 'host'), { moves: [] }));
  await seed('482620', playingRoom(), { host: { moves: [mv(1)] } });
  await assertFails(updateDoc(doc(db('p2'), 'rooms', '482620', 'players', 'host'), { moves: [mv(1), mv(2)] }));
});
test('players: a non-seated user cannot write', async () => {
  await seed('482619', playingRoom());
  await assertFails(setDoc(doc(db('stranger'), 'rooms', '482619', 'players', 'stranger'), { moves: [] }));
});
test('players: nothing can be written while the room is open', async () => {
  await seed('482619', roomDoc({ seats: { host: seat(), p2: seat('Bo') } }));
  await assertFails(setDoc(doc(db('p2'), 'rooms', '482619', 'players', 'p2'), { moves: [] }));
});
test('players: signed-out user cannot write', async () => {
  await seed('482619', playingRoom());
  await assertFails(setDoc(doc(anon(), 'rooms', '482619', 'players', 'p2'), { moves: [] }));
});
test('players: moves can be appended', async () => {
  await seed('482619', playingRoom(), { p2: { setup: { face: 'f' }, moves: [mv(1)] } });
  await assertSucceeds(setDoc(doc(db('p2'), 'rooms', '482619', 'players', 'p2'), { setup: { face: 'f' }, moves: [mv(1), mv(2)], turn: { phase: 'play' } }));
  await assertSucceeds(updateDoc(doc(db('p2'), 'rooms', '482619', 'players', 'p2'), { moves: [mv(1), mv(2), mv(3), mv(4)] }));
});
test('players: re-writing the same moves (e.g. only the turn summary changes) is fine', async () => {
  await seed('482619', playingRoom(), { p2: { moves: [mv(1), mv(2)] } });
  await assertSucceeds(setDoc(doc(db('p2'), 'rooms', '482619', 'players', 'p2'), { moves: [mv(1), mv(2)], turn: { phase: 'play', next: 'host' } }));
});
test('players: first write with no previous moves list works (empty and non-empty)', async () => {
  await seed('482619', playingRoom(), { p2: { turn: { phase: 'setup' } } });
  await assertSucceeds(setDoc(doc(db('p2'), 'rooms', '482619', 'players', 'p2'), { moves: [mv(1)] }));
});
test('players: rewriting an earlier move is rejected', async () => {
  await seed('482619', playingRoom(), { p2: { moves: [mv(1), mv(2)] } });
  await assertFails(setDoc(doc(db('p2'), 'rooms', '482619', 'players', 'p2'), { moves: [mv(9), mv(2), mv(3)] }));
  await assertFails(setDoc(doc(db('p2'), 'rooms', '482619', 'players', 'p2'), { moves: [mv(1), mv(9)] }));
});
test('players: truncating moves is rejected', async () => {
  await seed('482619', playingRoom(), { p2: { moves: [mv(1), mv(2)] } });
  await assertFails(setDoc(doc(db('p2'), 'rooms', '482619', 'players', 'p2'), { moves: [mv(1)] }));
  await assertFails(setDoc(doc(db('p2'), 'rooms', '482619', 'players', 'p2'), { moves: [] }));
});
test('players: removing the moves field is rejected when moves exist', async () => {
  await seed('482619', playingRoom(), { p2: { moves: [mv(1)] } });
  await assertFails(setDoc(doc(db('p2'), 'rooms', '482619', 'players', 'p2'), { turn: { phase: 'play' } }));
});
test('players: setup can be set once, then not changed', async () => {
  await seed('482619', playingRoom(), { p2: { moves: [] } });
  await assertSucceeds(setDoc(doc(db('p2'), 'rooms', '482619', 'players', 'p2'), { setup: { face: 'f', secret: 1 }, moves: [] }));
  await assertFails(setDoc(doc(db('p2'), 'rooms', '482619', 'players', 'p2'), { setup: { face: 'b', secret: 1 }, moves: [] }));
  await assertFails(setDoc(doc(db('p2'), 'rooms', '482619', 'players', 'p2'), { setup: { face: 'f', secret: 2 }, moves: [mv(1)] }));
  await assertFails(setDoc(doc(db('p2'), 'rooms', '482619', 'players', 'p2'), { moves: [mv(1)] })); // removes setup
  await assertSucceeds(setDoc(doc(db('p2'), 'rooms', '482619', 'players', 'p2'), { setup: { face: 'f', secret: 1 }, moves: [mv(1)] }));
});
test('players: unknown fields and a non-list moves are rejected', async () => {
  await seed('482619', playingRoom());
  await assertFails(setDoc(doc(db('p2'), 'rooms', '482619', 'players', 'p2'), { moves: [], score: 99 }));
  await assertFails(setDoc(doc(db('p2'), 'rooms', '482619', 'players', 'p2'), { moves: 'nope' }));
});
test('players: any signed-in user may read and list the players, signed-out may not', async () => {
  await seed('482619', playingRoom(), { p2: { moves: [mv(1)] }, host: { moves: [] } });
  await assertSucceeds(getDoc(doc(db('stranger'), 'rooms', '482619', 'players', 'p2')));
  await assertSucceeds(getDocs(collection(db('stranger'), 'rooms', '482619', 'players')));
  await assertFails(getDocs(collection(anon(), 'rooms', '482619', 'players')));
});
test('players: delete is never allowed', async () => {
  await seed('482619', playingRoom(), { p2: { moves: [mv(1)] } });
  await assertFails(deleteDoc(doc(db('p2'), 'rooms', '482619', 'players', 'p2')));
});

/* ---------- reads, lists, deletes ---------- */
test('rooms: get works when signed in, fails signed out', async () => {
  await seed('482619', roomDoc());
  await assertSucceeds(getDoc(doc(db('anyone'), 'rooms', '482619')));
  await assertFails(getDoc(doc(anon(), 'rooms', '482619')));
});
test('rooms: listing or querying rooms fails', async () => {
  await seed('482619', roomDoc());
  await assertFails(getDocs(collection(db('anyone'), 'rooms')));
  await assertFails(getDocs(query(collection(db('anyone'), 'rooms'), where('status', '==', 'open'))));
});
test('rooms: delete is never allowed (even the host)', async () => {
  await seed('482619', roomDoc());
  await assertFails(deleteDoc(doc(db('host'), 'rooms', '482619')));
});
test('profiles: owner writes, others cannot, lists fail, get works', async () => {
  await assertSucceeds(setDoc(doc(db('u1'), 'profiles', 'u1'), { name: 'Ann', color: '#e4572e', updatedAt: 1, stats: { codex: { played: 1, won: 0, best: 12 } } }));
  await assertFails(setDoc(doc(db('u2'), 'profiles', 'u1'), { name: 'Evil', color: '#000' }));
  await assertFails(setDoc(doc(anon(), 'profiles', 'u1'), { name: 'Evil', color: '#000' }));
  await assertSucceeds(getDoc(doc(db('u2'), 'profiles', 'u1')));
  await assertFails(getDocs(collection(db('u2'), 'profiles')));
  await assertFails(deleteDoc(doc(db('u1'), 'profiles', 'u1')));
});
test('profiles: oversized name or colour, wrong types and extra fields are rejected', async () => {
  await assertFails(setDoc(doc(db('u1'), 'profiles', 'u1'), { name: 'x'.repeat(17), color: '#e4572e' }));
  await assertSucceeds(setDoc(doc(db('u1'), 'profiles', 'u1'), { name: 'x'.repeat(16), color: '#e4572e' }));
  await assertFails(setDoc(doc(db('u1'), 'profiles', 'u1'), { name: 'Ann', color: 'c'.repeat(17) }));
  await assertFails(setDoc(doc(db('u1'), 'profiles', 'u1'), { name: 5, color: '#e4572e' }));
  await assertFails(setDoc(doc(db('u1'), 'profiles', 'u1'), { name: 'Ann', color: '#e4572e', admin: true }));
});
test('anything outside the known paths is denied', async () => {
  await assertFails(setDoc(doc(db('u1'), 'other', 'x'), { a: 1 }));
  await assertFails(getDoc(doc(db('u1'), 'other', 'x')));
});
