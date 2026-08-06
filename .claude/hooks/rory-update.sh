#!/usr/bin/env bash
# Rory daily-update trigger  (UserPromptSubmit hook)
#
# Fires when the OWNER directly asks Rory (the assistant formerly named JARVIS)
# for the day's update/brief — e.g. "hey rory what's the update for today?" and
# natural variants. It injects instructions for Rory to read the state file,
# deliver the since-you-left brief, and propose today's tasks. Otherwise silent.
#
# Guarded against false positives: fires only when the message EITHER opens by
# addressing Rory, OR is a SHORT message that names Rory + an update word. Long
# messages that merely discuss Rory/updates (e.g. an automated PR check-in that
# names "Rory" and "update") do NOT trigger it.
#
# Test:  echo '{"prompt":"hey rory whats the update for today?"}' | bash .claude/hooks/rory-update.sh
set -euo pipefail

input="$(cat)"
prompt="$(printf '%s' "$input" | jq -r '.prompt // empty' 2>/dev/null || true)"
low="$(printf '%s' "$prompt" | tr '[:upper:]' '[:lower:]')"

intent_re="update|today|brief|daily|status|what.?s new|what have you|what did you|whats the|what is the|catch me up|recap|since (i|you) (left|last)"

has_intent=0; if printf '%s' "$low" | grep -qE "$intent_re"; then has_intent=1; fi
has_rory=0;   if printf '%s' "$low" | grep -qE '\brory\b'; then has_rory=1; fi
addressed=0;  if printf '%s' "$low" | grep -qE '^[[:space:]]*(hey|hi|ok|okay|yo)?[[:space:],]*rory\b'; then addressed=1; fi
short=0;      if [ "${#prompt}" -le 240 ]; then short=1; fi

# A real request either addresses Rory up front, or is a short Rory + update ask.
if [ "$has_intent" = 1 ] && { [ "$addressed" = 1 ] || { [ "$has_rory" = 1 ] && [ "$short" = 1 ]; }; }; then
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
