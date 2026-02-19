/**
 * YAML Manager
 * Handles YAML parsing and serialization
 * 
 * Dependencies (from global scope):
 * - state (state-manager.js)
 * - setStatus (utils.js)
 * - jsyaml (js-yaml.min.js)
 * 
 * Parameters passed by caller:
 * - renderAll (ui-renderer.js) - function to re-render UI
 * - runValidation (app.js) - function to run validation
 */

const loadYamlText = (text, formStatusEl, renderAll, runValidation) => {
  try {
    const parsed = jsyaml.load(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      state.data = {};
      setStatus(formStatusEl, "Warning: Root must be an object. Initialized empty file.", true);
    } else {
      state.data = parsed;
      setStatus(formStatusEl, "YAML parsed successfully.");
    }
    state.rawText = text;
    renderAll();
    runValidation();
  } catch (err) {
    setStatus(formStatusEl, `YAML Parse Error: ${err.message}`, true);
  }
};

const dumpYaml = (data) => {
  return jsyaml.dump(data, {
    lineWidth: 1000,
    noRefs: true,
    sortKeys: false,
  });
};

const validateRaw = (rawTextarea, rawStatusEl) => {
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
