/**
 *
 * Copyright (c) 2015 Xinix Technology
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

var url = require('url'),
    fs = require('fs'),
    path = require('path'),
    semver = require('semver'),
    request = require('request');

var packagistProvider = module.exports = {
    support: function(pack) {
        'use strict';

        if (pack.queryUrl.indexOf('packagist:') === 0 ||
            pack.queryUrl.indexOf('https://packagist.org/p/') === 0) {
            return true;
        }
    },

    fetch: function(pack) {
        'use strict';

        return this.readIndices_(pack)
            .then(function(indices) {
                return this.detectValidVersion_(pack, indices);
            }.bind(this))
            .then(function(meta) {
                pack.downloadUrl = pack.queryUrl.split('#')[0] + '#' + meta.version;
                return this.download_(pack, meta);
            }.bind(this));
    },

    download_: function(pack, meta) {
        var fsUtil = this.require('util/fs');

        var cachePath = this.getCacheFor(pack.downloadUrl);

        if (fs.existsSync(cachePath) && meta.index.version.indexOf('dev-') === -1) {
            return cachePath;
        }

        if (meta.index.source.url.indexOf('github.com') >= 0) {
            var dispatchPack = this.query(meta.index.source.url + '#' + meta.index.source.reference);

            return dispatchPack.provider.fetch(dispatchPack)
                .then(function(dispatchCachePath) {
                    fsUtil.rm(cachePath);
                    fsUtil.mkdirp(path.dirname(cachePath));
                    return fsUtil.cp(dispatchCachePath, cachePath)
                        .then(function() {
                            return cachePath;
                        });
                }.bind(this));
        } else {
            throw new Error('Unimplemented non-github packagist provider');
        }
    },

    readIndices_: function(pack) {
        'use strict';

        var fsUtil = this.require('util/fs'),
            mkdirp = fsUtil.mkdirp;

        var parsed = url.parse(pack.queryUrl);
        var detectedName = parsed.hostname + (parsed.pathname || '');

        var detectedRemoteUrl = 'https://packagist.org/p/' + detectedName + '.json';

        var indicesFile = path.join(this.indicesDirectory, detectedName + '.json');

        try {
            var lastIndices = JSON.parse(fs.readFileSync(indicesFile));
            var lastFetchedTime = new Date(lastIndices.meta.fetchedTime);
            var delta = (new Date().getTime() - lastFetchedTime.getTime()) / 1000;
            if (delta < this.config('providers.expireInterval')) {
                return Promise.resolve(lastIndices);
            }
        } catch(e) {
            // console.error(e.stack);
        }

        return new Promise(function(resolve, reject) {
                request({ url: detectedRemoteUrl, json: true }, function(err, resp, json) {
                    if (err) {
                        return reject(err);
                    }

                    var remoteIndices = json.packages[detectedName];
                    var indices = {
                        tags: {},
                        branches: {},
                        meta: {
                            fetchedTime: new Date().toISOString()
                        }
                    };
                    for(var i in remoteIndices) {
                        var decodedI = decodeURIComponent(i);

                        // FIXME quick fix to non-3 segmented version
                        if (!isNaN(parseInt(decodedI, 10))) {
                            var segments = decodedI.split('.');
                            if (segments.length < 3) {
                                decodedI = segments.join('.') + '.0';
                            } else if (segments.length > 3) {
                                decodedI = segments.slice(0, 3).join('.');
                            }
                        }
                        //
                        if (semver.valid(decodedI)) {
                            indices.tags[decodedI] = remoteIndices[i];
                        } else {
                            indices.branches[decodedI.substr(4)] = remoteIndices[i];
                        }
                    }

                    mkdirp(path.dirname(indicesFile));
                    fs.writeFile(indicesFile, JSON.stringify(indices, null, 2), function(err) {
                        if (err) {
                            return reject(err);
                        }

                        resolve(indices);
                    });
                }.bind(this));

            }.bind(this));
    },

    detectValidVersion_: function(pack, indices) {
        'use strict';

        var parsed = url.parse(pack.queryUrl);
        var queryVersion = decodeURIComponent(parsed.hash ? parsed.hash.substr(1) : '*');
        if (semver.validRange(queryVersion)) {
            var tags = Object.keys(indices.tags);

            var satisfiedVersion = semver.maxSatisfying(tags, queryVersion);

            if (satisfiedVersion) {
                return {
                    type: 'tag',
                    version: satisfiedVersion,
                    index: indices.tags[satisfiedVersion]
                };
            } else if (queryVersion === '*' && indices.branches.master) {
                return {
                    type: 'branches',
                    version: 'master',
                    index: indices.branches.master
                };
            }
        } else {
            var branch = indices.branches[queryVersion];
            if (branch) {
                return {
                    type: 'branch',
                    version: queryVersion,
                    index: indices.branches[queryVersion]
                };
            }
        }

        throw new Error('Invalid version or version not found ' + pack.queryUrl + ' resolved:' + queryVersion);
    },

    normalizeUrl: function(queryUrl) {
        'use strict';

        if (this.support(queryUrl)) {
            return queryUrl;
        }

        return 'packagist:' + queryUrl;
    }
};
