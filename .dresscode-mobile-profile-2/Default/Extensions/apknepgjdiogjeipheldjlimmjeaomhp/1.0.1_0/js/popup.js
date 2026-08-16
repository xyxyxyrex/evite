var canvas = document.getElementById("canvas");
var ctx = canvas.getContext("2d");
var cw = canvas.width;
var ch = canvas.height;
var maxW = 16;
var maxH = 16;


var input = document.getElementById('input');
var output = document.getElementById('file_output');

let homepage = "https://favicon-changer.freefinancetools.net";

input.addEventListener('change', handleFiles);


document.getElementById("settings").addEventListener("click", function () {
    chrome.runtime.openOptionsPage();
})
document.getElementById("allow").addEventListener("click", function () {
    chrome.tabs.create({ 'url': 'edge://extensions/?id=' + chrome.runtime.id });
})
document.getElementById("drive").href = `${homepage}/drive-feature`;
document.getElementById("home").href = `${homepage}`;
document.getElementById("rate").href = `https://microsoftedge.microsoft.com/addons/detail/${chrome.runtime.id}/reviews`;
function init() {
    isBookmarked();
    lastFaviconChange();


}
init();
function showButton() {
    document.getElementById("btnList").style.display = "block";
}
function isBookmarked() {

    chrome.tabs.query({ 'active': true, 'windowId': chrome.windows.WINDOW_ID_CURRENT },
        function (tabs) {

            //data
            var currentURL = tabs[0].url.split('?')[0];

            //localStorage.removeItem("LangSave");
            chrome.bookmarks.search(currentURL, function (result) {
                if (result.length > 0) {
                    document.getElementById("isBookmarked").style.display = "block";
                }
                else {
                    document.getElementById("isNotBookmarked").style.display = "block";
                }
            })



        });

}

function lastFaviconChange() {


    chrome.tabs.query({ 'active': true, 'windowId': chrome.windows.WINDOW_ID_CURRENT },
        function (tabs) {

            //data
            var currentURL = tabs[0].url.split('?')[0];

            //localStorage.removeItem("LangSave");
            var lastChanged = localStorage.getItem(currentURL);
            if (lastChanged) {
                document.getElementById("lastChange").style.display = "block";
                document.getElementById("imgLastChange").setAttribute("src", lastChanged)
                console.log("has last change")
            }


        });

}
function handleFiles(e) {
    var img = new Image;
    img.onload = function () {
        var iw = img.width;
        var ih = img.height;
        var scale = Math.min((maxW / iw), (maxH / ih));
        var iwScaled = iw * scale;
        var ihScaled = ih * scale;
        canvas.width = iwScaled;
        canvas.height = ihScaled;
        ctx.drawImage(img, 0, 0, iwScaled, ihScaled);
        output.value = canvas.toDataURL("image/img", 0.5);
        showButton();
    }
    img.src = URL.createObjectURL(e.target.files[0]);
}
document.getElementById("clear").addEventListener('click', function () {

    chrome.tabs.query({ 'active': true, 'windowId': chrome.windows.WINDOW_ID_CURRENT },
        function (tabs) {

            //data
            var currentURL = tabs[0].url.split('?')[0];
            localStorage.removeItem(currentURL);
            chrome.tabs.reload(tabs[0].id, function () {
                window.close();
            })



        });
})
document.getElementById("change").addEventListener('click', function () {
    var fileOutput = document.getElementById("file_output");

    chrome.tabs.query({ 'active': true, 'windowId': chrome.windows.WINDOW_ID_CURRENT },
        function (tabs) {

            //data
            var currentURL = tabs[0].url.split('?')[0];
            var urlCheck = currentURL.split('/');
            if (urlCheck[0].indexOf("chrome") > -1) {
                sendMsg("cant_change".loc());
                return;
            }
            //localStorage.removeItem("LangSave");
            localStorage.setItem(currentURL, fileOutput.value);
            sendMsg("success".loc());
            chrome.tabs.reload(tabs[0].id, function () {
                lastFaviconChange();
                console.log("reload")
            })



        });

});

document.querySelectorAll("[data-loc]").forEach(el => {
    const key = el.getAttribute("data-loc");
    el.innerHTML = key.loc();
});
function sendMsg(msg) {
    var toast = document.getElementById("toast")
    toast.innerHTML = msg;
    //hide toast
    setTimeout(() => {
        toast.innerHTML = "";
    }, 2000);

}


for (var a in localStorage) {
    console.log(a, ' = ', localStorage[a]);
}
//inject JS
async function onLoaded() {
    const tab = await getActiveTabAsync();
    if (!tab) {
        return;
    }


    const tabId = tab.id;
    //inject CSS & JS
    chrome.tabs.sendMessage(tabId, { "message": "isInjected" }, (response) => {

        if (response !== "yes") {

            chrome.tabs.executeScript(tabId, {
                file: "/js/content.js",
            });
        }

    })

}
onLoaded();

function getActiveTabAsync() {
    return new Promise(resolve => {
        chrome.tabs.query({
            active: true,
            currentWindow: true,
        }, tabs => resolve(tabs[0]));
    });
}

