/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as Mocha from 'mocha';
import * as iLibInstrument from 'istanbul-lib-instrument';
import * as iLibCoverage from 'istanbul-lib-coverage';
import * as iLibReport from 'istanbul-lib-report';
import * as iReports from 'istanbul-reports';
import * as iLibHook from 'istanbul-lib-hook';
import * as iLibSourceMaps from 'istanbul-lib-source-maps';
import * as glob from 'glob';
import decache from 'decache';

let mocha = new Mocha({
    ui: 'tdd',
    useColors: true
});

let testOptions: ITestCoverOptions;

export function configure(mochaOpts: Mocha.MochaOptions, testOpts: ITestCoverOptions): void {
    mocha = new Mocha(mochaOpts);
    testOptions = testOpts;
}

class CoverageRunner {
    private coverageVar: string = '$$cov_' + new Date().getTime() + '$$';
    private transformer: iLibHook.Transformer;
    private unhookRequire: () => void;
    private matchFn: any;
    private instrumenter: iLibInstrument.Instrumenter;

    constructor(private options: ITestRunnerOptions, private testsRoot: string, endRunCallback: any) {
        if (!options.relativeSourcePath) {
            return endRunCallback('Error - relativeSourcePath must be defined for code coverage to work');
        }

    }

    public setupCoverage(): void {
        // Set up Code Coverage, hooking require so that instrumented code is returned
        this.instrumenter = iLibInstrument.createInstrumenter({ coverageVariable: this.coverageVar });
        let sourceRoot = path.join(this.testsRoot, this.options.relativeSourcePath);

        // Glob source files
        let srcFiles = glob.sync('**/**.js', {
            ignore: this.options.ignorePatterns,
            cwd: sourceRoot
        });

        // Create a match function - taken from the run-with-cover.js in istanbul.
        let fileMap = {};
        srcFiles.forEach(file => {
            let fullPath = path.join(sourceRoot, file);
            // Windows paths are (normally) case insensitive so convert to lower case
            // since sometimes the paths returned by the glob and the require hooks
            // are different casings.
            if (os.platform() === 'win32') {
                fullPath = fullPath.toLocaleLowerCase();
            }
            fileMap[fullPath] = true;

            // On Windows, extension is loaded pre-test hooks and this mean we lose
            // our chance to hook the Require call. In order to instrument the code
            // we have to decache the JS file so on next load it gets instrumented.
            // This doesn't impact tests, but is a concern if we had some integration
            // tests that relied on VSCode accessing our module since there could be
            // some shared global state that we lose.
            decache(fullPath);
        });

        this.matchFn = function (file: string): boolean {
            // Windows paths are (normally) case insensitive so convert to lower case
            // since sometimes the paths returned by the glob and the require hooks
            // are different casings.
            if (os.platform() === 'win32') {
                file = file.toLocaleLowerCase();
            }
            return fileMap[file];
        };
        this.matchFn.files = Object.keys(fileMap);

        // Hook up to the Require function so that when this is called, if any of our source files
        // are required, the instrumented version is pulled in instead. These instrumented versions
        // write to a global coverage variable with hit counts whenever they are accessed
        this.transformer = (code: string, options: iLibHook.TransformerOptions): string => {
            // Try to find a .map file
            let map = undefined;
            try {
                map = JSON.parse(fs.readFileSync(`${options.filename}.map`).toString());
            } catch (err) {
                // missing source map...
            }
            // Windows paths are (normally) case insensitive so convert to lower case
            // since sometimes the paths returned by the glob and the require hooks
            // are different casings.
            if (os.platform() === 'win32') {
                options.filename = options.filename.toLocaleLowerCase();
            }
            return this.instrumenter.instrumentSync(code, options.filename, map);
        }
        let hookOpts = { verbose: false, extensions: ['.js'] };
        this.unhookRequire = iLibHook.hookRequire(this.matchFn, this.transformer, hookOpts);
        // initialize the global variable to stop mocha from complaining about leaks
        global[this.coverageVar] = {};
    }


