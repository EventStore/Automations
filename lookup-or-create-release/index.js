const core = require('@actions/core');
const github = require('@actions/github');
const { Octokit } = require('@octokit/rest');
const octokit = new Octokit({
    auth: core.getInput('github-token'),
});

const nightlyTagName = 'nightly-build';
const minNightlyReleaseAge = 1 * 3600 /*hr*/ * 1000 /*milliseconds*/;

const getVersionString = () => {
    const type = core.getInput("build-type").toLocaleLowerCase();

    if (type === 'nightly') {
        return nightlyTagName;
    }

    if (type == 'release') {
        const version = core.getInput("version").toLocaleLowerCase();
        const iteration = core.getInput("iteration").toLocaleLowerCase();
        if (!version) {
            core.setFailed("Release build requires a version to be specified!");
        } else {
            if (iteration) {
                return version + "-" + iteration;
            }
            return version;
        }
    }

    if (type === 'stable') {
        core.setFailed("Stable build not implemented yet!");
    }

    if (type === 'beta') {
        core.setFailed("Beta build not implemented yet!");
    }

    core.setFailed(`Unsupported build type [${type}]`);
};

const getReleaseId = async (release_name) => {
    const owner = core.getInput("owner") || github.context.repo.owner;
    const repo = core.getInput("repo") || github.context.repo.repo;
    const build_type = core.getInput("build-type").toLocaleLowerCase();

    if (release_name == nightlyTagName) {
        await cleanupPreviousNightly();
        await createNightlyTagIfNeeded();
    }

    try {
        let prerelease = true;
        if (build_type === 'stable')
            prerelease = false;

        const response = await octokit.repos.createRelease({
            owner,
            repo,
            tag_name: release_name,
            prerelease,
            name: release_name,
        });

        return {
            release_id: response.data.id.toString(),
            upload_url: response.data.upload_url,
        };
    } catch (error) {
        if (error.status === 422) { // If the release already exists.
            try {
                const fallback = await octokit.repos.getReleaseByTag({
                    owner,
                    repo,
                    tag: release_name,
                });

                return {
                    release_id: fallback.data.id.toString(),
                    upload_url: fallback.data.upload_url,
                };
            } catch (newError) {
                core.setFailed(`New Error: ${JSON.stringify(newError, undefined, 4)}`);
            }
        }

        core.setFailed(`Unexpected error when creating a release: ${JSON.stringify(error, undefined, 4)}`);
    }
};

const cleanupPreviousNightly = async () => {
    const owner = core.getInput("owner") || github.context.repo.owner;
    const repo = core.getInput("repo") || github.context.repo.repo;

    console.log("checking nightly releases");

    // get all nightly releases, could be more than one in case of error
    const nightlyReleases = await getNightlyReleases();
    console.log(`found ${nightlyReleases.length} nightly releases`);

    const currentReleaseId = await getCurrentReleaseId(nightlyReleases);
    console.log(`current release id: ${currentReleaseId}`);

    for(var j=0; j < nightlyReleases.length; j++) {
        const release = nightlyReleases[j];
        if (release.id != currentReleaseId) {
            let totalDownloads = 0;
            for (const a in release.assets) {
                totalDownloads += release.assets[a].download_count;
            }

            console.log(`deleting release: id:${release.id} published_at:${release.published_at} total_downloads:${totalDownloads}`);
            await octokit.repos.deleteRelease({
                owner,
                repo,
                release_id: release.id,
            });
        }
    }

    const nightlyTagRef = `tags/${nightlyTagName}`;
    if (currentReleaseId == 0) {
        // there's no current release, it's safe to delete nightly tag if needed
        try {
            const repoInfo = await octokit.repos.get({
                owner,
                repo,
            });
            const mainBranchInfo = await octokit.git.getRef({
                owner,
                repo,
                ref: `heads/${repoInfo.data.default_branch}`,
            });
            const nightlyTagInfo = await octokit.git.getRef({
                owner,
                repo,
                ref: nightlyTagRef,
            });

            if (nightlyTagInfo.data.object.sha == mainBranchInfo.data.object.sha) {
                console.log(`no new commits since previous nightly-build, skip re-creating tag!`);
                return;
            }

            console.log(`deleting tag: ${nightlyTagRef} (${nightlyTagInfo.data.object.sha} / ${mainBranchInfo.data.object.sha})`);

            await octokit.git.deleteRef({
                owner,
                repo,
                ref: nightlyTagRef,
            });
        } catch {
            // noop
        }
    }
}

const getNightlyReleases = async () => {
    const owner = core.getInput("owner") || github.context.repo.owner;
    const repo = core.getInput("repo") || github.context.repo.repo;

    let page = 1;
    const pageSize = 30;
    const foundReleases = new Array();
    while (true) {
        const releases = await octokit.repos.listReleases({
            owner,
            repo,
            page: page,
            per_page: pageSize,
        });

        for(var i=0; i < releases.data.length; i++) {
            const r = releases.data[i];
            if (r.tag_name.includes("nightly")) {
                foundReleases.push(r);
            }
        }

        if (releases.data.length == pageSize) {
            page++;
            continue;
        }

        return foundReleases;
    }
};

// returns the id of the current release which is either the first one without assets or otherwise
// the first release which has an asset which is part of current nightly release.
const getCurrentReleaseId = async (releases) => {
    let currentReleaseWithAssetsId = 0;

    for (var i=0; i < releases.length; i++) {
        const r = releases[i];
        // current release can't be a draft.
        if (r.draft == true) {
            continue;
        }

        if (currentReleaseWithAssetsId == 0 && r.assets.length > 0) {
            const timeDiff = new Date() - Date.parse(r.assets[0].created_at);
            if (timeDiff < minNightlyReleaseAge) {
                currentReleaseWithAssetsId = r.id;
            }
        } else if (r.assets.length == 0 ) {
            return r.id;
        }
    }

    return currentReleaseWithAssetsId;
}

const createNightlyTagIfNeeded = async () => {
    const owner = core.getInput("owner") || github.context.repo.owner;
    const repo = core.getInput("repo") || github.context.repo.repo;

    try {
        await octokit.git.getRef({
            owner,
            repo,
            ref: `tags/${nightlyTagName}`,
        });
    } catch {
        console.log('creating nightly tag');
        const repoInfo = await octokit.repos.get({
            owner,
            repo,
        });
        const mainBranchRef = await octokit.git.getRef({
            owner,
            repo,
            ref: `heads/${repoInfo.data.default_branch}`,
        });
        await octokit.git.createRef({
            owner,
            repo,
            ref: `refs/tags/${nightlyTagName}`,
            sha: mainBranchRef.data.object.sha,
        });
    }
}


const run = async () => {
    const version = getVersionString();
    const release = await getReleaseId(version);

    core.setOutput("version", version);
    core.setOutput("release_id", release.release_id);
    core.setOutput("upload_url", release.upload_url);
};

run().then(() => {}, error => core.setFailed(JSON.stringify(error, undefined, 4)));