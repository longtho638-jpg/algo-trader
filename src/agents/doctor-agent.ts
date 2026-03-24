// Doctor Agent — health check: DB file, env vars, OpenClaw gateway reachability
import type { SpecialistAgent, AgentTask, AgentResult } from './agent-base.js';
import { successResult, failResult } from './agent-base.js';
import { logger } from '../core/logger.js';
import { existsSync } from 'fs';

const REQUIRED_ENV_VARS = [
  'DB_PATH',
  'OPENCLAW_BASE_URL',
  'DEEPSEEK_MODEL',
];

async function checkGateway(url: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
    return { ok: res.ok, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
  }
}

export class DoctorAgent implements SpecialistAgent {
  readonly name = 'doctor';
  readonly description = 'System health check: DB file, env vars, OpenClaw gateway reachability';
  readonly taskTypes = ['doctor' as const];

  canHandle(task: AgentTask): boolean {
    return task.type === 'doctor';
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const start = Date.now();
    try {
      logger.info('Doctor agent executing', 'DoctorAgent');

      // 1. File system check
      const dbPath = process.env.DB_PATH ?? 'data/algo-trade.db';
      const dbExists = existsSync(dbPath);

      // 2. Env vars check
      const envChecks = REQUIRED_ENV_VARS.map(key => ({
        key,
        set: Boolean(process.env[key]),
        value: process.env[key] ? '***set***' : undefined,
      }));
      const missingEnv = envChecks.filter(e => !e.set).map(e => e.key);

      // 3. OpenClaw gateway check
      const gatewayUrl = process.env.OPENCLAW_BASE_URL ?? 'http://localhost:8080';
      const gateway = await checkGateway(gatewayUrl);

      const allHealthy = dbExists && missingEnv.length === 0 && gateway.ok;

      return successResult(this.name, task.id, {
        healthy: allHealthy,
        checks: {
          database: { ok: dbExists, path: dbPath },
          envVars: { ok: missingEnv.length === 0, missing: missingEnv, checked: REQUIRED_ENV_VARS },
          gateway: { ok: gateway.ok, url: gatewayUrl, latencyMs: gateway.latencyMs, error: gateway.error },
        },
        summary: allHealthy
          ? 'All systems healthy.'
          : `Issues found: ${[
              !dbExists && 'DB file missing',
              missingEnv.length > 0 && `Missing env: ${missingEnv.join(', ')}`,
              !gateway.ok && 'OpenClaw gateway unreachable',
            ].filter(Boolean).join('; ')}`,
      }, Date.now() - start);
    } catch (err) {
      return failResult(this.name, task.id, err instanceof Error ? err.message : String(err), Date.now() - start);
    }
  }
}
