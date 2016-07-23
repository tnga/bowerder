## bowerder
> the bower components loader for browsers

<p align="center"><img style="max-width: 100%" src="bowerder.png"></p>
Easly Import your components or libraries installed via bower to your project.

#### why shall i use it ?

 - If you have difficulty to include bower components that require dependencies in your project, this is for you.
 - if you have difficulty to show how to include your module pushed to bower registry, considering it dependencies, this is for you.
 - if you care about how many time a component will be included to your project considering work's subdivision and module's inclusion here and there, this is for you.
 
Indeed, [**bower**](http://bower.io) is the package manager, but without a good loader's utility, package's dependency and module philosophy are under-exploited with usage of a simple `script` or `link` tag.
A best example to explain what i'm talking about is the comparison with node modules usage. 
Although conditions are a little differents, here is a place to better manage component we use through bower in our project.
 
#### how to install ?

Considering it's for bower package manager, just do :
```sh
$ bower install --save bowerder
```

don't forget the associated small and useful command line tool : 
*(**note**: global installation need `sudo` mode for some Linux distributions)*
```sh
$ npm install -g bowerder
```

#### how to use it ?

Very easy !
```html
<!-- only ~11kb minified or ~3kb gzipped :) -->
<script src="path-to-bower-components-dir/bowerder/dist/loader.min.js" data-bowerreg></script>
```
have fun ! *(components are loaded with their dependencies)*
```js
bower.import('ijs') ;
bower.import('vue') ;
//with callback
bower.import('Materialize', function (err) {

   if (err.occured) {
      //you can know if occured error is from bowerder or browser loading process ;)
      console.error('Oops it seems like `Materialize` isn\'t fully loaded from:'+ err.from) ;
      return null; // interruption 
   }

   // everything is ok!
   // materialize depends of jquery, so jquery will be automatically loaded ;)

   Materialize.toast('`Materialize` is loaded!', 5000);
   $('.chips-initial').material_chip('data');
   $('.modal-trigger').leanModal();
});

// global execution when all packages are fully imported
bower.ready( function (err) {

   if (err.occured) {
      //you can know which package have occured an error and if it is from bowerder or browser loading process ;)
      if (err.fromBrowser) console.error('Oops it seems like: '+ err.fromBrowser.join(', ') +' occured a loading error from: browser');
      if (err.fromBowerder) console.error('Oops it seems like: '+ err.fromBowerder.join(', ') +' occured a loading error from: bowerder');
      return null; // interruption 
   }

   Materialize.toast('everything is ok!', 5000);
   $('#winner-modal').openModal();
   iJS.animate($('#winner-modal')[0], 'shake', 15);
});
```

You have a custom external scripts or stylesheets for your project which use or overwrite some packages's features ?
Don't worry, just simply include them and bowerder will import packages's main files before their loading;
so that it will be like you have done it by yourself.
*(except it's without stress or question like "which package's main file i have forgot and where to include ?")*
```html
<link rel="stylesheet" href="mycustom.css"/>
<script src="mycustom.js"></script>
```
in your custom script :
```js
bower.ready( function (err) {

   // your hack here !
});
```

#### how it work ?

The recommended way to use boweder to import packages, is by provide a local registry for packages installed via bower.
This can be done by simply run the boweder command line tool on your target project's directory. 
*abrakadabra !!!*
```sh
$ bowerder
```
it's done, all your installed packages's configurations will be available on the browser through bowerder and will be use for importation process.

How about the size of that registry ? Not much, average is `~[15-20]kb` or `~[3-8]kb gzipped`  for 100 packages.

To avoid to run that command each time you make a bower operation (install, update, ...), just run the following command for automation:
```sh
$ bowerder auto
```

It's possible to load your bower packages via **online CDN service**. This is usefull for projects which don't provide local hosted dependencies *(codepen, jsfiddle, online demo, ...)*.
For that purpose, just enable the `bower.cdn.usage` property. The actual CDN use by the loader is [cdn.rawgit.com](https://rawgit.com). That will cause online package's loading method to have priority to local loading.
One of advantages of this functionality is the possibility to switch from local hosted dependencies to online hosting and vis versa, without change concerned code in a associated project.
```js
bower.cdn.usage = true ;

bower.import("vue") ;
bower.import("d3") ;
bower.import("aos") ;

bower.ready( function (err) {

   alert("after all previous importation. [error: "+ err.occured +"]") ;
}) ;
```
In the browser, packages's configurations can be access via the `bower.components` properties; and imported packages's tree dependencies via the `bower.packagesTree` properties.
What about to give more informations about libraries that powered a project ?
```js
bower.ready( function (err) {

   if (err.occured) {
      if (err.fromBrowser) console.error('Oops it seems that: '+ err.fromBrowser.join(', ') +' occured a loading error from: browser');
      if (err.fromBowerder) console.error('Oops it seems that: '+ err.fromBowerder.join(', ') +' occured a loading error from: bowerder');
      return null; // interruption 
   }

   var aboutV = new Vue({
      el: '#about',
      data: {
       poweredBy: bower.packagesTree
      }
   });
}
```
```html
<div id="about">
   <h4>love and thank to these modules:</h4>
   <div class='card-panel' v-for="pkg in poweredBy">
      <h5 class='card-title'>{{pkg.name}}</h5>
      <div class='card-content'>
         <b>author: </b><span>{{pkg.authors[].join(', ')}}</span><br/>
         <b>description: </b><span>{{pkg.description}}</span><br/>
         <b>homepage: </b><span>{{pkg.homepage}}</span><br/>
      </div>
   </div>
</div>
```

When the local registry isn't available or updated, bowerder will try to load packages through Ajax API; which can play on expected performances. 
The `data-bowerreg` attribute in the bowerder's script tag also contribute to the magic; without it, 
developer will have to manually include the local registry and set the bower components directory of the project.
```js
   bower.dir = 'path-to-bower-components-dir';
```

Enable the *development mode* is recommended if you want all print's trace of the loading process's warnings/errors.
```js
bower.devMode = true;
```

Bowerder way is simple. Except the usage of feature like `import` provided by es6-next, for those who think that, 
concatanation of their modules's main files in big one is the only way to really optimize loading on browsers have to note that it is disputable;
specially in development purpose. Ask yourself why best download manager use to download file in mutiple sub-parts even if that implies more requests to send.
Likewise, server can be configured to send compressed files to client so that transactions become faster. Even if one time download can be a solution, 
it can have a little negative influence on pages rendering process.


#### how to contirute ?

clone the repository an make a pull-request when your ready
```sh
$ git clone https://github.com/tnga/bowerder.git
```
install node modules dependencies
```sh
$ npm install
```
automate testing prerequisites
```sh
$ npm test
```
automate building task with your modifications:
*(look at `gulpfile.js` to see available task)*
```sh
$ gulp watch
```

Minification is a way for developer to have for some files a better loading optimization. However, `bower.json` spec do not allow to use minified files as mains files for a component.
Developers use to set associated `main` property with sources or developments files. Considering how web projects are now build, that pratice isn't advantageous for browsers.
Indeed, set an `index.scss`, `index.coffee` or an unminified `index.js` files *(depending of size)* for production as main files isn't actually good for browsers to digest.
That why bowerder now recommended to also set a `browser: {main: []}` properties for mains files that browsers can easly digest. Minified files with sourcemaps are specialy welcome in that case.

> If you like this module, you can give it a star and try to *pull request* to some libraries's repository like [bootstrap](http://github.com/twbs/bootstrap) which don't yet respect that behavior.

bowerder will use `browser: {main: []}` properties to load component's main files; if they aren't set, it will use the `main` property as default. 

**showcase**: *[font-awesome](http:////github.com/FortAwesome/Font-Awesome)'s* `bower.json`
```json
"main": [
   "less/font-awesome.less",
   "scss/font-awesome.scss"
],
"browser": {
   "main": ["css/font-awesome.min.css"]
}
```
Some libraries don't have that problem since their main files are distributions files.
 - *[aos](http://github.com/michalsnik/aos)'s* `bower.json`
 
   ```json
   "main": [
      "dist/aos.js",
      "dist/aos.css"
   ],
   ```
 - *[reveal.js](http://github.com/hakimel/reveal.js)'s* `bower.json`
 
   ```json
   "main": [
      "js/reveal.js",
      "css/reveal.css"
   ],
   ```

For others specifications and features, documentation isn't yet ready.

#### license MIT
Copyright (c) since june-2016 [Tindo N. Arsel](mailto:devtnga@gmail.com)

See [LICENSE](LICENSE.md) for more details.
