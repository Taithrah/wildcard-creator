/**
 * Wildcard YAML Validator
 * Based on ComfyUI Impact Pack wildcard system documentation
 */
class WildcardValidator {
  constructor() {
    this.issues = [];
  }

  validate(data) {
    this.issues = [];
    this.validateNode(data, []);
    return this.issues;
  }

  validateNode(node, path) {
    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        this.validateArrayItem(item, [...path, `[${index}]`]);
      });
    } else if (typeof node === 'object' && node !== null) {
      Object.entries(node).forEach(([key, value]) => {
        this.validateNode(value, [...path, key]);
      });
    }
  }

  validateArrayItem(item, path) {
    if (typeof item !== 'string') {
      this.addIssue('error', path,
        'Wildcard options must be strings',
        `Convert to string: "${String(item)}"`
      );
      return;
    }

    // Check if line starts with # (comment)
    const trimmed = item.trim();
    if (trimmed.startsWith('#')) {
      this.addIssue('info', path,
        'Comment line detected',
        'Lines starting with # are comments and will be ignored during processing'
      );
      return;
    }

    this.validateExpression(item, path);
    this.checkWildcardReferences(item, path);
    this.checkCommonMistakes(item, path);
  }

  validateExpression(text, path) {
    // Check for quantifier syntax: N#__wildcard__
    const quantifierPattern = /(\d+)#__([\w.\-+/*\\]+?)__/g;
    let quantMatch;
    while ((quantMatch = quantifierPattern.exec(text)) !== null) {
      const count = parseInt(quantMatch[1], 10);
      if (count > 20) {
        this.addIssue('warning', path,
          'Large quantifier may cause performance issues',
          `Quantifier ${count}#__${quantMatch[2]}__ will repeat ${count} times`,
          quantMatch[0]
        );
      }
    }

    let inWildcard = false;
    let depth = 0;
    let selectionBuffer = '';
    let selectionStart = -1;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const nextChar = i < text.length - 1 ? text[i + 1] : '';

      if (char === '_' && nextChar === '_') {
        inWildcard = !inWildcard;
        i += 1;
        continue;
      }

      if (!inWildcard) {
        if (char === '{') {
          if (depth === 0) {
            selectionBuffer = '';
            selectionStart = i;
          } else {
            selectionBuffer += char;
          }
          depth += 1;
          continue;
        }

        if (char === '}') {
          if (depth === 0) {
            this.addIssue('error', path,
              'Unmatched closing brace',
              `Extra } at position ${i}`,
              this.getContext(text, i)
            );
            continue;
          }

          depth -= 1;
          if (depth === 0) {
            this.validateSelection(selectionBuffer, path, selectionStart, text);
            selectionBuffer = '';
            selectionStart = -1;
          } else {
            selectionBuffer += char;
          }
          continue;
        }
      }

      if (depth > 0) {
        selectionBuffer += char;
      }
    }

    if (depth > 0) {
      this.addIssue('error', path,
        `Unmatched opening brace${depth > 1 ? 's' : ''}`,
        `${depth} unclosed { brace${depth > 1 ? 's' : ''}`,
        selectionStart >= 0 ? this.getContext(text, selectionStart) : null
      );
    }
  }

  validateSelection(content, path, startIndex, fullText) {
    if (!content.trim()) {
      this.addIssue('error', path,
        'Empty selection braces found',
        'Remove {} or add options',
        this.getContext(fullText, startIndex)
      );
      return;
    }

    const multiselectParts = splitTopLevel(content, '$$');
    if (multiselectParts.length >= 2) {
      const countSpec = multiselectParts[0].trim();
      let separator = ', ';
      let optionsPart = '';

      if (multiselectParts.length === 2) {
        optionsPart = multiselectParts[1];
      } else {
        separator = multiselectParts[1];
        optionsPart = multiselectParts.slice(2).join('$$');
      }

      if (!/^\s*-?\d+(\s*-\s*\d+)?\s*$/.test(countSpec)) {
        this.addIssue('error', path,
          'Invalid multiselect count format',
          `Count must be number or range (e.g., "2", "1-3", "-3"), got: "${countSpec}"`,
          `{${content}}`
        );
      }

      const options = splitTopLevel(optionsPart, '|');
      if (!optionsPart.trim() || options.length === 0) {
        this.addIssue('error', path,
          'Multiselect has no options',
          'Add options separated by |',
          `{${content}}`
        );
        return;
      }

      const emptyOptionIndices = options
        .map((option, index) => (option.trim() ? -1 : index))
        .filter(index => index >= 0);
      const nonEmptyOptions = options.filter(option => option.trim());

      if (emptyOptionIndices.length > 0 && nonEmptyOptions.length === 0) {
        this.addIssue('error', path,
          'Multiselect has no usable options',
          'Add at least one non-empty option',
          `{${content}}`
        );
        return;
      }

      if (emptyOptionIndices.length > 0) {
        const hasSingleEdgeEmpty =
          emptyOptionIndices.length === 1 &&
          (emptyOptionIndices[0] === 0 || emptyOptionIndices[0] === options.length - 1);

        if (!hasSingleEdgeEmpty) {
          this.addIssue('warning', path,
            'Multiselect contains empty options',
            'Remove extra | separators or move the empty option to the edge if intentional',
            `{${content}}`
          );
        }
      }

      const trimmedOptions = options.filter(option => option.trim());
      trimmedOptions.forEach(option => this.validateWeightedOption(option, path, `{${content}}`));

      const rangeMatch = countSpec.match(/(\d+)\s*-\s*(\d+)/);
      if (rangeMatch && parseInt(rangeMatch[1], 10) > parseInt(rangeMatch[2], 10)) {
        this.addIssue('warning', path,
          'Multiselect range is reversed',
          `Swap to ${rangeMatch[2]}-${rangeMatch[1]}`,
          `{${content}}`
        );
      }

      const numericCount = parseInt(countSpec, 10);
      if (!Number.isNaN(numericCount) && numericCount > trimmedOptions.length) {
        this.addIssue('warning', path,
          'Multiselect count exceeds available options',
          'Count will be capped by option count',
          `{${content}}`
        );
      }

      return;
    }

    const options = splitTopLevel(content, '|');
    if (options.length === 1) {
      this.validateExpression(options[0], path);
      return;
    }

    const emptyOptionIndices = options
      .map((option, index) => (option.trim() ? -1 : index))
      .filter(index => index >= 0);
    const nonEmptyOptions = options.filter(option => option.trim());

    if (emptyOptionIndices.length > 0 && nonEmptyOptions.length === 0) {
      this.addIssue('error', path,
        'Selection has no usable options',
        'Add at least one non-empty option',
        `{${content}}`
      );
      return;
    }

    if (emptyOptionIndices.length > 0) {
      const hasSingleEdgeEmpty =
        emptyOptionIndices.length === 1 &&
        (emptyOptionIndices[0] === 0 || emptyOptionIndices[0] === options.length - 1);

      if (!hasSingleEdgeEmpty) {
        this.addIssue('warning', path,
          'Selection contains empty options',
          'Remove extra | separators or move the empty option to the edge if intentional',
          `{${content}}`
        );
      }
    }

    options.forEach(option => {
      if (!option.trim()) {
        return;
      }
      this.validateWeightedOption(option, path, `{${content}}`);
    });
    
      const commaLeadingOptions = options.filter(option => option.trim().startsWith(','));
      if (commaLeadingOptions.length > 0) {
        this.addIssue('warning', path,
          'Options start with commas',
          'Leading commas can create double commas when combined with surrounding text',
          `{${content}}`
        );
      }
  }

  validateWeightedOption(option, path, context) {
    const weightParts = splitTopLevel(option, '::');
    if (weightParts.length > 2) {
      this.addIssue('error', path,
        'Multiple :: separators in weighted option',
        'Use only one :: separator per option',
        context
      );
      return;
    }

    if (weightParts.length === 2) {
      const first = weightParts[0].trim();
      const second = weightParts[1].trim();
      const firstIsNumber = /^\s*\d+(\.\d+)?\s*$/.test(first);
      const secondIsNumber = /^\s*\d+(\.\d+)?\s*$/.test(second);

      if (!firstIsNumber && secondIsNumber) {
        this.addIssue('error', path,
          'Incorrect weighted selection syntax - weight must come FIRST',
          `Change "${option}" to "${second}::${first}"`,
          context
        );
      }

      if (firstIsNumber && first.includes('.')) {
        const decimalPart = first.split('.')[1];
        if (decimalPart && decimalPart.length > 2) {
          this.addIssue('warning', path,
            'Complex decimal weights may cause issues',
            `Consider integer ratio instead of ${first}`,
            context
          );
        }
      }

      this.validateExpression(second, path);
      return;
    }

    this.validateExpression(option, path);
  }

  checkWildcardReferences(text, path) {
    const wildcardPattern = /__([^_]|_(?!_))+__/g;
    const matches = text.match(wildcardPattern);
    
    if (!matches) return;

    matches.forEach(match => {
      const reference = match.slice(2, -2);

      if (/[{}|]/.test(reference)) {
        this.addIssue('error', path,
          'Invalid characters in wildcard reference',
          'Wildcard paths should not contain {, }, or |',
          match
        );
      }

      if (/\s/.test(reference)) {
        this.addIssue('warning', path,
          'Wildcard reference contains spaces',
          'Spaces in wildcard paths are unusual',
          match
        );
      }

      const pathParts = reference.split('/').filter(part => part.trim());
      if (!pathParts.length) return;

      let node = state.data;
      for (const part of pathParts) {
        if (!node || typeof node !== 'object') {
          this.addIssue('warning', path,
            'Wildcard reference not found',
            `No wildcard found for "${reference}"`,
            match
          );
          return;
        }
        node = node[part];
      }

      if (!Array.isArray(node)) {
        this.addIssue('warning', path,
          'Wildcard reference does not point to a list',
          `"${reference}" should resolve to a list of options`,
          match
        );
      }
    });
  }

  checkCommonMistakes(text, path) {
    // Empty braces
    const emptyBraces = text.match(/\{\s*\}/);
    if (emptyBraces) {
      this.addIssue('error', path,
        'Empty selection braces found',
        'Remove {} or add options',
        emptyBraces[0]
      );
    }

    // Consecutive commas
    const doubleComma = text.match(/,\s*,/);
    if (doubleComma) {
      this.addIssue('warning', path,
        'Consecutive commas found',
        'Consecutive commas often mean an empty token; check optional segments',
        doubleComma[0]
      );
    }

    // Back-to-back comma-leading optional segments (can produce ",," after expansion)
    const optionalCommaChain = text.match(/(\{[^{}]*?(::)?\s*,[^{}]*?\|\}\s*){2,}/);
    if (optionalCommaChain) {
      this.addIssue('warning', path,
        'Adjacent comma-leading optionals detected',
        'Back-to-back {, ...|} segments can expand to consecutive commas',
        optionalCommaChain[0]
      );
    }

    // Percentage signs (suggesting wrong syntax)
    const percentage = text.match(/\d+%/);
    if (percentage) {
      this.addIssue('warning', path,
        'Percentage sign found',
        'Use ratio syntax: {10::common|1::rare} (not percentages)',
        percentage[0]
      );
    }

    // Check for potential confusion with detailer syntax
    if (/\[SEP\]|\[SKIP\]|\[STOP\]|\[CONCAT\]|\[LAB\]|\[ALL\]/.test(text)) {
      this.addIssue('warning', path,
        'Detailer control syntax detected',
        'Detailer syntax ([SEP], [SKIP], etc.) only works in Detailer nodes',
        text.match(/\[(SEP|SKIP|STOP|CONCAT|LAB|ALL)\]/)?.[0]
      );
    }
  }

  getContext(text, position, contextLength = 20) {
    const start = Math.max(0, position - contextLength);
    const end = Math.min(text.length, position + contextLength);
    let context = text.substring(start, end);
    
    if (start > 0) context = '...' + context;
    if (end < text.length) context = context + '...';
    
    return context;
  }

  addIssue(severity, path, message, suggestion, context = null) {
    this.issues.push({
      severity,
      path: path.join(' → '),
      message,
      suggestion,
      context
    });
  }

  getIssueCounts() {
    return {
      errors: this.issues.filter(i => i.severity === 'error').length,
      warnings: this.issues.filter(i => i.severity === 'warning').length,
      info: this.issues.filter(i => i.severity === 'info').length,
      total: this.issues.length
    };
  }
}

