
export class WorldRoom {
  constructor(state, env) {
    this.state = state;
    this.clients = new Map();
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('WebSocket required', { status: 426 });
    }

    const u = new URL(request.url);
    const name = (u.searchParams.get('name') || 'Guest').slice(0, 22);
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    server.accept();

    const id = crypto.randomUUID().slice(0, 12);
    const players = [...this.clients].map(([id, c]) => ({
      id, name: c.name, x: c.x, z: c.z, rot: c.rot,
      ride: c.ride || '', seat: c.seat || 0,
      gesture: c.gesture || '', y: c.y || 0,
      roof: !!c.roof, climbing: !!c.climbing,
      bouncing: !!c.bouncing, look: c.look || null,
      picnic: !!c.picnic, swim: c.swim || '',
      swimMoving: !!c.swimMoving,
      boat: c.boat ?? -1, boatSeat: c.boatSeat ?? -1,
      fishing: !!c.fishing
    }));

    const item = {
      ws: server, name, x: 0, z: 13, rot: 0,
      ride: '', seat: 0, gesture: '', y: 0,
      roof: false, climbing: false, bouncing: false,
      look: null, picnic: false, swim: '',
      swimMoving: false, boat: -1, boatSeat: -1,
      fishing: false
    };

    this.clients.set(id, item);
    server.send(JSON.stringify({
      type: 'welcome', id,
      count: this.clients.size, players
    }));
    this.broadcast({
      type: 'pos', id, name, x: 0, z: 13, rot: 0
    }, id);

