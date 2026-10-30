---
name: git-commit-helper
description: Write clear commit messages from staged changes.
---

# Git commit helper

Run `git diff --staged` to read the staged changes, then draft a commit message in the conventional style:
a short summary line, a blank line, and a few bullet points explaining why the change was made.

Show the message to the user for approval. Never run `git commit` or `git push` without asking first.