const state = {
  data: {},
  selectedPath: [],
  view: "form",
  rawText: "",
  validationIssues: [],
  validationFilter: "all"
};

const validator = new WildcardValidator();
const treeEl = document.getElementById("tree");
const editorTitleEl = document.getElementById("editorTitle");
const editorBodyEl = document.getElementById("editorBody");
const editorActionsEl = document.getElementById("editorActions");
const formStatusEl = document.getElementById("formStatus");
const rawStatusEl = document.getElementById("rawStatus");
const rawTextarea = document.getElementById("rawTextarea");
const formView = document.getElementById("formView");
const rawView = document.getElementById("rawView");
const validationView = document.getElementById("validationView");
const validationBadge = document.getElementById("validationBadge");
const validationList = document.getElementById("validationList");
const errorCount = document.getElementById("errorCount");
const warningCount = document.getElementById("warningCount");
const infoCount = document.getElementById("infoCount");
const totalCount = document.getElementById("totalCount");
const fileInput = document.getElementById("fileInput");

const runValidation = () => {
  state.validationIssues = validator.validate(state.data);
  const counts = validator.getIssueCounts();

  // Only show errors and warnings in the badge, not info messages
  const significantIssues = counts.errors + counts.warnings;
  if (significantIssues > 0) {
    validationBadge.textContent = significantIssues;
    validationBadge.style.display = 'inline-block';
    validationBadge.className = 'validation-badge ' + (counts.errors > 0 ? '' : 'warning');
  } else {
    validationBadge.style.display = 'none';
  }

  errorCount.textContent = counts.errors;
  warningCount.textContent = counts.warnings;
  infoCount.textContent = counts.info;
  
  const countItems = (obj) => {
    let count = 0;
    if (Array.isArray(obj)) {
      count += obj.length;
    } else if (typeof obj === 'object' && obj !== null) {
      Object.values(obj).forEach(val => {
        count += countItems(val);
      });
    }
    return count;
  };
  totalCount.textContent = countItems(state.data);

  renderValidationList();
};

