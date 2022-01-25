# Bulk add issues to project

Adds all open issues in the specified repo to a Github Beta Project board.

If the issue already exists on the project board, the status will remain unchanged.

Requires [nodejs](https://nodejs.org/en/).

## Usage

```
npm install
node index.js {github_token} {project_number} {repository} [{organization='EventStore'} {pageSize='100'} {startFrom=null}]
```

## Arguments

| Name | Description | Required |
|------|-------------|----------|
| github_token | Github Access Token with `org:write` permission | Y |
| project_number | The Project Number from the project's url | Y |
| repository | The repository containing the issues to add to the project | Y |
| organization | The organization that owns the repository. Defaults to `EventStore` | N |
| pageSize | The number of issues to page through at once. Defaults to `100` | N |
| startFrom | The `endCursor` of the previous page to continue on from. Defaults to the start of the repository issues | N |
