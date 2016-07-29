/* bower components's registry manager for bowerder
 ________________________________________________________________________________________
 *
 * Easly Import your components or libraries installed via bower to your project.
 * Here are functionalities that help to organize installed components in registry.
 * The goal is to use that registries to easly import them on browsers
 * 
 * @license MIT
 * @author  [Tindo N. Arsel](mailto:devtnga@gmail.com)
*/

var fs = require('fs');
var path = require('path');
var chokidar = require('chokidar');

var manager = {};
/**
 * generate `bowerreg.js` registry for installed components through bower
 * @param {string} bowerpath path to installed components directory for considered project
 */
manager.genregistry = function (bowerpath) {

   var counter = 0 ; // will be used to know if all `bower.json` of packages have been checked
   var bowerreg = {} ; // will be used as bower components registry for considered project

   fs.readdir( bowerpath, function (err, files) {

      if (err) throw err;

      files.forEach( function (fileName) {

         fs.lstat( path.join( bowerpath, fileName), function (err, stats) {

            if (stats.isDirectory() && fileName !== "bowerder") {

               counter++;

               fs.readFile( path.join( bowerpath, fileName, 'bower.json'), 'utf8', function (err, content) {

                  if (err) {

                     console.warn("waiting for "+ path.join( bowerpath, fileName, 'bower.json'));
                  }
                  else {

                     var pkgConfig = JSON.parse( content );

                     delete pkgConfig['ignore'];
                     delete pkgConfig['keywords'];
                     delete pkgConfig['moduleType'];
                     delete pkgConfig['resolutions'];

                     bowerreg[ pkgConfig.name ] = pkgConfig;
                     //package are accessible in the registry by name so name property isn't needed
                     delete bowerreg[ pkgConfig.name ].name;
                  }

                  counter--;
                  if (counter === 0) { //all bower.json have been checked

                     fs.writeFile( path.join( bowerpath, 'bowerreg.js'),
                                  '//manage possible conflict with loader namespace definition. \n'+
                                  'if (typeof bower !== "undefined" && typeof bower.import !== "function" && typeof bower.addPackage !== "function") {'+
                                  ' console.warn("Seem like `bower` namespace is use for another purpose. Taking risk of an overwrite ...");'+
                                  ' window.bower = bower = {};'+  
                                  '} else  if (typeof bower === "undefined") {'+
                                  ' window.bower = {};'+
                                  '} \n//available packages\n'+
                                  'bower.components = '+ JSON.stringify( bowerreg ) +';',
                        function (err) {
                           if (err) throw err; 
                     });
                  }
               });
            }
         });    
      });
   });
};

/**
 * watch and auto refresh registry for installed/romoved/changed components
 * @param {string} bowerpath bowerpath path to installed components directory for considered project
 */
manager.automate = function (bowerpath) {

   // Initialize watcher. 
   var watcher = chokidar.watch( bowerpath, {
      ignored: /[\/\\]\./,
      persistent: true
   });

   watcher
      .on('ready', function () {

         console.log('\nbowerder: start watching for local registry\'s automatic update\n');
      })
      .on('addDir', function (path) {

         manager.genregistry( bowerpath );
         console.log('bowerder: local registry updated with added content: '+ path);
      })
      .on('unlinkDir', function (path) {

         manager.genregistry( bowerpath );
         console.log('bowerder: local registry updated with removed content: '+ path);
      })
      .on('change', function (path) {

         manager.genregistry( bowerpath );
         console.log('bowerder: local registry updated with changed content: '+ path);
      })
      .on('error', function (error) {

         manager.genregistry( bowerpath );
         console.log('bowerder: local registry updated with error: '+ error);
      });
};

module.exports = manager;