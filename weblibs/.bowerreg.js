//manage possible conflict with loader namespace definition. 
if (typeof bower !== "undefined" && typeof bower.import !== "function" && typeof bower.addPackage !== "function") { console.warn("Seem like `bower` namespace is use for another purpose. Taking risk of an overwrite ..."); window.bower = bower = {};} else  if (typeof bower === "undefined") { window.bower = {};} 
//available packages
bower.components = {"headjs":{"description":"HeadJS: Responsive Design, Feature Detections & Asset Loading. The only script in your <HEAD>","version":"1.0.3","license":"MIT","authors":[{"name":"Tero Piirainen"},{"name":"Robert Hoffmann"}],"homepage ":"http://headjs.com","main":["./dist/1.0.0/head.min.js","./dist/1.0.0/head.min.js.map","./dist/1.0.0/changelog.txt"],"directory":"public/scripts","repository":{"type":"git","url":"git://github.com/headjs/headjs.git"}},"ijs":{"homepage":"https://github.com/tnga/lib.ijs","authors":["tnga <devtnga@gmail.com>"],"description":"\"Mini library for javaScript language. It provide functionalities that facilitate web's project development and it can be associated with all existing JS libraries.\"","main":"i.min.js","license":"LGPL 2.0 or later"},"iui":{"description":"Simple mini sass/css library which provide some user's friendly designs for the associated projects.","main":"iui.css","authors":["Tindo Ngoufo Arsel <devtnga@gmail.com>"],"license":"LGPL-2.1+","homepage":"https://github.com/tnga/lib.iui","dependencies":{"toast":"toast-grid#~1.0.0"}},"reveal.js":{"version":"3.3.0","main":["js/reveal.js","css/reveal.css"],"homepage":"http://lab.hakim.se/reveal-js/","license":"MIT","description":"The HTML Presentation Framework","authors":["Hakim El Hattab <hakim.elhattab@gmail.com>"],"dependencies":{"headjs":"~1.0.3"},"repository":{"type":"git","url":"git://github.com/hakimel/reveal.js.git"}},"toast":{"version":"1.0.0","main":["scss/_grid.scss"],"license":"MIT","homepage":"http://daneden.github.io/Toast"},"vue":{"main":"dist/vue.js","description":"Simple, Fast & Composable MVVM for building interative interfaces","authors":["Evan You <yyx990803@gmail.com>"],"license":"MIT"}};