    /**
     * Writes a coverage report. Note that as this is called in the process exit callback, all calls must be synchronous.
     *
     * @returns {void}
     *
     * @memberOf CoverageRunner
     */
    public reportCoverage(): void {
        this.unhookRequire();
        let cov: any;
        if (typeof global[this.coverageVar] === 'undefined' || Object.keys(global[this.coverageVar]).length === 0) {
            console.error('No coverage information was collected, exit without writing coverage information');
            return;
        } else {
            cov = global[this.coverageVar];
        }

        // TODO consider putting this under a conditional flag
        // Files that are not touched by code ran by the test runner is manually instrumented, to
        // illustrate the missing coverage.
        this.matchFn.files.forEach(file => {
            if (!cov[file]) {
                this.transformer(fs.readFileSync(file, 'utf-8'), { filename: file });

                // When instrumenting the code, istanbul will give each FunctionDeclaration a value of 1 in coverState.s,
                // presumably to compensate for function hoisting. We need to reset this, as the function was not hoisted,
                // as it was never loaded.
                Object.keys(this.instrumenter.fileCoverage.s).forEach(key => {
                    this.instrumenter.fileCoverage.s[key] = 0;
                });

                cov[file] = this.instrumenter.fileCoverage;
            }
        });

        // Convert the report to the mapped source files
        const mapStore = iLibSourceMaps.createSourceMapStore();
        const coverageMap = mapStore.transformCoverage(iLibCoverage.createCoverageMap(global[this.coverageVar])).map;

        // TODO Allow config of reporting directory with
        let reportingDir = path.join(this.testsRoot, this.options.relativeCoverageDir);

        const context = iLibReport.createContext({
            dir: reportingDir,
            coverageMap: coverageMap
        });

        const tree = context.getTree('flat');

        const reportTypes = (this.options.reports instanceof Array) ? this.options.reports : ['lcovonly'];
        // Cast to any since create only takes specific values but we don't know what the user passed in.
        // We'll let the lib error out if an invalid value is passed in.
        reportTypes.forEach(reportType => tree.visit(iReports.create(<any>reportType), context));
    }
}

function readCoverOptions(testsRoot: string): ITestRunnerOptions {
    let coverConfigPath = path.join(testsRoot, testOptions.coverConfig);
    let coverConfig: ITestRunnerOptions = undefined;
    if (fs.existsSync(coverConfigPath)) {
        let configContent = fs.readFileSync(coverConfigPath).toString();
        coverConfig = JSON.parse(configContent);
    }
    return coverConfig;
}

export function run(testsRoot: string, clb): any {
    // Read configuration for the coverage file
    let coverOptions: ITestRunnerOptions = readCoverOptions(testsRoot);
    if (coverOptions && coverOptions.enabled) {
        // Setup coverage pre-test, including post-test hook to report
        let coverageRunner = new CoverageRunner(coverOptions, testsRoot, clb);
        coverageRunner.setupCoverage();
        mocha.suite.afterAll(() => {
            coverageRunner.reportCoverage();
        })
    }

    // Glob test files
    glob('**/**.test.js', { cwd: testsRoot }, function (error, files): any {
        if (error) {
            return clb(error);
        }
        try {
            // Fill into Mocha
            files.forEach(function (f): Mocha {
                return mocha.addFile(path.join(testsRoot, f));
            });
            // Run the tests

            mocha.run((failureCount) => {
                clb(undefined, failureCount);
            });

        } catch (error) {
            return clb(error);
        }
    });
}

export interface ITestCoverOptions {
    /**
     * Relative path to the coverage config file with configuration
     * options for the test runner options.
     */
    coverConfig: string;
}

interface ITestRunnerOptions {
    enabled?: boolean;
    relativeCoverageDir: string;
    relativeSourcePath: string;
    ignorePatterns: string[];
    reports?: string[];
    verbose?: boolean;
}
