/*
 * Read folklore, write status.
 *
 * See LICENCE for Licenses
 *
 * (c) 2015, Mozilla Corporation
 */

(function() {

if (typeof fetch === 'undefined') {
    displayError('This requires a browser that supports <code>fetch</code>. Try with Firefox or Chrome.');
}

var AGE  = 2*60*60*24*7*1000; // weeks in µ seconds

var statusLine = document.querySelector('div.status');
var totalLine  = document.querySelector('div.total');
var table      = document.querySelector('div.bug-list table');
var product    = "Core, Toolkit, Firefox, and Fennec (Android/iOS)";
var lastWeek   = "2016-01-19"; // fake it for now

document.querySelector('h1').innerText = 'Component Triage Dashboard for ' + product;

/* Set Up Fetch */

var bzRequest = new Request('https://bugzilla.mozilla.org/rest/bug?' +
    'include_fields=id,summary,product,component,status,resolution' + 
    '&product=Core&product=Firefox&product=Firefox%20for%20Android&product=Firefox%20for%20iOS&product=Toolkit' +
    '&status=NEW&last_change_time=' + lastWeek, { mode: 'cors' });

fetch(bzRequest)
.then(function(response) {
    if(response.ok) {
        response.json().then(function(json) {
            createReport(json.bugs, 75);
        });
    }
    else {
        displayError('Request for bugs returned an invalid http response.')
    }
})
.catch(function(error) {
    displayError('Something went dreadfully wrong when we tried to request the bug list.');
});

/* Create an object to inspect bug history */
var History = function(obj) {
    this.history = obj.history;
    this.id      = obj.id;

    this.setInterestingHistory = function() {
        interestingChanges = [];
        this.history.sort(function(a, b) {
                return b - a;
            }).forEach(function(evt, i) {
            evt.changes.forEach(function(change, i) {
                if (change.field_name === 'component') {
                    interestingChanges.push('moved to component');
                }
                if (change.field_name === 'keywords' &&
                    change.added.match('crash')) {
                    interestingChanges.push('crasher');
                }
                if (change.field_name === 'keywords' &&
                    change.added.match('regression')) {
                    interestingChanges.push('regression');
                }
                if (change.field_name === 'keywords' &&
                    change.added.match('regressionwindowwanted')) {
                }
            });
        });
        this.interestingChanges = interestingChanges;
    };

    this.set = function(obj) {
        this.summary     = obj.summary || '';
        this.product     = obj.product     || '';
        this.component   = obj.component   || '';
        this['status']   = obj['status']   || '';
        this.resolution  = obj.resolution  || '';
    };
}

function createReport(data, sliceSize) {
    console.log ('got', data.length, 'bugs');
    
    var subRequest, history, bugHistories = [], done = false, resolved = 0, keys = {};

    if (data.length > 0) {
        totalLine.innerHTML = "<strong>Total:</strong> " + data.length;
    }
    else {
        totalLine.innerHTML = "<strong>zarro boogs found</strong>";
    }

    data.forEach(function(boog, i) {
        if (done) { return; }

        keys[boog.id] = {
            summary:     boog.summary,
            product:     boog.product,
            component:   boog.component,
            'status':    boog['status'],
            resolution:  boog.resolution
        };

        subRequest = new Request('https://bugzilla.mozilla.org/rest/bug/' + boog.id + '/history?new_since=' + lastWeek,
            {mode: 'cors'});

        fetch(subRequest).then(function(response) {
            if(response.ok) {
                response.json().then(function(json) {
                    json.bugs.forEach(function(bug, i) {
                        history = new History(bug);
                        history.set(keys[history.id]);
                        history.setInterestingHistory();
                        bugHistories.push(history);
                        resolved++;                        
                        statusLine.innerText = 'Boog ' + resolved;
                        if (resolved === data.length) {
                            done = true;
                            renderReport(bugHistories);
                        }
                    });        
                });
            } else {
                displayError('Request for bugs returned an invalid http response.');
                done = true;
            }
        })
        .catch(function(error) {
            displayError('Something went dreadfully wrong when we tried to request the bugs.');
            done = true;
        });
    });

}

function renderReport(data) {
    var container = false, li, interesting, options;
    var categories = classifyBugs(data);
    var total = 0;
    var interestingTotals = document.querySelector('ul.interesting-totals');

    // Check our work
    console.log('Got back', data.length, 'bugs');

    Object.keys(categories).forEach(function(category, i, arr) { 

        if (typeof window !== 'undefined') {
            // Do this once
            if (!container) {
                container = document.querySelector('div.container');
                container.removeChild(statusLine);
            }
            li = document.createElement('li');
            li.innerText = category + ': ' + categories[category];
            interestingTotals.appendChild(li);
        }
        else {
            console.log(category, categories[category], percent);    
        }

    }); 

    interesting = data.filter(function(bug, i) {
        return (bug.interestingChanges.length > 0);
    })
    .map(function(bug, i) {
        return {
                        // this is a hack because list.js does not support complex templates
                        // but the template code uses .innerHTML instead of innerText :(
            id:          '<a href="https://bugzilla.mozilla.org/show_bug.cgi?id=' + bug.id + '">' + bug.id + '</a>',
            component:   bug.product + ' : ' + bug.component,
            summary:     bug.summary,
            interesting: bug.interestingChanges.join(', '),
            'status':    bug['status'],
            resolution:  bug.resolution
        };
    });

    var interestingList = new List('bug-list', {
        valueNames: ['id', 'component', 'summary', 'interesting', 'status', 'resolution'],
        item: 'item-template'
    }, interesting);

    document.querySelector('#bug-list').style.display = '';
};

function displayError(text) {
    var message = document.querySelector('div.error div.message');
    message.innerText = text;
    document.querySelector('div.error').style.display = 'block';
}

function classifyBugs(data) {
    var categories = {};
    data.forEach(function(entry, i, arr) {
        entry.interestingChanges.forEach(function(change, i) {
            var category = change;
            if (categories[category]) {
                categories[category]++;
            }
            else {
                categories[category] = 1;
            }
        });
    });
    return categories;
}

})();
