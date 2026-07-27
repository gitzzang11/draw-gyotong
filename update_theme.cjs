const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'src', 'styles.css');
let css = fs.readFileSync(cssPath, 'utf8');

// Inject CSS variables into :root
const rootVars = `
  --c-bg: #25171A;
  --c-panel: rgba(75, 36, 74, 0.6);
  --c-panel-solid: #4B244A;
  --c-border: #533A7B;
  --c-accent: #6969B3;
  --c-highlight: #82D4BB;
  --glass-blur: blur(12px);
`;

css = css.replace(':root {', `:root {\n${rootVars}`);

// Replace common dark grays/blues with new palette
const replacements = [
  // Backgrounds
  { regex: /#14161[aA]/g, replacement: 'var(--c-bg)' },
  { regex: /#181[bB]20/g, replacement: 'var(--c-panel-solid)' },
  { regex: /#1[dD]212[aA]/g, replacement: 'var(--c-panel-solid)' },
  { regex: /#121418/g, replacement: 'var(--c-bg)' },
  { regex: /#081117/g, replacement: 'var(--c-bg)' },

  // Borders / Hovers / Lighter backgrounds
  { regex: /#2[bB]303[bB]/g, replacement: 'var(--c-border)' },
  { regex: /#363[aA]45/g, replacement: 'var(--c-border)' },
  { regex: /#333/g, replacement: 'var(--c-border)' },
  { regex: /#444/g, replacement: 'var(--c-accent)' },
  
  // Accents / Blues
  { regex: /#0[aA]84[fF][fF]/g, replacement: 'var(--c-highlight)' },
  { regex: /#3277[fF][fF]/g, replacement: 'var(--c-highlight)' },
  { regex: /#2962[fF][fF]/g, replacement: 'var(--c-accent)' },
  { regex: /#1[aA]56[fF][fF]/g, replacement: 'var(--c-accent)' },
  { regex: /#007[aA][fF][fF]/g, replacement: 'var(--c-highlight)' },
];

for (const { regex, replacement } of replacements) {
  css = css.replace(regex, replacement);
}

// Add global glassmorphism classes to the bottom
css += `
/* UI/UX Unification: Glassmorphism Overrides */
.start-panel, .dialog-content, .finance-card, .left-route-header, .top-actions-row, .layer-menu {
  background: var(--c-panel) !important;
  backdrop-filter: var(--glass-blur) !important;
  -webkit-backdrop-filter: var(--glass-blur) !important;
  border-color: var(--c-border) !important;
}

.primary-tool, .action-button, .ops-button, .time-button {
  background: var(--c-panel-solid);
  border-color: var(--c-border);
}

.primary-tool:hover, .action-button:hover, .ops-button:hover, .time-button:hover {
  background: var(--c-accent);
}

.primary-tool.active, .action-button.active, .time-button.active {
  background: var(--c-highlight) !important;
  color: #000 !important;
}

.status-pill {
  background: var(--c-panel) !important;
  backdrop-filter: var(--glass-blur) !important;
  border-color: var(--c-border) !important;
}
`;

fs.writeFileSync(cssPath, css, 'utf8');
console.log('CSS updated successfully.');
