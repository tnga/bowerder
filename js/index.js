//bower.cdn.usage = true;

bower.import('ijs');
bower.import('iui');
bower.import('reveal.js', function (err) {
	
	if (err.occured) throw new Error('Oops it seems like `reveal.js` wasn\'t fully loaded by:'+ err.from) ;
	
	// More info https://github.com/hakimel/reveal.js#configuration
	Reveal.initialize({
		history: true,

		// More info https://github.com/hakimel/reveal.js#dependencies
		dependencies: [
			{ src: basePath +'/weblibs/reveal.js/plugin/markdown/marked.js' },
			{ src: basePath +'/weblibs/reveal.js/plugin/markdown/markdown.js', callback: function() { document.getElementById('bowerder-logo').src = basePath +'/bowerder.png' } },
			//{ src: basePath +'/plugin/notes/notes.js', async: true },
			{ src: basePath+ '/weblibs/reveal.js/plugin/highlight/highlight.js', async: true, callback: function() { hljs.initHighlighting(); } }
		]
	});
});
bower.import('vue', function (err) {
	
	if (err.occured) throw new Error('Oops it seems like `vue` wasn\'t fully loaded by:'+ err.from) ;
	
	var iconView = new Vue({
		el: '#fixed-icon',
		data: {
			basePath: basePath,
			fixedIconPath: this.basePath +'/icon.png'
		}
	});
	
	codeDemoView = new Vue({
		el: '#code-demo',
		data: {
			fnPoweredBy:"bower.ready( function (err) { \n\n"+
					"\t if (err.occured) { \n"+
			        "\t\t if (err.fromBrowser.length !== 0) console.error('Oops it seems that: '+ err.fromBrowser.join(', ') +' occured a loading error from: browser'); \n"+
						"\t\t if (err.fromBowerder.length !== 0) console.error('Oops it seems that: '+ err.fromBowerder.join(', ') +' occured a loading error from: bowerder'); \n"+
						"\t\t // return null; // interruption \n"+
					"\t } \n\n"+
					"\t var aboutV = new Vue({ \n"+
					"\t\t el: '#about-view',\n"+
						"\t\t data: { \n"+
							"\t\t\t poweredBy: bower.packagesTree \n"+
						"\t\t } \n"+
					"\t }); \n\n"+
					"\t openMIDialog( document.getElementById('about-view').innerHTML, '70%') ; \n"+
				"});"
		},
		methods: {
			demoPoweredBy: function () { eval( this.fnPoweredBy );}
		}
	});
});

bower.ready( function (err) {
	
	// show the page rendering
	setSideBarDisplay();
	document.getElementsByClassName('reveal')[0].removeAttribute('data-hidden') ;
	// hide sidebar after 10s
	setTimeout( setSideBarDisplay, 10000);
	
	if (typeof iJS !== "undefined") {
		
		iJS.animate( dialogSectionContent, 'shake');
		iJS.animate('fixed-icon', 'pulse', -1);
		iJS.animate('with-heart', 'pulse', -1);
	}
	
	if (err.occured) {
		var errMsg = '' ;
		if (err.fromBrowser.length !== 0) errMsg += 'Oops it seems like: '+ err.fromBrowser.join(', ') +' occured a loading error from: browser \n';
		if (err.fromBowerder.length !== 0) errMsg += 'Oops it seems like: '+ err.fromBowerder.join(', ') +' occured a loading error from: bowerder';
		
		dialogSectionContent.innerHTML = '<center style="color:red">'+ errMsg.replace('\n', '<br />') +'</center>';
		console.error( errMsg ) ;
		return null;
	}
	
	dialogSectionContent.innerHTML = '<center style="color:green">needed modules have been successfully loaded by <b>bowerder</b></center>';
});


// first execution
//----------------
var codeDemoView = undefined ;
var basePath = !bower.cdn.usage ? '.' : 'cdn.rawgit.com/tnga/bowerder/gh-pages' ;
var dialogSectionContent = openMIDialog('<center><i class="loading"></i><br/> waiting for modules loading ...</center>') ;
//--------------------
// end first execution


