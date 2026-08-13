# Executor
This is a Node.js web app using Express.js framework. It has an endpoint `/query` which receives an sql query and an Integration Id.
Based on the integration id it received, it executes the sql query against it.

### Package Manager
- Use bun to manage dependencies.

#### Packages
- Uses `pg` Node-Postgres library to execute the queries.
