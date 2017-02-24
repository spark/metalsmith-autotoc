
var jsdom = require('jsdom');
var async = require('async');
var slug = require('./slug');
var minimatch = require('minimatch');

var TocItem = function() {
  TocItem.prototype.init.apply(this, arguments);
};

TocItem.prototype = {
  /**
   * @param {Object} [params]
   * @param {String} [params.id]
   * @param {String} [params.text]
   * @param {String} [params.dataHref]
   */
  init: function(params) {
    params = params || {};
    this.id = params.id || '';
    this.text = params.text || '';
    this.dataHref = params.dataHref;
    this.children = [];
    this.parent = null;
  },
  /**
   * @param {TocItem} tocItem
   */
  add: function(tocItem) {
    if (tocItem.parent) {
      throw 'tocItem.parent exists';
    }
    tocItem.parent = this;
    this.children.push(tocItem);
  },

  toJSON: function() {
    return {
      id: this.id,
      text: this.text,
      dataHref: this.dataHref,
      children: this.children
    };
  }
};

/**
 * @param {Function} [options.slug]
 * @param {String} [options.selector]
 * @param {String} [options.headerIdPrefix]
 */
module.exports = function(options) {
  options = options || {};
  options.selector = options.selector || 'h2, h3, h4, h5, h6';
  options.headerIdPrefix = options.headerIdPrefix || '';
  options.pattern = options.pattern || '';
  options.slug = options.slug || function(innerHTML, originalId) {
    if (originalId) {
      return originalId;
    }
    return options.headerIdPrefix + slug(innerHTML);
  };

  function getRootLevel(headers) {
    return headers.map(function(header) {
      return header.level;
    }).sort()[0] - 1 || 1;
  }

  function buildTocItems(headers) {
    if (headers.length == 0) {
      return [];
    }

    var root = new TocItem();
    var toc = root;

    headers = headers.map(function(header) {
      return {
        id: header.id,
        text: header.innerHTML.replace(/<[^>]*>/g, ""),
        dataHref: header.dataHref,
        level: parseInt(header.tagName.match(/^h([123456])$/i)[1], 10)
      };
    });

    var lastLevel = getRootLevel(headers);

    headers.forEach(function(header) {
      var id = header.id;
      var text = header.text;
      var level = header.level;
      var dataHref =  header.dataHref;

      while (level != 1 + lastLevel) {
        if (level < 1 + lastLevel) {
          toc = toc.parent;
          lastLevel--;
        } else if (level > 1 + lastLevel) {
          var emptyToc = new TocItem();
          toc.add(emptyToc);
          toc = emptyToc;
          lastLevel++;
        }
      }

      var newToc = new TocItem({
        text: text,
        id: id,
        dataHref: dataHref
      });

      toc.add(newToc);
      toc = newToc;
      lastLevel = level;
    });

    return root.children;
  }

  return function(files, metalsmith, done) {
    var fileList = Object.keys(files).map(function(path) {
      return files[path]
    });

    async.each(fileList, function(file, done) {
      var filePath = file.path ? file.path.href + file.path.base: '';

      if(!minimatch(filePath, options.pattern)) {
        done();
      } else {
        var contents = file.contents.toString('utf8');
        jsdom.env({
          html: '<html><body>' + contents + '</body></html>',
          feature: {QuerySelector: true},
          done: function(error, window) {
            if (error) {
              throw error;
            }

            var headers = Array.prototype.slice.call(
              window.document.querySelectorAll(file.autotocSelector || options.selector || 'h3, h4')
            ).map(function(header) {
              var headerDataHref = header.getAttribute('data-href');
              header.id = options.slug(header.innerHTML, header.id);
              header.dataHref = headerDataHref;
              return header;
            });

            file.contents = new Buffer(window.document.body.innerHTML);
            file.toc = buildTocItems(headers);
            done();
          }
        });
      }
    }, function() {
      done();
    });
  };
};
