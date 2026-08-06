// The shared contracts, authored as JSON-Schema documents. They reference the
// canonical enums so the vocabulary can never drift from the code. These
// objects ARE JSON Schema (draft-07 subset) and are exported to
// contracts/schemas/*.json by `node contracts/export-schemas.js` for external
// consumers such as the MCP boundary.

import {
  MEMORY_TYPES, SENSITIVITY, MEMORY_STATES, CONFIDENCE, TASK_STATES, RISK,
  REVIEW_DECISIONS, AGENT_STATUS, HANDOFF_STATUS, LESSON_STATUS,
  FAILURE_ROOT_CAUSE_STATUS, VERIFICATION_RESULT, MODEL_PROFILES,
} from './enums.js';

const iso = { type: 'string', format: 'date-time' };
const strArray = { type: 'array', items: { type: 'string' } };

export const eventSchema = {
  $id: 'event',
  type: 'object',
  required: ['id', 'type', 'actor', 'created_at'],
  properties: {
    id: { type: 'string' },
    seq: { type: 'integer' },
    type: { type: 'string', minLength: 1 },
    actor: { type: 'string', minLength: 1 },
    subject_type: { type: ['string', 'null'] },
    subject_id: { type: ['string', 'null'] },
    payload: { type: 'object' },
    created_at: iso,
  },
  additionalProperties: false,
};

export const memorySchema = {
  $id: 'memory',
  type: 'object',
  required: ['id', 'type', 'subject', 'content', 'status', 'source_type', 'created_by', 'created_at', 'sensitivity'],
  properties: {
    id: { type: 'string' },
    type: { type: 'string', enum: MEMORY_TYPES },
    scope: { type: 'string' },
    subject: { type: 'string', minLength: 1 },
    content: { type: 'string', minLength: 1 },
    status: { type: 'string', enum: MEMORY_STATES },
    source_type: { type: 'string' },
    source_reference: { type: ['string', 'null'] },
    created_by: { type: 'string' },
    created_at: iso,
    updated_at: { ...iso, type: ['string', 'null'] },
    confidence: { type: 'string', enum: CONFIDENCE },
    sensitivity: { type: 'string', enum: SENSITIVITY },
    valid_from: { type: ['string', 'null'] },
    valid_until: { type: ['string', 'null'] },
    supersedes: { type: ['string', 'null'] },
    tags: strArray,
    approval_required: { type: 'boolean' },
    approved_by: { type: ['string', 'null'] },
  },
  additionalProperties: false,
};

export const taskSchema = {
  $id: 'task',
  type: 'object',
  required: ['id', 'objective', 'status', 'risk', 'created_at'],
  properties: {
    id: { type: 'string' },
    parent_goal: { type: ['string', 'null'] },
    parent_task: { type: ['string', 'null'] },
    objective: { type: 'string', minLength: 1 },
    acceptance_criteria: strArray,
    scope: { type: ['string', 'null'] },
    exclusions: strArray,
    priority: { type: 'integer', minimum: 0, maximum: 100 },
    risk: { type: 'string', enum: RISK },
    required_capabilities: strArray,
    allowed_tools: strArray,
    memory_scopes: strArray,
    budget: {
      type: 'object',
      properties: {
        max_tokens: { type: ['integer', 'null'] },
        max_usd: { type: ['number', 'null'] },
        timeout_ms: { type: ['integer', 'null'] },
      },
    },
    assigned_agent: { type: ['string', 'null'] },
    reviewer: { type: ['string', 'null'] },
    dependencies: strArray,
    status: { type: 'string', enum: TASK_STATES },
    evidence: { type: 'array' },
    created_at: iso,
    updated_at: { type: ['string', 'null'] },
    failure: { type: ['object', 'null'] },
    recommended_next_action: { type: ['string', 'null'] },
    delegation_depth: { type: 'integer', minimum: 0 },
    retries: { type: 'integer', minimum: 0 },
    lease_expires_at: { type: ['string', 'null'] },
  },
  additionalProperties: false,
};

export const artifactSchema = {
  $id: 'artifact',
  type: 'object',
  required: ['id', 'task_id', 'type', 'authoring_agent', 'created_at'],
  properties: {
    id: { type: 'string' },
    task_id: { type: 'string' },
    path_or_uri: { type: ['string', 'null'] },
    type: { type: 'string' },
    authoring_agent: { type: 'string' },
    content_hash: { type: ['string', 'null'] },
    created_at: iso,
    review_state: { type: 'string', enum: ['unreviewed', 'approved', 'changes_requested'] },
    verification: { type: 'object' },
    sensitivity: { type: 'string', enum: SENSITIVITY },
    retention: { type: ['string', 'null'] },
  },
  additionalProperties: false,
};

export const reviewSchema = {
  $id: 'review',
  type: 'object',
  required: ['review_id', 'task_id', 'worker_agent', 'reviewer_agent', 'decision', 'created_at'],
  properties: {
    review_id: { type: 'string' },
    task_id: { type: 'string' },
    artifact_ids: strArray,
    worker_agent: { type: 'string' },
    reviewer_agent: { type: 'string' },
    criteria: strArray,
    findings: { type: 'array' },
    evidence: { type: 'array' },
    decision: { type: 'string', enum: REVIEW_DECISIONS },
    required_changes: strArray,
    created_at: iso,
  },
  additionalProperties: false,
};

