
function init(response) {

    console.log(response)
    var t = location.href;
    var thisURL = t.split('?')[0];
    // iterate localStorage
    for (var a in response) {
        //console.log(a, ' = ', response[a]);
        if (a == thisURL) {
            addFavicon(response[a])
        }
    }



}
init();

function addFavicon(imgData) {
    var e = document.getElementsByTagName("head")[0];
    if (!e) {
        var e = document.createElement("head");
        document.getElementsByTagName("html")[0].insertBefore(e, document.getElementsByTagName("body")[0])
    }
    var t = e.getElementsByTagName("link");
    for (i = 0; i < t.length; i++) {
        if (t[i].rel.toLowerCase() == "icon" || t[i].rel.toLowerCase() == "shortcut icon") {
            t[i].rel = "none";
            t[i].id = "originalFavicon"
        }
    }
    var n = document.createElement("link");
    n.rel = "icon";
    n.type = "image/x-icon";
    n.href = imgData;
    n.id = "customFavicon";
    e.appendChild(n)
}

//send msg
chrome.runtime.sendMessage({
    Message: "getValue"
}, function (response) {
    init(response);
})
