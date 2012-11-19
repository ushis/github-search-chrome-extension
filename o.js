(function() {

  // Initialize o.
  this.o = o = {};

  // Initialize the o configuration object.
  o.config = {};

  //
  // Utils.
  //

  // Some configuration.
  o.config.utils = {

    // XML sanitization rules.
    sanitizationRules: [
      [/&/g, '&amp;'],
      [/</g, '&lt;'],
      [/>/g, '&gt;'],
      [/"/g, '&quot;']
    ]
  };

  // Common utilities
  o.utils = {

    // Checks if a string contains a HTTP(s) url.
    isUrl: function(string) {
      return !! string.match(/^http(?:s)?:\/\//);
    },

    // Creates a tag with some content.
    //
    //   tag('dim', 'Hello World');
    //   //=> '<dim>Hello World</dim>'
    //
    // Returns a String.
    tag: function(tag, content) {
      return '<' + tag + '>' + content + '</' + tag + '>';
    },

    // Wrappes substrings in <match> tags.
    highlight: function(string, query) {
      if (query === '') return string;

      query = query.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');

      return string.replace(RegExp(query, 'gi'), this.tag('match', '$&'));
    },

    // Sanitizes the argument. Returns a string.
    sanitize: function(obj) {
      if (obj === null || obj === undefined) {
        return '';
      }

      if (typeof(obj) !== 'string') {
        obj = String(obj);
      }

      o.config.utils.sanitizationRules.forEach(function(rule) {
        obj = obj.replace(rule[0], rule[1]);
      });

      return obj;
    },

    // Returns an array of all sanitized arguments.
    sanitizeAll: function() {
      return Array.prototype.map.call(arguments, function(arg) {
        return this.sanitize(arg);
      }, this);
    },

    // Debounces a function.
    debounce: function(callback, delay) {
      var timeout;

      return function() {
        var self = this, args = arguments;
        clearTimeout(timeout);

        timeout = setTimeout(function() {
          callback.apply(self, args);
        }, delay);

        return this;
      };
    }
  };

  //
  // Cache.
  //

  // Cache configuration.
  o.config.cache = {

    // Invalidate cached item after 24 hours.
    ttl: 1000 * 60 * 60 * 24,

    // Suffix for timestamp keys.
    timestampSuffix: '%timestamp'
  };

  // Cache.
  o.cache = {

    // Retrieves an item from the cache.
    get: function(key, callback) {
      var timestampKey = this.timestampKeyFor(key);

      chrome.storage.local.get([key, timestampKey], function(results) {
        if (results[timestampKey] > +new Date() - o.config.cache.ttl) {
          callback(results[key] || null);
        } else {
          callback(null);
        }
      });
    },

    // Stores an item in the cache.
    set: function(key, value) {
      var item = {};
      item[key] = value;
      item[this.timestampKeyFor(key)] = +new Date();
      chrome.storage.local.set(item);
    },

    // Returns the timestamp key for a key.
    timestampKeyFor: function(key) {
      return key + o.config.cache.timestampSuffix;
    }
  };

  //
  // Ajax.
  //

  // Some ajax coniguration.
  o.config.ajax = {

    // Try to parse responses.
    json: true
  };

  // The o ajax module.
  o.ajax = {

    // Gets some data.
    get: function(url, callback) {
      o.cache.get(url, function(value) {
        if (value) {
          return callback(value);
        }

        var xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        xhr.send();

        xhr.onreadystatechange = function() {
          if (xhr.readyState !== 4) return;

          if ((xhr.status < 200 || xhr.status > 299) && xhr.status !== 304) {
            return console.log('[Ajax] Error ' + xhr.status + ': ' + url);
          }

          if ( ! o.config.ajax.json) {
            callback(xhr.responseText);
            return o.cache.set(url, xhr.responseText);
          }

          try {
            value = JSON.parse(xhr.responseText);
          } catch (_) {
            return console.log('[Ajax] Invalid JSON: ' + xhr.responseText);
          }

          callback(value);
          o.cache.set(url, value);
        };
      });
    }
  };

  //
  // History.
  //

  // History configuration.
  o.config.history = {

    // Store max 100 items in the history.
    length: 100,

    // Find max 5 results.
    maxResults: 5,

    // localStorage key.
    storageKey: 'history.history'
  };

  // History class.
  var History = function() {
    this.key = o.config.history.storageKey;

    try {
      this.history = JSON.parse(localStorage.getItem(this.key));
    } catch(_) {};

    if ( ! (this.history instanceof Array)) {
      this.history = [];
    }

    // Pushes a value into the history.
    this.push = function(value) {
      var i = this.history.indexOf(value);

      if (i > -1) {
        this.history.splice(i, 1);
      }

      this.history.push(value);

      if (this.history.length > o.config.history.length) {
        this.history.shift();
      }

      this.save();
    };

    // Finds some history items.
    this.find = function(query, callback) {
      callback(this.history.filter(function(value) {
        return value.toLowerCase().indexOf(query) > -1;
      }).slice(- o.config.history.maxResults).reverse());
    };

    // Stores the history.
    this.save = function() {
      try {
        localStorage.setItem(this.key, JSON.stringify(this.history));
      } catch (_) {
        console.log('[History] Could not save history: ' + this.history);
      }
    };
  };

  o.history = new History();
}).call(this);
