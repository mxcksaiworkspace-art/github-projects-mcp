# GitHub Projects MCP — Field & Grouping Structure

## How Collapsible Sections Work

GitHub Projects doesn't have explicit "sections" or "squads" as separate objects.
Instead, you create a **single-select field**, assign each issue to an option, then
set **Group by: [field name]** in any view. GitHub renders each option as a
collapsible group containing its issues.

---

## Creating a Grouping Field

```ts
createProjectV2Field(input: {
  projectId: $projectId
  name: "Workflow"           // visible group header in UI
  dataType: SINGLE_SELECT
  singleSelectOptions: [
    { name: "🔌 API Integration", color: BLUE,   description: "..." }
    { name: "🌐 Browser Automation", color: PURPLE, description: "..." }
    { name: "🏗️ Infrastructure",  color: GRAY,   description: "..." }
    { name: "🧪 Testing",          color: GREEN,  description: "..." }
  ]
})
```

**Rules:**
- Single-select fields must include at least one option at creation time
- Options cannot be added after creation via the API (use the UI for that)
- Valid colors: `RED`, `ORANGE`, `YELLOW`, `GREEN`, `BLUE`, `PURPLE`, `PINK`, `GRAY`

---

## Assigning Issues to a Group

```ts
updateProjectV2ItemFieldValue(input: {
  projectId: $projectId
  itemId: $itemId       // project item node ID (PVTI_...)
  fieldId: $fieldId     // field node ID (PVTSSF_...)
  value: { singleSelectOptionId: "41d0bcf5" }  // option node ID
})
```

---

## View Grouping (UI only — not settable via API)

Open the project → click the **⚙ sliders icon** next to the view name → **Group by** → select your field.

| View type | Effect of grouping |
|-----------|-------------------|
| Table     | Collapsible rows per group (like the YouTube example) |
| Board     | Each group becomes a column of cards |
| Roadmap   | Horizontal swim lanes per group |

Each saved view can group by a **different field**, so you can have:
- Table → Group by Workflow (squads)
- Board → Group by Status (kanban)
- Roadmap → Group by Priority (urgency lanes)

---

## Current Project Fields (AI Workspace Test Project)

| Field | Type | ID |
|-------|------|----|
| Title | TITLE | `PVTF_lAHOD6JMXs4BPfwEzg942Q0` |
| Status | SINGLE_SELECT | `PVTSSF_lAHOD6JMXs4BPfwEzg942Q8` |
| Priority | SINGLE_SELECT | `PVTSSF_lAHOD6JMXs4BPfwEzg95K2s` |
| Workflow | SINGLE_SELECT | `PVTSSF_lAHOD6JMXs4BPfwEzg95Nig` |
| Start Date | DATE | `PVTF_lAHOD6JMXs4BPfwEzg95Xwo` |
| Target Date | DATE | `PVTF_lAHOD6JMXs4BPfwEzg95Xws` |

### Status options
| Name | ID |
|------|----|
| 💡 Idea | `f5228ba4` |
| 📋 Todo | `f75ad846` |
| 🔄 In Progress | `47fc9ee4` |
| 🧪 Testing | `5a40fa22` |
| ✅ Done | `98236657` |
| Recall | `9de178be` |

### Priority options
| Name | ID |
|------|----|
| 🔴 Critical | `1aacdfa6` |
| 🟠 High | `ab851c2f` |
| 🟡 Medium | `9a5feb18` |
| 🟢 Low | `6a74064d` |

### Workflow options
| Name | ID |
|------|----|
| 🔌 API Integration | `41d0bcf5` |
| 🌐 Browser Automation | `cb7dffe4` |
| 🏗️ Infrastructure | `b2067197` |
| 🧪 Testing | `34976e8b` |

---

## Roadmap Date Fields

DATE fields drive the Gantt bars on the Roadmap view. Fields are set via API; the field-to-axis mapping is one-time UI config.

**Setting dates via API:**
```ts
updateProjectV2ItemFieldValue(input: {
  projectId: $projectId
  itemId: $itemId
  fieldId: "PVTF_lAHOD6JMXs4BPfwEzg95Xwo"  // Start Date
  value: { date: "2026-03-01" }              // YYYY-MM-DD
})
```

**One-time Roadmap view config (UI only):**
1. Open Roadmap view → click the sliders/settings icon on the view
2. Set **Start date** → `Start Date`
3. Set **Target date** → `Target Date`

---

## Milestones (Empty repo)

| # | Title | Due | Issues |
|---|-------|-----|--------|
| 1 | 🚀 Phase 1 — Core MCP | 2026-02-28 | #13, #16, #17, #20 |
| 2 | 🌐 Phase 2 — Browser & Automation | 2026-03-15 | #14, #15, #18, #19 |

---

## API Capability Matrix

| Feature | API support | Notes |
|---------|-------------|-------|
| Create/read fields | ✅ Full | All types incl. DATE, SINGLE_SELECT |
| Set field values | ✅ Full | Single-select, date, text, number |
| Add Status options | ❌ None | UI only — Status is a built-in field |
| Rename Status options | ❌ None | UI only |
| View renaming | ❌ None | `updateProjectV2View` doesn't exist in public API |
| Set "Group by" | ❌ None | UI only |
| Set Roadmap date fields | ❌ None | UI only (one-time) |
| Create/assign milestones | ✅ Full | REST API |
| Labels | ✅ Full | REST API |
| Assignees | ✅ Full | REST API (user must be repo collaborator) |
| Comments | ✅ Full | REST API |
| Create repo | ✅ Full | REST API |
| Delete project | ✅ Full | GraphQL |

---

## Project IDs

| Resource | ID |
|----------|----|
| Project | `PVT_kwHOD6JMXs4BPfwE` |
| Owner | `mxcksaiworkspace-art` |
| Repo for issues | `mxcksaiworkspace-art/Empty` |
