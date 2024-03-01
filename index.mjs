import core from "@actions/core";
import fs from "fs";
import xml2js from "xml2js";
import { globSync } from "glob";

const parser = new xml2js.Parser();

/** @typedef {import('@actions/core/lib/summary').SummaryTableRow} TableRow*/
/** @typedef {TableRow[]} Table*/

/**
 * Parse Android Test Report XML file
 * @param {string} xmlFile - The XML file to parse
 * @returns {void}
 * @throws {Error} - Throws error if file is not found
 * @throws {Error} - Throws error if file is not valid XML
 */
function parseXML(xmlFile) {
  console.log(`Parsing: ${xmlFile}`);

  let hasSeenFailure = false;

  // Read XML file
  fs.readFile(xmlFile, (err, data) => {
    if (err) throw err;

    /** @type {Table} */
    let summaryTable = [];

    /** @type {Table} */
    let errorTable = [];

    core.summary.addHeading(xmlFile, 2);

    // Parse XML
    parser.parseString(data, (err, result) => {
      if (err) throw err;
      const root = result.testsuite[0];
      const attributes = root.$;

      for (const [dataName, dataValue] of Object.entries(attributes)) {
        if (dataName === 'hostname') continue;

        /** @type {TableRow} */
        let tableRow = [];
        tableRow.push({
          data: dataName,
        });
        tableRow.push({
          data: dataValue.toString(),
        });

        summaryTable.push(tableRow);
      }

      core.summary.addTable(summaryTable);

      root.testcase.forEach((elem) => {
        const elemAttrib = elem.$;
        if (elem.failure) {
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

      if (hasSeenFailure) {
        core.summary.addHeading("Failures", 3);
        core.summary.addTable(errorTable);
      }
    });
  });
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

  files.forEach((file) => {
    parseXML(file);
  });

  if (files.length === 0) {
    core.summary.addRaw(
      "No test reports found. Please verify the tests were executed successfully. Android Test Report Action failed the job.",
    );
  }
}

try {
  const baseDir = core.getInput("working-directory");

  console.log(`Getting Reports In: ${baseDir}`);

  main(baseDir);

  await core.summary.write();
} catch (error) {
  core.setFailed(error.message);
}
