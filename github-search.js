(function() {

  //
  // Setup.
  //

  // XML sanitization rules.
  var sanitizationRules = [
    [/&/g, '&amp;'],
    [/</g, '&lt;'],
    [/>/g, '&gt;'],
    [/"/g, '&quot;']
  ];

  // Invalidate cache after 6 hours.
  var cacheTTL = 1000 * 60 * 60 * 6;

  // Suffix of the ttl cache key.
  var ttlKeySuffix = '%ttl';

  // Clear the cache at the beginning of the session.
  localStorage.clear();

  // Chrome displays max 5 results.
  var maxResults = 5;

  // GitHub base urls.
  var baseLocations = {
    html: 'https://github.com',
    api: 'https://api.github.com'
  };

  // Some GitHub paths we need.
  var locations = {
    html: {
      user: '/:user',
      repo: '/:user/:repo',
      search: '/search?q=:query'
    },
    api: {
      users: {
        repos: '/users/:user/repos?sort=pushed',
        search: '/legacy/user/search/:query'
      },
      repos: {
        search: '/legacy/repos/search/:query'
      }
    }
  };

  //
  // Utils.
  //

  // Returns the url for an Array of keys or a dotted path.
  //
  //   urlFor('api.users.search', { query: 'torvalds' });
  //   //=> 'https://api.github.com/legacy/user/search/torvalds'
  //
  // The second argument is a object of with.
  var urlFor = function(keys, params) {
    var path = locations;

    if ( ! (keys instanceof Array)) {
      keys = keys.split('.');
    }

    keys.forEach(function(key) {
      path = path[key];
    });

    for (var param in params) {
      path = path.replace(':' + param, encodeURIComponent(params[param]));
    }

    return baseLocations[keys[0]] + path;
  };

  // Simple check if a string is a "valid" HTTP(S) url.
  var isUrl = function(string) {
    return !! string.match(/^http(?:s)?:\/\//);
  };

  // Sanitizes the argument. Returns a string.
  var sanitize = function(obj) {
    if (obj === null || obj === undefined) {
      return '';
    }

    if (typeof(obj) !== 'string') {
      obj = String(obj);
    }

    sanitizationRules.forEach(function(rule) {
      obj = obj.replace(rule[0], rule[1]);
    });

    return obj;
  };

  // Returns an array of all sanitized arguments.
  var sanitizeAll = function() {
    return Array.prototype.map.call(arguments, function(arg) {
      return sanitize(arg);
    });
  };

  // Debounces a function.
  var debounce = function(callback, delay) {
    var self = this, timeout;

    return function() {
      var args = arguments;
      clearTimeout(timeout);

      timeout = setTimeout(function() {
        callback.apply(self, args);
      }, delay);

      return this;
    };
  };

  //
  // Ajax.
  //

  // Stores a result in the cache.
  var cache = function(key, value) {
    var ttlKey = key + ttlKeySuffix;

    try {
      localStorage.setItem(key, value);
      localStorage.setItem(ttlKey, +new Date() + cacheTTL);
    } catch (error) {
      localStorage.removeItem(key);
      localStorage.removeItem(ttlKey);
      console.log('[Cache] Could not store value: ' + value);
    }
  };

  // Retrieves a value from the cache. Returns null on miss.
  var getFromCache = function(key) {
    var ttlKey = key + ttlKeySuffix;
    var ttl = localStorage.getItem(ttlKey);

    if ( ! ttl || ttl < +new Date()) {
      localStorage.removeItem(key);
      localStorage.removeItem(ttlKey);
      return null;
    }

    var value = localStorage.getItem(key);

    if (value) {
      try {
        return JSON.parse(value);
      } catch (error) {
        console.log('[Cache] Invalid JSON: ' + value);
      }
    }

    return null;
  };

  // Gets some JSON data from somewhere.
  var get = function(url, callback) {
    var value = getFromCache(url);

    if (value) {
      return callback(value);
    }

    var xhr = new XMLHttpRequest();

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

      cache(url, xhr.responseText);
      callback(value);
    };

    xhr.open('GET', url);
    xhr.send();
  };

  //
  // Result formatters.
  //

  // Creates a tag with some content.
  //
  //   tag('dim', 'Hello World');
  //   //=> '<dim>Hello World</dim>'
  //
  // Returns a String.
  var tag = function(tag, content) {
    return '<' + tag + '>' + content + '</' + tag + '>';
  };

  // Wrappes substrings in <match> tags.
  var highlight = function(string, query) {
    if (query === '') return string;

    query = query.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');

    return string.replace(RegExp(query, 'gi'), tag('match', '$&'));
  };

  // Builds a user description.
  var userDescription = function(user, query) {
    query = sanitize(query);

    user = sanitizeAll(user.login, user.name).map(function(value) {
      return highlight(value, query);
    });

    return tag('url', '@' + user[0]) + ' ' + tag('dim', user[1]);
  };

  // Builds a repo description.
  var repoDescription = function(repo, query, highlightUser) {
    query = sanitize(query);

    repo = sanitizeAll(repo.user, repo.name, repo.desc.slice(0, 60)).map(function(value, i) {
      return (i > 0 || highlightUser) ? highlight(value, query) : value;
    });

    return tag('url', repo[0] + '/' + repo[1]) + ' ' + tag('dim', repo[2]);
  };

  //
  // Request methods.
  //

  // Processes a search request.
  var request = function(query, callback) {
    query = query.trim().toLowerCase();

    if (query === '' || query === '@' || query[0] === '/') {
      return;
    }

    if (query[0] === '@') {
      return findUsers(query.slice(1).trim(), callback);
    }

    if (query.indexOf('/') === -1) {
      return findRepos(query, callback);
    }

    query = query.split('/');
    findReposByUser(query.shift().trim(), query.join('/').trim(), callback);
  };

  // Finds users.
  var findUsers = function(query, callback) {
    get(urlFor('api.users.search', { query: query }), function(data) {
      var results = data.users.slice(0, maxResults).map(function(user) {
        return {
          content: urlFor('html.user', { user: user.username }),
          description: userDescription({
            login: user.username,
            name: user.fullname
          }, query)
        };
      });

      callback(results);
    });
  };

  // Finds repos.
  var findRepos = function(query, callback) {
    get(urlFor('api.repos.search', { query: query }), function(data) {
      var results = data.repositories.slice(0, maxResults).map(function(repo) {
        return {
          content: urlFor('html.repo', { user: repo.username, repo: repo.name }),
          description: repoDescription({
            name: repo.name,
            user: repo.username,
            desc: repo.description
          }, query, true)
        };
      });

      callback(results);
    });
  };

  // Finds repos by a user.
  var findReposByUser = function(user, query, callback) {
    get(urlFor('api.users.repos', { user: user }), function(data) {
      var results = data.filter(function(repo) {
        return repo.name.toLowerCase().indexOf(query) > -1;
      }).slice(0, maxResults).map(function(repo) {
        return {
          content: repo.html_url,
          description: repoDescription({
            name: repo.name,
            user: repo.owner.login,
            desc: repo.description
          }, query, false)
        };
      });

      callback(results);
    });
  };

  //
  // Chrome events.
  //

  // Process search request.
  chrome.omnibox.onInputChanged.addListener(debounce(request, 250));

  // Open the new page on enter.
  chrome.omnibox.onInputEntered.addListener(function (url) {
    chrome.tabs.update({
      url: isUrl(url) ? url : urlFor('html.search', { query: url })
    });
  });
}).call(this);
