setPanelSize();
var tree = $('#jstree');
function getRoot() {
    return typeof InstallTrigger !== 'undefined' ? 'root_____' : '0';
}


tree.string = {};
tree.plugins = ['dnd', 'types', 'conditionalselect', 'state'];

if (localStorage.getItem('sort') === 'true') {
    tree.plugins.push('sort');
}
tree.jstree("refresh");

tree.element = id => $('#' + id);

tree.activate = () => {
    const ids = tree.jstree('get_selected');
    const id = ids[0];
    tree.jstree('hover_node', tree.element(id));

    window.setTimeout(() => tree.focus(), 120);
};

tree.string.escape = str => str
    .replace(/'/g, '&#039;')
    .replace(/</g, '&lt;')
    .replace(/&/g, '&amp;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
tree.string.uscape = str => str
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#039;/g, `'`)
    .replace(/&amp;/g, '&');

tree.jstree({
    'types': {
        'dFolder': {
        },
        'file': {
            'icon': 'item',
            'max_children': 0
        }


    },
    'sort': function (a, b) {
        a1 = this.get_node(a);
        b1 = this.get_node(b);
        if (a1.icon == b1.icon) {
            return (a1.text > b1.text) ? 1 : -1;
        } else {
            return (a1.icon > b1.icon) ? 1 : -1;
        }
    },
    'plugins': tree.plugins,

    'core': {
        'check_callback': (ope, node) => {
            if (ope === 'move_node') {
                return node.data.drag;
            }

            if (ope === 'edit') {
                return false;
            }
            return true;
        },
        'multiple': true,
        'data': (obj, cb) => {

            chrome.bookmarks.getChildren(obj.id === '#' ? getRoot() : obj.id, nodes => {
                cb(nodes.map(node => {
                    const children = !node.url;
                    const drag = node.parentId !== '0' && node.parentId !== 'root_____';
                    return {
                        text: tree.string.escape(node.title),
                        id: node.id,
                        type: children ? (drag ? 'folder' : 'dFolder') : 'file',
                        icon: children ? null : utils.favicon(node.url),
                        children,
                        a_attr: { // open with middle-click
                            href: node.url || '#'
                        },
                        data: {
                            dateGroupModified: node.dateGroupModified,
                            dateAdded: node.dateAdded,
                            url: node.url || '',
                            drag
                        },
                        state: {
                            hidden: node.url && node.url.startsWith('place:')
                        }
                    };
                }));
            });

        }
    },

});


// double click event

tree.on('dblclick.jstree', e => {
    const ids = tree.jstree('get_selected');
    const node = tree.jstree('get_node', ids[0]);
    if (node && node.data && node.data.url) {
        const url = node.data.url;
        chrome.tabs.query({
            active: true,
            currentWindow: true
        }, tabs => {
            // if current tab is new tab, update it
            if (tabs.length && tabs[0].url === 'edge://newtab/' || tabs[0].url === 'about:newtab') {
                chrome.tabs.update({
                    url
                });
            } else {
                chrome.tabs.create({
                    url
                });
            }
            if (location.search.indexOf('in=') === -1) {
                window.close();
            }
        });
    }
});


//move node event
tree.on('move_node.jstree ', (e, data) => {

    chrome.bookmarks.move(data.node.id, {
        parentId: data.parent,
        index: data.position + (data.position > data.old_position ? 1 : 0)
    }, () => {
        let lerror = chrome.runtime.lastError;
        if (lerror) {
            notify.inline('Refresh First ' + lerror.message);
        }
    });

});
function showButton() {
    document.getElementById("btnList").style.display = "block";
}
// on selected event
tree.on('select_node.jstree', (e) => {
    const ids = tree.jstree('get_selected');
    const node = tree.jstree('get_node', ids[0]);
    //console.log(node);
    const icon = node.icon;
    const url = node.data.url;
    console.log(url);
    var check = document.getElementById("changeFaviconSection");
    if (url != "")
        check.style.display = "block";
    else
        check.style.display = "none";
    document.getElementById("bookmarkFavicon").setAttribute("src", icon);
    document.getElementById("url").value = url;


});



function sendMsg(msg) {
    var toast = document.getElementById("toast")
    toast.innerHTML = msg;
    //hide toast
    setTimeout(() => {
        toast.innerHTML = "";
    }, 2000);

}

//click change event
document.getElementById("change").addEventListener('click', function () {

    var currentURL = document.getElementById("url").value;
    chrome.tabs.create({ url: currentURL });

});


document.querySelectorAll("[data-loc]").forEach(el => {
    const key = el.getAttribute("data-loc");
    el.innerHTML = key.loc();
});

//set panel size
function setPanelSize() {


    width = 400;
    height = 350;
    var panel = document.getElementById("app");
    panel.style.width = width + "px";
    panel.style.height = height + "px";
}

