'use strict';

var utils = {};

utils.copy = text => {
    document.oncopy = event => {
        event.clipboardData.setData('Text', text);
        event.preventDefault();
    };
    document.execCommand('Copy');
    document.oncopy = undefined;
};

utils.favicon = (() => {
    return url => {
        if (url.startsWith('/')) {
            return url;
        }

        return 'edge://favicon/' + url;
    };
})();
String.prototype.loc = function () {
    return chrome.i18n.getMessage(this) || this;
}