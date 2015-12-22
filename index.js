/*
 * Read folklore, write status.
 *
 * See LICENCE for Licenses
 *
 * (c) 2015, Mozilla Corporation
 */

var bz = require("bz");
var client = bz.createClient({timeout: 30000});

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
        return (this.data.status === 'NEW' ||
                this.data.status === 'UNCONFIRMED');
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

client.searchBugs({product: 'Toolkit', component: 'Password Manager'}, function(error, data) {
    if (!error) {
        console.log('Got back', data.length, 'bugs');
        classifyBugs(data);
    }    
    else {
        console.log(error);
    }
});

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
    console.log(categories);
}

