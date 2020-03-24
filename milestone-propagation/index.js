
const core = require('@actions/core');
const github = require('@actions/github');

// We use octokit directly because the version that @actions/github is too old and suffers from
// bug that prevents it from displaying private repositories.
const { Octokit } = require('@octokit/rest');

const supportedActions = ['created', 'edited'];

const debugFixtureRepos = [
  'Automation',
  'Administration',
  'Functions',
  'EventStoreDb-Enterprise',
  'EventStoreDb'
];

function isSupportedGitHubObject(payload) {
  return  payload.hasOwnProperty('milestone');
}

function milestoneTitlePredicate(payload) {
  if (payload.action == 'edited' && payload.changes.hasOwnProperty('title')) {
    return (milestone => milestone.title == payload.changes.title.from);
  }

  return (milestone => milestone.title == payload.milestone.title);
}

async function run() {
  try {
    const payload = github.context.payload;

    if (isSupportedGitHubObject(payload)) {
      const selfRepoName = payload.repository.name;
      const auth = core.getInput('github-token');
      const octokit = new Octokit({
        auth
      });

      const options = octokit.repos.listForAuthenticatedUser.endpoint.merge({
        visibility: 'private',
        affiliation: 'owner'
      });

      for await (const response of octokit.paginate.iterator(options)) {
        for (const idx in response.data) {
          const repo = response.data[idx];

          if (repo.name != selfRepoName && debugFixtureRepos.includes(repo.name)) {
            const milestoneOptions = octokit.issues.listMilestonesForRepo.endpoint.merge({
              owner: payload.repository.owner.login,
              repo: repo.name
            });

            var milestoneClone = null;

            for await (const batch of octokit.paginate.iterator(milestoneOptions)) {
              // The only way for detecting if a milestone exits.
              milestoneClone = batch.data.find(milestoneTitlePredicate(payload));

              if (milestoneClone != null)
                break;
            }

            if (milestoneClone == null) {
              var params = {
                owner: payload.repository.owner.login,
                repo: repo.name,
                title: payload.milestone.title,
                state: 'open',
                description: payload.milestone.description,
              };

              if (payload.milestone.due_on != null) {
                params['due_on'] = payload.milestone.due_on;
              }

              await octokit.issues.createMilestone(params);
            } else {
              // We can't update the title because milestone cannot be uniquely identified across an organization
              // nor a user github account.
              var params = {
                owner: payload.repository.owner.login,
                repo: repo.name,
                milestone_number: milestoneClone.number,
                title: payload.milestone.title,
                description: payload.milestone.description,
              };

              if (payload.milestone.due_on != null) {
                params['due_on'] = payload.milestone.due_on;
              }

              await octokit.issues.updateMilestone(params);
            }
          }
        };
      }
    } else {
      core.setFailed(`milestone-propagation only supports milestones.`);
    }
  } catch (error) {
    core.setFailed(`An unexpected error happened: ${error.message}`);
  }
}

run();
