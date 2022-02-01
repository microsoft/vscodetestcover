# vscodetestcover

A Mocha test runner with code coverage support for VS Code and Azure Data Studio Extensions. This replaces the standard test runner from `vscode/lib/testrunner` and adds in code coverage support.

## Usage
 In a standard VSCode extension project, replace the `src/test/index.ts` file with the contents of `sample/index.ts` installed as part of this node module. This will use the test runner with coverage.

 To configure coverage settings, copy the `samples/coverconfig.json` beside the `index.ts` file and edit its contents. It defines where the expected src directory is, where to save coverage files, and more.

## Development

- Run `yarn install` to install dependencies
- Run `yarn compile` or `yarn watch` to compile


## Releasing

Release a new version of the extension by:

1. Bump the version in [package.json](./package.json)
2. Merge into main
3. Create a new tag with the version number specified in step 1
4. The release will be created in Github automatically by the CD pipeline, go to it and download the package artifact (tgz)
5. Run `npm publish <path to tarball>`

## Licensing
This code is originally from https://github.com/Microsoft/vscode-mssql. I have preserved the MIT license statement and Copyright from that project so things are still marked as Copyright Microsoft.