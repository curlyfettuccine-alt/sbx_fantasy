# SBX Fantasy — Fullstack Starter (Node + React)

This repository is a **ready-to-run starter** for a Snowboard Cross (SBX) fantasy game. It's designed to be **easy to edit**: change athletes, countries (teams), and the points rules. It includes:

- Node + Express backend (SQLite) with JWT auth & admin role
- Simple configurable points engine (server-side)
- React frontend (single-file friendly structure) using local API endpoints
- Admin panel to enter race results (scores), which triggers fantasy points calculation

---

## Quick project layout (files included in this document)

- `backend/package.json`
- `backend/server.js`
- `backend/db.js` (sqlite helper)
- `backend/auth.js` (middleware)
- `backend/pointsEngine.js` (where you code points rules)
- `backend/routes/*.js` (routes inlined in server.js for brevity)

- `frontend/package.json`
- `frontend/src/App.jsx`
- `frontend/src/api.js`
- `frontend/src/components/{Login,Register,Dashboard,Admin}.jsx`
- `README.md` (this file)

---

## Setup & run (locally)

1. Create two folders: `backend` and `frontend`.
2. Copy the files below into those folders (filenames shown above).
3. Backend:
   - `cd backend`
   - `npm install`
   - `node server.js` (or `nodemon server.js` if you have nodemon)
4. Frontend:
   - `cd frontend`
   - `npm install`
   - `npm run dev` (or `npm start` depending on your template)

The backend listens on port `4000` by default. The frontend expects it there.

---

### Important: Default admin account

The server bootstraps a default admin user:

- **email:** admin@sbx.local
- **password:** adminpass

Change these in the server code after first run (or register a new admin and delete default user).

---

## Files (copy each block into the appropriate file)

---

### backend/package.json

```json
{
  "name": "sbx-fantasy-backend",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "bcrypt": "^5.1.0",
    "body-parser": "^1.20.2",
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "jsonwebtoken": "^9.0.0",
    "sqlite3": "^5.1.6"
  }
}
```

---

### backend/db.js

```js
const sqlite3 = require('sqlite3').verbose();
const DBSOURCE = 'db.sqlite';

const db = new sqlite3.Database(DBSOURCE, (err) => {
  if (err) {
    console.error(err.message);
    throw err;
  }
  console.log('Connected to SQLite database.');
});

module.exports = db;
```

---

### backend/pointsEngine.js

```js
// pointsEngine.js
// Central place to configure how fantasy points are assigned from race results.
// The server will call calculatePointsForResult(resultRow) after you insert a result.

// Example rules (easy to edit):
// - placePoints: mapping from finishing position -> points
// - bonus for top qualifiers, time gaps, etc. (you can implement custom logic here)

const placePoints = {
  1: 100,
  2: 80,
  3: 65,
  4: 55,
  5: 45,
  6: 40,
  7: 36,
  8: 32
};

function calculatePointsForResult(result) {
  // result: { athleteId, place, time, raceId }
  let pts = 0;
  if (placePoints[result.place]) pts += placePoints[result.place];

  // Example: small bonus for finishing within 0.5s of winner (you'd need timing data)
  // if (result.time && result.timeGap <= 0.5) pts += 5;

  // Extend this function to include: country bonuses, stage multipliers, head-to-head wins, etc.

  return pts;
}

module.exports = { calculatePointsForResult };
```

---

### backend/auth.js

```js
const jwt = require('jsonwebtoken');
const SECRET = 'replace-with-strong-secret';

function generateToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'Missing token' });
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Missing token' });
  try {
    const user = jwt.verify(token, SECRET);
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
}

module.exports = { generateToken, authenticateToken };
```

---

### backend/server.js

```js
// Simple Express server with in-memory sqlite tables and basic auth
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');
const db = require('./db');
const { generateToken } = require('./auth');
const { calculatePointsForResult } = require('./pointsEngine');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Bootstrap DB tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT,
    role TEXT DEFAULT 'user'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS athletes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    country TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS races (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    date TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    raceId INTEGER,
    athleteId INTEGER,
    place INTEGER,
    time REAL,
    points INTEGER DEFAULT 0,
    FOREIGN KEY(raceId) REFERENCES races(id),
    FOREIGN KEY(athleteId) REFERENCES athletes(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS fantasy_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    athleteId INTEGER,
    raceId INTEGER,
    points INTEGER,
    FOREIGN KEY(athleteId) REFERENCES athletes(id),
    FOREIGN KEY(raceId) REFERENCES races(id)
  )`);

  // Insert default admin if not exists
  const adminEmail = 'admin@sbx.local';
  db.get('SELECT * FROM users WHERE email = ?', [adminEmail], (err, row) => {
    if (!row) {
      const pw = 'adminpass';
      bcrypt.hash(pw, 10).then((hash) => {
        db.run('INSERT INTO users (email, password, name, role) VALUES (?,?,?,?)', [adminEmail, hash, 'Administrator', 'admin']);
        console.log('Bootstrapped default admin ->', adminEmail);
      });
    }
  });
});