const navigateToIssue = (path) => {
  // Parse the path string to get the selectedPath array
  // Path format: "group → key → [0]" or "group → key"
  const pathParts = path.split(' → ').filter(part => part.trim());
  
  // Remove array indices from path parts (e.g., [0], [1])
  const cleanPath = pathParts.filter(part => !part.match(/^\[\d+\]$/));
  
  if (cleanPath.length > 0) {
    // Set the selected path
    state.selectedPath = cleanPath;
    
    // Switch to form view
    showFormView();
    
    // Render everything
    renderAll();
  }
};

const renderValidationList = () => {
  const filtered = state.validationIssues.filter(issue => {
    if (state.validationFilter === 'all') return true;
    return issue.severity === state.validationFilter;
  });

  if (filtered.length === 0) {
    validationList.innerHTML = `
      <div class="no-issues">
        <div style="font-size: 48px; margin-bottom: 12px;">✓</div>
        <div>No ${state.validationFilter === 'all' ? '' : state.validationFilter} issues found!</div>
      </div>
    `;
    return;
  }

  validationList.innerHTML = '';
  
  filtered.forEach(issue => {
    const itemDiv = document.createElement('div');
    itemDiv.className = `validation-item ${issue.severity}`;
    
    // Create header with navigate button
    const header = document.createElement('div');
    header.className = 'validation-item-header';
    
    const messageSpan = document.createElement('span');
    const icon = issue.severity === 'error' ? '✕' : issue.severity === 'warning' ? '⚠' : 'ℹ';
    messageSpan.innerHTML = `${icon} ${issue.message}`;
    
    const navBtn = document.createElement('button');
    navBtn.className = 'validation-nav-btn';
    navBtn.textContent = '→ Go to';
    navBtn.title = 'Navigate to this item';
    navBtn.onclick = () => navigateToIssue(issue.path);
    
    header.appendChild(messageSpan);
    header.appendChild(navBtn);
    itemDiv.appendChild(header);
    
    // Add other content
    const pathDiv = document.createElement('div');
    pathDiv.className = 'validation-item-path';
    pathDiv.textContent = issue.path;
    itemDiv.appendChild(pathDiv);
    
    const suggestionDiv = document.createElement('div');
    suggestionDiv.textContent = issue.suggestion;
    itemDiv.appendChild(suggestionDiv);
    
    if (issue.context) {
      const contextDiv = document.createElement('div');
      contextDiv.className = 'validation-item-suggestion';
      contextDiv.textContent = issue.context;
      itemDiv.appendChild(contextDiv);
    }
    
    validationList.appendChild(itemDiv);
  });
};

