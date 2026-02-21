# Contributing

Thanks for helping improve the Wildcard Editor.

## Quick Start

- Keep changes focused and easy to review.
- Try and follow the existing code style.
- Use clear, descriptive commit messages.

## Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher)
- [pnpm](https://pnpm.io/) (recommended) or npm

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd wildcard-creator
   ```

2. Install dependencies:
   ```bash
   pnpm install --frozen-lockfile
   # or
   npm ci
   ```

3. Run the linter to check code quality:
   ```bash
   pnpm lint
   # or
   npm run lint
   ```

## Development

- Open `wildcard-editor.html` directly in a browser to test the application.
- Run validation in the app for any YAML examples you add.
- Before committing, run `pnpm lint` to check for code issues.
- Use `pnpm lint:fix` to automatically fix formatting issues.

## Pull Request Checklist

- Describe the user-facing impact.
- Include screenshots for UI changes.
