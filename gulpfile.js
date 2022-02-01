var gulp = require('gulp');
var gulpTsLint = require('gulp-tslint');
var ts = require('gulp-typescript');
var tslint = require('tslint');
var tsProject = ts.createProject('tsconfig.json');
var del = require('del');
var srcmap = require('gulp-sourcemaps');
var config = require('./tasks/config');

gulp.task('lint', () => {
    var program = tslint.Linter.createProgram('tsconfig.json');
    return gulp.src([config.paths.project.root + '/src/**/*.ts'])
    .pipe((gulpTsLint({
        program,
        formatter: "verbose",
        rulesDirectory: "node_modules/tslint-microsoft-contrib"
    })))
    .pipe(gulpTsLint.report());
});

gulp.task('ext:compile', (done) => {
    return gulp.src([
                config.paths.project.root + '/src/**/*.ts',
                config.paths.project.root + '/src/**/*.js'])
                .pipe(srcmap.init())
                .pipe(tsProject())
                .on('error', function() {
                    if (process.env.BUILDMACHINE) {
                        done('Extension Tests failed to build. See Above.');
                        process.exit(1);
                    }
                })
                .pipe(srcmap.write('.', {
                   sourceRoot: function(file){ return file.cwd + '/src'; }
                }))
                .pipe(gulp.dest('out/src/'));
});

gulp.task('ext:copy', () => {
    return gulp.src([config.paths.project.root + '/src/**/*.js'])
        .pipe(gulp.dest(config.paths.project.root + '/out/src'))
});

gulp.task('clean', function (done) {
    return del('out', done);
});

gulp.task('build', gulp.series('clean', 'ext:copy', 'ext:compile'));

gulp.task('watch', function(){
    return gulp.watch(config.paths.project.root + '/src/**/*', gulp.series('build'))
});
