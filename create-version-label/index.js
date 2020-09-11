const core = require('@actions/core');

const date = new Date();
const yearString = `${date.getFullYear()}`.substr(2);
const month = date.getMonth() + 1;
let monthStr;

if (month < 10)
    monthStr = `0${month}`;
else
    monthStr = `${month}`;


core.setOutput("version", `${yearString}.${monthStr}`);