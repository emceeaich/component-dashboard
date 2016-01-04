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

var statusLine = document.querySelector('div.status');

/* Set Up Fetch */

var bzRequest = new Request('https://bugzilla.mozilla.org/rest/bug?include_fields=id&component=Password%20Manager&product=Toolkit',
    { mode: 'cors' });

fetch(bzRequest)
.then(function(response) {
    if(response.ok) {
        response.json().then(function(json) {
            createReport(json.bugs);
        });
    }
    else {
        displayError('Request for bugs returned an invalid http response.')
    }
})
.catch(function(error) {
    displayError('Something went dreadfully wrong when we tried to request the bug list.');
});

/* Create an object to Classify Bugs */

var Bug = function(obj) {
    this.data = obj;

    this.category = function() {
        var result = [];

        if (this.hasBeenClosed()) {
            result = '[CLOSED]';
        }
        else if (this.isDone()) {
            result = '[DONE]';
        }
        else if (this.isInProgress()) {
            result = '[IN_PROGRESS]';
        }
        else if (this.hasBeenReleased()) {
            result = '[RELEASED]';
        }
        else if (this.isUnmerged()) {
            result = '[UNMERGED]';
        }
        else if (this.hasBeenPrioritized()) {
            result = '[PRIORITIZED]';
        }
        else if (this.needsPriority()) {
            result = '[NEEDS_PRIORITY]';
        }
        else if (this.hasVersion()) {
            result = '[HAS_VERSION]';
        }
        else if (this.isNew()) {
            result = '[NEW]';
        }
        else if (this.needsTriage()) {
            result = '[NEEDS_TRIAGE]';
        }
        else {
            console.log('Could not categorize', this.data.id, this.data.status, this.data.resolution);
        }

        return result;
    };

    this.hasBeenClosed = function() {
        return (['CLOSED', 'VERIFIED', 'RESOLVED'].indexOf(this.data.status.toUpperCase()) > -1 &&
                ['DUPLICATE', 'INVALID', 'INCOMPLETE',
                 'WONTFIX', 'WORKSFORME', 'EXPIRED'].indexOf(this.data.resolution.toUpperCase()) > -1);      
    };
    this.isDone = function() {
        return (this.data.status.toUpperCase() === 'VERIFIED');
    };
    this.isInProgress = function() {
        return (this.data.status.toUpperCase() === 'ASSIGNED');
    };
    this.hasBeenReleased = function() {
        return ((this.data.status.toUpperCase() === 'RESOLVED' &&
                 this.data.resolution.toUpperCase() === 'FIXED') &&
                (this.data.target_milestone !== '---' || 
                 this.isTrackingARelease()));
    };
    this.isUnmerged = function() {
        return ((this.data.status.toUpperCase() === 'RESOLVED' &&
                 this.data.resolution.toUpperCase() === 'FIXED') &&
                (this.data.target_milestone === '---' &&
                 !this.isTrackingARelease()));
    };
    this.hasBeenPrioritized = function() {
        return ((['P1', 'P2', 'P3'].indexOf(this.data.priority.toUpperCase()) > -1) ||
                this.hasFlag('firefox-backlog', '+'));
    };
    this.needsPriority = function() {
        return (this.hasFlag('firefox-backlog', '?') || this.data.status.toUpperCase() === 'REOPENED');
    };
    this.hasVersion = function() {
        return (this.isFlaggedForARelease());
    };
    this.isNew = function() {
        return (this.data.status === 'NEW');
    };
    this.needsTriage = function() {
        return (this.data.status === 'UNCONFIRMED');
    };
    this.hasFlag = function(name, status) {
        return (this.data.flags && this.data.flags.some(function(flag, i, arry) {
                    return (flag.name === name && flag.status === status);
                }));
    }
    this.isTrackingARelease = function() {
        var keys = Object.keys(this.data);
        var statusFlags = keys.filter(function(key, i, arr) {
            return (key.indexOf('cf_status_firefox') === 0);
        });
        return statusFlags.some(function(flag, i, arr) {
            return (['affected','fixed','verified'].indexOf(this.data[flag]) > -1);
        }, this);
    };
    this.isFlaggedForARelease = function() {
        var keys = Object.keys(this.data);
        var releaseFlags = keys.filter(function(key, i, arr) {
            return (key.indexOf('cf_tracking_firefox') === 0);
        });
        return releaseFlags.some(function(flag, i, arr) {
            return (['?'].indexOf(this.data[flag]) > -1);
        }, this);
    };
    return this;
}

function createReport(data) {
    console.log ('got', data.length, 'bugs');

    statusLine.innerText = 'Found ' + data.length + ' bugs';

    // take slices of the array and fetch each one's details
    var sliceSize = 50, offset = 0, more = true, slice, slices, buglist, subRequest, returns = 0, bugs = [], ids, timers, isErr = false, done = false, i = 0;

    slices = Math.ceil(data.length / sliceSize);
    console.log('will fetch', slices, 'slices of', sliceSize, 'bugs');    

    while (!done) {
        slice = data.slice(offset, offset + sliceSize);
        ids = slice.map(function(bug,i,arr) { return bug.id; }).join(',');

        if (slice.length > 0) {
            subRequest = new Request('https://bugzilla.mozilla.org/rest/bug?id=' + 
                ids, { mode: 'cors' });

            fetch(subRequest)
            .then(function(response) {
                if(response.ok) {
                    response.json().then(function(json) {
                        returns++; // count returned response
                        Array.prototype.push.apply(bugs, json.bugs);
                        if (returns === slices) {
                            console.log('got back all slices');
                            renderReport(bugs);
                        }
                        statusLine.innerText = 'Read ' + bugs.length + ' bugs';
                    });
                }
                else {
                    displayError('Request for bugs returned an invalid http response.');
                    done = true;
                }
            })
            .catch(function(error) {
                displayError('Something went dreadfully wrong when we tried to request the bugs.');
                done = true;
            });
        }
        offset = offset + sliceSize;
        i ++;
        if (i > slices) {
            done = true;
        }
    }
}

function renderReport(data) {
    var container = false, bar, legend, percent;
    var categories = classifyBugs(data);
    var total = 0;

    // Check our work
    console.log('Got back', data.length, 'bugs');
    Object.keys(categories).forEach(function(category, i, arr) { total = total + categories[category]; });
    console.log('Total', total, 'bugs');

    Object.keys(categories).forEach(function(category, i, arr) { 

        percent = Math.floor((categories[category] / total) * 100) + '%';

        if (typeof window !== 'undefined') {

            // Do this once
            if (!container) {
                container = document.querySelector('div.container');
                container.removeChild(statusLine);
            }
            bar = document.createElement('div');
            bar.className = 'bar';
            bar.style.width = percent;
            container.appendChild(bar);
            legend = document.createElement('span');
            legend.className = 'legend';
            legend.innerText = category + ': ' + categories[category] + ': ' + percent;
            bar.appendChild(legend);
        }
        else {
            console.log(category, categories[category], percent);    
        }

    });  
};

function displayError(text) {
    var message = document.querySelector('div.error div.message');
    message.innerText = text;
    document.querySelector('div.error').style.display = 'block';
}

function classifyBugs(data) {
    var categories = {};
    data.forEach(function(entry, i, arr) {
        var bug = new Bug(entry);
        var category = bug.category();
        if (categories[category]) {
            categories[category]++;
        }
        else {
            categories[category] = 1;
        }
    });
    return categories;
}

})();
