const core = require('@actions/core');
const github = require('@actions/github');
const supportedActions = ['opened', 'edited'];
const supportedObjects = ['issue', 'pull_request'];

function isSupportedGitHubObject(payload) {
  return supportedObjects.some(obj => payload.hasOwnProperty(obj));
}

// Pull Requests are the same as Issues (The opposite isn't true though).
function getIssueNumber(payload) {
  if (payload.hasOwnProperty('issue'))
    return payload.issue.number;

  if (payload.hasOwnProperty('pull_request'))
    return payload.pull_request.number;
}

async function run() {
  try {
    const payload = github.context.payload;

    if (isSupportedGitHubObject(payload)) {
      const projectName = payload.repository.name;

      if (supportedActions.includes(payload.action)) {
        const githubToken = core.getInput('github-token');
        const octokit = new github.GitHub(githubToken);
        const issueNumber = getIssueNumber(payload);

        await octokit.issues.addLabels({
          owner: payload.repository.owner.login,
          repo: projectName,
          issue_number: issueNumber,
          labels: [projectName.toLowerCase()]
        });
      } else {
        core.setFailed(`apply-label only supports ${supportedObjects} statuses.`);
      }
    } else {
      core.setFailed(`apply-label only supports ${supportedObjects} objects.`);
    }
  } catch (error) {
    core.setFailed(`An unexpected error happened: ${error.message}`);
  }
}

run();
