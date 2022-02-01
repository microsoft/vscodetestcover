# vscodetestcover

A Mocha test runner with code coverage support for VSCode Extensions. This replaces the standard test runner from `vscode/lib/testrunner` and adds in code coverage support.

## Usage
 In a standard VSCode extension project, replace the `src/test/index.ts` file with the contents of `sample/index.ts` installed as part of this node module. This will use the test runner with coverage.

 To configure coverage settings, copy the `samples/coverconfig.json` beside the `index.ts` file and edit its contents. It defines where the expected src directory is, where to save coverage files, and more.


## Licensing
This code is originally from https://github.com/Microsoft/vscode-mssql. I have preserved the MIT license statement and Copyright from that project so things are still marked as Copyright Microsoft.