// AUTH: register
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email + password required' });
  const hash = await bcrypt.hash(password, 10);
  db.run('INSERT INTO users (email,password,name) VALUES (?,?,?)', [email, hash, name || ''], function(err) {
    if (err) return res.status(400).json({ message: err.message });
    const token = generateToken({ id: this.lastID, email, role: 'user' });
    res.json({ token });
  });
});

// AUTH: login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, row) => {
    if (err || !row) return res.status(401).json({ message: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, row.password);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
    const token = generateToken({ id: row.id, email: row.email, role: row.role });
    res.json({ token, role: row.role, name: row.name });
  });
});

// --- Simple middleware to check token and role (inline to avoid many files) ---
const jwt = require('jsonwebtoken');
const SECRET = 'replace-with-strong-secret';
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ message: 'Missing auth' });
  const token = header.split(' ')[1];
  try {
    const user = jwt.verify(token, SECRET);
    req.user = user;
    next();
  } catch (e) {
    res.status(401).json({ message: 'Invalid token' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ message: 'Admin required' });
  next();
}

// ATHLETES: list, add (admin)
app.get('/api/athletes', (req, res) => {
  db.all('SELECT * FROM athletes', [], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json(rows);
  });
});

app.post('/api/athletes', authMiddleware, requireAdmin, (req, res) => {
  const { name, country } = req.body;
  db.run('INSERT INTO athletes (name,country) VALUES (?,?)', [name, country], function(err) {
    if (err) return res.status(400).json({ message: err.message });
    res.json({ id: this.lastID, name, country });
  });
});

// RACES: create/list
app.post('/api/races', authMiddleware, requireAdmin, (req, res) => {
  const { name, date } = req.body;
  db.run('INSERT INTO races (name,date) VALUES (?,?)', [name, date], function(err) {
    if (err) return res.status(400).json({ message: err.message });
    res.json({ id: this.lastID, name, date });
  });
});

app.get('/api/races', (req, res) => {
  db.all('SELECT * FROM races ORDER BY date DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json(rows);
  });
});

// RESULTS: admin enters results; server calculates points
app.post('/api/results', authMiddleware, requireAdmin, (req, res) => {
  // payload: { raceId, results: [ { athleteId, place, time } ] }
  const { raceId, results } = req.body;
  if (!raceId || !Array.isArray(results)) return res.status(400).json({ message: 'raceId + results[] required' });

  const stmt = db.prepare('INSERT INTO results (raceId, athleteId, place, time, points) VALUES (?,?,?,?,?)');
  db.serialize(() => {
    results.forEach(r => {
      const pts = calculatePointsForResult(r);
      stmt.run([raceId, r.athleteId, r.place, r.time || null, pts]);
      db.run('INSERT INTO fantasy_scores (athleteId, raceId, points) VALUES (?,?,?)', [r.athleteId, raceId, pts]);
    });
    stmt.finalize();
    res.json({ message: 'Results stored and points calculated' });
  });
});

// STANDINGS
app.get('/api/standings', (req, res) => {
  // total points per athlete
  const q = `SELECT a.id as athleteId, a.name, a.country, IFNULL(SUM(fs.points),0) as totalPoints
             FROM athletes a
             LEFT JOIN fantasy_scores fs ON fs.athleteId = a.id
             GROUP BY a.id
             ORDER BY totalPoints DESC`;
  db.all(q, [], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json(rows);
  });
});

// PORT
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log('Server listening on', PORT));
```

---

### frontend/package.json

```json
{
  "name": "sbx-fantasy-frontend",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "axios": "^1.4.0"
  },
  "scripts": {
    "start": "vite"
  }
}
```

---

### frontend/src/api.js

```js
import axios from 'axios';
const API = axios.create({ baseURL: 'http://localhost:4000/api' });

export function setAuth(token) {
  API.defaults.headers.common['Authorization'] = 'Bearer ' + token;
}

export default API;
```

---

### frontend/src/App.jsx

```jsx
import React, { useState, useEffect } from 'react';
import API, { setAuth } from './api';

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  async function submit(e) {
    e.preventDefault();
    const res = await API.post('/auth/login', { email, password: pw });
    const { token, role, name } = res.data;
    localStorage.setItem('token', token);
    localStorage.setItem('role', role);
    setAuth(token);
    onLogin({ role, name });
  }
  return (
    <form onSubmit={submit} className="p-4">
      <h2 className="text-xl mb-2">Login</h2>
      <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="email" className="block mb-2 p-2" />
      <input value={pw} onChange={e=>setPw(e.target.value)} placeholder="password" type="password" className="block mb-2 p-2" />
      <button className="p-2 rounded bg-blue-600 text-white">Login</button>
    </form>
  )
}