function setSideBarDisplay() {
	
	var sidebar = document.getElementById('sidebar');
	if (sidebar.hasAttribute('data-hidden')) {
		
		if (typeof iJS !== "undefined") iJS.animate( sidebar, 'slide-in-left');
		sidebar.removeAttribute('data-hidden');
	} 
	else {
	
		if (typeof iJS !== "undefined") {
			var outAnime = iJS.animate( sidebar, 'slide-out-left');
			outAnime.onfinish = function () {sidebar.setAttribute('data-hidden', true);}
		}
		else sidebar.setAttribute('data-hidden', true);
	}
}

// @TODO remove this below hack when will upgrade to a next stable IUI production, considering that it will be a part functionnality

/* Cette fonction définie et crée une "boite de dialogue" personnalisée (pas vraiment au sens propre).
 * Elle permet d'afficher du texte ou le résultat d'un code ou modèle HTML.
 * Le style appliqué à cette "boite de dialogue" est défini dans le fichier de style approprié
 * La définition de style des éléments enfants peut se faire à partir du sélecteur ".main-fixed-block" ou "#mi-dialog-panel>section".
 *
 * Le code minimal HTML généré dans l'élément "body" est le suivant:
 * <DIV class="main-fixed-block" id="mi-dialog-panel" >

		<Section>
			<button class="b-dialog-close" id="b-panel-close">X</button>
		</Section>

	</DIV>
*/
function openMIDialog(content, dWidth, dHeight) {

	var closeButton = document.createElement("button");
	closeButton.className = "b-dialog-close";
	//closeButton.id = "b-panel-close";
	closeButton.innerHTML = "X";

	//le conteneur principale
	var dialogSection = document.createElement("section");
	dialogSection.appendChild(closeButton);

	//prise en charge du contenu en fonction du type référence
	var paragraph = document.createElement("p");
	if (typeof content === 'string' ) {
		paragraph.innerHTML = content;
	} else if (content instanceof HTMLElement) {
		paragraph.appendChild(content);
	}
	dialogSection.appendChild(paragraph);

	if (typeof dWidth === 'number')
		dialogSection.style.width = dWidth + "px";
	else if (typeof dWidth === 'string')
		dialogSection.style.width = dWidth; //exple: dWidth=300px ou 50%

	if (typeof dHeight === 'number')
		dialogSection.style.height = dHeight + "px";
	else if (typeof dHeight === 'string')
		dialogSection.style.height = dHeight; //exple: dHeight=300px ou 50%

	//block fixe principale: conteneur global
	var mainFixedBlock = document.createElement("div");
	mainFixedBlock.className = "main-fixed-block mi-fixed-dialog";
	mainFixedBlock.id = "mi-dialog-panel";
	mainFixedBlock.appendChild(dialogSection);

	document.body.style.overflow = "hidden";
	document.body.appendChild(mainFixedBlock);
	
	if (typeof iJS !== "undefined") {
		
		iJS.animate( mainFixedBlock, 'fade-in');
		iJS.animate( dialogSection, 'fade-in-down');
	}

	//fermeture lors du clic sur le bouton considéré
	closeButton.onclick = function () {
		document.body.style.overflow = "auto";
		document.body.removeChild(mainFixedBlock);
	}

	//fermeture lors du clic sur un espace vide du conteneur global
	mainFixedBlock.addEventListener('click', function (e) {

		if (e.target.id == "mi-dialog-panel") {
			document.body.style.overflow = "auto";
			document.body.removeChild(mainFixedBlock);
		};

	}, false);

	//centre suivant la hauteur le contenu de la boite de dialogue
	var centerContentPosition = function () {

		maxDSHeight = mainFixedBlock.offsetHeight - (mainFixedBlock.offsetHeight * 30 / 100) ;

		if ( dialogSection.offsetHeight > maxDSHeight) {

			dialogSection.offsetHeight = (maxDSHeight >= 100) ? maxDSHeight + "px" : "100px" ;
			dialogSection.style.margin = "15% auto" ;

		} else {

			dsMargin = (mainFixedBlock.offsetHeight - dialogSection.offsetHeight) / 2 ;

			dialogSection.style.margin = dsMargin + "px auto" ;
		}
	}

	centerContentPosition() ;
	//pour centrer suivant la hauteur le contenu de la boite de dialogue
	window.addEventListener('resize', centerContentPosition, false);
	
	return paragraph ;
}