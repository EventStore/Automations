const core = require('@actions/core');
const github = require('@actions/github');

// We use octokit directly because the version that @actions/github is too old.
const { Octokit } = require('@octokit/rest');

const sections =
  [ 'Added'
  , 'Fixed'
  , 'Removed'
  , 'Changed'
  , 'Deprecated'
  , 'Security'
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

async function fetchChangedFiles(env) {
  const response = await env.octokit.pulls.listFiles({
    owner: env.owner,
    repo: env.repo,
    pull_number: env.pull_number,
  });

  return response.data.map(file => file.filename);
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

      var doLinting = true;
      const sourcePath = core.getInput('source-path');

      if (sourcePath != null) {
        const paths = await fetchChangedFiles(env);

        // If there is no change that targets 'sourcePath' path, we skip linting.
        doLinting = paths.some(path => path.startsWith(sourcePath))
      }

      if (doLinting) {
        await lintDescription(env, description);
        core.setOutput("skipped", "false");
      } else {
        core.setOutput("skipped", "true");
      }
    } else {
      core.setFailed(`pr-check only supports pull_request objects.`);
    }
  } catch (error) {
    core.setFailed(`An unexpected error happened: ${error.message}`);
  }
}

run();
