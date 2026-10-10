# Security Policy

## Reporting a vulnerability

Report vulnerabilities privately through [GitHub's private vulnerability reporting](https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/security/advisories/new). Do not open a public issue.

Only the latest release receives fixes.

## Scope

Formatting a file runs the Gradle or Maven build of the workspace, including its `mvnw`, so it runs the build's code. The extension is disabled in untrusted workspaces. Running build code in a trusted workspace is expected behavior, not a vulnerability.
