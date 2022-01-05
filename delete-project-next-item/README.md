# Delete Project Next Item

Automation to remove items from Github beta projects.

## Inputs

| Input              | Description |
| ------------------ | ----------- |
| `github-token`     | Github Access Token with `org:write` permission |
| `organization`     | Organization for the project |
| `project-number`       | The Project Number from the project's url |
| `resource-node-id` | The global node ID of the issue or PR |

## Usage

Example usage to remove an issue from the board if a milestone is added to it:

```yaml
name: Project automation
on:
  issues:
    types:
      - milestoned
jobs:
  remove-milestoned-item:
    name: Remove milestoned item
    runs-on: ubuntu-latest
    steps:
      - name: 'Remove issue from project'
        uses: EventStore/Automations/delete-project-next-item@master
        with:
          github-token: ${{ secrets.PERSONAL_ACCESS_TOKEN }}
          organization: EventStore
          project-number: 1
          resource-node-id: ${{ github.event.issue.node_id }}
```