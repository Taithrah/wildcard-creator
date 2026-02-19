/**
 * Expression Processing Engine
 * Handles wildcard replacement and dynamic prompt evaluation
 */

const generateSampleOutputs = (expression, maxSamples = 1) => {
  const samples = new Set();
  const maxAttempts = 50;
  let attempts = 0;

  while (samples.size < maxSamples && attempts < maxAttempts) {
    attempts++;
    try {
      const result = processExpression(expression);
      if (result && result !== expression) {
        samples.add(result);
      }
    } catch (e) {
      break;
    }
  }

  return Array.from(samples);
};

const resolveSelection = (content, depth, maxDepth) => {
  const multiselectParts = splitTopLevel(content, '$$');

  if (multiselectParts.length >= 2) {
    const countSpec = multiselectParts[0].trim();
    let separator = ' ';
    let optionsPart = '';

    if (multiselectParts.length === 2) {
      optionsPart = multiselectParts[1];
    } else {
      separator = multiselectParts[1];
      optionsPart = multiselectParts.slice(2).join('$$');
    }

    const rawOptions = splitTopLevel(optionsPart, '|');
    const weightedOptions = rawOptions
      .map(option => {
        const weightParts = splitTopLevel(option, '::');
        if (weightParts.length === 2 && /^\s*\d+(\.\d+)?\s*$/.test(weightParts[0])) {
          const weight = Math.max(0, parseFloat(weightParts[0].trim()));
          return {
            weight,
            value: resolveExpression(weightParts[1], depth + 1, maxDepth)
          };
        }

        return {
          weight: 1,
          value: resolveExpression(option, depth + 1, maxDepth)
        };
      })
      .filter(option => option.value.trim().length > 0);

    if (weightedOptions.length === 0) return '';

    const count = parseCountSpec(countSpec, weightedOptions.length);
    const chosen = [];
    const pool = [...weightedOptions];

    for (let i = 0; i < count; i += 1) {
      const pickedValue = chooseWeighted(pool);
      const pickedIndex = pool.findIndex(option => option.value === pickedValue);
      if (pickedIndex === -1) break;
      chosen.push(pickedValue);
      pool.splice(pickedIndex, 1);
    }

    return chosen.join(separator);
  }

  const rawOptions = splitTopLevel(content, '|');

  // Parse weights for all options (including single-option and empty for optional syntax)
  // Match Impact Pack behavior: process all options including empty strings
  const weightedOptions = rawOptions.map(option => {
    const weightParts = splitTopLevel(option, '::');
    if (weightParts.length === 2 && /^\s*\d+(\.\d+)?\s*$/.test(weightParts[0])) {
      const weight = Math.max(0, parseFloat(weightParts[0].trim()));
      return {
        weight,
        value: resolveExpression(weightParts[1], depth + 1, maxDepth)
      };
    }

    return {
      weight: 1,
      value: resolveExpression(option, depth + 1, maxDepth)
    };
  });

  // Don't filter empty options - they're valid for optional syntax like {text,|}
  // This matches Impact Pack behavior where empty options can be selected
  const totalWeight = weightedOptions.reduce((sum, opt) => sum + opt.weight, 0);
  if (totalWeight <= 0) return '';

  return chooseWeighted(weightedOptions);
};

const resolveWildcards = (text, depth, maxDepth) => {
  return text.replace(/__([^_]|_(?!_))+__/g, (match) => {
    const path = match.slice(2, -2);

    // Normalize wildcard path (lowercase, forward slashes)
    const normalizedPath = path.toLowerCase().replace(/\\/g, '/');
    const pathParts = normalizedPath.split('/');

    // Handle pattern matching for __*/name__
    if (normalizedPath.startsWith('*/')) {
      const baseName = normalizedPath.slice(2); // Remove '*/'
      const matchingNodes = [];

      // Find all matching wildcards at any depth
      const findMatches = (obj, prefix = '') => {
        if (typeof obj === 'object' && obj !== null) {
          for (const key in obj) {
            const fullKey = prefix ? `${prefix}/${key}` : key;
            const normalizedKey = fullKey.toLowerCase();

            // Match if key equals baseName or contains it in path
            if (normalizedKey === baseName ||
              normalizedKey.endsWith('/' + baseName) ||
              normalizedKey.startsWith(baseName + '/') ||
              normalizedKey.includes('/' + baseName + '/')) {
              if (Array.isArray(obj[key])) {
                matchingNodes.push(...obj[key]);
              }
            }

            // Recurse into nested objects
            if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
              findMatches(obj[key], fullKey);
            }
          }
        }
      };

      findMatches(state.data);

      if (matchingNodes.length > 0) {
        const randomItem = matchingNodes[Math.floor(Math.random() * matchingNodes.length)] ?? '';
        return resolveExpression(randomItem, depth + 1, maxDepth);
      }

      return '[wildcard not found]';
    }

    // Try exact path lookup (case-insensitive)
    let node = state.data;
    let found = true;

    for (const part of pathParts) {
      if (!node || typeof node !== 'object') {
        found = false;
        break;
      }

      // Case-insensitive key lookup
      const matchingKey = Object.keys(node).find(k => k.toLowerCase() === part);
      if (matchingKey) {
        node = node[matchingKey];
      } else {
        found = false;
        break;
      }
    }

    // If exact match found and it's an array, select random item
    if (found && Array.isArray(node) && node.length > 0) {
      const randomItem = node[Math.floor(Math.random() * node.length)] ?? '';
      return resolveExpression(randomItem, depth + 1, maxDepth);
    }

    // No match found - return as-is (Impact Pack behavior for YAML)
    return '[wildcard not found]';
  });
};

const resolveBraces = (text, depth, maxDepth) => {
  let result = '';
  let buffer = '';
  let braceDepth = 0;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === '{') {
      if (braceDepth === 0) {
        result += buffer;
        buffer = '';
      } else {
        buffer += char;
      }
      braceDepth += 1;
      continue;
    }

    if (char === '}') {
      if (braceDepth > 0) {
        braceDepth -= 1;
        if (braceDepth === 0) {
          const evaluated = resolveSelection(buffer, depth + 1, maxDepth);
          result += evaluated;
          buffer = '';
        } else {
          buffer += char;
        }
        continue;
      }
    }

    buffer += char;
  }

  if (braceDepth > 0) {
    result += '{' + buffer;
  } else {
    result += buffer;
  }

  return result;
};

const resolveExpression = (expr, depth = 0, maxDepth = 10) => {
  if (depth > maxDepth) return expr;
  let result = expr;

  // Process quantifiers first (like Impact Pack)
  // Pattern: N#__wildcard__ becomes __wildcard__|__wildcard__|... (N times)
  const quantifierPattern = /(\d+)#__([\w.\-+/*\\]+?)__/g;
  result = result.replace(quantifierPattern, (match, count, wildcard) => {
    const repeatCount = parseInt(count, 10);
    const repeated = Array(repeatCount).fill(`__${wildcard}__`).join('|');
    return `{${repeated}}`;
  });

  result = resolveWildcards(result, depth, maxDepth);
  result = resolveBraces(result, depth, maxDepth);

  return result;
};

const processExpression = (expr) => {
  return resolveExpression(expr, 0, 12);
};