function AdminPanel() {
  const [athletes, setAthletes] = useState([]);
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');

  useEffect(()=>{ API.get('/athletes').then(r=>setAthletes(r.data)); }, []);

  async function addAthlete(e){
    e.preventDefault();
    await API.post('/athletes', { name, country });
    const r = await API.get('/athletes');
    setAthletes(r.data);
    setName(''); setCountry('');
  }

  // Quick results submission UI
  const [raceName, setRaceName] = useState('');
  const [raceId, setRaceId] = useState(null);
  const [results, setResults] = useState([]);

  async function createRace(){
    const r = await API.post('/races', { name: raceName, date: new Date().toISOString() });
    setRaceId(r.data.id);
  }

  function addResultRow(){ setResults([...results, { athleteId: '', place: '', time: '' }]); }
  function updateResult(idx, field, val){ const copy=[...results]; copy[idx][field]=val; setResults(copy); }

  async function submitResults(){
    // convert athleteId/place types
    const payload = { raceId, results: results.map(r=>({ athleteId: Number(r.athleteId), place: Number(r.place), time: r.time?Number(r.time):null })) };
    await API.post('/results', payload);
    alert('Results submitted.');
  }

  return (
    <div className="p-4">
      <h2 className="text-xl">Admin Panel</h2>
      <section className="mt-3">
        <h3 className="font-semibold">Add Athlete</h3>
        <form onSubmit={addAthlete} className="flex gap-2 mt-2">
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Athlete name" />
          <input value={country} onChange={e=>setCountry(e.target.value)} placeholder="Country/team" />
          <button className="p-2 bg-green-600 text-white">Add</button>
        </form>
        <ul className="mt-2">
          {athletes.map(a => <li key={a.id}>{a.name} — {a.country}</li>)}
        </ul>
      </section>

      <section className="mt-4">
        <h3 className="font-semibold">Enter Race & Results</h3>
        <div className="mt-2">
          <input value={raceName} onChange={e=>setRaceName(e.target.value)} placeholder="Race name" />
          <button onClick={createRace} className="ml-2 p-2 bg-gray-600 text-white">Create Race</button>
          {raceId && <div className="mt-2">Race created — ID: {raceId}</div>}
        </div>
        <div className="mt-3">
          <button onClick={addResultRow} className="p-2 bg-blue-600 text-white">Add result row</button>
          {results.map((r, i)=> (
            <div key={i} className="flex gap-2 mt-2">
              <select value={r.athleteId} onChange={e=>updateResult(i,'athleteId',e.target.value)}>
                <option value="">-- athlete --</option>
                {athletes.map(a=> <option key={a.id} value={a.id}>{a.name} ({a.country})</option>)}
              </select>
              <input placeholder="place" value={r.place} onChange={e=>updateResult(i,'place',e.target.value)} />
              <input placeholder="time (sec)" value={r.time} onChange={e=>updateResult(i,'time',e.target.value)} />
            </div>
          ))}
          <div className="mt-3">
            <button onClick={submitResults} className="p-2 bg-green-700 text-white">Submit Results</button>
          </div>
        </div>
      </section>
    </div>
  )
}

function Standings(){
  const [standings, setStandings]=useState([]);
  useEffect(()=>{ API.get('/standings').then(r=>setStandings(r.data)); }, []);
  return (
    <div className="p-4">
      <h2 className="text-xl">Standings</h2>
      <ol className="mt-2">
        {standings.map(s=> <li key={s.athleteId}>{s.name} ({s.country}) — {s.totalPoints} pts</li>)}
      </ol>
    </div>
  )
}

export default function App(){
  const [user, setUser] = useState(null);
  useEffect(()=>{
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    if (token) { setAuth(token); setUser({ role }); }
  }, []);

  if (!user) return <div className="p-6"><Login onLogin={(u)=>setUser(u)} /></div>;

  return (
    <div className="p-6">
      <header className="flex justify-between items-center">
        <h1 className="text-2xl">SBX Fantasy</h1>
        <div>
          <button onClick={()=>{ localStorage.clear(); window.location.reload(); }} className="p-2 bg-red-600 text-white">Logout</button>
        </div>
      </header>

      <main className="mt-6 grid grid-cols-2 gap-6">
        <div className="card bg-white p-4 shadow">
          <Standings />
        </div>
        <div className="card bg-white p-4 shadow">
          {user.role === 'admin' ? <AdminPanel /> : <div className="p-4">User dashboard coming soon.</div>}
        </div>
      </main>
    </div>
  )
}
```

---

## Notes & How to edit

- **Add athletes/countries:** Admin -> Add Athlete form. You can pre-populate athletes by adding rows directly in the `athletes` table (use sqlite browser) or via the API.
- **Points rules:** Edit `backend/pointsEngine.js`. That single file is where you configure place->points, bonuses, multipliers.
- **Admin control:** Any user with `role = 'admin'` can add athletes and post results. Register a user and update their role in the `users` table if you want to promote them.
- **Persistence:** Uses SQLite (`db.sqlite`) in backend folder. Simple and portable.
- **Security:** This is a starter demo. Change `SECRET` in `auth.js` and `server.js`, use HTTPS and environment variables in production.

---

## Next steps (suggested)

- Add proper team creation (users form fantasy teams selecting athletes)
- Add transfers, budgets, and scoring windows
- Add validation (duplicate results, check athlete exists)
- Make frontend prettier (Tailwind + components)
- Add pagination & search for athletes

---

If you'd like, I can also:
- Provide a Dockerfile and docker-compose for easy deploy
- Convert the frontend into a full Create React App / Vite project with routing
- Add user fantasy-team creation and scoring breakdown UI




