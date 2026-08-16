chrome.extension.onMessage.addListener(function (e, t, n) { if (e.request == "chromeFaviconUrl") { n({ chromeFaviconUrl: t.tab.favIconUrl }) } })
chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {

        if (request.Message == "getValue") {

            sendResponse(localStorage);

        }
        else
            sendResponse({});
    });

