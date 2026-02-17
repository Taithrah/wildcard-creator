/**
 * Event Handlers
 * Manages user interactions and state changes
 */

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
  renderEditor(editorTitleEl, editorBodyEl, editorActionsEl, formStatusEl);
  runValidation();
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

const setupEventListeners = () => {
  document.getElementById("addGroupBtn").onclick = addGroup;
  document.getElementById("rawViewBtn").onclick = showRawView;
  document.getElementById("validationBtn").onclick = showValidation;

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.validationFilter = btn.dataset.filter;
      renderValidationList(validationList);
    });
  });

  document.getElementById("applyRawBtn").onclick = () => {
    if (!validateRaw(rawTextarea, rawStatusEl)) return;
    loadYamlText(rawTextarea.value, rawStatusEl, renderAll, runValidation);
  };

  document.getElementById("importBtn").onclick = () => {
    fileInput.click();
  };

  fileInput.onchange = (event) => {
    const file = event.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      loadYamlText(reader.result, rawStatusEl, renderAll, runValidation);
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
    validateRaw(rawTextarea, rawStatusEl);
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
};
