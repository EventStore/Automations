// This Github actions aims at supporting `keepachangelog` changelog format based
// on a list of changes specified in a pull request description.
// More info: https://keepachangelog.com/en/1.0.0/.
//
// This Github action will update the changelog automatically and push the changes on
// the repository afterward.
const core = require('@actions/core');
const github = require('@actions/github');
const { Base64 } = require('js-base64');

// We use octokit directly because the version that @actions/github is too old.
const { Octokit } = require('@octokit/rest');

// Takes a pull request description and returns a list of changelog lines. If there is
// a double linebreak in the description, the function keeps the part preceeding the
// double linebreak while the remaining text is ignored.
function tokenizeChanges(changesString) {
  const end = changesString.indexOf('\n\n');
  var target;

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
    end = part.end

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
    var section = findSection(part, content, token.section);
    var textToInsert = "";

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
function getChangelogContent(previousChangelog, payload) {
  const repo = payload.repository.name;
  const title = payload.pull_request.title;
  const link = payload.pull_request._links.html.href;
  const number = payload.pull_request.number;
  const changes = tokenizeChanges(payload.pull_request.body.replace(/\r\n/g, '\n')).map(line => {
    return `${line} [${repo}#${number}](${link})`;
  });

  const unreleasedPart = findBigPart(previousChangelog, 'Unreleased');

  return applyChangelog(unreleasedPart, previousChangelog, changes);
}

/// When there is no changelog, we create a new one with this text.
function initChangelog(payload) {
  return `# Changelog
All notable changes to this project will be documented in this files.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

`;
}

async function run() {
  try {
    const changelogFile = 'CHANGELOG.md';
    const payload = github.context.payload;
    const skipped = core.getInput('skipped') || 'false';

    core.debug(JSON.stringify(github.context, undefined, 4));

    if (skipped === 'true')
      return;

    if (isSupportedGitHubObject(payload)) {
      const auth = core.getInput('github-token');
      const octokit = new Octokit({
        auth
      });

      if (payload.pull_request.merged) {
        const owner = payload.repository.owner.login;
        const repo = payload.repository.name;
        const commit_sha = payload.pull_request.merge_commit_sha;
        var previousChangelog = "";
        var content = "";

        const commitResponse = await octokit.git.getCommit({
          owner,
          repo,
          commit_sha
        });

        const base_tree = commitResponse.data.tree.sha;

        try {
          // Fetches the content of the changelog (if any) from the main branch.
          // It's fine because our github action is supposed to be the only one updating
          // that file.
          const response = await octokit.repos.getContents({
            owner,
            repo,
            path: changelogFile
          });

          previousChangelog = Base64.decode(response.data.content);

        } catch (error) {
          if (error.status == 404) {
            previousChangelog = initChangelog(payload);
          } else {
            core.setFailed(`Unexpected error happened when listing CHANGELOG.md file: ${error}`);
          }
        }


        content = getChangelogContent(previousChangelog, payload);

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
        const createCommitResponse = await octokit.git.createCommit({
          owner,
          repo,
          message: 'Update CHANGELOG.md',
          tree: newTreeSha,
          parents: [commit_sha]
        });

        const newCommitSha = createCommitResponse.data.sha;

        await octokit.git.updateRef({
          owner,
          repo,
          ref: 'heads/master',
          sha: newCommitSha
        });
      }
    } else {
      core.setFailed(`changelog-update only supports pull requests.`);
    }
  } catch (error) {
    core.setFailed(`An unexpected error happened: ${JSON.stringify(error, undefined, 4)}`);
  }
}

run();
