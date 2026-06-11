/**
 * Terminal presentation helpers — consistent spacing, dividers, and color so
 * the pipeline output is easy to scan. Color is disabled when not a TTY or
 * when NO_COLOR is set, so piped/CI output stays clean.
 */
const useColor = !process.env.NO_COLOR && process.stdout.isTTY;
const paint = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);

const bold = (s) => paint('1', s);
const dim = (s) => paint('2', s);
const green = (s) => paint('32', s);
const cyan = (s) => paint('36', s);
const yellow = (s) => paint('33', s);
const blue = (s) => paint('34', s);

const W = 52;
const rule = (ch) => ch.repeat(W);

function banner(title) {
  console.log('');
  console.log(cyan('╔' + '═'.repeat(W) + '╗'));
  console.log(cyan('║') + bold(center(title, W)) + cyan('║'));
  console.log(cyan('╚' + '═'.repeat(W) + '╝'));
}

function center(s, width) {
  const pad = Math.max(0, width - s.length);
  const left = Math.floor(pad / 2);
  return ' '.repeat(left) + s + ' '.repeat(pad - left);
}

// A numbered pipeline step, with a blank line above for separation.
function step(n, title) {
  console.log('');
  console.log(bold(`${blue(`▸ ${n}`)}  ${title}`));
}

// A gate section — visually distinct block.
function gate(title) {
  console.log('');
  console.log(yellow('┌' + rule('─')));
  console.log(yellow('│ ') + bold(`🔑 ${title}`));
  console.log(yellow('└' + rule('─')));
}

// Indented detail / progress line (dim).
function detail(msg) {
  console.log(dim('     ' + msg));
}

function ok(msg) {
  console.log('     ' + green('✓') + ' ' + msg);
}

function agent(msg) {
  console.log('     ' + '🤖 ' + msg);
}

function note(msg) {
  console.log('     ' + dim(msg));
}

function blank() {
  console.log('');
}

module.exports = { banner, step, gate, detail, ok, agent, note, blank, bold, dim, green, cyan, yellow };
