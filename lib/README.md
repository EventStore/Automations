# Utilities for custom GitHub actions

This lib provides the set of utilities that can be reused in the custom GitHub Actions.

## Available helpers

1. `getLastCommitInBranch` - gets the last commit in the specified branch.
2. `createNewBranch` - creates new branch in the specified repository.
3. `getCommitsInPullRequest` - gets all commits from the pull request.
4. `cherryPick` - cherry picks set of commits to the target branch.
5. `createPullRequest` - creates the pull request.
6. `getPullRequest` - gets pull request between selected branches with the specific status (e.g. `open`).
7. `commentOnPR` - adds review comment to specific pull request.

Check more in [index.js](./index.js).

## Sample usage

```javascript
const {
  getLastCommitInBranch,
  createNewBranch,
  getCommitsInPullRequest,
  cherryPick,
  createPullRequest,
  commentOnPR,
} = require("../lib");
```