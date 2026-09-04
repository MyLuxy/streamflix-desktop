"use strict";

// swapped in at CI release-build time from a repo secret by
// scripts/inject-tmdb-key.mjs - stays blank in the repo and in any local/dev build,
// never put a real key here
module.exports = {
  TMDB_PERSONAL_API_KEY: "",
};
