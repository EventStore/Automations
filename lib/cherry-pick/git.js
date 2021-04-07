// forked from https://github.com/tibdex/shared-github-internals
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
const { v4: generateUuid } = require("uuid");
const generateUniqueRef = (ref) => `${ref}-${generateUuid()}`;
exports.generateUniqueRef = generateUniqueRef;
const getHeadRef = (ref) => `heads/${ref}`;
exports.getHeadRef = getHeadRef;
const getFullyQualifiedRef = (ref) => `refs/${getHeadRef(ref)}`;
const fetchRefSha = ({ octokit, owner, ref, repo }) =>
  __awaiter(this, void 0, void 0, function* () {
    const {
      data: {
        object: { sha },
      },
    } = yield octokit.git.getRef({
      owner,
      ref: getHeadRef(ref),
      repo,
    });
    return sha;
  });
exports.fetchRefSha = fetchRefSha;
const updateRef = ({ force, octokit, owner, ref, repo, sha }) =>
  __awaiter(this, void 0, void 0, function* () {
    yield octokit.git.updateRef({
      force,
      owner,
      ref: getHeadRef(ref),
      repo,
      sha,
    });
  });
exports.updateRef = updateRef;
const deleteRef = ({ octokit, owner, ref, repo }) =>
  __awaiter(this, void 0, void 0, function* () {
    yield octokit.git.deleteRef({
      owner,
      ref: getHeadRef(ref),
      repo,
    });
  });
exports.deleteRef = deleteRef;
const createRef = ({ octokit, owner, ref, repo, sha }) =>
  __awaiter(this, void 0, void 0, function* () {
    yield octokit.git.createRef({
      owner,
      ref: getFullyQualifiedRef(ref),
      repo,
      sha,
    });
  });
exports.createRef = createRef;
const createTemporaryRef = ({ octokit, owner, ref, repo, sha }) =>
  __awaiter(this, void 0, void 0, function* () {
    const temporaryRef = generateUniqueRef(ref);
    yield createRef({
      octokit,
      owner,
      ref: temporaryRef,
      repo,
      sha,
    });
    return {
      deleteTemporaryRef() {
        return __awaiter(this, void 0, void 0, function* () {
          yield deleteRef({
            octokit,
            owner,
            ref: temporaryRef,
            repo,
          });
        });
      },
      temporaryRef,
    };
  });
exports.createTemporaryRef = createTemporaryRef;
const withTemporaryRef = ({ action, octokit, owner, ref, repo, sha }) =>
  __awaiter(this, void 0, void 0, function* () {
    const { deleteTemporaryRef, temporaryRef } = yield createTemporaryRef({
      octokit,
      owner,
      ref,
      repo,
      sha,
    });
    try {
      return yield action(temporaryRef);
    } finally {
      yield deleteTemporaryRef();
    }
  });
exports.withTemporaryRef = withTemporaryRef;
const getCommitsDetails = ({
  commit: {
    author,
    committer,
    message,
    tree: { sha: tree },
  },
  sha,
}) => ({
  author,
  committer,
  message,
  sha,
  tree,
});
const fetchCommitsDetails = ({ octokit, owner, pullRequestNumber, repo }) =>
  __awaiter(this, void 0, void 0, function* () {
    const options = octokit.pulls.listCommits.endpoint.merge({
      owner,
      pull_number: pullRequestNumber,
      repo,
    });
    const commits = yield octokit.paginate(options);
    return commits.map(getCommitsDetails);
  });
exports.fetchCommitsDetails = fetchCommitsDetails;
const fetchCommits = ({ octokit, owner, pullRequestNumber, repo }) =>
  __awaiter(this, void 0, void 0, function* () {
    const details = yield fetchCommitsDetails({
      octokit,
      owner,
      pullRequestNumber,
      repo,
    });
    return details.map(({ sha }) => sha);
  });
exports.fetchCommits = fetchCommits;
