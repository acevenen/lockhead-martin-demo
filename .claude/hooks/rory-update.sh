#!/usr/bin/env bash
# Rory daily-update trigger  (UserPromptSubmit hook)
#
# Fires when the owner addresses Rory (the assistant formerly named JARVIS) and
# asks for the update/status/brief for the day — e.g. "hey rory what's the
# update for today?" and natural variants. On a match it injects instructions
# telling Rory to read the state file, deliver the since-you-left brief, and
# propose today's tasks. On no match it stays silent (no context added).
#
# Test:   echo '{"prompt":"hey rory whats the update for today?"}' | bash .claude/hooks/rory-update.sh
set -euo pipefail

input="$(cat)"
prompt="$(printf '%s' "$input" | jq -r '.prompt // empty' 2>/dev/null || true)"
low="$(printf '%s' "$prompt" | tr '[:upper:]' '[:lower:]')"

# Require BOTH: the name "rory", and an update/status intent word. Requiring both
# keeps ordinary messages that merely mention Rory from triggering the brief.
if printf '%s' "$low" | grep -qE '\brory\b' \
   && printf '%s' "$low" | grep -qE "update|today|brief|daily|status|what.?s new|what have you|what did you|whats the|what is the|catch me up|recap|since (i|you) (left|last)"; then

  read -r -d '' ctx <<'CTX' || true
[Rory daily-update triggered by the owner's message]
Respond now as Rory (the assistant formerly named JARVIS). Do all of this, in order:
1. Read the state file — rory/state.json if it exists, otherwise jarvis/state.json (the rename may not have reached this branch yet). It is the single source of truth for priorities, tasks, roadblocks, demos, and agent status.
2. Deliver the since-you-left brief — crisp, spoken-style, no fluff: what was done since meta.updated (from brief.items), what is blocked (roadblocks), and what needs the owner's decision (roadblocks with needsUser:true — include your proposed answer for each).
3. Propose today's tasks — work the priorities top-down (Priority One first), turn them into a short concrete task list for today, and separate what you'll pick up autonomously from what needs the owner's go-ahead.
Keep it short and sign off as Rory. Do not fabricate progress — blocked is blocked.
CTX

  jq -n --arg ctx "$ctx" '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:$ctx}}'
fi

exit 0
