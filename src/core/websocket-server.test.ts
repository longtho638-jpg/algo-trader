import WebSocket from 'ws';
import {
  startWsServer,
  stopWsServer,
  broadcastToChannel,
} from './websocket-server';

let port = 0;

function connect(): WebSocket {
  return new WebSocket(`ws://localhost:${port}`);
}

function waitForMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    ws.once('message', (data) => {
      try { resolve(JSON.parse(data.toString())); }
      catch (e) { reject(e); }
    });
    ws.once('error', reject);
  });
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) { resolve(); return; }
    ws.once('open', resolve);
    ws.once('error', reject);
  });
}

/** Connect and consume the initial 'connected' welcome message. */
async function connectAndWelcome(): Promise<WebSocket> {
  const ws = connect();
  // Register message listener before open so we don't miss early messages
  const welcome = waitForMessage(ws);
  await waitForOpen(ws);
  await welcome;
  return ws;
}

describe('websocket-server', () => {
  beforeEach(async () => {
    process.env.WS_AUTH_TOKEN = '';
    process.env.WS_MAX_CONNECTIONS = '3';
    port = await startWsServer(0);
  });

  afterEach(async () => {
    await stopWsServer();
  });

  it('starts and stops cleanly', async () => {
    const ws = connect();
    await waitForOpen(ws);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('sends welcome message on connect', async () => {
    const ws = connect();
    const msgP = waitForMessage(ws); // register before open to avoid race
    await waitForOpen(ws);
    const msg = await msgP as { type: string; channels: string[] };
    expect(msg.type).toBe('connected');
    expect(msg.channels).toContain('tick');
    ws.close();
  });

  it('subscribe and unsubscribe', async () => {
    const ws = await connectAndWelcome();
    ws.send(JSON.stringify({ action: 'subscribe', channel: 'tick' }));
    const sub = await waitForMessage(ws) as { type: string; channel: string };
    expect(sub.type).toBe('subscribed');
    expect(sub.channel).toBe('tick');

    ws.send(JSON.stringify({ action: 'unsubscribe', channel: 'tick' }));
    const unsub = await waitForMessage(ws) as { type: string; channel: string };
    expect(unsub.type).toBe('unsubscribed');
    ws.close();
  });

  it('broadcastToChannel sends to subscribed clients only', async () => {
    const subbed = await connectAndWelcome();
    const unsubbed = await connectAndWelcome();

    subbed.send(JSON.stringify({ action: 'subscribe', channel: 'signal' }));
    await waitForMessage(subbed);

    const received: unknown[] = [];
    subbed.on('message', (d) => received.push(JSON.parse(d.toString())));
    const notReceived: unknown[] = [];
    unsubbed.on('message', (d) => notReceived.push(JSON.parse(d.toString())));

    broadcastToChannel('signal', { price: 100 });
    await new Promise((r) => setTimeout(r, 50));

    expect(received.length).toBe(1);
    expect(notReceived.length).toBe(0);
    subbed.close();
    unsubbed.close();
  });

  it('rejects invalid messages', async () => {
    const ws = await connectAndWelcome();
    ws.send(JSON.stringify({ action: 'fly', channel: 'tick' }));
    const err = await waitForMessage(ws) as { error: string };
    expect(err.error).toBe('invalid_message');
    ws.close();
  });

  it('rejects invalid JSON', async () => {
    const ws = await connectAndWelcome();
    ws.send('not-json');
    const err = await waitForMessage(ws) as { error: string };
    expect(err.error).toBe('invalid_json');
    ws.close();
  });

  it('enforces max connections', async () => {
    const clients = await Promise.all([
      connectAndWelcome(),
      connectAndWelcome(),
      connectAndWelcome(),
    ]);
    const ws4 = connect();
    const closed = await new Promise<boolean>((resolve) => {
      ws4.once('close', () => resolve(true));
      ws4.once('error', () => resolve(true));
      setTimeout(() => resolve(false), 500);
    });
    expect(closed).toBe(true);
    clients.forEach((c) => c.close());
  });
});
