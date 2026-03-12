/**
 * AGI SOPs Orchestrator
 * Parses and executes SOP workflows using local LLM
 */

import { Ollama } from 'ollama';
import { parseSOP } from './sop-parser.js';
import { executeAction } from './actions/registry.js';

export class Orchestrator {
  constructor(options = {}) {
    this.model = options.model || 'llama3.2';
    this.client = new Ollama({ host: options.host || 'http://127.0.0.1:11434' });
    this.sops = new Map();
    this.executionHistory = [];
  }

  /**
   * Load SOP from YAML/JSON definition
   */
  async loadSOP(name, definition) {
    const parsed = await parseSOP(definition);
    this.sops.set(name, parsed);
    console.log(`[Orchestrator] Loaded SOP: ${name}`);
    return parsed;
  }

  /**
   * Execute SOP with given context
   */
  async execute(name, context = {}) {
    const sop = this.sops.get(name);
    if (!sop) {
      throw new Error(`SOP not found: ${name}`);
    }

    console.log(`[Orchestrator] Executing SOP: ${name}`);

    const result = {
      sopName: name,
      startTime: Date.now(),
      steps: [],
      status: 'running'
    };

    try {
      for (const step of sop.steps) {
        const stepResult = await this.executeStep(step, context);
        result.steps.push(stepResult);

        if (stepResult.status === 'failed' && step.onError === 'abort') {
          result.status = 'aborted';
          break;
        }
      }

      result.status = 'completed';
    } catch (error) {
      result.status = 'failed';
      result.error = error.message;
    }

    result.endTime = Date.now();
    result.duration = result.endTime - result.startTime;
    this.executionHistory.push(result);

    return result;
  }

  /**
   * Execute single SOP step with LLM guidance
   */
  async executeStep(step, context) {
    console.log(`[Step] ${step.name || step.action}`);

    try {
      // Use LLM to parse/validate parameters if needed
      if (step.prompt) {
        const llmResponse = await this.client.chat({
          model: this.model,
          messages: [{
            role: 'user',
            content: step.prompt,
            context: JSON.stringify(context)
          }]
        });

        step.params = {
          ...step.params,
          llmOutput: llmResponse.message.content
        };
      }

      // Execute action
      const actionResult = await executeAction(step.action, step.params);

      return {
        name: step.name || step.action,
        status: 'success',
        result: actionResult
      };
    } catch (error) {
      return {
        name: step.name || step.action,
        status: 'failed',
        error: error.message
      };
    }
  }

  /**
   * Get execution history
   */
  getHistory() {
    return this.executionHistory;
  }
}

export default Orchestrator;
