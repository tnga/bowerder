//manage possible conflict with loader namespace definition. 
if (typeof bower !== "undefined" && typeof bower.import !== "function" && typeof bower.addPackage !== "function") { console.warn("Seem like `bower` namespace is use for another purpose. Taking risk of an overwrite ..."); window.bower = bower = {};} else  if (typeof bower === "undefined") { window.bower = {};} 
//available packages
bower.components = {"animate.css":{"main":"./animate.css"},"aos":{"version":"1.2.0","homepage":"git://github.com/michalsnik/aos.git","authors":["Michał Sajnóg <michal.sajnog@hotmail.com>"],"main":["dist/aos.js","dist/aos.css"],"license":"MIT","dependencies":{}},"bootstrap":{"description":"The most popular front-end framework for developing responsive, mobile first projects on the web.","homepage":"http://getbootstrap.com","license":"MIT","main":["less/bootstrap.less","dist/js/bootstrap.js"],"dependencies":{"jquery":"1.9.1 - 2"}},"font-awesome":{"description":"Font Awesome","homepage":"http://fontawesome.io","dependencies":{},"devDependencies":{},"license":["OFL-1.1","MIT","CC-BY-3.0"],"main":["less/font-awesome.less","scss/font-awesome.scss"]},"headjs":{"description":"HeadJS: Responsive Design, Feature Detections & Asset Loading. The only script in your <HEAD>","version":"1.0.3","license":"MIT","authors":[{"name":"Tero Piirainen"},{"name":"Robert Hoffmann"}],"homepage ":"http://headjs.com","main":["./dist/1.0.0/head.min.js","./dist/1.0.0/head.min.js.map","./dist/1.0.0/changelog.txt"],"directory":"public/scripts","repository":{"type":"git","url":"git://github.com/headjs/headjs.git"}},"ijs":{"homepage":"https://github.com/tnga/lib.ijs","authors":["tnga <devtnga@gmail.com>"],"description":"\"Mini library for javaScript language. It provide functionalities that facilitate web's project development and it can be associated with all existing JS libraries.\"","main":"i.min.js","license":"LGPL 2.0 or later"},"jquery":{"main":"dist/jquery.js","license":"MIT"},"reveal.js":{"version":"3.2.0","main":["js/reveal.js","css/reveal.css"],"homepage":"http://lab.hakim.se/reveal-js/","license":"MIT","description":"The HTML Presentation Framework","authors":["Hakim El Hattab <hakim.elhattab@gmail.com>"],"dependencies":{"headjs":"~1.0.3"},"repository":{"type":"git","url":"git://github.com/hakimel/reveal.js.git"}}};