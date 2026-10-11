---
name: create-skil
description: "Use when: scaffolding a new Copilot skill for this repository, creating a reusable workflow under .github/skills, or documenting a repeatable process with a SKILL.md file."
---

# Create Skill

Use this skill to add a new project workflow that can be invoked later with a slash command.

## When to use

Use this when you need to:

- create a new reusable workflow for the repo
- package a repeatable task into a skill
- document the trigger conditions and steps for a team workflow
- add a new skill under `.github/skills/`

## Goal

Create a skill that is specific, discoverable, and easy to follow.

## Workflow

1. Choose a short, kebab-case skill name.
2. Create a directory at `.github/skills/<skill-name>/`.
3. Add a file named `SKILL.md` in that directory.
4. Add YAML frontmatter with:
   - `name: <skill-name>`
   - `description: "Use when: ..."`
5. Write a concise body with:
   - a title
   - a brief summary of the task
   - a `When to use` section
   - numbered steps or a workflow
   - expected outcome or validation
6. Keep the skill scoped to a specific workflow instead of broad project guidance.
7. Optionally add helper assets or templates in the same folder if the workflow needs them.

## GTD task list section

This is a good fit for GTD because it keeps work visible, reviewable, and actionable without mixing project planning with admin tasks.

Use a compact checklist style for the dashboard and a simple task block for notes or journals:

```md
## Tasks

- [ ] Draft launch checklist
  - Category: Planning
  - Owner: @me
  - Deadline: 2026-10-16 (default: 1 week)
  - Status: Next Action
  - Journal: [Journal entry](../journal/2026-10-09.md)
  - Subtasks:
    - Confirm scope
    - Review owners
    - Log blockers

- [ ] Fix login bug
  - Category: Product
  - Owner: @dev-team
  - Deadline: 2026-10-13
  - Status: Waiting
  - Journal: [Journal entry](../journal/2026-10-09.md)
  - Subtasks:
    - Reproduce
    - Add test
    - Ship patch

- [ ] Update onboarding docs
  - Category: Admin
  - Owner: @ops
  - Deadline: 2026-10-20
  - Status: Scheduled
  - Journal: [Journal entry](../journal/2026-10-09.md)
  - Subtasks:
    - Collect edits
    - Review draft
```

### Recommended fields

- Task: the concrete next action or outcome
- Category: e.g. Admin, Errands, Work, Health, Personal, Project
- Owner: assign a person or `@me`
- Deadline: default to 1 week from today if no date is specified
- Status: Next Action, Waiting, Scheduled, Someday, Done
- Journal: a link to the related journal entry or reflection
- Subtasks: quick break-down of steps required to complete the task

### GTD guidance

- Keep tasks small enough to complete in one focused session.
- Use categories to reduce cognitive load and improve triage.
- Prefer `Next Action` items that can be done immediately.
- Move blocked items to `Waiting` instead of leaving them vague.
- Keep a journal link so the task can be traced back to context or notes.
- Copy or reference the task into a daily journal when needed for follow-up or reflection.

## Template

```md
---
name: <skill-name>
description: "Use when: <specific task or trigger conditions>"
---

# <Skill Title>

## When to use

Use this when ...

## Workflow

1. ...
2. ...
3. ...

## Tasks

- [ ] <task title>
  - Category: <category>
  - Owner: <owner>
  - Deadline: <date> (default: 1 week)
  - Status: Next Action
  - Journal: [link](../journal/entry.md)
  - Subtasks:
    - ...

## Validation

- ...
```

## Validation checklist

Before finishing, confirm that:

- the skill lives under `.github/skills/<skill-name>/`
- the file is named `SKILL.md`
- the `description` includes trigger phrases that match the intended use case
- the instructions are specific and actionable
- the workflow is narrow enough to be reusable without loading unrelated context
