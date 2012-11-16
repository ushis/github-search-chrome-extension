(function($) {

  //
  // Setup.
  //

  // Use localStorage cache for all ajax requests.
  $.ajaxSetup({
    dataType: 'json',
    localCache: true,
    cacheTTL: 6 // hours
  });

  // XML sanitization rules.
  var sanitizationRules = [
    [/&/g, '&amp;'],
    [/</g, '&lt;'],
    [/>/g, '&gt;'],
    [/"/g, '&quot;']
  ];

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

  // Sanitizes all arguments.
  var sanitize = function() {
    var results = Array.prototype.map.call(arguments, function(arg) {
      if (arg === null || arg === undefined) {
        return '';
      }

      if (typeof(arg) !== 'string') {
        arg = String(arg);
      }

      sanitizationRules.forEach(function(rule) {
        arg = arg.replace(rule[0], rule[1]);
      });

      return arg;
    });

    if (results.length < 2) {
      return results[0];
    }

    return results;
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
    if (query === '') {
      return string;
    }

    var regex = query.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');

    return string.replace(RegExp(regex, 'gi'), tag('match', '$&'));
  };

  // Builds a user description.
  var userDescription = function(user, query) {
    user = sanitize(user.login, user.name);
    query = sanitize(query);

    return tag('url', '@' + highlight(user[0], query)) + ' ' +
           tag('dim', highlight(user[1], query));
  };

  // Builds a repo description.
  var repoDescription = function(repo, query, highlightUser) {
    repo = sanitize(repo.user, repo.name, repo.desc.slice(0, 60));
    query = sanitize(query);

    if (highlightUser) {
      repo[0] = highlight(repo[0], query);
    }

    return tag('url', repo[0] + '/' + highlight(repo[1], query)) + ' ' +
           tag('dim', highlight(repo[2], query));
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
    $.getJSON(urlFor('api.users.search', { query: query }), function(data) {
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
    $.getJSON(urlFor('api.repos.search', { query: query }), function(data) {
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
    $.getJSON(urlFor('api.users.repos', { user: user }), function(data) {
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
    if ( ! url.match(/^http(?:s)?:\/\//)) {
      url = urlFor('html.search', { query: url });
    }

    chrome.tabs.update({ url: url });
  });
})(jQuery);
