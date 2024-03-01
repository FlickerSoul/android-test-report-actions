import core from "@actions/core";
import fs from "fs";
import xml2js from "xml2js";
import { globSync } from "glob";
import { relative } from "path";

const parser = new xml2js.Parser();

/** @typedef {import('@actions/core/lib/summary').SummaryTableRow} TableRow*/
/** @typedef {TableRow[]} Table*/
/** @typedef {name: string, tests: number, skipped: number, failures: number, errors: number, timestamp: string, time: string} SummaryData */
/** @typedef {{summary: SummaryData, failure: Table?, }} XMLData*/

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
  const data = fs.readFileSync(xmlFile)

  /** @type {Table | null} */
  let errorTable = null;

  /** @type {SummaryData} */
  let summaryData = {
    name: "",
    tests: 0,
    skipped: 0,
    failures: 0,
    errors: 0,
    timestamp: "",
    time: "",
  }

  console.log("Start parsing")

  // Parse XML
  parser.parseString(data, (err, result) => {
    if (err) throw err;
    const root = result.testsuite;
    const attributes = root.$;

    for (const [dataName, dataValue] of Object.entries(attributes)) {
      if (dataName === 'hostname') continue;
      summaryData[dataName] = dataValue;
    }

    root.testcase.forEach((elem) => {
      const elemAttrib = elem.$;
      if (elem.failure) {
        if (!errorTable) {
          errorTable = [];
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
        })
        errorRow.push({
          data: elemAttrib.time.toString(),
        });
        errorRow.push({
          data: failureStackTrace,
        })

        errorTable.push(errorRow);
      }
    });
  });

  console.log("End parsing")

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
  let summaryTable = [];
  summaryTable.push([
    { data: "Name" },
    { data: "Tests" },
    { data: "Skipped" },
    { data: "Failures" },
    { data: "Errors" },
    { data: "Timestamp" },
    { data: "Time" },
  ])

  /** @type {{string: Table}} */
  let failures = {};

  files.forEach((file) => {
    const {summary, failure} = parseXML(file);

    /** @type {TableRow} */
    let row = [];
    Object.entries(summary).forEach(([key, value]) => {
      row.push({
          data: value.toString(),
      });
    });
    summaryTable.push(row);

    if (failure) {
      failures[relative(baseDir, file)] = failure;
    }
  });

  if (files.length === 0) {
    core.summary.addRaw(
      "No test reports found. Please verify the tests were executed successfully. Android Test Report Action failed the job.",
    );
  }

  core.summary.addHeading("Summary", 2);
  core.summary.addTable(summaryTable);

  Object.entries(failures).forEach(([file, table]) => {
    core.summary.addHeading(`Failures in ${file}`, 2);
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