const showFormView = () => {
  state.view = "form";
  formView.classList.add("active");
  rawView.classList.remove("active");
  validationView.classList.remove("active");
};

const showRawView = () => {
  state.view = "raw";
  formView.classList.remove("active");
  rawView.classList.add("active");
  validationView.classList.remove("active");
  rawTextarea.value = dumpYaml(state.data);
  rawTextarea.focus();
};

const showValidation = () => {
  state.view = "validation";
  formView.classList.remove("active");
  rawView.classList.remove("active");
  validationView.classList.add("active");
  runValidation();
};

const setStatus = (el, message, isError = false) => {
  el.innerHTML = message
    ? `<span class="${isError ? "error" : "ok"}">${message}</span>`
    : "";
};

const loadYamlText = (text) => {
  try {
    const parsed = jsyaml.load(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      state.data = {};
      setStatus(rawStatusEl, "Warning: Root must be an object. Initialized empty file.", true);
    } else {
      state.data = parsed;
      setStatus(rawStatusEl, "YAML parsed successfully.");
    }
    state.rawText = text;
    renderAll();
    runValidation();
  } catch (err) {
    setStatus(rawStatusEl, `YAML Parse Error: ${err.message}`, true);
  }
};

const dumpYaml = (data) => {
  return jsyaml.dump(data, {
    lineWidth: 1000,
    noRefs: true,
    sortKeys: false,
  });
};

