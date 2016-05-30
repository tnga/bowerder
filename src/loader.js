/* bower component loader for the browser
 ________________________________________________________________________________________
 *
 * Easly Import your components or libraries installed via bower to your project.
 * 
 * @license MIT
 * @author  [Tindo Ngoufo Arsel](mailto:devtnga@gmail.com)
*/

//manage possible conflict with loader namespace definition.
if ( typeof bower !== "undefined" ) {

    console.warn("Seem like `bower` namespace is use for another purpose. Taking risk of an overwrite ...") ;
    window.bower = bower = {} ;
    console.warn("Forcing `bower` namespace initialization ... done.") ;

} else {

    window.bower = {} ;
}

/* importing package is an interresting hack when we have to avoid duplicate import and manage dependencies.
 * the method here is to have a registry where we will add package's configuration in particular order (function of dependency or not).
 * package's configuration is an object build from `bower.json` assciated file.
 * dependencies will always be imported before package of which depends ; this influences how order is done in packages's configuration registry.
 * package have to have a unique occurrence on the registry ; this assure that we will not have duplicate component's import.
*/

bower.dir = "../.." ;      //bower base directory
bower.pkgCount = 0 ;       //number of package that have been loaded
bower.loadingCount = 0 ;   //have many package are in loading process
bower.total = 0 ;          //total number of packages that must to be loaded
bower.packagesTree = [] ;   //packages's configuration registry 

/**
 * get the text reponse throught an ajax request from a given path
 * @param   {string}   path     path where to get file's content
 * @param   {boolean}  isAsync  enable request asynchrone or not
 * @param   {function} callback the function to execute after the end of request process. take the returned object as argument 
 * @returns {object}   content the answer informations with this properties {error: boolean, status: number, statusText: string, text: string}
 */
bower.xhrGet = function (path, isAsync, callback) {
    
    if (typeof path !== "string" && !(path instanceof String)) {

        console.error("bowerder: path must be give as a string") ;
        return null ;
    }
    
    isAsync = (typeof isAsync === "boolean" || isAsync instanceof Boolean) ? isAsync : true ;
    callback = (typeof callback === "function" || callback instanceof Function) ? callback : undefined ;
    
    var xhr = undefined ;

    if (window.XMLHttpRequest) {

        xhr = new XMLHttpRequest(); //For Chrome, Firefox, Opera and others...

        if (xhr.overrideMimeType)
            xhr.overrideMimeType("text/xml"); //Avoid Safari’s bug
    }
    else if (window.ActiveXObject) {
        //For Internet Explorer
        try {
            xhr = new ActiveXObject("Msxml2.XMLHTTP");  
        } catch (e1) {
            try {
                xhr = new ActiveXObject("Microsoft.XMLHTTP");  
            } catch (e2) {
                console.warn( e1.message );
                console.warn( e2.message );
            }
        }
    }
    
    if (!(xhr instanceof Object)) {
        
        console.error("bowerder: Can’t init Ajax functionalities. Maybe it’s your browser version ?") ;
        return null ;
    }

    //on soumet les champs de connexion à la page de traitement approprié pour vérification
    xhr.open('GET', path, true) ;
    //xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded") ;
    // Si la requêtte s'est exécutée sans erreur on recupère le resultat du traitement
    xhr.send() ;
    
    xhr.onreadystatechange = function() {

        var response = {} ;
        response.error = false ;
        
        if(xhr.readyState == 4 && xhr.status == 200) {

            response.status = xhr.status ;
            response.text = xhr.responseText ;
            
            if (callback) callback( response ) ;
            
            return response ;
        } 
        else if ( xhr.status != 200) {
           
            response.status = xhr.status ;
            response.statusText = xhr.statusText ;
            response.error = true ;
            console.error("bowerder: Ajax request error (status: "+ xhr.status +"), try to check your connection. ") ;
            
            return response ;
        }
    }  
} ;

/**
 * helpfull to determine if a package is in the packages's configuration registry
 * @param   {string} pkgName the name of the package
 * @returns {number} index of the first occurrence of the given package. -1 if it's isn't in the registry.
 */
