//bower.import('octicons');
bower.import('iui');
bower.import('reveal.js', function (err) {
	
	if (err.occured) {
		console.error('Oops it seems like `reveal.js` wasn\'t fully loaded by:'+ err.from) ;
		return null; // interruption
	}
	
	// More info https://github.com/hakimel/reveal.js#configuration
	Reveal.initialize({
		history: true,

		// More info https://github.com/hakimel/reveal.js#dependencies
		dependencies: [
			{ src: 'weblibs/reveal.js/plugin/markdown/marked.js' },
			{ src: 'weblibs/reveal.js/plugin/markdown/markdown.js' },
			//{ src: 'plugin/notes/notes.js', async: true },
			{ src: 'weblibs/reveal.js/plugin/highlight/highlight.js', async: true, callback: function() { hljs.initHighlighting(); } }
		]
	});
});