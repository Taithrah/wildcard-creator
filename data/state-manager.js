/**
 * State Management
 * Manages application state and node operations
 */

const state = {
  data: {},
  selectedPath: [],
  view: "form",
  rawText: "",
  validationIssues: [],
  validationFilter: "all"
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

const renameNode = (path, formStatusEl, renderAll, runValidation) => {
  if (!path.length) return;

  const oldName = path[path.length - 1];
  const newName = prompt(`Rename "${oldName}" to:`, oldName);

  if (!newName || newName === oldName) return;

  const trimmedName = newName.trim();
  if (!trimmedName) {
    setStatus(formStatusEl, "Name cannot be empty.", true);
    return;
  }

  // Get the parent node
  let parentNode = state.data;
  for (let i = 0; i < path.length - 1; i += 1) {
    parentNode = parentNode[path[i]];
  }

  // Check if new name already exists
  if (parentNode[trimmedName]) {
    setStatus(formStatusEl, "Name already exists.", true);
    return;
  }

  // Rename by creating new key and deleting old one
  parentNode[trimmedName] = parentNode[oldName];
  delete parentNode[oldName];

  // Update selected path
  const newPath = [...path];
  newPath[newPath.length - 1] = trimmedName;
  state.selectedPath = newPath;

  renderAll();
  runValidation();
  setStatus(formStatusEl, `Renamed to "${trimmedName}"`);
};

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
