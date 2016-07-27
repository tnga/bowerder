iUI: inside user interface
==========================
> Simple mini sass/css library which provide some user's friendly designs for the associated projects.

It’s firstly build with [UMI web’s projects](http://umiproject.sf.net) and for css development.
However it can be use for any css projects.

By using the power of preprocessed stylesheet language like [sass](https://github.com/sass/sass), the goal is to build special css theme with beauty and elegant spirit.

Actually, the library is on building and it will continuous to grow up.

## Installation

There are two possibles ways. 

Note that, you can also partially use the library by firstly include the base theme and then include the target features styles (grids, collections, ...).
If you want to use the javaScript associated features, you will need to install or use [**ijs-core**](https://github.com/tnga/lib.ijs/) first.

1. The recommended way to install **iUI** is through **Bower**. To install [Bower](https://github.com/bower/bower), see the [Bower web site](http://bower.io/).

    Bower removes the hassle of dependency management when developing or consuming elements. When you install a component, Bower makes sure any dependencies are installed as well. So in the root of your project, just do:
    ```sh
    $ bower install iui
    ```
    Bower adds a `bower_components/` folder in your root's project where the libraries will be installed.

    When a new version of **iJS** is available, run bower update in your app directory to update your copy:
    ```sh
    $ bower update
    ```   
    Therefore, you use the library by include it to your project. Commonly:
    ```html
    <link rel="stylesheet" href="bower_components/iui/iui.min.css"></link>
    ```
2. [Download the code](https://github.com/tnga/lib.iui/archive/master.zip) and follow instructions.
    - The minify code is sufficient to include it to your project.
    - Read the documentation for more information.

## Contribution

To contribute, note that all the development features are done in `src/` directory.
Functionalities are grouped depending of what is added. 
When new group feature's file is created, it have to be specified in `./gulpfile.js` script.

`gulp build` command have to be use to build the library for browser side usage. 
Take it a look of `./gulpfile.js` for more informations.

Also note that [nodejs](https://nodejs.org) have to be installed and also [npm](https://npmjs.com) library's associated dependencies.

## LICENSE

Copyright (c) (December)-2015 -> (January)-2016 [Tindo Ngoufo Arsel](mailto:devtnga@gmail.com).

The LGPL version 2.1 or later. See [LICENSE.md](https://github.com/tnga/lib.iui/blob/master/LICENSE.md) for more details.

