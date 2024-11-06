// This Github actions aims at supporting `keepachangelog` changelog format based
// on a list of changes specified in a pull request description.
// More info: https://keepachangelog.com/en/1.0.0/.
//
// This Github action will update the changelog automatically and push the changes on
// the repository afterward.
import * as core from '@actions/core';
import * as github from '@actions/github';
import { Base64 } from 'js-base64';

// We use octokit directly because the version that @actions/github is too old.
import { Octokit } from '@octokit/rest';
const auth = core.getInput('github-token');
const octokit = new Octokit({
  auth: auth,
  log: {
    warn: console.warn,
    error: console.error
  }
});

const onSpotMode = 'on-spot';
const batchMode = 'batch';
const mode = core.getInput('mode') || onSpotMode;

// Takes a pull request description and returns a list of changelog lines. If there is
// a double linebreak in the description, the function keeps the part preceeding the
// double linebreak while the remaining text is ignored.
function tokenizeChanges(changesString) {
  const end = changesString.indexOf('\n\n');
  let target;

  core.debug(`>>> ChangesString: ${changesString}`);
  core.debug(`>>> end: ${end}`);

  if (end === -1) {
    target = changesString;
  } else {
    target = changesString.substring(0, end);
  }

  return target.split('\n');
}

// Takes a changelog line breaks it into a section name and a message.
// A changelog uses the following template: {section_name}: *{message} *\n
// Example:
// Added: Implement an amazing feature.
function tokenizeChangelog(string) {
  const colonIdx = string.indexOf(':');
  const section = string.substring(0, colonIdx).trim();
  const message = string.substring(colonIdx + 1).trim();

  return {
    section,
    message
  };
}

// Looks for a 'big' part in the changelog. If you pass the name 'Unreleased', that
// function will look for the '## [Unreleased]' 'big' part.
function findBigPart(content, name) {
  const qualifiedName = `## [${name}]`;
  const start = content.indexOf(qualifiedName);

  if (start === -1)
    return null;

  var end = content.indexOf('## [', start + qualifiedName.length);

  if (end === -1)
    end = content.length - 1;

  return {
    name,
    start,
    end,
  };
}

// Given a text and a section name, returns a record comprised of
// the beginning of a section and where it ends. If a section is named Foo for example,
// its starting point would be where we can locate `### Foo`. The section's end would be
// when we find a double linebreak. It returns `null` if the section doesn't exist.
function findSection(part, content, name) {
  const qualifiedName = `### ${name}`;
  const start = content.indexOf(qualifiedName, part.start);

  if (start === -1 || start > part.end)
    return null;

  var end = content.indexOf('\n\n', start + qualifiedName.length);

  if (end === -1 || end > part.end)
    end = part.end;

  return {
    name,
    start,
    end,
  };
}

function createSection(sectionName) {
  return `### ${sectionName}`;
}

// Given a previous changelog text and a change list, returns a new changelog with all
// changes assigned to their sections.
function applyChangelog(part, content, changes) {
  changes.forEach(change => {
    const token = tokenizeChangelog(change);
    let section = findSection(part, content, token.section);
    let textToInsert;

    if (section == null) {
      content = insertTextAt(content, `${createSection(token.section)}`, part);
      part = findBigPart(content, part.name);
      section = findSection(part, content, token.section);
      textToInsert = `\n- ${token.message}\n\n`;
    } else {
      textToInsert = `\n- ${token.message}`;
    }

    content = insertTextAt(content, textToInsert, section);
    part = findBigPart(content, part.name);
  });

  return content;
}

// Inserts a text in the right section of a previous changelog text.
function insertTextAt(content, text, section) {
  var tmp = [
    content.slice(0, section.end),
    text,
    content.slice(section.end)
  ];

  return tmp.join('');
}

function isSupportedGitHubObject(payload) {
  return  payload.hasOwnProperty('pull_request');
}

// Entrypoint of the changelog manipulation. We extract the description out of the pull request,
// perform some text transformation on the description itself, then proceed updating the
// changelog accordingly.
function getChangelogContent(previousChangelog, params) {
  const changes = tokenizeChanges(params.body.replace(/\r\n/g, '\n')).map(line => {
    return `${line} [${params.repo}#${params.number}](${params.link})`;
  });

  const unreleasedPart = findBigPart(previousChangelog, 'Unreleased');

  return applyChangelog(unreleasedPart, previousChangelog, changes);
}

/// When there is no changelog, we create a new one with this text.
function initChangelog() {
  return `# Changelog
All notable changes to this project will be documented in this files.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

`;
}