    server.addEventListener('message', async e => {
      try {
        if (typeof e.data !== 'string' || e.data.length > 1024) return;
        const d = JSON.parse(e.data);

        if (d.type === 'pos') {
          item.x = Math.max(-69, Math.min(69, Number(d.x) || 0));
          item.z = Math.max(-89, Math.min(75, Number(d.z) || 0));
          item.rot = Number(d.rot) || 0;
          item.y = Math.max(-1, Math.min(13, Number(d.y) || 0));
          item.roof = !!d.roof;
          item.climbing = !!d.climbing;
          item.bouncing = !!d.bouncing;
          item.picnic = !!d.picnic;
          item.swim = ['freestyle', 'backstroke'].includes(d.swim)
            ? d.swim : '';
          item.swimMoving = !!d.swimMoving;
          item.boat = Number.isInteger(d.boat) &&
            d.boat >= 0 && d.boat < 2 ? d.boat : -1;
          item.boatSeat = item.boat < 0
            ? -1 : (d.boatSeat === 1 ? 1 : 0);
          item.fishing = !!d.fishing;
          item.look = d.look && typeof d.look === 'object'
            ? d.look : null;
          item.ride = ['viking', 'carousel', 'ferris', 'teacup']
            .includes(d.ride) ? d.ride : '';
          item.seat = Math.max(0, Math.min(7, Number(d.seat) || 0));
          item.gesture = ['wave', 'highfive', 'dance', 'clap', 'heart']
            .includes(d.gesture) ? d.gesture : '';

          this.broadcast({
            type: 'pos', id, name,
            x: item.x, z: item.z, rot: item.rot,
            y: item.y, ride: item.ride, seat: item.seat,
            gesture: item.gesture, roof: item.roof,
            climbing: item.climbing, bouncing: item.bouncing,
            picnic: item.picnic, look: item.look,
            swim: item.swim, swimMoving: item.swimMoving,
            boat: item.boat, boatSeat: item.boatSeat,
            fishing: item.fishing
          }, id);

        } else if (d.type === 'action') {
          if ([
            'bounce', 'climb', 'descend', 'wish',
            'fishStart', 'fishStop', 'boatBoard', 'boatLeave'
          ].includes(d.action)) {
            this.broadcast({
              type: 'action', id, name, action: d.action,
              x: Math.max(-69, Math.min(69, Number(d.x) || 0)),
              y: Math.max(-1, Math.min(13, Number(d.y) || 0)),
              z: Math.max(-89, Math.min(75, Number(d.z) || 0)),
              boat: d.boat, seat: d.seat
            }, id);
          }

        } else if (d.type === 'feed') {
          const pellets = Array.isArray(d.pellets)
            ? d.pellets.slice(0, 10).filter(p =>
                Array.isArray(p) &&
                p.length === 2 &&
                p.every(n =>
                  typeof n === 'number' &&
                  Number.isFinite(n) &&
                  Math.abs(n) < 200
                )
              )
            : [];

          if (pellets.length >= 6) {
            this.broadcast({
              type: 'feed', id, name,
              x: Number(d.x) || 0,
              y: Number(d.y) || 0,
              z: Number(d.z) || 0,
              pellets
            }, id);
          }

        } else if (d.type === 'secretSave') {
          const code = String(d.code || '').toUpperCase();
          const body = String(d.body || '');
          const password = String(d.password || '');

          if (
            !/^[A-Z0-9_-]{3,20}$/.test(code) ||
            !body || body.length > 600 ||
            password.length < 4 || password.length > 60
          ) {
            server.send(JSON.stringify({
              type: 'secretResult', ok: false,
              error: 'Invalid letter'
            }));
            return;
          }

          const key = 'letter:' + code;
          const existing = await this.state.storage.get(key);

          if (existing) {
            server.send(JSON.stringify({
              type: 'secretResult', ok: false,
              error: 'Letter code already exists'
            }));
            return;
          }

          const salt = crypto.randomUUID();
          const hash = Array.from(
            new Uint8Array(
              await crypto.subtle.digest(
                'SHA-256',
                new TextEncoder().encode(salt + password)
              )
            ),
            b => b.toString(16).padStart(2, '0')
          ).join('');

          await this.state.storage.put(key, { body, salt, hash });
          server.send(JSON.stringify({
            type: 'secretResult', ok: true
          }));

        } else if (d.type === 'secretRead') {
          const code = String(d.code || '').toUpperCase();
          const password = String(d.password || '');
          const letter = await this.state.storage.get('letter:' + code);

          if (!letter) {
            server.send(JSON.stringify({
              type: 'secretResult', ok: false,
              error: 'Letter not found'
            }));
            return;
          }

          const hash = Array.from(
            new Uint8Array(
              await crypto.subtle.digest(
                'SHA-256',
                new TextEncoder().encode(letter.salt + password)
              )
            ),
            b => b.toString(16).padStart(2, '0')
          ).join('');

          server.send(JSON.stringify(
            hash === letter.hash
              ? { type: 'secretResult', ok: true, body: letter.body }
              : {
                  type: 'secretResult', ok: false,
                  error: 'Incorrect password'
                }
          ));

        } else if (d.type === 'chat') {
          this.broadcast({
            type: 'chat', id, name,
            text: String(d.text || '').slice(0, 120)
          });
        }
      } catch (err) {}
    });

    const bye = () => {
      if (this.clients.delete(id)) {
        this.broadcast({ type: 'bye', id });
      }
    };

    server.addEventListener('close', bye);
    server.addEventListener('error', bye);

    return new Response(null, {
      status: 101, webSocket: client
    });
  }

  broadcast(msg, except) {
    const payload = JSON.stringify(msg);
    for (const [id, c] of this.clients) {
      if (id !== except) {
        try {
          c.ws.send(payload);
        } catch (e) {
          this.clients.delete(id);
        }
      }
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({
        ok: true, service: 'Sunset Bay multiplayer'
      });
    }

    if (url.pathname !== '/ws') {
      return new Response(
        'Sunset Bay multiplayer backend', { status: 200 }
      );
    }

    const mode = url.searchParams.get('mode');
    const room = url.searchParams.get('room') || '';

    if (!['public', 'private'].includes(mode)) {
      return new Response('Invalid mode', { status: 400 });
    }

    if (mode === 'private' && !/^[A-Z0-9]{6}$/.test(room)) {
      return new Response('Invalid room code', { status: 400 });
    }

    const key = mode === 'public' ? 'public-v1' : 'private-' + room;
    const id = env.WORLDS.idFromName(key);

    return env.WORLDS.get(id).fetch(request);
  }
};
