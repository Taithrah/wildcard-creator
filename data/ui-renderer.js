/**
 * UI Renderer
 * Handles all view rendering and updates
 */

const renderTree = (treeEl) => {
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

const renderEditor = (editorTitleEl, editorBodyEl, editorActionsEl, formStatusEl) => {
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

  const renameBtn = document.createElement("button");
  renameBtn.textContent = "Rename";
  renameBtn.onclick = () => {
    renameNode(state.selectedPath, formStatusEl, renderAll, runValidation);
  };
  editorActionsEl.appendChild(renameBtn);

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
        renderEditor(editorTitleEl, editorBodyEl, editorActionsEl, formStatusEl);
        runValidation();
      };
      const down = document.createElement("button");
      down.textContent = "Down";
      down.onclick = () => {
        if (index === node.length - 1) return;
        [node[index + 1], node[index]] = [node[index], node[index + 1]];
        renderEditor(editorTitleEl, editorBodyEl, editorActionsEl, formStatusEl);
        runValidation();
      };
      const del = document.createElement("button");
      del.textContent = "Remove";
      del.onclick = () => {
        node.splice(index, 1);
        renderEditor(editorTitleEl, editorBodyEl, editorActionsEl, formStatusEl);
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

const renderValidationList = (validationList) => {
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

const renderAll = () => {
  renderTree(treeEl);
  renderEditor(editorTitleEl, editorBodyEl, editorActionsEl, formStatusEl);
  rawTextarea.value = dumpYaml(state.data);
};
