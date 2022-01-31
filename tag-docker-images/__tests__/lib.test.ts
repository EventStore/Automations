import { expect, test, describe } from '@jest/globals';
import {
  getTagListFromReleases,
  BaseImage,
  getCurrentReleases,
} from '../src/lib';
import * as cp from 'child_process';
import * as path from 'path';
import * as process from 'process';
import * as semver from 'semver';

const getTagListFromReleasesCases = [
  [
    [
      '20.10.0',
      '20.10.1',
      '20.10.2',
      '20.10.3',
      '20.10.4',
      '20.10.5',
      '20.6.0',
      '20.6.1',
      '20.6.2',
      '21.10.0',
      '21.10.1',
      '21.2.0',
      '21.6.0',
      '19.10.0',
    ],
    'alpine',
    {
      latest: '21.10.1-alpine',
      lts: '21.10.1-alpine',
      'previous-lts': '20.10.5-alpine',
      '21': '21.10.1-alpine',
      '20': '20.10.5-alpine',
    },
  ],
  [
    [
      '22.2.1',
      '22.2.0',
      '20.10.0',
      '20.10.1',
      '20.10.2',
      '20.10.3',
      '20.10.4',
      '20.10.5',
      '20.6.0',
      '20.6.1',
      '20.6.2',
      '21.10.0',
      '21.10.1',
      '21.2.0',
      '21.6.0',
    ],
    'focal',
    {
      latest: '22.2.1-focal',
      lts: '21.10.1-focal',
      'previous-lts': '20.10.5-focal',
      '22': '22.2.1-focal',
      '21': '21.10.1-focal',
    },
  ],
  [
    [
      '22.6.0',
      '22.2.1',
      '22.2.0',
      '20.10.0',
      '20.10.1',
      '20.10.2',
      '20.10.3',
      '20.10.4',
      '20.10.5',
      '20.6.0',
      '20.6.1',
      '20.6.2',
      '21.10.0',
      '21.10.1',
      '21.2.0',
      '21.6.0',
    ],
    'buster-slim',
    {
      latest: '22.6.0-buster-slim',
      lts: '21.10.1-buster-slim',
      'previous-lts': '20.10.5-buster-slim',
      '22': '22.6.0-buster-slim',
      '21': '21.10.1-buster-slim',
    },
  ],
];

describe('getTagListFromReleases', () => {
  test.each(getTagListFromReleasesCases)(
    'A tag list of %p and a base image of %p returns %p',
    (versions: string[], baseImage: BaseImage, expected) => {
      const releases = versions
        .map((v) => ({ semver: new semver.SemVer(v), sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort) // random shuffle
        .map(({ semver }) => semver);

      const result = getTagListFromReleases(baseImage, releases);
      expect(result).toEqual(expected);
    }
  );
});

describe('getCurrentReleases', () => {
  test('gets a list of releases', async () => {
    const result = await getCurrentReleases();
    console.info(result.map(({ version }) => version));
    expect(result.length).toBeGreaterThan(0);
    await Promise.all([]);
  }, 10000);
});

describe('action', () => {
  test('execution', () => {
    const { env, execPath } = process;
    const ip = path.join(__dirname, '..', 'lib', 'main.js');

    const result = cp.execFileSync(execPath, [ip], { env });
    console.log(result.toString());
  });
});
