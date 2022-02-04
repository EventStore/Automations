import * as github from '@actions/github';
import * as semver from 'semver';

export type BaseImage = 'focal' | 'alpine' | 'buster-slim';

const formatTag = (version: semver.SemVer, baseImage: BaseImage): string =>
  `${version.format()}-${baseImage}`;

const getLastTwoLTSReleases = (
  releases: semver.SemVer[]
): [semver.SemVer, semver.SemVer] => {
  const lts = releases.filter(({ minor }) => minor === 10)[0];

  const previousLts = releases.filter(
    ({ major, minor }) => major < lts.major && minor === 10
  )[0];

  return [lts, previousLts];
};

const getLastTwoSupportedReleases = (
  releases: semver.SemVer[]
): semver.SemVer[] => {
  const latest = releases[0];
  const previous = releases.filter(({ major }) => major < latest.major)[0];

  return [latest, previous];
};

export function getTagListFromReleases(
  baseImage: BaseImage,
  releases: semver.SemVer[]
): Record<string, string> {
  const sorted = semver.rsort(releases);

  const [lts, previousLts] = getLastTwoLTSReleases(sorted);
  const [latest, previous] = getLastTwoSupportedReleases(sorted);

  return {
    latest: formatTag(sorted[0], baseImage),
    lts: formatTag(lts, baseImage),
    'previous-lts': formatTag(previousLts, baseImage),
    [latest.major.toString()]: formatTag(latest, baseImage),
    [previous.major.toString()]: formatTag(previous, baseImage),
  };
}

export async function getCurrentReleases(): Promise<semver.SemVer[]> {
  const octokit = github.getOctokit(process.env.GITHUB_TOKEN as string);

  const gitHubReleases = await octokit.paginate(
    octokit.rest.repos.listReleases,
    {
      repo: 'EventStore',
      owner: 'EventStore',
      per_page: 100,
    }
  );

  return gitHubReleases
    .filter(({ tag_name }) => tag_name.startsWith('oss-v'))
    .map(({ tag_name }) => tag_name.slice('oss-v'.length))
    .map((version) => semver.parse(version))
    .filter((version) => version && version.prerelease.length === 0)
    .map((version) => version as semver.SemVer);
}
