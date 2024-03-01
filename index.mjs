import core from "@actions/core";
import fs from "fs";
import xml2js from "xml2js";
import { globSync } from "glob";

const parser = new xml2js.Parser();

/** @typedef {import('@actions/core/lib/summary').SummaryTableRow} TableRow*/
/** @typedef {TableRow[]} Table*/
/** @typedef {name: string, tests: number, skipped: number, failures: number, errors: number, timestamp: string, time: string} SummaryData */
/** @typedef {{summary: SummaryData, failure: Table?, }} XMLData*/
/** @typedef {name: 'Total', tests: number, skipped: number, failures: number, errors: number, timestamp: 'N/A', time: number} SummaryTotal*/

/**
 * Returns a new summary table with headers
 * @returns {Table}
 */
function createSummaryTable() {
  return [
    [
      { data: "💾 Name", header: true },
      { data: "📋 Tests", header: true },
      { data: "↩️ Skipped", header: true },
      { data: "‼️ Failures", header: true },
      { data: "❌ Errors", header: true },
      { data: "⌚ Timestamp", header: true },
      { data: "⌛ Time (s)", header: true },
    ],
  ];
}

/**
 * Returns a new failure table with headers
 * @returns {Table}
 */
function createFailureTable() {
  return [
    [
      { data: "💾 Test Name", header: true },
      { data: "💬 Failure Message", header: true },
      { data: "⁉️ Failure Type", header: true },
      { data: "⌛️ Time (s)", header: true },
      { data: "🤔 Stack Trace", header: true },
    ],
  ];
}

/**
 * Make an anchor ID from input string
 * @param {string} input
 * @param {boolean} back
 * @returns {string}
 */
function makeAnchorId(input, back = false) {
  // Step 1: Insert a hyphen before uppercase letters and convert the string to lowercase
  let kebabCase = input.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

  // Step 2: Replace any non-lowercase letter or non-number with a dash
  kebabCase = kebabCase.replace(/[^a-z0-9]/g, '-');

  if (back)
    return `back-to-${kebabCase}`
  else
    return kebabCase;
}

/**
 * Make a jump link from input string
 * @param {string} input
 * @param {boolean} back
 * @returns {string}
 */
function makeJumpLink(input, back = true) {
  return `#user-content-${makeAnchorId(input, back)}`
}

/**
 * Parse Android Test Report XML file
 * @param {string} xmlFile - The XML file to parse
 * @returns {XMLData}
 * @throws {Error} - Throws error if file is not found
 * @throws {Error} - Throws error if file is not valid XML
 */
function parseXML(xmlFile) {
  console.log(`Parsing: ${xmlFile}`);

  let hasSeenFailure = false;

  // Read XML file
  const data = fs.readFileSync(xmlFile);

  /** @type {Table | null} */
  let errorTable = null;

  /** @type {SummaryData} */
  let summaryData = {
    name: "N/A",
    tests: 0,
    skipped: 0,
    failures: 0,
    errors: 0,
    timestamp: "N/A",
    time: "0",
  };

  console.log("Start parsing");

  // Parse XML
  parser.parseString(data, (err, result) => {
    if (err) throw err;
    const root = result.testsuite;
    const attributes = root.$;

    for (const [dataName, dataValue] of Object.entries(attributes)) {
      if (dataName === "hostname") continue;
      switch (dataName) {
        case "tests":
        case "skipped":
        case "failures":
        case "errors":
          summaryData[dataName] = parseInt(dataValue);
          break;
        default:
          summaryData[dataName] = dataValue;
      }
    }

    root.testcase.forEach((elem) => {
      const elemAttrib = elem.$;
      if (elem.failure) {
        if (!errorTable) {
          errorTable = createFailureTable();
        }

        const failureMsg = elem.failure[0].$.message;
        const failureType = elem.failure[0].$.type;
        const failureStackTrace = elem.failure[0]._;

        hasSeenFailure = true;

        /** @type {TableRow} */
        let errorRow = [];

        errorRow.push({
          data: elemAttrib.name,
        });
        errorRow.push({
          data: failureMsg,
        });
        errorRow.push({
          data: failureType,
        });
        errorRow.push({
          data: elemAttrib.time.toString(),
        });
        errorRow.push({
          data: failureStackTrace,
        });

        errorTable.push(errorRow);
      }
    });
  });

  console.log("End parsing");

  return {
    summary: summaryData,
    failure: errorTable,
  };
}

/**
 * Main function
 * @param {string} baseDir - The base directory to search for test reports
 * @returns {void}
 */
function main(baseDir) {
  core.summary.addHeading("Android Test Report", 1);

  let files = globSync(`${baseDir}/**/TEST-*.xml`, {
    nodir: true,
    absolute: true,
    withFileTypes: false,
  });

  /** @type {Table} */
  let summaryTable = createSummaryTable();

  /** @type {{string: Table}} */
  let failures = {};

  /** @type {SummaryTotal} */
  let summaryTotal = {
    name: "Total",
    tests: 0,
    skipped: 0,
    failures: 0,
    errors: 0,
    timestamp: "N/A",
    time: 0,
  };

  files.forEach((file) => {
    const { summary, failure } = parseXML(file);

    const where = failure && failure[1][0].data;

    /** @type {TableRow} */
    let row = [];
    Object.entries(summary).forEach(([key, value]) => {
      switch (key) {
        case "failures":
        case "errors":
          row.push({
            data: (value > 0) ? `<a href="${makeJumpLink(where)}" id="${makeAnchorId(where, true)}">${value}</a>` : "0",
          });
          break;
        default:
          row.push({
              data: value.toString(),
            });
      }

      switch (key) {
        case "tests":
          summaryTotal.tests += value;
          break;
        case "skipped":
          summaryTotal.skipped += value;
          break;
        case "failures":
          summaryTotal.failures += value;
          break;
        case "errors":
          summaryTotal.errors += value;
          break;
        case "time":
          summaryTotal.time += parseFloat(value);
          break;
      }
    });
    summaryTable.push(row);

    if (failure) {
      failures[where] = failure;
    }
  });

  if (files.length === 0) {
    core.summary.addRaw(
      "No test reports found. Please verify the tests were executed successfully. Android Test Report Action failed the job.",
    );
  }

  let totalRow = [];
  Object.entries(summaryTotal).forEach(([key, value]) => {
    totalRow.push({
      data: value.toString(),
    });
  });
  summaryTable.push(totalRow);

  core.summary.addHeading("Summary", 2);
  core.summary.addTable(summaryTable);

  Object.entries(failures).forEach(([where, table]) => {
    core.summary.addHeading(`Failures in <code>${where}</code> <a id="${makeAnchorId(where)}" href="${makeJumpLink(where, true)}">🔗(Back)</a>`, 2);
    core.summary.addTable(table);
  });
}

try {
  const baseDir = core.getInput("working-directory");

  console.log(`Getting Reports In: ${baseDir}`);

  main(baseDir);

  await core.summary.write();
} catch (error) {
  core.setFailed(error.message);
}