const belongsToSameDay = (refDate, targetDate) => {
  return refDate.getUTCDate() === targetDate.getUTCDate() && refDate.getUTCFullYear() === targetDate.getUTCFullYear() && refDate.getUTCMonth() === targetDate.getUTCMonth();
};

const fetchPullRequestsOfTheDay = async (owner, repo, offset) => {
  let page = 1;
  let targetedPulls = [];
  let lastUpdateDate = null;

  while (true) {
    const response = await octokit.pulls.list({
      owner,
      repo,
      state: "closed",
      sort: "updated",
      direction: "desc",
      page,
    });

    response.data.forEach(pull => {
      if (pull.merged_at) {
        const updatedAt = new Date(pull.updated_at);
        const mergedAt = new Date(pull.merged_at);

        if (belongsToSameDay(offset, mergedAt)) {
          targetedPulls.push(pull);
        }

        lastUpdateDate = updatedAt;
      }
    });

    if (!lastUpdateDate || lastUpdateDate < offset)
      break;

    lastUpdateDate = null;
    page += 1;
  }

  return targetedPulls;
};

// Fetches the content of the changelog (if any) from the main branch.
// It's fine because our github action is supposed to be the only one updating
// that file.
const getCurrentChangelogText = async (owner, repo) => {
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path: "CHANGELOG.md",
    });

    return Base64.decode(response.data.content);
  } catch (error) {
    if (error.status === 404) {
      return null;
    } else {
      core.setFailed(`Unexpected error happened when listing CHANGELOG.md file: ${JSON.stringify(error, undefined, 4)}`);
    }
  }
};

const validPullRequest = (pull) => {
  if (pull.body == null)
    return false;

  const changes = tokenizeChanges(pull.body.replace(/\r\n/g, '\n'));

  core.debug(`>>> Changes: ${changes}`);

  return changes.every(line => {
    if (line.trim() === "")
      return false;

    core.debug(`>>> Line: ${line}`);

    const token = tokenizeChangelog(line);

    core.debug(`>>> Token: ${JSON.stringify(token)}`);

    return token.section !== "" && token.message !== "";
  });
};