bower.packageIndex = function (pkgName) {
  
    if (typeof pkgName !== "string" && !(pkgName instanceof String)) {

        console.error("bowerder:packageIndex: argument must be a string" );
    }
    else {
        
        for (i in bower.packagesTree) {

            if (bower.packagesTree[i].name === pkgName) return i ;
        }
    }
    
    return -1 ;
} ;

bower.addPackage = function (pkgName, pkgCaller) {
    
    if (typeof pkgName !== "string" && !(pkgName instanceof String)) {
        
        console.error("bowerder:addPackage: argument must be a string" );
        return null ;
    }
    if (pkgCaller && (typeof pkgCaller !== "string") && !(pkgCaller instanceof String)) console.warn("bowerder:addPackage: argument must be a string") ;
    
    var isAlreadyOk = false ;
    
    /* check if package to load is already present in the registry.
     * if it's a dependency, check if it's present in the registry before package of which depends.
     * if so, nothing will be done, else the adding operation to the registry will be process.
    */
    for (i in bower.packagesTree.length) {
        
        if (bower.packagesTree[i].name === pkgName ) {
            
            isAlreadyOk = true ;
            
            if (pkgCaller && (bower.packageIndex( pkgCaller ) != -1) && (bower.packageIndex( pkgCaller ) < i)) isAlreadyOk = false ;
            
            break ;
        }
    }
    
    if (!isAlreadyOk) { //process the adding operation to the registry.
        
        bower.loadingCount++ ;
        
        bower.xhrGet( bower.dir +"/"+ pkgName +"/bower.json", true, function (reponse) {
            
            if (reponse.error) {
                
                bower.loadingCount-- ;
                console.error("bowerder:addPackage: unable to load `"+ pkgName +"` component." );
                
                return null ;
            }
            
            var pkgConfig = JSON.parse( reponse.text ) ; 
            
            if (pkgConfig instanceof Object) {
                
                delete pkgConfig['ignore'] ;
                delete pkgConfig['keywords'] ;
                delete pkgConfig['moduleType'] ;
                delete pkgConfig['resolutions'] ;

                /* if `pkgCaller` is set, then current loading package adress by `pkgName` is a dependency.
                 * therefore, it have to be added before the `pkgCaller` in the packages's configuration registry.
                 * else it's a just a package to add in the considered registry.
                */
                if (pkgCaller) {

                    if (bower.packageIndex( pkgCaller ) != -1) {

                        bower.packagesTree.splice( bower.packageIndex( pkgCaller ), 0, pkgConfig) ;
                    }
                }
                else {

                    bower.packagesTree.push( pkgConfig ) ;
                }

                //if the current loading package have dependencies, then also process their loading
                if (pkgConfig["dependencies"]) {
                    
                    var pkgDeps = Object.getOwnPropertyNames( pkgConfig["dependencies"] );

                    pkgDeps.forEach( function (name) {

                        bower.addPackage( name, pkgConfig["name"]) ;
                    }) ;
                }
            }
            else {

                console.warn("bowerder:addPackage: unable to load `"+ pkgName +"` component." );
            }
            
            bower.loadingCount-- ;
            
            //when all the loading package process are finished, process their importation on the DOM.
            if (bower.loadingCount === 0) {
                
                //be sure to have unique package occurence in package's tree
                for (var i=0; i < bower.packagesTree.length; i++) {
                    
                    for (var j=i+1; j < bower.packagesTree.length; j++) {
                    
                        if (bower.packagesTree[i].name === bower.packagesTree[j].name) {
                            
                            bower.packagesTree.splice( j, 1) ;
                            j-- ;
                        }
                    }
                }
                
                var pkgScriptTag = undefined ;
                
                bower.packagesTree.forEach( function (pkg) {
                    
                    if (typeof pkg.main === "string") pkg.main = [pkg.main] ;
                    for (index in pkg.main) {

                        pkgScriptTag = document.createElement("script") ;
                        pkgScriptTag.src = bower.dir +"/"+ pkg.name +"/"+  pkg.main[index] ;
                        document.head.appendChild( pkgScriptTag ) ;
                    }
                }) ;
                
                console.log(bower.packagesTree) ;
            }
        }) ;
    }
};


bower.import = function (pkgName) {
    
    if (typeof pkgName !== "string" && !(pkgName instanceof String)) {

        console.error("bowerder:import: argument must be a string" );
        return null ;
    }
    
    bower.addPackage( pkgName ) ;
};