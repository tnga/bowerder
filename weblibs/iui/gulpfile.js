/*===================================================================================================================
 * Here, the script need *nodeJS* and *gulp* to run.
 * 
 * This script is for building iUI library from its partials sources; For that, the following operations can be done:
 * watching partials sources to biuld the library depending of changes.
 * compiling considered partials sources.
 * autoprefixe and generate sourcemap when needed.
 * minifications.
 *===================================================================================================================
 * @license LGPL v2.1 or later
 * @author  [Tindo Ngoufo Arsel](mailto:devtnga@gmail.com)
*/


if (process.versions.node <= '0.12.0') {
    
    console.warn('iui-gulp: recommand node version 0.12.x or later ') ;
    require('es6-promise').polyfill() ;
}

var gulp = require('gulp'),
    sass = require('gulp-ruby-sass'),
    autoprefixer = require('gulp-autoprefixer'),
    cssnano = require('gulp-cssnano'),
    sourcemaps = require('gulp-sourcemaps'),
    ignore = require('gulp-ignore'),
    rename = require('gulp-rename') ,
    
    notifier = require('node-notifier') ;

var paths = {
    sassAll: 'src/sass/**/*.scss' ,
    sassMain: 'src/sass/iui.scss' ,
    sass: 'src/sass/*.scss' ,
    bower: 'bower_components' ,
    node: 'node_modules' ,
    destMap: 'sourcemaps' ,
    dest: './dist'
    //scripts: ['client/js/**/*.coffee', '!client/external/**/*.coffee']
};

gulp.task('sass', function() {
    // compile and minify all target sass files.
    // with sourcemaps all the way down
    sass( paths.sass, {sourcemap: true, style: 'expanded'} ).on('error', sass.logError)
        .pipe( autoprefixer('last 5 Chrome versions',
                            'last 5 Firefox versions',
                            'last 2 Safari versions',
                            'ie >= 8',
                            'iOS >= 7',
                            'Android >= 4.2'))
        .pipe( sourcemaps.write( paths.destMap, {includeContent: false})) //@TODO make source files from sourcemaps to be load by browsers (see `sourceRoot` property)
        .pipe( gulp.dest( paths.dest))
        .pipe( ignore.exclude('*.map'))
        .pipe( rename({suffix: '.min'}))
        .pipe( cssnano())
        .pipe( sourcemaps.write( paths.destMap))
        .pipe( gulp.dest(paths.dest)) ;
    
    notifier.notify({ title: 'iui-sass:', message: 'css generation\'s / minification\'s task complete!' }) ;

});

// library's builder task
gulp.task('build', ['sass'] );

// Return the task when a file changes
gulp.task('watch', function() {
    
    gulp.watch( paths.sassAll, ['sass']) ;
    
    notifier.notify({ title: 'iui-watcher:', message: 'source files are being watched!' }) ;
});

// The default task (called when you run `gulp` from cli)
gulp.task('default', ['watch'], function() {
    
    console.log('.....\n iui-dev: available task:') ;
    console.log('watch [default] - (watch source files and automate building)') ;
    console.log('sass - (generate and minify css from sass\'s files)') ;
    console.log('build - (build the project)') ;
    console.log('.....') ;
});