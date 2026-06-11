/**
 * Gate 3 — agent assignment review.
 *
 * EARLY STAGE ONLY — remove once assignment confidence is consistently high.
 *
 * Auto-skip when all hold:
 *   - assignment.confidence > 0.85
 *   - assignee load < 0.70   (no live workload source in the demo → assume 0.5)
 *   - ticket.priority !== 'critical'
 *
 * Otherwise prompt (CLI mode) or auto-approve.
 */
const config = require('../config');

const ASSUMED_LOAD = 0.5;

async function runGate3(ticket, assignment) {
  const autoSkip =
    assignment.confidence > 0.85 &&
    ASSUMED_LOAD < 0.7 &&
    ticket.priority !== 'critical';

  if (autoSkip) {
    console.log(`⏭️  [Gate 3] auto-skipped — assign ${assignment.assignee} (confidence ${assignment.confidence})`);
    return assignment;
  }

  if (config.demo.gateMode === 'cli') {
    const { prompt } = require('./cli');
    console.log(`\n🔑 Gate 3 — assignment review for ${ticket.key}`);
    console.log(`   proposed: ${assignment.assignee} — ${assignment.reason}`);
    const cmd = await prompt('   > [enter]=approve · reassign NAME : ');
    const re = /^reassign\s+(\S+)$/i.exec(cmd);
    if (re) return { ...assignment, assignee: re[1], reason: 'Reassigned by reviewer' };
    return assignment;
  }

  console.log(`✅ [Gate 3] approved — assign ${assignment.assignee}`);
  return assignment;
}

module.exports = { runGate3 };
