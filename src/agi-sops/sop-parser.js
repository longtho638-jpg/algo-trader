/**
 * SOP Parser
 * Parses YAML/JSON SOP definitions into executable format
 */

export async function parseSOP(definition) {
  // If already parsed (object), return as-is
  if (typeof definition === 'object') {
    return validateSOP(definition);
  }

  // Try JSON first
  try {
    const parsed = JSON.parse(definition);
    return validateSOP(parsed);
  } catch {
    // Try YAML (simple parser, for full YAML use js-yaml package)
    const parsed = parseSimpleYAML(definition);
    return validateSOP(parsed);
  }
}

function validateSOP(sop) {
  if (!sop.name) {
    throw new Error('SOP must have a name');
  }
  if (!sop.steps || !Array.isArray(sop.steps)) {
    throw new Error('SOP must have steps array');
  }

  return {
    name: sop.name,
    description: sop.description || '',
    version: sop.version || '1.0.0',
    steps: sop.steps.map((step, index) => ({
      id: step.id || `step-${index}`,
      name: step.name || step.action,
      action: step.action,
      params: step.params || {},
      prompt: step.prompt || null,
      onError: step.onError || 'continue'
    }))
  };
}

function parseSimpleYAML(yaml) {
  // Simple YAML parser for basic SOP format
  // For production, use js-yaml package
  const result = { steps: [] };
  const lines = yaml.split('\n');
  let currentStep = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('name:')) {
      result.name = trimmed.split(':')[1].trim();
    } else if (trimmed.startsWith('description:')) {
      result.description = trimmed.split(':')[1].trim();
    } else if (trimmed.startsWith('- action:')) {
      if (currentStep) {
        result.steps.push(currentStep);
      }
      currentStep = { action: trimmed.split(':')[1].trim() };
    } else if (currentStep && trimmed.startsWith('name:')) {
      currentStep.name = trimmed.split(':')[1].trim();
    } else if (currentStep && trimmed.startsWith('params:')) {
      currentStep.params = JSON.parse(trimmed.split(':')[1].trim());
    }
  }

  if (currentStep) {
    result.steps.push(currentStep);
  }

  return result;
}