const getNode = (path) => {
  let node = state.data;
  for (const key of path) {
    if (!node || typeof node !== "object") return null;
    node = node[key];
  }
  return node;
};

const setNode = (path, value) => {
  let node = state.data;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    if (!node[key] || typeof node[key] !== "object") {
      node[key] = {};
    }
    node = node[key];
  }
  node[path[path.length - 1]] = value;
};

const deleteNode = (path) => {
  if (!path.length) return;
  let node = state.data;
  for (let i = 0; i < path.length - 1; i += 1) {
    node = node[path[i]];
  }
  delete node[path[path.length - 1]];
};

const addGroup = () => {
  const name = prompt("Group name?");
  if (!name) return;
  
  const trimmedName = name.trim();
  if (!trimmedName) {
    setStatus(formStatusEl, "Group name cannot be empty.", true);
    return;
  }
  
  if (state.data[trimmedName]) {
    setStatus(formStatusEl, "Group already exists.", true);
    return;
  }
  
  state.data[trimmedName] = {};
  state.selectedPath = [trimmedName];
  renderAll();
  runValidation();
};

const addKey = () => {
  const node = getNode(state.selectedPath);
  if (!node || typeof node !== "object" || Array.isArray(node)) return;
  
  const name = prompt("Key name?");
  if (!name) return;
  
  const trimmedName = name.trim();
  if (!trimmedName) {
    setStatus(formStatusEl, "Key name cannot be empty.", true);
    return;
  }
  
  if (node[trimmedName]) {
    setStatus(formStatusEl, "Key already exists.", true);
    return;
  }
  
  node[trimmedName] = [];
  state.selectedPath = [...state.selectedPath, trimmedName];
  renderAll();
  runValidation();
};

