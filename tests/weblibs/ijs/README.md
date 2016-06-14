iJS: inside JavaScript
======================
> Simple mini library which provide some functionalities that facilitate JavaScript development of the associated projects.

It’s firstly build with [UMI web’s projects](http://umiproject.sf.net) and for pure JavaScript development.
However it can be use for any JavaScript projects.

The goal is not to build another big library like Jquery, Mootools, AngularJS, ..., but to complete them.
The script is written in pure JavaScript, so it’s independent and can be easily associated to any previous libraries. 

## What’s there?

#### Internationalization

Actually the main feature of the library is the Javascript implementation of GNU Gettext API.   
[This implementation of GNU Gettext](http://tnga.github.io/lib.ijs/docs/iJS.Gettext.html), providing internationalization support for JavaScript. 
It differs from existing JavaScript implementations in that it will support all current Gettext features 
(ex. plural and context support), and will also support loading language catalogs from .mo, .po, 
or preprocessed json files (*converter included*).

In this case the "i" in **iJS** can be considered as **i**nternalization.
The following is an simple usage example: 
```js
//set the locale in which the messages will be translated
iJS.i18n.setlocale("fr_FR.utf8") ;
//add domain where to find messages data
iJS.i18n.bindtextdomain("domain_po", "./path_to_locale", "po") ;
//Always do this after a `setlocale` or a `bindtextdomain` call.
iJS.i18n.try_load_lang() ; //will load and parse messages data from the setting catalog.
//now print your messages
alert( iJS.i18n.gettext("messages to be translated") ) ;
//or use the easy way to print your messages
alert( iJS._("another way to get translated messages") ) ; 
```    
[Documentation]( http://tnga.github.io/lib.ijs/docs/iJS.Gettext.html) is a friend to see what are provided.

#### Animation

Animations features, are building in top of the [web-animation-js](https://github.com/web-animations) project.
There is a lot of predefined animations styles that are easy to use.
One of mains functionalities that are provided here is the support of [animate.css](https://daneden.github.io/animate.css/) features. The following is a simple usage example:
```js
//Select the elements to animate and enjoy!
var elt = document.querySelector("#notification") ;
iJS.animate(elt, "shake") ;
//it return an AnimationPlayer object
//animation iteration and duration can also be indicated.
var vivifyElt = iJS.animate(elt, "bounce", 3, 500) ;
vivifyElt.onfinish = function(e) {
//doSomething ...;
}
// less than 1500ms later...changed mind!
vivifyElt.cancel(); 
```
Read [i_animate.md](https://github.com/tnga/lib.ijs/blob/master/i_animate.md) to see available animations styles.
Take a look of associated [documentation here]( http://tnga.github.io/lib.ijs/docs/global.html#animate) 

Other example to better make a loader with images without use gif animation:
```js
var iloader = new iJS.mi_loader("img-loader", "./images", 3, "img_load") ;
iloader.startLoading(250) ; // default time interval 150
iloader.stopLoading(10000) ; //do not execute this for infinite animation  
```    
Take a look of associated [documentation here]( http://tnga.github.io/lib.ijs/docs/iJS.mi_loader.html).

Even if in this step of development, powerful thing can be done with it, more functionalities have to be added. So it will continuous to grow up.

#### Simples tools

See the [documentation](http://tnga.github.io/lib.ijs/docs/) for more informations about all the library’s features.

## Installation

There are three possibles ways. 
Note that, you can also partially use the library by firstly include the core script and then include the target features script (gettext, animation, ...).

1. The recommended way to install **iJS** is through **Bower**. To install [Bower](https://github.com/bower/bower), see the [Bower web site](http://bower.io/).

   Bower removes the hassle of dependency management when developing or consuming elements. When you install a component, Bower makes sure any dependencies are installed as well. So in the root of your project, just do:
   ```sh
    $ bower install ijs
   ```
   Bower adds a `bower_components/` folder in your root's project where the libraries will be installed.
   
   When a new version of **iJS** is available, run bower update in your app directory to update your copy:
   ```sh
    $ bower update
   ```   
    Therefore, you use the library by include it to your project. Commonly:
    ```html
    <script src="bower_components/ijs/i.min.js"></script>
    ```   

2. Directly include it in your project via the official link where you will sure to have the latest version. [Here is the link](http://tnga.github.io/lib.ijs/i.min.js).

   For partials usage of features, use the link bellow:
   
   - ijs - core : [-> link](http://tnga.github.io/lib.ijs/partials/i_core.min.js).
   - ijs - animation : [-> link](http://tnga.github.io/lib.ijs/partials/i_animation.min.js).
   - ijs - gettext : [-> link](http://tnga.github.io/lib.ijs/partials/i_gettext.min.js).
   
3. [Download the code](https://github.com/tnga/lib.ijs/archive/master.zip) and follow instructions.
  - The minify code is sufficient to include it to your project.
  - Read the documentation for more information.
  
## Contribution

To contribute, note that all the development features are done in `scr/` directory.
Functionalities are grouped depending of what is added. 
When new group feature's file is created, it have to be specified in `i-js-build` script.

`i-js-build` script have to be use to build the library for browser side usage. 
Take it a look for more informations.

Also note that [nodejs](https://nodejs.org) have to be installed and also [npm](https://npmjs.com) library's associated dependencies.

## LICENSE

Copyright (c) (April->November) - 2015 [Tindo Ngoufo Arsel](mailto:devtnga@gmail.com).

The LGPL version 2.1 or later. See [LICENSE.md](https://github.com/tnga/lib.ijs/blob/master/LICENSE.md) for more details.

