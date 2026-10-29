const STAGE_ORDER = {
  lead: 0,
  first_contact: 1,
  proposal: 2,
  negotiation: 3,
  onboarding: 4,
  active: 5,
};

const REACHED_ONBOARDING = new Set(['onboarding', 'active']);

function validDate(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : null;
}

function orderedHistory(history = []) {
  return [...history]
    .filter(item => item && validDate(item.created_at) !== null)
    .sort((a, b) => validDate(a.created_at) - validDate(b.created_at));
}

function isAdvancement(event) {
  const from = STAGE_ORDER[event.from_stage];
  const to = STAGE_ORDER[event.to_stage];
  return Number.isInteger(from) && Number.isInteger(to) && to > from;
}

export function summarizeLeadHistory(channel, history = []) {
  const events = orderedHistory(history);
  const advances = events.filter(isAdvancement);
  const knownStages = [
    ...events.flatMap(item => [item.from_stage, item.to_stage]),
    channel?.pipeline_stage,
  ].filter(stage => Number.isInteger(STAGE_ORDER[stage]));
  const highestStage = knownStages.reduce((highest, stage) => (
    highest === null || STAGE_ORDER[stage] > STAGE_ORDER[highest] ? stage : highest
  ), null);

  return {
    initialStage: events[0]?.from_stage || null,
    highestStage,
    changeCount: events.length,
    advancementCount: advances.length,
    hasAdvanced: advances.length > 0,
    firstAdvanceAt: advances[0]?.created_at || null,
    lastStageChangeAt: events.at(-1)?.created_at || channel?.pipeline_stage_changed_at || null,
    historyAvailable: events.length > 0,
  };
}

export function buildLeadSummary(rows = []) {
  return {
    total: rows.length,
    advanced: rows.filter(row => row._leadHistory?.hasAdvanced).length,
    withoutVerifiedAdvance: rows.filter(row => !row._leadHistory?.hasAdvanced).length,
    withHistoryNoAdvance: rows.filter(row => row._leadHistory?.historyAvailable && !row._leadHistory?.hasAdvanced).length,
    withoutHistory: rows.filter(row => !row._leadHistory?.historyAvailable).length,
    onboardingOrActive: rows.filter(row => REACHED_ONBOARDING.has(row.pipeline_stage)).length,
    active: rows.filter(row => row.pipeline_stage === 'active' || row.status === 'activo').length,
    closed: rows.filter(row => row.pipeline_stage === 'closed_no_deal' || ['rechazado', 'cierre_sin_acuerdo'].includes(row.status)).length,
  };
}
