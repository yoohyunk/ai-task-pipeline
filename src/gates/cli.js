/**
 * Interactive terminal gates. Used when GATE_MODE=cli so a presenter can
 * approve / edit / remove items live in the terminal — no Slack/ngrok needed.
 *
 * Each function reads from stdin via readline. If stdin is closed with no
 * input (e.g. piped EOF), it falls back to approving so the demo never hangs.
 */
const readline = require('readline/promises');
const { stdin, stdout } = require('process');
const ui = require('../ui');

// One shared readline interface for the whole process. Recreating it per gate
// discards readline's read-ahead buffer (losing piped lines) and a fresh
// interface never settles after stdin EOF — both hang the demo. So we open it
// once, reuse it across all gates, and close it explicitly via closeCli().
let sharedRl = null;
let stdinEnded = false;
stdin.on('end', () => {
  stdinEnded = true;
});

function getRl() {
  if (!sharedRl) {
    sharedRl = readline.createInterface({ input: stdin, output: stdout });
    sharedRl.on('close', () => {
      stdinEnded = true;
    });
  }
  return sharedRl;
}

// Ask one question. Resolves '' on EOF / closed stdin so the demo never hangs.
function prompt(question) {
  if (stdinEnded) return Promise.resolve('');
  const rl = getRl();
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      resolve(typeof v === 'string' ? v.trim() : '');
    };
    rl.question(question).then(finish).catch(() => finish(''));
    rl.once('close', () => finish(''));
    stdin.once('end', () => finish(''));
  });
}

// Close the shared interface so the process can exit. Idempotent.
function closeCli() {
  if (sharedRl) {
    sharedRl.close();
    sharedRl = null;
  }
}

function printTasks(tasks) {
  console.log('');
  tasks.forEach((t, i) => {
    const n = String(i + 1).padStart(2, ' ');
    console.log(`   ${ui.bold(n)}. ${t.title}`);
    console.log(ui.dim(`       ${t.priority} · ${t.assignee_hint || 'TBD'} · ${t.source}`));
  });
  console.log('');
}

/**
 * Gate 1 — review the extracted task list.
 * Commands: [enter]/a approve all · r reject · rm N remove · e N edit title
 * @returns {Promise<{decision:'approved'|'rejected', tasks:object[]}>}
 */
async function askGate1(tasks) {
  let list = [...tasks];
  for (;;) {
    printTasks(list);
    console.log(ui.dim('   commands:  [enter] approve all   ·   r reject   ·   rm N remove   ·   e N edit'));
    const cmd = await prompt('   ▸ ');
    if (cmd === '' || cmd === 'a' || cmd === 'approve') {
      return { decision: 'approved', tasks: list };
    }
    if (cmd === 'r' || cmd === 'reject') {
      return { decision: 'rejected', tasks: list };
    }
    const rm = /^(?:rm|remove)\s+(\d+)$/.exec(cmd);
    if (rm) {
      const idx = Number(rm[1]) - 1;
      if (idx >= 0 && idx < list.length) {
        console.log(`   🗑 removed: ${list[idx].title}`);
        list = list.filter((_, i) => i !== idx);
      }
      continue;
    }
    const ed = /^(?:e|edit)\s+(\d+)$/.exec(cmd);
    if (ed) {
      const idx = Number(ed[1]) - 1;
      if (idx >= 0 && idx < list.length) {
        const nt = await prompt(`   new title for "${list[idx].title}": `);
        if (nt) list[idx] = { ...list[idx], title: nt };
      }
      continue;
    }
    console.log('   (unrecognized — try again)');
  }
}

/**
 * Gate 2 — review created tickets.
 * Commands: [enter]/a approve all · d N delete · m N merge (warning items)
 * Mutates the results array in place (sets _removed / _mergedInto via onMerge).
 * @param {object[]} tickets - dedup results
 * @param {(idx:number)=>Promise<void>} onMerge - apply a merge for ticket idx
 * @param {(idx:number)=>Promise<void>} onDelete - apply a delete for ticket idx
 * @returns {Promise<object[]>} confirmed tickets
 */
async function askGate2(tickets, onMerge, onDelete) {
  for (;;) {
    console.log('');
    tickets.forEach((t, i) => {
      const n = String(i + 1).padStart(2, ' ');
      if (t.status === 'duplicate') {
        console.log(`   ${ui.bold(n)}. ${ui.dim('⊘ ' + t.issue.key + ' (duplicate)')}  ${t.issue.summary}`);
      } else if (t._removed) {
        console.log(`   ${ui.bold(n)}. ${ui.dim('⊘ ' + t.issue.key + ' (' + (t._mergedInto ? 'merged → ' + t._mergedInto : 'deleted') + ')')}`);
      } else if (t.status === 'created_with_warning') {
        console.log(`   ${ui.bold(n)}. ⚠ ${t.issue.key}  ${t.issue.summary}`);
        console.log(ui.dim(`       possible dup of ${t.similarTo.key}`));
      } else {
        console.log(`   ${ui.bold(n)}. ${ui.green('✓')} ${t.issue.key}  ${t.issue.summary}`);
      }
    });
    console.log('');
    console.log(ui.dim('   commands:  [enter] approve all   ·   d N delete   ·   m N merge'));
    const cmd = await prompt('   ▸ ');
    if (cmd === '' || cmd === 'a' || cmd === 'approve') break;
    const del = /^d(?:elete)?\s+(\d+)$/.exec(cmd);
    if (del) {
      await onDelete(Number(del[1]) - 1);
      continue;
    }
    const mg = /^m(?:erge)?\s+(\d+)$/.exec(cmd);
    if (mg) {
      await onMerge(Number(mg[1]) - 1);
      continue;
    }
    console.log('   (unrecognized — try again)');
  }
  return tickets.filter((t) => t.status !== 'duplicate' && !t._removed);
}

/**
 * Gate 4 — assignee reviews the PR.
 * @returns {Promise<'approved'|'rejected'>}
 */
async function askGate4(ticket, pr, summary) {
  console.log('');
  console.log(`   ${ui.bold(ticket.key)}  ${ticket.summary || ticket.title}`);
  console.log(`   ${ui.dim('PR')}      ${pr.prUrl}`);
  if (summary) {
    console.log(`   ${ui.dim('What')}    ${summary.what}`);
    console.log(`   ${ui.dim('How')}     ${summary.how}`);
    console.log(`   ${ui.dim('Check')}   ${summary.checkPoints}`);
    if (summary.remaining) console.log(`   ${ui.dim('Left')}    ${summary.remaining}`);
  }
  console.log('');
  console.log(ui.dim('   commands:  [enter] approve & merge   ·   r request changes'));
  const cmd = await prompt('   ▸ ');
  return cmd === 'r' || cmd === 'reject' ? 'rejected' : 'approved';
}

module.exports = { askGate1, askGate2, askGate4, prompt, closeCli };
