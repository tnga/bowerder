/*===================================================================================================================
 * Here, the script need *nodeJS* and *gulp* to run.
 * 
 * This script is for building bowerder from its partials sources; For that, the following operations can be done:
 * watching partials sources to biuld the library depending of changes.
 * minifications and generate sourcemap when needed.
 *===================================================================================================================
 * @license MIT
 * @author  [Tindo N. Arsel](mailto:devtnga@gmail.com)
*/


if (process.versions.node <= '0.12.0') {

   console.warn('bowerder-gulp: recommand node version 0.12.x or later ');
   require('es6-promise').polyfill();
}

var gulp = require('gulp'),
    sourcemaps = require('gulp-sourcemaps'),
    rename = require('gulp-rename'),
    uglify = require('gulp-uglify'),
    notify = require("gulp-notify");

var paths = {
   sources: 'src/*.js',
   loader: 'src/loader.js',
   loaderTest: 'tests/weblibs/bowerder/src',
   manager: 'src/manager.js',
   bower: 'tests/bower_components',
   node: 'node_modules',
   destMap: './',
   dest: './dist'
};

gulp.task('minify', function () {
   // compile and minify all target js files.
   // with sourcemaps all the way down
   return gulp.src( paths.loader )
      .pipe( sourcemaps.init())
      .pipe( uglify() )
      .pipe( rename({suffix: '.min'}))
      .pipe( sourcemaps.write( paths.destMap ))
      .pipe( gulp.dest( paths.dest ))
      .pipe( notify({ onLast: true, title: 'bowerder-minify:', message: 'minification task complete!' }));
});

// library's builder task
gulp.task('build', ['minify'] );

gulp.task('sync-loader-dev', function () {

   return gulp.src( paths.loader )
      .pipe( gulp.dest( paths.loaderTest ) )
      .pipe( notify({ title: 'bowerder-sync:', message: 'dev loader.js is now synchronized with loader.js using for test!' }) );
});

// run associated task(s) when a file change from given path
gulp.task('watch', function () {

   gulp.watch( paths.sources, ['build']);
   gulp.watch( paths.loader, ['sync-loader-dev']);

   console.log('bowerder-watch: dev-source files are being watched!');
});

// The default task (called when you run `gulp` from cli)
gulp.task('default', ['watch'], function () {

   console.log('.....\n bowerder-dev: available task:');
   console.log('watch [default] - (watch source files and automate building / tests)');
   console.log('standard - (check standard style code guideline)');
   console.log('minify - (uglify and minify js files from sources)');
   console.log('sync-loader-dev - (synchronize dev loader.js with loader.js using for test!)');
   console.log('build - (build the project)');
   console.log('.....');
});