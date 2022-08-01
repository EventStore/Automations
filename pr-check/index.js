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
    const accepted = sections.map(sect => `- ${sect}:`).join('\n');
    const body = `Pull request description doesn't meet requirements:\n\n${message}\n\nPlease ensure your PR description starts with one of the following sections, followed by a brief note for the changelog and a newline:\n\n${accepted}`;

    core.setFailed(body);
  }
}

async function lintDescription(env, content) {
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

  await reportValidationStatus(env, state);
}

async function fetchChangedFiles(env) {
  const response = await env.octokit.pulls.listFiles({
    owner: env.owner,
    repo: env.repo,
    pull_number: env.pull_number,
  });

  return response.data.map(file => file.filename);
}

const parseStringOrStringList = (json) => {
  if (!json)
    return [];

  if (!json.includes('"') || !json.includes("'") || !json.includes(']') || !json.includes('['))
    return [json];

  let result = null;

  try {
    result = JSON.parse(json);

    const type = typeof result;

    if (type !== "string" && type !== "object") // hard to know if it is a list but whatever.
      core.setFailed(`Not supported type: ${type}`);

    if (type === "string")
      return [result];

    return result;
  } catch (e) {
    core.setFailed(`Failed to parse JSON: ${e}`);
  }
};

const isCandidateToLinting = (includes, excludes) => {
  return (path) => {
    const isTarget = includes.length !== 0 ? includes.some(target => path.match(new RegExp(target))) : true;
    const isExcluded = excludes.length !== 0 ? excludes.some(target => path.match(new RegExp(target))) : false;

    return isTarget && !isExcluded;
  };
};

async function run() {
  try {
    const payload = github.context.payload;
    const includeParams = core.getInput("include") || core.getInput("source-path") || null;
    const excludeParams = core.getInput("exclude") || null;
    core.debug("Parse include parameter…");
    const includeList = parseStringOrStringList(includeParams);
    core.debug("Parse exclude parameter…");
    const excludeList = parseStringOrStringList(excludeParams);
    core.debug("Complete");

    if (payload.hasOwnProperty('pull_request')) {
      const description = payload.pull_request.body.replace(/\r\n/g, '\n');
      const env = {
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        pull_number: payload.pull_request.number,
        octokit: new Octokit(),
      };

      const paths = await fetchChangedFiles(env);
      const doLinting = paths.some(isCandidateToLinting(includeList, excludeList));

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
