// MCP tool descriptors: the narrow, governed surface other agents (Claude Code,
// Codex) reach the shared brain through — never raw database access. The
// transport is a zero-dependency stdio JSON-RPC server in server.js (run:
// `node cli/rory.js mcp`); these descriptors + the handlers in tools.js are the
// substance and are transport-agnostic.
export const TOOL_DESCRIPTORS = [
  { name: 'memory_search', write: false, summary: 'Full-text search active durable memory within the caller\'s read scopes.' },
  { name: 'memory_get', write: false, summary: 'Fetch one memory by id if the caller may read its scope.' },
  { name: 'memory_propose', write: true, summary: 'Propose a durable memory (proposal-first; identity/goals/restricted need owner approval).' },
  { name: 'memory_dispute', write: true, summary: 'Flag an active memory as disputed for resolution.' },
  { name: 'goal_list', write: false, summary: 'List active goals.' },
  { name: 'project_get', write: false, summary: 'Get a project charter/state (from the brain).' },
  { name: 'task_create', write: true, summary: 'Create a bounded task.' },
  { name: 'task_get', write: false, summary: 'Get a task by id.' },
  { name: 'task_update', write: true, summary: 'Transition a task (deny-by-default state machine).' },
  { name: 'task_list', write: false, summary: 'List tasks by status/goal.' },
  { name: 'artifact_register', write: true, summary: 'Register a consequential output with provenance.' },
  { name: 'artifact_get', write: false, summary: 'Get an artifact by id.' },
  { name: 'agent_list', write: false, summary: 'List the agent company.' },
  { name: 'agent_get', write: false, summary: 'Get one agent manifest.' },
  { name: 'handoff_create', write: true, summary: 'Create a validated handoff envelope.' },
  { name: 'handoff_get', write: false, summary: 'Get a handoff by id.' },
  { name: 'lesson_search', write: false, summary: 'Find active lessons relevant to a task type/tags/scopes.' },
  { name: 'review_submit', write: true, summary: 'Submit a review decision (reviewer separation enforced).' },
  { name: 'board_generate', write: true, summary: 'Generate the 24h board report + action plan.' },
  { name: 'system_status', write: false, summary: 'One-glance system status.' },
];
