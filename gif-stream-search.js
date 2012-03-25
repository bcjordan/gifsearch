var sys = require("util"),
  net = require('net'),
  http = require("http"),
  url = require("url"),
  path = require("path"),
  fs = require("fs"),
  events = require("events");

String.prototype.format = function () {
  var formatted = this;
  for (arg in arguments) {
    formatted = formatted.replace("{" + arg + "}", arguments[arg]);
  }
  return formatted;
};

var DEBUG = true;
var DELAY = DEBUG ? 5000 : 30000

var urls = {};


function load_static_file(uri, response) {
  var filename = path.join(process.cwd(), uri);
  path.exists(filename, function (exists) {
    if (!exists) {
      response.writeHead(404, {"Content-Type":"text/plain"});
      response.end("404 Not Found\n");
      return;
    }

    fs.readFile(filename, "binary", function (err, file) {
      if (err) {
        response.writeHead(500, {"Content-Type":"text/plain"});
        response.end(err + "\n");
        return;
      }

      response.writeHead(200);
      response.end(file, "binary");
    });
  });
}

var gif_emitter = new events.EventEmitter();

//
// HTTP server
//
http.createServer(
  function (request, response) {
    var uri = url.parse(request.url).pathname;
    if (uri === "/stream") {
      var callback = function (gifs) {
        response.writeHead(200, { "Content-Type":"text/plain" });

        console.log("Sending " + JSON.stringify(urls))
        response.end(JSON.stringify(urls));

        clearTimeout(timeout);

        gif_emitter.removeListener("gif", callback);
        //        urls = {}

      }

      gif_emitter.addListener("gif", callback);

      var timeout = setTimeout(function () {
        response.writeHead(200, { "Content-Type":"text/plain" });
        response.end(JSON.stringify([]));

      }, 10000);

    } else if (uri.substring(1, 4) === 'tag') {
      urls = {};
      gif_emitter.removeAllListeners("gif");

      console.log("Searching", uri.substring(5, uri.length))
      exports.searchGifs(uri.substring(5, uri.length))

      load_static_file('/gif-stream-multi.html', response);

    }

    else {
      load_static_file(uri, response);
    }
  }).listen(8080);

console.log("Server running at http://localhost:8080/");

//
// GIF fetcher (reddit)
//

var sources = ['/user/gif_only_mode.json',
  '/user/edom_ylno_fig.json',
  '/user/replies_with_gifs.json',
  //    '/r/gifs.json?limit=100',
  '/r/reactiongifs/new/.json?sort=new&limit=100',
  '/r/gifs/new/.json?sort=new&limit=100']

var all_gifs_regex = /(http:\/\/[^"]*(^\n)?\.(gif|otherextensions))/g;
var reddit_regex = /(http:\/\/[^"]*(^\n)(^\[)?\.(gif|otherextensions))/g;
var tumblr_gifs_regex = /(http:\/\/[^"]*[^\n][^"][^']*\.gif)/g;
var test_regex = /(http(s?):)([/|.|\w|\s])*\.(?:gif)/g;
//var test_regex = /(http(s?):)([/|.|\w|\s])*[^100]\.(?:gif)/g;

// Tumblr gifs:
// http://25.media.tumblr.com/tumblr_m1azctZHXC1r71juxo1_400.gif
// http://28.media.tumblr.com/tumblr_m1azdgkoX61qejltco1_400.gif


//var keyword = 'typing';

exports.searchGifs = function (keyword) {
  var gif_sources = [
    ['www.reddit.com', '/r/gifs/search?q={0}&restrict_sr=on'.format(keyword), test_regex],
    ['www.tumblr.com', '/tagged/{0}-gif/everything'.format(keyword), test_regex],
    ['www.tumblr.com', '/tagged/{0}-gifs/everything'.format(keyword), test_regex],
    ['www.tumblr.com', '/tagged/{0}/everything'.format(keyword), test_regex],
    ['senorgif.memebase.com', '/tag/{0}'.format(keyword), test_regex],
    ['senorgif.memebase.com', '/tag/{0}/page/2'.format(keyword), test_regex],
    ['senorgif.memebase.com', '/tag/{0}/page/3'.format(keyword), test_regex],
    ['senorgif.memebase.com', '/tag/{0}/page/4'.format(keyword), test_regex],
  ]


  var sockets = []; // collect connections

  // Fetch new gifs from Reddit
  for (var s = 0; s < gif_sources.length; s++) {
    // s -> i to avoid closure issues
    (function (i) {
      setTimeout(function () {
        //        setInterval(function () {
        var get = http.get(
          {
            host:gif_sources[i][0],
            path:gif_sources[i][1],
            port:80
          },

          function (res) {
            res.on('data',
              function (chunk) {
                var url_regex = gif_sources[i][2];
                var matches = chunk.toString().match(url_regex) || [];
                for (var m = 0; m < matches.length; m += 1) {
                  if (!urls[matches[m]]) {
                    // Write to sockets
                    for (var j = 0; j < sockets.length; j++) { sockets[0].write("\n" + matches[m]) }

                    // Emit for web viewers
                    //                      gif_emitter.emit("gif", matches[m]);

                    // Store in matches
                    urls[matches[m]] = true;


                    console.log("Found new gif: " + matches[m]);
                  }
                }
              })

            res.on('end', function () {
              if (DEBUG)
                for (u in urls) {
                  console.log("" + u);
                  gif_emitter.emit('gif', u);
                }
            })
          })

        console.log("Fetched source " + gif_sources[i] + " index " + i);

        //        }, DELAY) // repeat
      }, i * (DELAY / gif_sources.length)) // wait
    })(s)
  }
}
