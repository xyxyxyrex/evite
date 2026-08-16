 
chrome.browserAction.onClicked.addListener(function(tab) {
  // No tabs or host permissions needed!
 executeScriptAsync();
});
const injectScripts = [ "js/jquery.js", "js/content.js" ];

	for (const file of injectScripts) {
	    await executeScriptAsync(tab.id, file);
	}

 



function getCurrentTabAsync() {
    return new Promise(resolve => {
        chrome.tabs.query({
            currentWindow: true,
            active: true
        }, (tabs) => resolve(tabs[0]));
    });
}

function executeScriptAsync(tabId, file) {
    return new Promise(resolve => {
        chrome.tabs.executeScript(tabId, {
            file: file,
        }, resolve);
    });
}