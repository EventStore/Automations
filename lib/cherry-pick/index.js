// forked from https://github.com/tibdex/github-cherry-pick
"use strict";
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : new P(function (resolve) {
              resolve(result.value);
            }).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
Object.defineProperty(exports, "__esModule", { value: true });
const createDebug = require("debug");
const git_1 = require("./git");
const debug = createDebug("github-cherry-pick");
// See https://github.com/tibdex/github-rebase/issues/13
const getCommitMessageToSkipCI = (title) => `${title} [skip ci]


skip-checks: true
`;
const createCommit = ({
  author,
  committer,
  message,
  octokit,
  owner,
  parent,
  repo,
  tree,
}) =>
  __awaiter(this, void 0, void 0, function* () {
    const {
      data: { sha },
    } = yield octokit.git.createCommit({
      author,
      committer,
      message,
      owner,
      parents: [parent],
      repo,
      // No PGP signature support for now.
      // See https://developer.github.com/v3/git/commits/#create-a-commit.
      tree,
    });
    return sha;
  });
const merge = ({ base, commit, octokit, owner, repo }) =>
  __awaiter(this, void 0, void 0, function* () {
    const {
      data: {
        commit: {
          tree: { sha: tree },
        },
      },
    } = yield octokit.repos.merge({
      base,
      commit_message: getCommitMessageToSkipCI(`Merge ${commit} into ${base}`),
      head: commit,
      owner,
      repo,
    });
    return tree;
  });
const retrieveCommitDetails = ({ commit, octokit, owner, repo }) =>
  __awaiter(this, void 0, void 0, function* () {
    const {
      data: { author, committer, message, parents },
    } = yield octokit.git.getCommit({
      commit_sha: commit,
      owner,
      repo,
    });
    if (parents.length > 1) {
      throw new Error(
        `Commit ${commit} has ${parents.length} parents.` +
          ` github-cherry-pick is designed for the rebase workflow and doesn't support merge commits.`
      );
    }
    return { author, committer, message, parent: parents[0].sha };
  });
const createSiblingCommit = ({
  commit,
  head: { author, committer, ref, tree },
  octokit,
  owner,
  parent,
  repo,
}) =>
  __awaiter(this, void 0, void 0, function* () {
    const sha = yield createCommit({
      author,
      committer,
      message: getCommitMessageToSkipCI(`Sibling of ${commit}`),
      octokit,
      owner,
      parent,
      repo,
      tree,
    });
    yield git_1.updateRef({
      force: true,
      octokit,
      owner,
      ref,
      repo,
      sha,
    });
  });
const cherryPickCommit = ({
  commit,
  head: { ref, sha, tree },
  octokit,
  owner,
  sourceOwner,
  repo,
}) =>
  __awaiter(this, void 0, void 0, function* () {
    const { author, committer, message, parent } = yield retrieveCommitDetails({
      commit,
      octokit,
      owner: sourceOwner,
      repo,
    });
    debug("creating sibling commit");
    yield createSiblingCommit({
      commit,
      head: { author, committer, ref, tree },
      octokit,
      owner,
      parent,
      repo,
    });
    debug("merging");
    const newHeadTree = yield merge({
      base: ref,
      commit,
      octokit,
      owner,
      repo,
    });
    debug("creating commit with different tree", newHeadTree);
    const newHeadSha = yield createCommit({
      author,
      committer,
      message,
      octokit,
      owner,
      parent: sha,
      repo,
      tree: newHeadTree,
    });
    debug("updating ref", newHeadSha);
    yield git_1.updateRef({
      // Overwrite the merge commit and its parent on the branch by a single commit.
      // The result will be equivalent to what would have happened with a fast-forward merge.
      force: true,
      octokit,
      owner,
      ref,
      repo,
      sha: newHeadSha,
    });
    return {
      sha: newHeadSha,
      tree: newHeadTree,
    };
  });
const cherryPickCommitsOnRef = ({
  commits,
  initialHeadSha,
  octokit,
  owner,
  sourceOwner,
  ref,
  repo,
}) =>
  __awaiter(this, void 0, void 0, function* () {
    const {
      data: {
        tree: { sha: initialHeadTree },
      },
    } = yield octokit.git.getCommit({
      commit_sha: initialHeadSha,
      owner,
      repo,
    });
    const { sha: newHeadSha } = yield commits.reduce(
      (previousCherryPick, commit) =>
        __awaiter(this, void 0, void 0, function* () {
          const { sha, tree } = yield previousCherryPick;
          debug("cherry-picking", { commit, ref, sha });
          return cherryPickCommit({
            commit,
            head: { ref, sha, tree },
            octokit,
            owner,
            sourceOwner,
            repo,
          });
        }),
      Promise.resolve({
        sha: initialHeadSha,
        tree: initialHeadTree,
      })
    );
    return newHeadSha;
  });
// eslint-disable-next-line max-lines-per-function
const cherryPickCommits = ({
  // Should only be used in tests.
  _intercept = () => Promise.resolve(),
  commits,
  head,
  octokit,
  owner,
  sourceOwner,
  repo,
}) =>
  __awaiter(this, void 0, void 0, function* () {
    debug("starting", { commits, head, owner, repo });
    const initialHeadSha = yield git_1.fetchRefSha({
      octokit,
      owner,
      ref: head,
      repo,
    });
    yield _intercept({ initialHeadSha });
    return git_1.withTemporaryRef({
      action: (temporaryRef) =>
        __awaiter(this, void 0, void 0, function* () {
          debug({ temporaryRef });
          const newSha = yield cherryPickCommitsOnRef({
            commits,
            initialHeadSha,
            octokit,
            owner,
            sourceOwner,
            ref: temporaryRef,
            repo,
          });
          debug("updating ref with new SHA", newSha);
          yield git_1.updateRef({
            // Make sure it's a fast-forward update.
            force: false,
            octokit,
            owner,
            ref: head,
            repo,
            sha: newSha,
          });
          debug("ref updated");
          return newSha;
        }),
      octokit,
      owner,
      ref: `cherry-pick-${head}`,
      repo,
      sha: initialHeadSha,
    });
  });
exports.cherryPickCommits = cherryPickCommits;
