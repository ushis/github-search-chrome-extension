(function() {

  // Chrome displays max 5 results.
  var maxResults = 5;

  // GitHub locations.
  var locations = {
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
  };

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

    return locations[keys[0]].base + path;
  };

  //
  // Result formatters.
  //

  // Builds a user description.
  var userDescription = function(user, query) {
    query = o.utils.sanitize(query);

    var user = o.utils.sanitizeAll(user.login, user.name).map(function(value) {
      return o.utils.highlight(value, query);
    }, this);

    return o.utils.tag('url', '@' + user[0]) + ' ' + o.utils.tag('dim', user[1]);
  };

  // Builds a repo description.
  var repoDescription = function(repo, query, highlightUser) {
    var user = o.utils.sanitize(repo.user);
    var desc = (repo.desc || '').slice(0, 60);
    query = o.utils.sanitize(query);

    repo = o.utils.sanitizeAll(repo.name, desc).map(function(value) {
      return o.utils.highlight(value, query);
    }, this)

    if (highlightUser) {
      user = o.utils.highlight(user, query);
    }

    return o.utils.tag('url', user + '/' + repo[0]) + ' ' + o.utils.tag('dim', repo[1]);
  };

  // Builds a description for history entries.
  var historyDescription = function(url, query) {
    url = url.slice(1);

    if (url.indexOf('/') === -1) {
      return userDescription({ login: url }, query);
    }

    return o.utils.tag('url', o.utils.highlight(url, query));
  };

  //
  // Requests.
  //

  // Finds users.
  var findUsers = function(query, callback) {
    o.ajax.get(urlFor('api.users.search', { query: query }), function(data) {
      callback(data.users.slice(0, maxResults).map(function(user) {
        return {
          content: urlFor('html.user', { user: user.username }),
          description: userDescription({
            login: user.username,
            name: user.fullname
          }, query)
        };
      }));
    });
  };

  // Finds repos.
  var findRepos = function(query, callback) {
    o.ajax.get(urlFor('api.repos.search', { query: query }), function(data) {
      callback(data.repositories.slice(0, maxResults).map(function(repo) {
        return {
          content: urlFor('html.repo', { user: repo.username, repo: repo.name }),
          description: repoDescription({
            name: repo.name,
            user: repo.username,
            desc: repo.description
          }, query, true)
        };
      }));
    });
  };

  // Finds repos by a user.
  var findReposByUser = function(user, query, callback) {
    o.ajax.get(urlFor('api.users.repos', { user: user }), function(data) {
      callback(data.filter(function(repo) {
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
      }));
    });
  };

  // Items in the history.
  var findInHistory = function(query, callback) {
    o.history.find(query, function(data) {
      callback(data.map(function(url) {
        return {
          content: locations.html.base + url,
          description: historyDescription(url, query)
        };
      }));
    });
  };

  //
  // Events.
  //

  // Process search request.
  chrome.omnibox.onInputChanged.addListener(o.utils.debounce(function(query, callback) {
    query = query.trim().toLowerCase();

    if (query === '' || query === '@' || query[0] === '/') {
      return;
    }

    if (query[0] === '@') {
      return findUsers(query.slice(1).trim(), callback);
    }

    if (query[0] === ':') {
      return findInHistory(query.slice(1).trim(), callback);
    }

    if (query.indexOf('/') === -1) {
      return findRepos(query, callback);
    }

    query = query.split('/');
    findReposByUser(query.shift().trim(), query.join('/').trim(), callback);
  }, 300));

  // Open the new page on enter.
  chrome.omnibox.onInputEntered.addListener(function (url) {
    if (o.utils.isUrl(url)) {
      o.history.push(url.slice(locations.html.base.length));
    } else {
      url = urlFor('html.search', { query: url });
    }

    chrome.tabs.update({ url: url });
  });
}).call(this);
