const core = require("@actions/core");
const github = require("@actions/github");
const util = require("util");

const {
  getLastCommitInBranch,
  createNewBranch,
  getCommitsInPullRequest,
  cherryPick,
  createPullRequest,
  commentOnPR,
} = require("../lib");

const CHERRY_PICK_LABEL = "cherry-pick";

function getTargetBranchesFromLabels(pullRequest) {
  return pullRequest.labels
    .filter((label) => label.name.startsWith(CHERRY_PICK_LABEL))
    .map((label) => label.name.split(":")[1])
    .filter((label) => !!label);
}

async function createPullRequestWithCherryPick(
  octokit,
  { repo, owner, sourceOwner, targetBranch, pullRequest, actor, actionRunId }
) {
  try {
    const targetSha = await getLastCommitInBranch(octokit, {
      repo,
      owner,
      branchName: targetBranch,
    });

    const newBranchName = `cherry-pick/${pullRequest.number}/${pullRequest.head.ref}-${targetBranch}`;

    await createNewBranch(octokit, {
      repo,
      owner,
      branchName: newBranchName,
      targetSha,
    });

    const commits = await getCommitsInPullRequest(octokit, {
      repo,
      owner,
      pullRequestNumber: pullRequest.number,
    });

    await cherryPick(octokit, {
      repo,
      owner,
      sourceOwner,
      commits,
      branchName: newBranchName,
    });

    const newTitle = `[${targetBranch}] ${pullRequest.title}`;
    const body = `Cherry picked from https://github.com/${sourceOwner}/${repo}/pull/${pullRequest.number}`;

    const { url: newPullRequestUrl } = await createPullRequest(octokit, {
      repo,
      owner,
      sourceOwner,
      title: newTitle,
      branchName: newBranchName,
      base: targetBranch,
      body,
    });

    await commentOnPR(octokit, {
      repo,
      owner,
      pullRequestNumber: pullRequest.number,
      body: `@${actor} 👉 Created pull request targeting ${targetBranch}: ${newPullRequestUrl}`,
    });

    return true;
  } catch (ex) {
    const errorMessage = `Failed to create cherry Pick PR due to error:\n \`\`\`\n${util.inspect(
      ex
    )}\n\`\`\``;
    console.error(errorMessage);

    await commentOnPR(octokit, {
      repo,
      owner,
      pullRequestNumber: pullRequest.number,
      body: `🚨 @${actor} ${errorMessage}\n\n🚨👉 Check https://github.com/${owner}/${repo}/actions/runs/${actionRunId}`,
    });
    return false;
  }
}

async function run() {
  try {
    const octokit = github.getOctokit(core.getInput("GITHUB_TOKEN"));

    const {
      actor,
      runId: actionRunId,
      payload: { pull_request: pullRequest },
    } = github.context;

    const {
      base: {
        repo: {
          name: repo,
          owner: { login: owner },
        },
      },
      head: {
        repo: {
          owner: { login: sourceOwner },
        },
      },
    } = pullRequest;

    const targetBranches = getTargetBranchesFromLabels(pullRequest);

    if (targetBranches.length === 0) {
      console.log(
        `Skipping: No cherry pick labels (starting with '${CHERRY_PICK_LABEL}:').`
      );
      return;
    }

    let anyCherryPickFailed = false;

    for (const targetBranch of targetBranches) {
      const isCreated = await createPullRequestWithCherryPick(octokit, {
        repo,
        owner,
        sourceOwner,
        targetBranch,
        pullRequest,
        actor,
        actionRunId,
      });

      if (!isCreated) {
        anyCherryPickFailed = true;
      }
    }
    if (anyCherryPickFailed) {
      core.setFailed(
        "Failed to create one of the cherry Pick PRs. Check the details above."
      );
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
