/**
 * Utility functions
 * No dependencies
 */

const setStatus = (el, message, isError = false) => {
  el.innerHTML = message
    ? `<span class="${isError ? "error" : "ok"}">${message}</span>`
    : "";
};

const splitTopLevel = (input, delimiter) => {
  const parts = [];
  let buffer = '';
  let depth = 0;
  let inWildcard = false;
  let i = 0;

  while (i < input.length) {
    const char = input[i];
    const nextChar = i < input.length - 1 ? input[i + 1] : '';

    if (char === '_' && nextChar === '_') {
      inWildcard = !inWildcard;
      buffer += '__';
      i += 2;
      continue;
    }

    if (!inWildcard) {
      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth = Math.max(0, depth - 1);
      }

      if (depth === 0 && input.startsWith(delimiter, i)) {
        parts.push(buffer);
        buffer = '';
        i += delimiter.length;
        continue;
      }
    }

    buffer += char;
    i += 1;
  }

  parts.push(buffer);
  return parts;
};

const parseCountSpec = (spec, maxOptions) => {
  const trimmed = spec.trim();
  if (!trimmed) return 0;

  // Handle negative range: -n means 0 to n (changed to 1 to n for Impact Pack compatibility)
  if (/^\s*-(\d+)\s*$/.test(trimmed)) {
    const maxNum = parseInt(trimmed.slice(1), 10);
    const max = Math.min(maxNum, maxOptions);
    // Impact Pack uses random from 1 to max (not 0 to max)
    return Math.floor(Math.random() * max) + 1;
  }

  // Handle range: n1-n2
  const rangeMatch = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    const min = Math.min(parseInt(rangeMatch[1], 10), maxOptions);
    const max = Math.min(parseInt(rangeMatch[2], 10), maxOptions);
    // Impact Pack handles min > max by returning min
    if (max < min) return min;
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  // Handle single number
  const single = parseInt(trimmed, 10);
  if (!Number.isNaN(single)) {
    return Math.min(single, maxOptions);
  }

  return 0;
};

const chooseWeighted = (options) => {
  const totalWeight = options.reduce((sum, option) => sum + option.weight, 0);
  if (totalWeight <= 0) return options[0]?.value ?? '';
  let roll = Math.random() * totalWeight;

  for (const option of options) {
    roll -= option.weight;
    if (roll <= 0) return option.value;
  }

  return options[options.length - 1]?.value ?? '';
};

const insertAtCursor = (input, text) => {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const value = input.value;
  input.value = value.substring(0, start) + text + value.substring(end);
  input.selectionStart = input.selectionEnd = start + text.length;

  // Trigger input event to update data
  const event = new Event('input', { bubbles: true });
  input.dispatchEvent(event);
};

const findDuplicateKeys = (text) => {
  const duplicates = [];
  const stack = [{ indent: -1, keys: new Set() }];

  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const clean = line.replace(/#.*$/, "");
    if (!clean.trim()) return;
    const match = clean.match(/^(\s*)([^:\s][^:]*?)\s*:/);
    if (!match) return;

    const indent = match[1].length;
    const key = match[2].trim();

    while (stack.length && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const level = stack[stack.length - 1];
    if (level.keys.has(key)) {
      duplicates.push({ line: index + 1, key });
    } else {
      level.keys.add(key);
    }

    stack.push({ indent, keys: new Set() });
  });

  return duplicates;
};
