import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/",
      "dist/",
      "coverage/",
      "*.min.js",
      "data/js-yaml.min.js",
    ],
  },
  js.configs.recommended,
  {
    files: ["data/**/*.js"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "script", // Traditional script tags, not modules
      globals: {
        ...globals.browser,
        // Third-party library loaded via script tag
        jsyaml: "readonly",
      },
    },
    rules: {
      // Relax rules for script-tag architecture where files share global namespace
      "no-undef": "off", // Variables defined in one script are used in others
      "no-unused-vars": ["warn", { 
        vars: "all",
        args: "after-used",
        argsIgnorePattern: "^_",
        caughtErrors: "none", // Allow unused catch parameters
        // Allow intentionally unused variables (APIs defined for other files)
        varsIgnorePattern: "^_|^(generateSampleOutputs|getNode|setNode|deleteNode|renameNode|countItems|setStatus|splitTopLevel|parseCountSpec|chooseWeighted|insertAtCursor|findDuplicateKeys|WildcardValidator|loadYamlText|dumpYaml|validateRaw|renderValidationList|setupEventListeners|navigateToIssue|togglePatternPalette|addKey|addItem|treeEl|editorTitleEl|editorBodyEl|editorActionsEl|formStatusEl|rawStatusEl|rawTextarea|formView|rawView|validationView|validationBadge|validationList|errorCount|warningCount|infoCount|totalCount|fileInput|showFormView|showRawView|runValidation|renderAll|renderEditor|processExpression|resolveExpression)$"
      }],
      "no-redeclare": "off", // Global namespace is intentional
      "no-useless-assignment": "off", // Reduces noise
      
      // Code quality rules (inspired by ComfyUI)
      "eqeqeq": ["error", "always", { "null": "ignore" }], // Require === and !==
      "curly": ["error", "all"], // Require curly braces for all control statements
      "no-console": "warn", // Warn on console.log (useful for catching debug statements)
      "no-debugger": "error", // Don't commit debugger statements
      "no-alert": "warn", // Warn on alert/confirm/prompt
      "no-var": "error", // Use const/let instead of var
      "prefer-const": "warn", // Prefer const when variables aren't reassigned
    },
  },
];
