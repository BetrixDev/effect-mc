---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

If the user passes a ticket reference, fetch it from the issue tracker and state its title before starting. If the reference is ambiguous, ask.

Before changing files, check whether you started on a clean checkout of `main` or in a clean worktree (no uncommitted changes). If so, create a feature branch before implementing, and when the work is finished open a pull request for that branch using the `visual-pr` skill. If you are already on a task branch, or the checkout is not clean, stay on the current branch and only open a PR when the user asks.

Call the Skill tool with "tdd" where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, call the Skill tool with "code-review" to review the work.

After the implementation is finished, always spawn a subagent to review the change with the "thermo-nuclear-code-quality-review" skill. Implement the findings that hold up, re-run the relevant checks, and include those fixes in the same branch and pull request. Do not stop at reporting the review.

Commit your work to the current branch. If you opened a PR, push the branch as well.
