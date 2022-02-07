# Automations
Gathers GitHub actions used across the organization.

# Reusable Workflows

## Triage project automation

Newly opened or reopened issues are given the "To Triage" status on the Triage project board.
Items that are given a milestone are removed from the Triage project, and should be added to the appropriate work project in a separate workflow.

### Inputs

| Input                   | Description |
| ------------------ | ------------- |
| `resource-node-id` | The global node ID of the issue or PR (`github.event.issue.node_id`) |
| `event-action` | The action that triggered the workflow (`github.event.action`) |
| `labels` | A comma-separated list of the labels on the issue (`join(github.event.issue.labels.*.name, ', ')`) |

| Secrets                | Description |
| ------------------ | ------------- |
| `project-number`       | The Project Number from the project's url |
| `token`                | Github Access Token with `org:write` permission |

### Example calling workflow:

```yaml
name: Triage project automations

on:
  issues:
    types:
      - opened
      - reopened
      - milestoned
      - labeled
jobs:
  call-workflow:
    uses: EventStore/Automations/.github/workflows/triage-project-automation.yml@master
    with:
      resource-node-id: ${{ github.event.issue.node_id }}
      event-action: ${{ github.event.action }}
      labels: ${{ join(github.event.issue.labels.*.name, ', ') }}
    secrets:
      project-number: 1
      token: ${{ secrets.PERSONAL_ACCESS_TOKEN }}
```

## Development project automation

Issues that have been given a milestone are added to the Development project board, and should be removed from the Triage board in a separate workflow.
The issues are added without a status, so if they are already present on the Development board then they will remain in their current status. Otherwise they will be given the board's default status.

Pull requests that are opened or reopened are added to the project board. They are added to "In Progress" if they are still in draft, otherwise they are added to "Review/QA".
If the pull request is converted to draft or set to ready to review, then the status will be updated accordingly.

### Inputs

| Input                   | Description |
| ------------------ | ------------- |
| `resource-node-id` | The global node ID of the issue or PR (`github.event.issue.node_id`) |
| `event-action` | The action that triggered the workflow (`github.event.action`) |
| `event-name` | The name of the event that triggered the workflow (`github.event_name`) |

| Secrets                | Description |
| ------------------ | ------------- |
| `project-number`       | The Project Number from the project's url |
| `token`                | Github Access Token with `org:write` permission |

### Example calling workflow:

```yaml
name: Development project automations for pull requests

on:
  pull_request:
    types:
      - opened
      - reopened
      - converted_to_draft
      - ready_for_review

jobs:
  call-workflow:
    uses: EventStore/Automations/.github/workflows/development-project-automation.yml@master
    with:
      resource-node-id: ${{ github.event.pull_request.node_id }}
      event-action: ${{ github.event.action }}
      event-name: ${{ github.event_name }}
    secrets:
      project-number: 2
      token: ${{ secrets.PERSONAL_ACCESS_TOKEN }}
```

```yaml
name: Development project automations for issues

on:
  issues:
    types:
      - milestoned

jobs:
  call-workflow:
    uses: EventStore/Automations/.github/workflows/development-project-automation.yml@master
    with:
      resource-node-id: ${{ github.event.issue.node_id }}
      event-action: ${{ github.event.action }}
      event-name: ${{ github.event_name }}
    secrets:
      project-number: 2
      token: ${{ secrets.PERSONAL_ACCESS_TOKEN }}
```