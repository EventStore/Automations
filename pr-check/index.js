const core = require('@actions/core');
const github = require('@actions/github');

// We use octokit directly because the version that @actions/github is too old.
const { Octokit } = require('@octokit/rest');

const sections =
  [ 'Added'
  , 'Fixed'
  , 'Removed'
  , 'Updated'
  ];

function tokenizeChangelog(string) {
  const colonIdx = string.indexOf(':');
  const section = string.substring(0, colonIdx).trim();
  const message = string.substring(colonIdx + 1).trim();

  return {
    section,
    message
  };
}

function tokenizeChanges(changesString) {
  const end = changesString.indexOf('\n\n');
  var target;

  if (end === -1) {
    target = changesString.trim();
  } else {
    target = changesString.substring(0, end);
  }

  return target.split('\n');
}

function validateChangelogToken(state, token) {
  if (token.section === '') {
    state.errors.push("A section was found with an empty section name");
  } else if (!sections.includes(token.section)) {
    state.errors.push(`Unsupported changelog section: [${token.section}]`);
  }

  if (token.message === '') {
    state.errors.push("Changelog line was found with an empty message");
  }
}

function initValidationState() {
  return {
    errors: [],
  };
}

async function reportValidationStatus(env, state) {
  if (state.errors.length > 0) {
    const message = state.errors.map(line => `- ${line}`).join('\n');
    const body = `Pull request description doesn't meet requirements:\n\n${message}`;

    await env.octokit.pulls.createReview({
      owner: env.owner,
      repo: env.repo,
      pull_number: env.pull_number,
      event: 'REQUEST_CHANGES',
      body,
    });
  }
}

function lintDescription(env, content) {
  var state = initValidationState();
  const changes = tokenizeChanges(content);

  if (changes.every(line => line.trim() === '')) {
    state.errors.push(`No change text detected`);
  } else {
    changes.forEach(line => {
      const token = tokenizeChangelog(line);

      validateChangelogToken(state, token);
    });
  }

  reportValidationStatus(env, state);
}
async function run() {
  try {
    const payload = github.context.payload;

    if (payload.hasOwnProperty('pull_request')) {
      const projectName = payload.repository.name;
      const description = payload.pull_request.body.replace(/\r\n/g, '\n');
      const env = {
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        pull_number: payload.pull_request.number,
        octokit: new Octokit({
          auth: core.getInput('github-token')
        }),
      };

      await lintDescription(env, description);
    } else {
      core.setFailed(`pr-check only supports pull_request objects.`);
    }
  } catch (error) {
    core.setFailed(`An unexpected error happened: ${error.message}`);
  }
}

run();
