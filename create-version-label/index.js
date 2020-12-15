const core = require('@actions/core');
const github = require('@actions/github');

let type = core.getInput("type");
var version = "";

switch (type) {
    case 'tag':
        version = github.context.ref.substr(10);
        break;
    default:
        const date = new Date();
        const yearString = `${date.getFullYear()}`.substr(2);
        const month = date.getMonth() + 1;
        let monthStr;

        if (month < 10)
            monthStr = `0${month}`;
        else
            monthStr = `${month}`;

        version = `${yearString}.${monthStr}`;

        break;
}

core.setOutput("version", version);