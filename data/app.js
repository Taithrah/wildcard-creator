/**
 * Wildcard YAML Editor - Main Application
 * Orchestrates all modules and initializes the application
 */

// Get DOM elements
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

// Initialize validator
const validator = new WildcardValidator();

// Run validation on state
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
  totalCount.textContent = countItems(state.data);

  renderValidationList(validationList);
};

// Initialize application
const initializeApp = () => {
  setupEventListeners();
  renderAll();
  runValidation();
};

// Start application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