export const agentManifestSchema = {
  $id: 'agent-manifest',
  type: 'object',
  required: ['id', 'name', 'role', 'department', 'purpose', 'status', 'risk_ceiling', 'default_model_profile'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string' },
    department: { type: 'string' },
    purpose: { type: 'string' },
    capabilities: strArray,
    non_capabilities: strArray,
    accepted_task_types: strArray,
    required_inputs: strArray,
    output_contract: { type: ['string', 'null'] },
    available_tools: strArray,
    tool_restrictions: strArray,
    memory_read_scopes: strArray,
    memory_write_scopes: strArray,
    risk_ceiling: { type: 'string', enum: RISK },
    allowed_model_profiles: { type: 'array', items: { type: 'string', enum: MODEL_PROFILES } },
    default_model_profile: { type: 'string', enum: MODEL_PROFILES },
    reviewer_roles: strArray,
    escalation_rules: strArray,
    source_provenance: {
      type: 'object',
      properties: {
        origin: { type: ['string', 'null'] },
        source_hash: { type: ['string', 'null'] },
        imported_prompt: { type: ['string', 'null'] },
      },
    },
    version: { type: 'string' },
    status: { type: 'string', enum: AGENT_STATUS },
  },
  additionalProperties: false,
};

export const handoffSchema = {
  $id: 'handoff',
  type: 'object',
  required: ['handoff_id', 'task_id', 'from_agent', 'to_agent', 'objective', 'status', 'summary', 'created_at'],
  properties: {
    handoff_id: { type: 'string' },
    task_id: { type: 'string' },
    from_agent: { type: 'string' },
    to_agent: { type: 'string' },
    objective: { type: 'string', minLength: 1 },
    status: { type: 'string', enum: HANDOFF_STATUS },
    summary: { type: 'string' },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['artifact', 'description'],
        properties: { artifact: { type: 'string' }, description: { type: 'string' } },
      },
    },
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['decision', 'reason'],
        properties: { decision: { type: 'string' }, reason: { type: 'string' }, evidence: strArray },
      },
    },
    assumptions: strArray,
    verification: {
      type: 'object',
      properties: {
        commands_or_checks: strArray,
        result: { type: 'string', enum: VERIFICATION_RESULT },
      },
    },
    risks: strArray,
    open_questions: strArray,
    recommended_next_action: { type: 'string' },
    created_at: iso,
  },
  additionalProperties: false,
};

export const routingDecisionSchema = {
  $id: 'routing-decision',
  type: 'object',
  required: ['task_id', 'selected_agent', 'selected_model_profile', 'decision_summary', 'created_at'],
  properties: {
    task_id: { type: 'string' },
    selected_agent: { type: 'string' },
    selected_model_profile: { type: 'string', enum: MODEL_PROFILES },
    constraints: strArray,
    alternatives_considered: { type: 'array' },
    decision_summary: { type: 'string' },
    policy_version: { type: 'string' },
    created_at: iso,
  },
  additionalProperties: false,
};

export const lessonSchema = {
  $id: 'lesson',
  type: 'object',
  required: ['id', 'trigger_conditions', 'prevention_instruction', 'status', 'created_at'],
  properties: {
    id: { type: 'string' },
    trigger_conditions: { type: 'string' },
    scopes: strArray,
    tags: strArray,
    prevention_instruction: { type: 'string' },
    enforcement_mechanism: { type: ['string', 'null'] },
    regression_check: { type: ['string', 'null'] },
    evidence: { type: 'array' },
    confidence: { type: 'string', enum: CONFIDENCE },
    status: { type: 'string', enum: LESSON_STATUS },
    supersedes: { type: ['string', 'null'] },
    last_verified: { type: ['string', 'null'] },
    owner: { type: ['string', 'null'] },
    task_type: { type: ['string', 'null'] },
    created_at: iso,
  },
  additionalProperties: false,
};

export const failureSchema = {
  $id: 'failure',
  type: 'object',
  required: ['id', 'symptom', 'created_at'],
  properties: {
    id: { type: 'string' },
    task_id: { type: ['string', 'null'] },
    run_id: { type: ['string', 'null'] },
    symptom: { type: 'string', minLength: 1 },
    impact: { type: ['string', 'null'] },
    evidence: { type: 'array' },
    root_cause_status: { type: 'string', enum: FAILURE_ROOT_CAUSE_STATUS },
    likely_root_cause: { type: ['string', 'null'] },
    contributing_factors: strArray,
    recurrent: { type: 'boolean' },
    containment: { type: ['string', 'null'] },
    proposed_prevention: { type: ['string', 'null'] },
    owner: { type: ['string', 'null'] },
    verification_state: { type: 'string', enum: VERIFICATION_RESULT },
    lesson_id: { type: ['string', 'null'] },
    created_at: iso,
  },
  additionalProperties: false,
};

export const SCHEMAS = {
  event: eventSchema,
  memory: memorySchema,
  task: taskSchema,
  artifact: artifactSchema,
  review: reviewSchema,
  'agent-manifest': agentManifestSchema,
  handoff: handoffSchema,
  'routing-decision': routingDecisionSchema,
  lesson: lessonSchema,
  failure: failureSchema,
};
