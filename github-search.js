// Lets go!
(function($) {

  // Set some general ajax options.
  $.ajaxSetup({
    dataType: 'json',
    localCache: true,
    cacheTTL: 6 // hours
  });

  // Our big fat GitHub object.
  var GitHub = {

    // Base uri of github.
    baseUri: 'https://github.com/',

    // Some api uris.
    apiUris: {
      user: 'https://api.github.com/users/:user/repos',
      search: 'https://api.github.com/legacy/repos/search/:query'
    },

    // Asks GitHub for some data.
    //
    //   GitHub.askFor('rails', function(data) { console.log(data); });
    //
    // To search the repos of a user, write a query like 'username/rails'.
    askFor: function(query, callback) {
      if (query.indexOf('/') > -1) {
        this.askForUser(query, callback);
      } else {
        this.askForRepos(query, callback);
      }
    },

    // Searches the repo of a user.
    askForUser: function(query, callback) {
      var parts = query.split('/');
      var uri = this.apiUris.user.replace(':user', parts.shift());
      query = parts.join('/');

      $.getJSON(uri, function(data) {
        var results = data.filter(function(repo) {
          return repo.name.indexOf(query) > -1
        }).map(function(repo) {
          return {
            url: repo.html_url,
            name: repo.name,
            user: repo.owner.login,
            desc: (repo.description || '').slice(0, 66)
          };
        });

        callback(results);
      });
    },

    // Searches the repos.
    askForRepos: function(query, callback) {
      var self = this;
      var uri = this.apiUris.search.replace(':query', encodeURIComponent(query));

      $.getJSON(uri, function(data) {
        var results = data.repositories.map(function(repo) {
          return {
            url: self.baseUri + repo.username + '/' + repo.name,
            name: repo.name,
            user: repo.username,
            desc: (repo.description || '').slice(0, 66)
          };
        });

        callback(results);
      });
    }
  };

  // Debounces a function.
  var debounce = function(callback, delay) {
    var self = this, timeout;

    return function() {
      var args = arguments;
      clearTimeout(timeout);

      timeout = setTimeout(function() {
        callback.apply(self, args);
        timeout = 0;
      }, delay);

      return this;
    };
  };

  // Escapes some special XML chars.
  var xmlEncode = function(string) {
    return string.replace(/&/g, '&amp;')
                 .replace(/</g, '&lt;')
                 .replace(/>/g, '&gt;')
                 .replace(/"/g, '&quot;');
  };

  // Wrappes found substrings in <match> tags.
  var highlight = function(string, substring) {
    return string.replace(substring, '<match>' + substring + '</match>');
  };

  // Creates a description for a repo.
  var descriptionFor = function(repo, query) {
    var _repo = {}, desc = '<url>';

    for (var attr in repo)
      _repo[attr] = xmlEncode(repo[attr]);

    if (query.indexOf('/') === -1) {
      query = xmlEncode(query);
      desc += highlight(_repo.user + '/' + _repo.name, query);
    } else {
      query = xmlEncode(query.split('/').slice(1).join('/'));
      desc += _repo.user + '/' + highlight(_repo.name, query);
    }

    return desc + '</url> <dim>' + highlight(_repo.desc, query) + '</dim>';
  };

  // Catch the input.
  chrome.omnibox.onInputChanged.addListener(debounce(function(query, callback) {
    if ( ! query) return;

    GitHub.askFor(query, function(data) {
      var results = data.slice(0, 5).map(function(repo) {
        return {
          content: repo.url,
          description: descriptionFor(repo, query)
        };
      });

      callback(results);
    });
  }, 200));

  // Catch the submission.
  chrome.omnibox.onInputEntered.addListener(function (uri) {
    if ( ! uri.match(/^http(?:s)?:\/\//)) {
      uri = GitHub.baseUri + 'search?q=' + uri;
    }

    chrome.tabs.update({ url: uri });
  });
})(jQuery);
