# Approval policy

The owner remains the final authority. The following require **explicit owner
approval** before an agent may act. When in doubt, treat it as requiring
approval.

## Always requires approval
- Purchases or any financial commitment.
- Sending email, messages, posts, invitations, or any external communication.
- Publishing or deploying anything publicly.
- Deleting material data.
- Rotating, exposing, or changing credentials.
- Accessing a new private account or data source.
- Installing a persistent system service.
- Changing permissions or security controls.
- Legal, medical, investment, employment, or contractual decisions.
- Any irreversible action.
- Changing the owner's durable identity, goals, boundaries, or high-level
  operating policies (these are governed as `restricted`/approval-required
  memory).
- Allowing an agent to approve its own high-risk work.

## Allowed without asking (routine, reversible, local)
- Edits inside this repository.
- Running tests and local checks.
- Local database migrations (the operational store).
- Writing local documentation and brain files that are not identity/goals/
  boundaries.

## How it is enforced
- Durable memory writes to identity, preferences, goals, constraints, or
  `restricted` sensitivity are held as proposals with `approval_required: true`
  and never auto-activate (`memory-policy.md`).
- High-risk task output cannot be self-approved (`review-policy.md`).
- Provider adapters for real models **fail closed** until explicitly configured;
  they never borrow interactive credentials.
- External/irreversible actions are surfaced as board "items requiring
  approval," not executed.
