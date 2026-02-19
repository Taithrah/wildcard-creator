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
        // Check if this might be intentional (e.g., {a||b} where empty is a valid choice)
        const severity = emptyOptionIndices.length === 1 ? 'info' : 'warning';
        this.addIssue(severity, path,
          'Selection contains empty options',
          'Empty options can be valid (selecting "nothing"), or may be unintentional extra | separators',
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

    // Check for comma-leading options (common in optional syntax like {, text|})
    const commaLeadingOptions = options.filter(option => option.trim().startsWith(','));
    if (commaLeadingOptions.length > 0) {
      // Check if this is likely intentional optional syntax: {text,|} or {, text|}
      const hasEmptyOption = emptyOptionIndices.length > 0;
      const isOptionalPattern = hasEmptyOption && options.length === 2;
      
      // Check if most options have comma prefix (intentional formatting)
      // Use >= 66% threshold to catch cases like {0.01::, text|, text2|, text3}
      const commaRatio = commaLeadingOptions.length / nonEmptyOptions.length;
      const isMostlyCommaFormatted = commaRatio >= 0.66;
      
      if (isOptionalPattern) {
        this.addIssue('info', path,
          'Optional syntax pattern detected',
          'Pattern {, text|} or {text,|} creates optional comma-prefixed text',
          `{${content}}`
        );
      } else if (isMostlyCommaFormatted) {
        this.addIssue('info', path,
          'Comma-prefix formatting detected',
          'Most options start with comma for text separation - likely intentional formatting',
          `{${content}}`
        );
      } else {
        this.addIssue('warning', path,
          'Options start with commas',
          'Leading commas can create double commas when combined with surrounding text',
          `{${content}}`
        );
      }
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

      // Check for pattern matching syntax (*/name) - this is valid and doesn't need validation
      if (reference.startsWith('*/')) {
        this.addIssue('info', path,
          'Pattern matching wildcard',
          `__*/name__ matches any wildcard ending with "${reference.slice(2)}" at any depth`,
          match
        );
        return;
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

    // Consecutive commas - but allow if part of valid optional syntax
    const doubleComma = text.match(/,\s*,/);
    if (doubleComma) {
      // Check if this could be from optional syntax expanding to empty
      const doubleCommaIndex = text.indexOf(doubleComma[0]);
      const contextBefore = text.substring(Math.max(0, doubleCommaIndex - 20), doubleCommaIndex);
      const contextAfter = text.substring(doubleCommaIndex + doubleComma[0].length, Math.min(text.length, doubleCommaIndex + 30));
      
      // Suppress warning if surrounded by optional syntax patterns
      const isInOptionalContext = /(\{[^{}]*?,\|[^{}]*?\}|\{[^{}]*\|\})/.test(contextBefore + doubleComma[0] + contextAfter);
      
      if (!isInOptionalContext) {
        this.addIssue('warning', path,
          'Consecutive commas found',
          'Consecutive commas often mean an empty token; check optional segments',
          doubleComma[0]
        );
      }
    }

    // Back-to-back comma-leading optional segments (can produce ",," after expansion)
    const optionalCommaChain = text.match(/(\{[^{}]*?(::)?\s*,[^{}]*?\|\}\s*){2,}/);
    if (optionalCommaChain) {
      this.addIssue('info', path,
        'Adjacent comma-leading optionals detected',
        'Back-to-back {, ...|} segments can expand to consecutive commas - this may be intentional',
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
