const core = require("@actions/core");
const { graphql } = require("@octokit/graphql");

var args = process.argv.slice(2);

console.log("Usage: node index.js {github_token} {project_number} {repository} [{organization='EventStore'} {pageSize='100'} {startFrom=null}]");
console.log();

const token = args[0];
if (!token) {
  console.log("A github access token is required");
  return;
}

const projectNumber = args[1];
if (!projectNumber) {
  console.log("The project number is required");
  return;
}

const repository = args[2];
if (!repository) {
  console.log("The source repository is required");
  return;
}

const organization = args[3] ?? "EventStore";

const pageSize = args[4] ? parseInt(args[4]) : 5;
if (!pageSize) {
  console.log("The page size needs to be an Int");
  return;
}

const startFrom = args[5];

const graphqlWithAuth = graphql.defaults({
  headers: {
    authorization: `token ${token}`,
  },
});

async function getProjectId() {
  console.log(`Getting project with number ${projectNumber}`);

  try {
    const { organization: {projectNext: { id }}} = await graphqlWithAuth(`
    query ($org: String!, $number: Int!) {
      organization(login: $org) {
        projectNext(number: $number) {
          id
          fields(first:20) {
            nodes {
              id
              name
              settings
            }
          }
        }
      }
    }`,
    {
      org: organization,
      number: projectNumber
    });
    console.log(`Got project id ${id}`);
    return id;
  } catch (error) {
    core.setFailed(error.message);
    console.log(error.message);
  }
}

async function addItemToProject(projectId, itemId) {
  console.log(`Adding node with id ${itemId} to project ${projectId}`);

  try {
    const { addProjectNextItem: { projectNextItem: { id }}} = await graphqlWithAuth(`
    mutation(
      $project:ID!,
      $resource_id:ID!
    ) {
      addProjectNextItem(
        input: {
          projectId: $project,
          contentId: $resource_id
        }
      ) {
        projectNextItem {
          id
        }
      }
    }`,
    {
      project: projectId,
      resource_id: itemId
    });
  } catch (error) {
    core.setFailed(error.message);
    console.log(error.message);
  }
}

async function AddPageOfIssues(page, projectId) {
  console.log(`Getting page '${page}'`);
  try {
    const { repository: { issues }} = await graphqlWithAuth(`
    query ($page: String, $pageSize: Int!, $org: String!, $repo: String!) {
      repository(name: $repo, owner: $org) {
        issues(first: $pageSize, after: $page, states:OPEN) {
          nodes {
            id
            title
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }`,
    {
      page: page,
      pageSize: pageSize,
      org: organization,
      repo: repository
    });
    const pageInfo = {
      next: issues.pageInfo.endCursor,
      hasNext: issues.pageInfo.hasNextPage
    };

    for (const issue of issues.nodes) {
      await addItemToProject(projectId, issue.id)
    }

    console.log(`Added page ${page}`);
    return pageInfo;
  } catch (error) {
    console.log(error.message);
    console.log(`failed at page '${page}'`);
  }
}

async function Run() {
  try {
    const projectId = await getProjectId();
    var hasNextPage = true;
    var nextPage = startFrom;
    while (hasNextPage) {
      const { next, hasNext } = await AddPageOfIssues(nextPage, projectId);
      hasNextPage = hasNext;
      nextPage = next;
    }
  } catch(error) {
    console.log(error.message);
  }
}

Run();