const addItem = () => {
  const node = getNode(state.selectedPath);
  if (!Array.isArray(node)) return;
  node.push("");
  renderEditor();
  runValidation();
};

const togglePatternPalette = (input, wrapper) => {
  // Remove any existing palette
  document.querySelectorAll('.pattern-palette').forEach(p => p.remove());
  
  // Create new palette
  const palette = document.createElement('div');
  palette.className = 'pattern-palette active';
  palette.innerHTML = `
    <div class="pattern-palette-header">
      Quick Insert
      <button class="pattern-palette-close">✕</button>
    </div>
    <div class="pattern-grid"></div>
  `;
  
  const patterns = [
    { label: 'Wildcard', pattern: '__category__' },
    { label: 'Basic Choice', pattern: '{option1|option2|option3}' },
    { label: 'Weighted', pattern: '{5::common|1::rare}' },
    { label: 'Multi-select', pattern: '{2$$opt1|opt2|opt3}' },
    { label: 'Custom Separator', pattern: '{2$$ and $$opt1|opt2|opt3}' },
    { label: 'Range Select', pattern: '{1-3$$opt1|opt2|opt3}' },
    { label: 'Negative Range', pattern: '{-3$$opt1|opt2|opt3}' },
    { label: 'Optional', pattern: '{option,|}' },
    { label: 'Optional Wildcard', pattern: '{__category__,|}' },
    { label: 'Repeat Wildcard', pattern: '3#__wildcard__' },
    { label: 'Pattern Match', pattern: '__*/category__' },
    { label: 'Comment', pattern: '# comment' }
  ];
  
  const grid = palette.querySelector('.pattern-grid');
  patterns.forEach(({ label, pattern }) => {
    const btn = document.createElement('button');
    btn.className = 'pattern-btn';
    btn.innerHTML = `<span class="pattern-btn-label">${label}</span>${pattern}`;
    btn.onclick = () => {
      insertAtCursor(input, pattern);
      palette.remove();
      input.focus();
    };
    grid.appendChild(btn);
  });
  
  palette.querySelector('.pattern-palette-close').onclick = () => palette.remove();
  
  wrapper.appendChild(palette);
  
  // Close on click outside
  setTimeout(() => {
    const closeHandler = (e) => {
      if (!palette.contains(e.target) && e.target !== input) {
        palette.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    document.addEventListener('click', closeHandler);
  }, 0);
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
    }).filter(option => option.value.trim().length > 0);

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
  if (rawOptions.length === 1) {
    return resolveExpression(rawOptions[0], depth + 1, maxDepth);
  }

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

const updateExpressionTester = (input, wrapper) => {
  const tester = wrapper.querySelector('.expression-tester');
  if (!tester) return;

  const combinations = tester.querySelector('.tester-combinations');
  const regenBtn = tester.querySelector('.tester-regen-btn');

  const shouldShowTester = (rawValue) => {
    const trimmed = rawValue.trim();
    return trimmed.length > 0 && (trimmed.includes('{') || trimmed.includes('__'));
  };

  const generateAndDisplay = () => {
    const value = input.value;
    if (!shouldShowTester(value)) {
      tester.classList.remove('active');
      combinations.innerHTML = '';
      return;
    }

    tester.classList.add('active');

    try {
      const samples = generateSampleOutputs(value, 1);
      if (samples.length > 0) {
        const escaped = samples[0].replace(/</g, '&lt;').replace(/>/g, '&gt;');
        combinations.innerHTML = `<div class="tester-combination">${escaped}</div>`;
      } else {
        combinations.innerHTML = '<div class="tester-combination" style="color: var(--muted);">No variations detected</div>';
      }
    } catch (err) {
      combinations.innerHTML = '<div class="tester-combination" style="color: var(--danger);">Error processing expression</div>';
    }
  };

  if (regenBtn) {
    regenBtn.onclick = (e) => {
      e.preventDefault();
      generateAndDisplay();
    };
  }

  // Defer so the input value is fully updated before sampling.
  window.requestAnimationFrame(generateAndDisplay);
};

const renderTree = () => {
  treeEl.innerHTML = "";
  const keys = Object.keys(state.data || {});
  if (!keys.length) {
    treeEl.innerHTML = "<p class='hint'>No groups yet.</p>";
    return;
  }
  keys.forEach((group) => {
    const btn = document.createElement("button");
    btn.textContent = group;
    btn.className =
      state.selectedPath[0] === group ? "active" : "";
    btn.onclick = () => {
      state.selectedPath = [group];
      showFormView();
      renderAll();
    };
    treeEl.appendChild(btn);

    const node = state.data[group];
    if (node && typeof node === "object" && !Array.isArray(node)) {
      Object.keys(node).forEach((key) => {
        const child = document.createElement("button");
        child.textContent = `  - ${key}`;
        child.className =
          state.selectedPath[0] === group &&
            state.selectedPath[1] === key
            ? "active"
            : "";
        child.onclick = () => {
          state.selectedPath = [group, key];
          showFormView();
          renderAll();
        };
        treeEl.appendChild(child);
      });
    }
  });
};

const renderEditor = () => {
  editorActionsEl.innerHTML = "";
  editorBodyEl.innerHTML = "";
  setStatus(formStatusEl, "");

  if (!state.selectedPath.length) {
    editorTitleEl.textContent = "Select a group or key";
    return;
  }

  const node = getNode(state.selectedPath);
  const title = state.selectedPath.join(" / ");
  editorTitleEl.textContent = title;

  const deleteBtn = document.createElement("button");
  deleteBtn.textContent = "Delete";
  deleteBtn.onclick = () => {
    const itemName = state.selectedPath[state.selectedPath.length - 1];
    if (confirm(`Delete "${itemName}"?`)) {
      deleteNode(state.selectedPath);
      state.selectedPath = [];
      renderAll();
      runValidation();
    }
  };
  editorActionsEl.appendChild(deleteBtn);

  if (Array.isArray(node)) {
    const addBtn = document.createElement("button");
    addBtn.textContent = "Add Item";
    addBtn.onclick = addItem;
    editorActionsEl.appendChild(addBtn);

    node.forEach((item, index) => {
      const wrapper = document.createElement("div");
      wrapper.className = "list-item";
      wrapper.dataset.itemIndex = index;
      
      const input = document.createElement("textarea");
      input.rows = 2;
      input.value = item ?? "";
      input.dataset.itemIndex = index;
      input.oninput = () => {
        node[index] = input.value;
        setStatus(formStatusEl, "Updated.");
        runValidation();
        updateExpressionTester(input, wrapper);
      };
      input.onfocus = () => {
        updateExpressionTester(input, wrapper);
      };

      const controls = document.createElement("div");
      
      const helperToggle = document.createElement("button");
      helperToggle.textContent = "🔧";
      helperToggle.className = "helper-toggle";
      helperToggle.title = "Pattern Helper";
      helperToggle.onclick = () => togglePatternPalette(input, wrapper);
      
      const up = document.createElement("button");
      up.textContent = "Up";
      up.onclick = () => {
        if (index === 0) return;
        [node[index - 1], node[index]] = [node[index], node[index - 1]];
        renderEditor();
        runValidation();
      };
      const down = document.createElement("button");
      down.textContent = "Down";
      down.onclick = () => {
        if (index === node.length - 1) return;
        [node[index + 1], node[index]] = [node[index], node[index + 1]];
        renderEditor();
        runValidation();
      };
      const del = document.createElement("button");
      del.textContent = "Remove";
      del.onclick = () => {
        node.splice(index, 1);
        renderEditor();
        runValidation();
      };

      controls.appendChild(helperToggle);
      controls.appendChild(up);
      controls.appendChild(down);
      controls.appendChild(del);
      wrapper.appendChild(input);
      wrapper.appendChild(controls);
      
      // Add expression tester
      const tester = document.createElement("div");
      tester.className = "expression-tester";
      tester.innerHTML = `
        <div class="tester-header">
          Sample Output
          <button class="tester-regen-btn" title="Generate new sample">🔄</button>
        </div>
        <div class="tester-combinations"></div>
      `;
      wrapper.appendChild(tester);
      
      editorBodyEl.appendChild(wrapper);
    });
  } else if (node && typeof node === "object") {
    const addKeyBtn = document.createElement("button");
    addKeyBtn.textContent = "Add Key";
    addKeyBtn.onclick = addKey;
    editorActionsEl.appendChild(addKeyBtn);

    const keys = Object.keys(node);
    if (!keys.length) {
      editorBodyEl.innerHTML = "<p class='hint'>No keys yet. Add one.</p>";
      return;
    }
    keys.forEach((key) => {
      const row = document.createElement("div");
      row.className = "list-item";
      const input = document.createElement("input");
      input.type = "text";
      input.value = key;
      input.onchange = () => {
        if (!input.value || input.value === key) return;
        if (node[input.value]) {
          setStatus(formStatusEl, "Key already exists.", true);
          input.value = key;
          return;
        }
        node[input.value] = node[key];
        delete node[key];
        state.selectedPath = [state.selectedPath[0], input.value];
        renderAll();
        runValidation();
      };
      const openBtn = document.createElement("button");
      openBtn.textContent = "Open";
      openBtn.onclick = () => {
        state.selectedPath = [state.selectedPath[0], key];
        renderAll();
      };
      row.appendChild(input);
      row.appendChild(openBtn);
      editorBodyEl.appendChild(row);
    });
  } else {
    editorBodyEl.innerHTML = "<p class='hint'>Unsupported value type.</p>";
  }
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

const validateRaw = () => {
  const dups = findDuplicateKeys(rawTextarea.value);
  if (dups.length) {
    const msg = dups
      .map((d) => `Duplicate key "${d.key}" at line ${d.line}`)
      .join("<br>");
    setStatus(rawStatusEl, msg, true);
    return false;
  }
  setStatus(rawStatusEl, "No duplicate keys detected.");
  return true;
};

const renderAll = () => {
  renderTree();
  renderEditor();
  rawTextarea.value = dumpYaml(state.data);
};

document.getElementById("addGroupBtn").onclick = addGroup;
document.getElementById("rawViewBtn").onclick = showRawView;
document.getElementById("validationBtn").onclick = showValidation;

// Filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.validationFilter = btn.dataset.filter;
    renderValidationList();
  });
});

document.getElementById("applyRawBtn").onclick = () => {
  if (!validateRaw()) return;
  loadYamlText(rawTextarea.value);
};

document.getElementById("importBtn").onclick = () => {
  fileInput.click();
};

fileInput.onchange = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    loadYamlText(reader.result);
  };
  reader.readAsText(file);
};

document.getElementById("exportBtn").onclick = () => {
  const yamlText = dumpYaml(state.data);
  const blob = new Blob([yamlText], { type: "text/yaml" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "wildcards.yaml";
  link.click();
  URL.revokeObjectURL(link.href);
};

document.getElementById("newBtn").onclick = () => {
  if (!confirm("Start a new file? Unsaved changes will be lost.")) return;
  state.data = {};
  state.selectedPath = [];
  renderAll();
  runValidation();
};

rawTextarea.addEventListener("input", () => {
  validateRaw();
});

// Theme toggle functionality
const themeToggle = document.getElementById('themeToggle');
const html = document.documentElement;

// Load saved theme or default to dark
const savedTheme = localStorage.getItem('theme') || 'dark';
html.setAttribute('data-theme', savedTheme);

themeToggle.addEventListener('click', () => {
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
});

renderAll();
runValidation();
