// The canonical controlled vocabularies of the shared brain. Single source of
// truth — schemas import these so the JSON files and the code never drift.

export const MEMORY_TYPES = [
  'fact', 'preference', 'goal', 'constraint', 'decision', 'project_state',
  'procedure', 'lesson', 'relationship', 'capability', 'temporary_context',
];

export const SENSITIVITY = ['public', 'internal', 'private', 'restricted'];

export const MEMORY_STATES = [
  'proposed', 'active', 'disputed', 'superseded', 'expired', 'rejected',
];

export const CONFIDENCE = ['stated', 'inferred', 'uncertain'];

export const TASK_STATES = [
  'proposed', 'planned', 'queued', 'assigned', 'running',
  'review_requested', 'changes_requested', 'blocked',
  'completed', 'failed', 'cancelled',
];

// Allowed task transitions. deny-by-default: anything not listed is invalid.
export const TASK_TRANSITIONS = {
  proposed: ['planned', 'cancelled'],
  planned: ['queued', 'cancelled'],
  queued: ['assigned', 'cancelled', 'blocked'],
  assigned: ['running', 'blocked', 'cancelled'],
  running: ['review_requested', 'blocked', 'failed', 'completed'],
  review_requested: ['changes_requested', 'completed', 'blocked'],
  changes_requested: ['running', 'cancelled', 'blocked'],
  blocked: ['queued', 'assigned', 'running', 'cancelled'],
  completed: [],
  failed: ['queued'], // a failure may be retried into the queue
  cancelled: [],
};

export const RISK = ['none', 'low', 'medium', 'high', 'critical'];

export const REVIEW_DECISIONS = ['approved', 'changes_requested', 'escalated'];

export const AGENT_STATUS = [
  'active', 'standby', 'discovery_required', 'deprecated', 'draft',
];

export const HANDOFF_STATUS = ['ready', 'blocked', 'review_requested', 'completed'];

export const LESSON_STATUS = ['proposed', 'active', 'superseded', 'ineffective'];

export const FAILURE_ROOT_CAUSE_STATUS = ['unknown', 'hypothesized', 'confirmed'];

export const VERIFICATION_RESULT = ['passed', 'failed', 'partial', 'not_run'];

// Model-profile names the router understands (providers are configured, not
// hardcoded here).
export const MODEL_PROFILES = [
  'ceo_strategy', 'deep_reasoning', 'coding_primary', 'coding_review',
  'fast_general', 'research', 'vision', 'embedding', 'local_private',
];
