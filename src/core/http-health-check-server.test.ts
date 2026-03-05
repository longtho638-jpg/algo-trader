import { startHealthServer, stopHealthServer, setReady } from './http-health-check-server';

describe('http-health-check-server', () => {
  beforeAll(() => {
    process.env.HEALTH_PORT = '0';
  });

  afterEach(() => {
    stopHealthServer();
  });

  it('startHealthServer creates server without error', () => {
    expect(() => startHealthServer()).not.toThrow();
  });

  it('setReady toggles readiness state', () => {
    startHealthServer();
    expect(() => setReady(true)).not.toThrow();
    expect(() => setReady(false)).not.toThrow();
  });

  it('stopHealthServer can be called multiple times safely', () => {
    startHealthServer();
    stopHealthServer();
    expect(() => stopHealthServer()).not.toThrow();
  });

  it('stopHealthServer without start does not throw', () => {
    expect(() => stopHealthServer()).not.toThrow();
  });
});
