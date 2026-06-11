/**
 * Interactive terminal gates. Used when GATE_MODE=cli so a presenter can
 * approve / edit / remove items live in the terminal — no Slack/ngrok needed.
 *
 * Each function reads from stdin via readline. If stdin is closed with no
 * input (e.g. piped EOF), it falls back to approving so the demo never hangs.
 */
const readline = require('readline/promises');
const { stdin, stdout } = require('process');

// Open one readline interface per gate session. Recreating it per question
// drops buffered piped input, so each gate function creates a single `ask`.
function makeAsker() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  let closed = false;
  rl.on('close', () => {
    closed = true;
  });
  const ask = (question) => {
    if (closed) return Promise.resolve('');
    // Race the answer against stream close — readline/promises does not settle
    // question() on EOF, which would otherwise hang (or silently drain) the loop.
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        resolve(typeof v === 'string' ? v.trim() : '');
      };
      rl.question(question).then(finish).catch(() => finish(''));
      rl.once('close', () => finish(''));
    });
  };
  ask.close = () => {
    if (!closed) rl.close();
  };
  return ask;
}

// Standalone single prompt (used by Gate 4).
async function prompt(question) {
  const ask = makeAsker();
  try {
    return await ask(question);
  } finally {
    ask.close();
  }
}

function printTasks(tasks) {
  tasks.forEach((t, i) => {
    console.log(
      `   ${i + 1}. ${t.title}  ` +
        `(${t.priority} · ${t.assignee_hint || 'TBD'} · ${t.source})`
    );
  });
}

/**
 * Gate 1 — review the extracted task list.
 * Commands: [enter]/a approve all · r reject · rm N remove · e N edit title
 * @returns {Promise<{decision:'approved'|'rejected', tasks:object[]}>}
 */
async function askGate1(tasks) {
  let list = [...tasks];
  const ask = makeAsker();
  console.log('\n🔑 Gate 1 — review extracted tasks:');
  try {
    for (;;) {
      printTasks(list);
      const cmd = await ask(
        '   > [enter]=approve all · r=reject · rm N=remove · e N=edit title : '
      );
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
          const nt = await ask(`   new title for "${list[idx].title}": `);
          if (nt) list[idx] = { ...list[idx], title: nt };
        }
        continue;
      }
      console.log('   (unrecognized — try again)');
    }
  } finally {
    ask.close();
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
  const ask = makeAsker();
  console.log('\n🔑 Gate 2 — review created tickets:');
  try {
    for (;;) {
      tickets.forEach((t, i) => {
        if (t.status === 'duplicate') {
          console.log(`   ${i + 1}. ℹ️ skipped (dup) ${t.issue.key} — ${t.issue.summary}`);
        } else if (t._removed) {
          console.log(`   ${i + 1}. ⊘ ${t.issue.key} (${t._mergedInto ? 'merged → ' + t._mergedInto : 'deleted'})`);
        } else if (t.status === 'created_with_warning') {
          console.log(`   ${i + 1}. ⚠️ ${t.issue.key} — ${t.issue.summary} (possible dup of ${t.similarTo.key})`);
        } else {
          console.log(`   ${i + 1}. ✅ ${t.issue.key} — ${t.issue.summary}`);
        }
      });
      const cmd = await ask('   > [enter]=approve all · d N=delete · m N=merge : ');
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
  } finally {
    ask.close();
  }
  return tickets.filter((t) => t.status !== 'duplicate' && !t._removed);
}

/**
 * Gate 4 — assignee reviews the PR.
 * @returns {Promise<'approved'|'rejected'>}
 */
async function askGate4(ticket, pr, summary) {
  console.log('\n🔑 Gate 4 — review the agent PR:');
  console.log(`   Ticket:  ${ticket.key} — ${ticket.summary || ticket.title}`);
  console.log(`   PR:      ${pr.prUrl}`);
  if (summary) {
    console.log(`   What:    ${summary.what}`);
    console.log(`   How:     ${summary.how}`);
    console.log(`   Check:   ${summary.checkPoints}`);
    if (summary.remaining) console.log(`   Left:    ${summary.remaining}`);
  }
  const cmd = await prompt('   > [enter]=approve · r=reject : ');
  return cmd === 'r' || cmd === 'reject' ? 'rejected' : 'approved';
}

module.exports = { askGate1, askGate2, askGate4, prompt };