async function run() {
  try {
    const payload = github.context.payload;
    const skipped = core.getInput('skipped') || 'false';
    const owner = core.getInput("owner") || payload.repository.owner.login;
    const repo = core.getInput("repo") || payload.repository.name;
    const startDate = core.getInput("start-date") || "";
    const endDate = core.getInput("end-date") || "";
    const dryRun = core.getInput("dry-run") || false;

    core.debug(`Get ${owner}/${repo} default branch...`);
    const default_branch = (await octokit.repos.get({
      owner,
      repo
    })).data.default_branch;
    core.debug(`Default branch: ${default_branch}`);

    core.debug(`Skipped: [${skipped}], Owner: [${owner}], Repo: [${repo}], Mode: [${mode}]`);

    if (skipped === 'true')
      return;

    core.debug("Before validation…");
    // Mode validation.
    if (mode === onSpotMode) {
      if (!isSupportedGitHubObject(payload))
        core.setFailed('changelog-update only supports pull requests on on-spot mode.');

      if (!payload.pull_request.merged)
        core.setFailed("changelog-update requires a merged pull request on on-spot mode.");
    }
    // End validation.
    core.debug("Complete…");
    core.debug("Before getCurrentChangelogText…");
    let changelog = await getCurrentChangelogText(owner, repo);
    core.debug("Complete");

    if (!changelog) {
      changelog = initChangelog();
      core.debug("CHANGELOG.md doesn’t exist. Created.");
    }

    let content = null;
    let base_tree = null;
    let commit_sha = null;

    if (mode === onSpotMode) {
      const params = {
        repo,
        title: payload.pull_request.title,
        link: payload.pull_request._links.html.href,
        number: payload.pull_request.number,
        body: payload.pull_request.body,
      };

      content = getChangelogContent(changelog, params);

      commit_sha = payload.pull_request.merge_commit_sha;
      const response = await octokit.git.getCommit({
        owner,
        repo,
        commit_sha
      });

      base_tree = response.data.tree.sha;
    } else if (mode === batchMode) {
      let pulls = [];
      core.debug("Running in batch mode");
      if (startDate === "") {
        core.debug("startDate was not provided. Only dealing with pull requests from the day before today");
        let offset = new Date();
        offset.setUTCDate(offset.getUTCDate() - 1);

        core.debug("Before fetchPullRequestsOfTheDay…");
        pulls = await fetchPullRequestsOfTheDay(owner, repo, offset);
        core.debug("Completed");
      } else {
        core.debug("startDate was provided. Parsing start and end dates");
        let start = new Date(startDate);
        if (isNaN(start.getTime())) {
          core.setFailed("startDate input is an invalid date. Please provide the startDate in the format YYYY-MM-dd");
        }
        core.debug(`start date set to ${start}`);

        let end = new Date();
        if (endDate !== "") {
          end = new Date(endDate);
          if (isNaN(end.getTime())) {
            core.setFailed("endDate input is an invalid date. Please provide the endDate in the format YYYY-MM-dd");
          }
        }
        core.debug(`end date set to ${end}`);
        core.info(`Creating changelog for pull requests from ${start.getUTCFullYear()}-${start.getUTCMonth()+1}-${start.getUTCDate()} to ${end.getUTCFullYear()}-${end.getUTCMonth()+1}-${end.getUTCDate()}`);
        let offset = end;
        // Gather the pull requests day by day until we reach the start date
        while (true) {
          core.debug(`Before fetchPullRequestsOfTheDay. Offset is ${offset.getUTCFullYear()}-${offset.getUTCMonth()+1}-${offset.getUTCDate()}`);
          pulls = pulls.concat(await fetchPullRequestsOfTheDay(owner, repo, offset));
          core.debug("Completed");
          offset.setUTCDate(offset.getUTCDate() - 1);
          if (offset < start && !belongsToSameDay(start, offset)) {
            core.debug("Finished collecting pull requests for the time period");
            break;
          }
        }
      }

      core.debug("Gathering pull requests…");
      let input = pulls.flatMap(pull => {
        core.debug(`>>>Dealing with #${pull.number}`);
        // core.debug(`${JSON.stringify(pull, null, 4)}`);
        // Because it is possible for a pull request check to be skipped by `pr-check` action (for example, if the PR
        // doesn’t change anything under `src` directory), we got to filter those skipped pull requests out in batch
        // mode.
        if (!validPullRequest(pull)) {
          core.info(`Pull request #${pull.number} was skipped`);
          return [];
        }

        return [{
          repo,
          title: pull.title,
          link: pull._links.html.href,
          number: pull.number,
          body: pull.body,
        }];
      });
      core.debug("Completed");

      if (input.length === 0) {
        core.info(`No pull request found for ${offset.getUTCFullYear()}-${offset.getUTCMonth()}-${offset.getUTCDate()} day`);
        return;
      }

      core.debug("Batch mode: folding pull requests into a changelog…");
      content = input.reduce(getChangelogContent, changelog);
      core.debug("Completed");
      core.debug(`Batch mode: get ${default_branch} ref...`);
      let response = await octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${default_branch}`,
      });
      core.debug("Completed");
      core.debug(`Batch mode: get ${default_branch} ref commit...`);
      commit_sha = response.data.object.sha;
      response = await octokit.git.getCommit({
        owner,
        repo,
        commit_sha
      });
      base_tree = response.data.tree.sha;
      core.debug("Completed");
    } else {
      core.setFailed(`Unsupported mode: ${mode}`);
    }

    if (dryRun) {
      core.info("DryRun was specified. The changelog will not be updated.");
      core.info(`Changelog update would be made with base tree: '${base_tree}', parent commit: '${commit_sha}', branch: '${default_branch}'`);
      core.info("Changelog update contents: ");
      core.info(content);
      core.info("Exiting...");
      return;
    }

    core.debug("Create a new git tree…");
    const treeResponse = await octokit.git.createTree({
      owner,
      repo,
      base_tree,
      tree: [
        {
          path: 'CHANGELOG.md',
          mode: '100644',
          type: 'blob',
          content,
        }
      ]
    });

    const newTreeSha = treeResponse.data.sha;
    core.debug("Completed");
    core.debug("Create commit…");
    const createCommitResponse = await octokit.git.createCommit({
      owner,
      repo,
      message: 'Update CHANGELOG.md',
      tree: newTreeSha,
      parents: [commit_sha]
    });

    const newCommitSha = createCommitResponse.data.sha;
    core.debug("Completed");

    core.debug(`Update ${default_branch} ref...`);
    await octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${default_branch}`,
      sha: newCommitSha
    });
    core.debug("Completed");
  } catch (error) {
    core.setFailed(`An unexpected error happened: ${JSON.stringify(error, undefined, 4)}`);
  }
}


run();