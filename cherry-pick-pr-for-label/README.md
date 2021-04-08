# Cherry-pick Pull Request's commits for selected labels

Action aim is to help to synchronise changes between multiple branches. You can use it to copy changes to the different release branches automatically, e.g. update the documentation changes for various database versions.

Action cherry-picks the commits from merged PR. Cherry-pick is done based on the labels(_**Note**: labels can be set only by repository contributors._). If merged PR has the labels with format `cherry-pick:{target_branch}` (e.g. `cherry-pick:release/oss-v20.10`) then for each label it will create the follow up pull request. It will do that doing following steps:

1. Create a new branch with the format `cherry-pick/${pull_request_number}/${pull_request_source_branch}-${target_branch}` (e.g. `cherry-pick/16/docs_update-release/oss-v20.10`). Parameter `target_branch` will be taken from the label suffix. If a branch already exists, it will be reused (no new branch will be created).
2. Cherry-pick commits from the pull request to the newly created branch. If the action was run multiple times (e.g. someone closed and reopened a pull request), cherry-pick would be made more than once.
3. Create a pull request from the newly created branch to the target branch (taken from the label suffix). If such PR already exists, it will be reused.

Action will inform about success or failure via the review comments to the initial pull request tagging the person that merged the pull request. It's recommended to monitor those notifications and make sure that cherry-picks succeeded.

## Usage

``` yaml
name: Cherry Pick commits for merged PR
on:
  pull_request_target:
    types: [closed]
jobs:
  cherry_pick:
    if: github.event.pull_request.merged == 'true'
    name: Cherry Pick PR for label
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Cherry Pick PR for label
        uses: EventStore/Automations/cherry-pick-pr-for-label@master
        with:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

As Pull Request can also be made from repository fork, it's suggested to use [`pull_request_target`](https://github.blog/2020-08-03-github-actions-improvements-for-fork-and-pull-request-workflows/) trigger. It behaves in an almost identical way to the `pull_request` event with the same set of filters and payload. However, instead of running against the workflow and code from the merge commit, the event runs against the workflow and code from the base of the pull request.  

It's needed to pass the `GITHUB_TOKEN` input. It's recommended to use the built-in `secrets.GITHUB_TOKEN`. Having that action will use the permissions from the person that merged the PR. You can also use the custom PAT (Personal Access Token). It needs write permissions to the repository to be able to create a new branch and pull request.

To run action only for merged pull request add `if: github.event.pull_request.merged == 'true'` to the job definition.

## Known limitations

Action is using the forked version of the [github-cherry-pick](https://github.com/tibdex/github-cherry-pick/) for cherry-picking commits between branches. **Thus, it's recommended to rebase instead of merging while updating the feature branch changes from the source branch**. If there is a *merge commit* then cherry-pick will fail. It will also fail if there is a conflict with the target branch (so `target_branch` from label suffix).

If those cases happen then, it's needed to do manual cherry-picks. 
