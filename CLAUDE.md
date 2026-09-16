# CLAUDE.md

@AGENTS.md

## Claude Code specifics

- Use plan mode for any task that touches a protected path (AGENTS.md section 6) or the on-disk format. Present the plan before editing.
- Before finishing a task, run `pnpm check` and the suites named in the task's gate tests, and report their results in your final message.
- When a command fails, read the full output and fix the cause. Do not retry the same command unchanged or silence the failure.
- Check library APIs against the installed versions in `node_modules` type definitions or `cargo doc`, not memory.
- If you cannot complete a task within these rules, stop and explain what is blocking you.
