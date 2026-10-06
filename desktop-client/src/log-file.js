"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MAX_LOG_BYTES = 5 * 1024 * 1024;

// backend logs every dns/http call, so rotate once per launch or the file just grows forever
function openLogStream(logDir, name) {
  const file = path.join(logDir, name);
  try {
    if (fs.statSync(file).size > MAX_LOG_BYTES) fs.renameSync(file, `${file}.old`);
  } catch {
    // no file yet on first launch, or a leftover process still has it open, just keep appending
  }
  return fs.createWriteStream(file, { flags: "a" });
}

module.exports = { openLogStream };
