(function() {

  //
  // Config.
  //
  var config = {

    // Chrome displays max 5 results.
    maxResults: 5,

    // XML sanitization rules.
    sanitizationRules: [
      [/&/g, '&amp;'],
      [/</g, '&lt;'],
      [/>/g, '&gt;'],
      [/"/g, '&quot;']
    ],

    // Cache related settings.
    cache: {

      // Invalidate cache item after 24 hours.
      ttl: 1000 * 60 * 60 * 24,

      // Sweep the cache every hour.
      sweepInterval: 1000 * 60 * 60 * 1,

      // Suffix for timestamp keys.
      timestampSuffix: '%timestamp'
    },

    // GitHub locations.
    locations: {
      html: {
        base: 'https://github.com',
        user: '/:user',
        repo: '/:user/:repo',
        search: '/search?q=:query'
      },
      api: {
        base: 'https://api.github.com',
        users: {
          repos: '/users/:user/repos?sort=pushed',
          search: '/legacy/user/search/:query'
        },
        repos: {
          search: '/legacy/repos/search/:query'
        }
      }
    }
  };

  //
  // Utils.
  //
  var utils = {

    // Checks if a string is a suffix of another string.
    endsWith: function(string, suffix) {
      return string.indexOf(suffix, string.length - suffix.length) !== -1;
    },

    // Simple check if a string contains a HTTP(S) url.
    isUrl: function(string) {
      return !! string.match(/^http(?:s)?:\/\//);
    },

    // Returns the url for an Array of keys or a dotted path.
    //
    //   urlFor('api.users.search', { query: 'torvalds' });
    //   //=> 'https://api.github.com/legacy/user/search/torvalds'
    //
    // The second argument is a object of with.
    urlFor: function(keys, params) {
      var path = config.locations;

      if ( ! (keys instanceof Array)) {
        keys = keys.split('.');
      }

      keys.forEach(function(key) {
        path = path[key];
      });

      for (var param in params) {
        path = path.replace(':' + param, encodeURIComponent(params[param]));
      }

      return config.locations[keys[0]].base + path;
    },

    // Sanitizes the argument. Returns a string.
    sanitize: function(obj) {
      if (obj === null || obj === undefined) {
        return '';
      }

      if (typeof(obj) !== 'string') {
        obj = String(obj);
      }

      config.sanitizationRules.forEach(function(rule) {
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
  var cache = {

    // Retrieves an item from the cache.
    get: function(key) {
      try {
        return JSON.parse(localStorage.getItem(key));
      } catch (error) {
        this.remove(key);
        return null;
      }
    },

    // Stores an item in the cache.
    set: function(key, value) {
      try {
        localStorage.setItem(key, value);
        this.setTimestampFor(key);
      } catch (error) {
        this.remove(key);
      }
    },

    // Removes an item from the cache.
    remove: function(key) {
      localStorage.removeItem(key);
      this.removeTimestampFor(key);
    },

    // Removes expired items from the cache.
    sweep: function() {
      Object.keys(localStorage).filter(function(key) {
        return ! (this.isTimestampKey(key) || this.isValid(key));
      }, this).forEach(function(key) {
        this.remove(key);
      }, this);
    },

    // Checks if a cached item is expired.
    isValid: function(key) {
      return this.getTimestampFor(key) > +new Date() - config.cache.ttl;
    },

    // Checks if a key is a timestamp key.
    isTimestampKey: function(key) {
      return utils.endsWith(key, config.cache.timestampSuffix);
    },

    // Returns the timestamp key for a key.
    timestampKeyFor: function(key) {
      return key + config.cache.timestampSuffix;
    },

    // Returns the timestamp of an item.
    getTimestampFor: function(key) {
      return Number(localStorage.getItem(this.timestampKeyFor(key))) || 0;
    },

    // Sets the timestamp of an item.
    setTimestampFor: function(key) {
      localStorage.setItem(this.timestampKeyFor(key), +new Date());
    },

    // Removes the timestamp of an item.
    removeTimestampFor: function(key) {
      localStorage.removeItem(this.timestampKeyFor(key));
    }
  };

  //
  // Ajax.
  //
  var ajax = {

    // Gets some data.
    get: function(path, params, callback) {
      var url = utils.urlFor(path, params);
      var value = cache.get(url);

      if (value) {
        return callback(value);
      }

      var xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.send();

      xhr.onreadystatechange = function() {
        if (xhr.readyState !== 4) return;

        if ((xhr.status < 200 || xhr.status > 299) && xhr.status !== 304) {
          return console.log('[XHR] Error ' + xhr.status + ': ' + url);
        }

        try {
          value = JSON.parse(xhr.responseText);
        } catch (error) {
          return console.log('[XHR] Invalid JSON: ' + xhr.responseText);
        }

        cache.set(url, xhr.responseText);
        callback(value);
      };
    },
  };

  //
  // Result formatters.
  //
  var format = {

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

    // Builds a user description.
    userDescription: function(user, query) {
      query = utils.sanitize(query);

      var user = utils.sanitizeAll(user.login, user.name).map(function(value) {
        return this.highlight(value, query);
      }, this);

      return this.tag('url', '@' + user[0]) + ' ' + this.tag('dim', user[1]);
    },

    // Builds a repo description.
    repoDescription: function(repo, query, highlightUser) {
      query = utils.sanitize(query);
      repo = utils.sanitizeAll(repo.name, repo.desc.slice(0, 60), repo.user);
      var user = (highlightUser) ? this.highlight(repo.pop(), query) : repo.pop();

      repo = repo.map(function(value) {
        return this.highlight(value, query);
      }, this)

      return this.tag('url', user + '/' + repo[0]) + ' ' + this.tag('dim', repo[1]);
    }
  };

  //
  // GitHub.
  //
  var github = {

    // Finds users.
    findUsers: function(query, callback) {
      ajax.get('api.users.search', { query: query }, function(data) {
        callback(data.users.slice(0, config.maxResults).map(function(user) {
          return {
            content: utils.urlFor('html.user', { user: user.username }),
            description: format.userDescription({
              login: user.username,
              name: user.fullname
            }, query)
          };
        }));
      });
    },

    // Finds repos.
    findRepos: function(query, callback) {
      ajax.get('api.repos.search', { query: query }, function(data) {
        callback(data.repositories.slice(0, config.maxResults).map(function(repo) {
          return {
            content: utils.urlFor('html.repo', {
              user: repo.username,
              repo: repo.name
            }),
            description: format.repoDescription({
              name: repo.name,
              user: repo.username,
              desc: repo.description
            }, query, true)
          };
        }));
      });
    },

    // Finds repos by a user.
    findReposByUser: function(user, query, callback) {
      ajax.get('api.users.repos', { user: user }, function(data) {
        callback(data.filter(function(repo) {
          return repo.name.toLowerCase().indexOf(query) > -1;
        }).slice(0, config.maxResults).map(function(repo) {
          return {
            content: repo.html_url,
            description: format.repoDescription({
              name: repo.name,
              user: repo.owner.login,
              desc: repo.description
            }, query, false)
          };
        }));
      });
    }
  };

  //
  // Lets go!
  //

  // Process search request.
  chrome.omnibox.onInputChanged.addListener(utils.debounce(function(query, fn) {
    query = query.trim().toLowerCase();

    if (query === '' || query === '@' || query[0] === '/') {
      return;
    }

    if (query[0] === '@') {
      return github.findUsers(query.slice(1).trim(), fn);
    }

    if (query.indexOf('/') === -1) {
      return github.findRepos(query, fn);
    }

    query = query.split('/');
    github.findReposByUser(query.shift().trim(), query.join('/').trim(), fn);
  }, 250));

  // Open the new page on enter.
  chrome.omnibox.onInputEntered.addListener(function (url) {
    chrome.tabs.update({
      url: utils.isUrl(url) ? url : utils.urlFor('html.search', { query: url })
    });
  });

  // Sweep the cache on startup.
  cache.sweep();

  // Install cache sweeper intervall.
  setInterval(function() {
    cache.sweep();
  }, config.cache.sweepInterval);
}).call(this);
