/**
 * Actions Registry
 * Built-in actions available to SOPs
 */

import { exec } from 'child_process';
import { promises as fs } from 'fs';
import { promisify } from 'util';

const execAsync = promisify(exec);

const actions = {
  /**
   * Execute shell command
   */
  'shell:run': async (params) => {
    const { command, timeout = 30000 } = params;
    const { stdout, stderr } = await execAsync(command, { timeout });
    return { stdout, stderr };
  },

  /**
   * Read file
   */
  'file:read': async (params) => {
    const { path, encoding = 'utf-8' } = params;
    const content = await fs.readFile(path, encoding);
    return { content, path };
  },

  /**
   * Write file
   */
  'file:write': async (params) => {
    const { path, content, encoding = 'utf-8' } = params;
    await fs.writeFile(path, content, encoding);
    return { success: true, path };
  },

  /**
   * HTTP request
   */
  'http:request': async (params) => {
    const { url, method = 'GET', headers = {}, body = null } = params;
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });
    const data = await response.json();
    return { status: response.status, data };
  },

  /**
   * LLM Chat (passthrough to orchestrator)
   */
  'llm:chat': async (params) => {
    const { prompt, model = 'llama3.2' } = params;
    // Handled by orchestrator
    return { prompt, model };
  },

  /**
   * Wait/sleep
   */
  'system:wait': async (params) => {
    const { ms = 1000 } = params;
    await new Promise(resolve => setTimeout(resolve, ms));
    return { waited: ms };
  }
};

export function executeAction(actionName, params) {
  const action = actions[actionName];
  if (!action) {
    throw new Error(`Unknown action: ${actionName}`);
  }
  return action(params);
}

export function registerAction(name, fn) {
  actions[name] = fn;
}

export default actions;
