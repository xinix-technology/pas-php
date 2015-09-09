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

var fs = require('fs'),
    spawn = require('child_process').spawn,
    path = require('path'),
    net = require('net');

var VENDOR_DIRECTORY = 'vendor';

var findPort = function(port) {
    port = port || 3000;

    return new Promise(function(resolve, reject) {
        var server = net.createServer();
        server.listen(port, '0.0.0.0', function (err) {
            server.once('close', function () {
                resolve(port);
            });
            server.close();
        });
        server.on('error', function (err) {
            findPort(port + 1).then(resolve, reject);
        });
    });
};

var phpProfile = module.exports = {
    support: function(pack) {
        'use strict';

        return fs.existsSync(path.join(pack.cachePath || '', 'composer.json'));
    },

    read: function(pack) {
        'use strict';

        var objectUtil = this.require('util/object'),
            fsUtil = this.require('util/fs');


        return this.super_.read.apply(this, arguments)
            .then(function(manifest) {
                manifest = manifest || {};

                var promise = Promise.resolve(manifest);

                try {
                    var repositoryPacks = {};
                    var composerJsonFile = path.join(pack.cachePath, 'composer.json');
                    if (fs.existsSync(composerJsonFile)) {

                        var composerJson = JSON.parse(fs.readFileSync(composerJsonFile));

                        manifest.name = manifest.name || composerJson.name;
                        if (composerJson.version) {
                            manifest.version = manifest.version || composerJson.version;
                        }
                        manifest.dependencies = manifest.dependencies || {};
                        manifest.autoload = manifest.autoload || {
                            files: []
                        };

                        if (composerJson.repositories && composerJson.repositories.length > 0) {
                            promise = promise.then(function() {
                                return Promise.all(composerJson.repositories.map(function(repository) {
                                    var subPack = this.query(repository.url);
                                    return subPack.fetch()
                                        .then(function() {
                                            repositoryPacks[subPack.name] = subPack;
                                        });
                                }.bind(this)));
                            }.bind(this));
                        }

                        promise = promise.then(function() {
                            if (composerJson.autoload) {
                                var autoloads = manifest.autoload;
                                Object.keys(composerJson.autoload).forEach(function(i) {
                                    var j,
                                        key;
                                    if (i === 'psr-0') {
                                        var psr0 = composerJson.autoload[i];
                                        for(j in psr0) {
                                            key = j.replace(/^[\\]+/, '').replace(/[\\]+$/, '');
                                            autoloads[key] = path.join(psr0[j] || '', j.replace(/\\/g, '/')).replace(/[\/]+$/, '');
                                            if (composerJson['target-dir']) {
                                                autoloads[key] = autoloads[key].replace(composerJson['target-dir'], '');
                                            }
                                        }
                                    } else if (i === 'psr-4') {
                                        var psr4 = composerJson.autoload[i];
                                        for(j in psr4) {
                                            key = j.replace(/^[\\]+/, '').replace(/[\\]+$/, '');
                                            autoloads[key] = psr4[j].replace(/[\/]+$/, '');
                                        }
                                    } else if (i === 'classmap') {
                                        var classmap = composerJson.autoload[i];

                                        for(j in classmap) {
                                            var classes = classmapCollectClasses(pack.cachePath, classmap[j]);
                                            for(var k in classes) {
                                                autoloads[k] = classes[k];
                                            }
                                        }
                                    } else if (i === 'files') {
                                        // autoloads.files = autoloads.files || [];
                                        composerJson.autoload[i].forEach(function(file) {
                                            if (composerJson['target-dir']) {
                                                var f = file.replace(composerJson['target-dir'] + '/', '');

                                                if (autoloads.files.indexOf(f) === -1) {
                                                    autoloads.files.push(f);
                                                }
                                            } else {
                                                if (autoloads.files.indexOf(file) === -1) {
                                                    autoloads.files.push(file);
                                                }
                                            }
                                        }.bind(this));
                                    } else {
                                        throw new Error('unimplement yet for autoload:' + i);
                                    }
                                });
                            }

                            for(var i in composerJson.require) {
                                var requireValue = composerJson.require[i];
                                var version = requireValue.indexOf('dev-') === 0 ? requireValue.substr(4) : requireValue;

                                // FIXME i dont know if it is important to check
                                // right now i will ignore php version and ext deps
                                if (i.indexOf('/') === -1) {
                                    continue;
                                }

                                if (repositoryPacks[i]) {
                                    manifest.dependencies[i] = repositoryPacks[i].queryUrl.split('#')[0] + '#' + version;
                                } else {
                                    manifest.dependencies[i] = 'packagist:' + i + '#' + version;
                                }
                            }

                            return manifest;
                        }.bind(this));
                    }
                } catch(e) {
                    console.log('<e>', e.stack);
                }

                return promise;
            }.bind(this));
    },

    link: function(pack) {
        var fsUtil = this.require('util/fs');

        pack.workingPath = path.join(this.cwd, VENDOR_DIRECTORY, pack.name);

        if (fs.existsSync(pack.workingPath)) {
            var stat = fs.lstatSync(pack.workingPath);
            if (stat.isSymbolicLink()) {
                fs.unlinkSync(pack.workingPath);
            } else {
                fsUtil.rm(pack.workingPath);
            }
        }
        fsUtil.mkdirp(path.dirname(pack.workingPath));

        fs.symlinkSync(pack.cachePath, pack.workingPath);

        return this.install(pack);
    },

    uninstall: function(pack) {
        'use strict';

        if (pack.working) {

        } else {
            pack.workingPath = path.join(this.cwd, VENDOR_DIRECTORY, pack.name);


        }
    },

    install: function(pack) {
        'use strict';

        var fsUtil = this.require('util/fs');

        var autoloadFile = path.join(this.cwd, 'autoload.json');

        var next;
        if (pack.working) {
            var autoloadF = path.join(this.cwd, VENDOR_DIRECTORY, 'autoload.php');
            fsUtil.mkdirp(path.dirname(autoloadF));
            fs.writeFileSync(autoloadF, "<?php\n\nrequire '../" + VENDOR_DIRECTORY + "/xinix-technology/pas-php/src/autoload.php';\n");

            pack.dependencies['xinix-technology/pas-php'] = 'github:xinix-technology/pas-php#*';

            next = Promise.resolve();
        } else if (pack.provider.name === 'link') {
            next = Promise.resolve();
        } else {
            pack.workingPath = this.getWorkingPath(pack);
            if (fs.existsSync(pack.workingPath)) {
                var stat = fs.lstatSync(pack.workingPath);
                if (stat.isSymbolicLink()) {
                    fs.unlinkSync(pack.workingPath);
                } else {
                    fsUtil.rm(pack.workingPath);
                }
            }
            fsUtil.mkdirp(path.dirname(pack.workingPath));
            next = fsUtil.cp(pack.cachePath, pack.workingPath);
        }

        var autoload = {
            files: []
        };
        if (fs.existsSync(autoloadFile)) {
            try {
                var json = JSON.parse(fs.readFileSync(autoloadFile));
                autoload = json;
            } catch(e) {

            }

        }
        for(var i in pack.autoload) {
            var wp = '.';
            if (pack.workingPath) {
                wp = pack.workingPath.replace(this.cwd + '/', '');
            }

            if (i === 'files') {
                for(var j in pack.autoload.files) {
                    var file = pack.autoload.files[j];
                    var f = path.join(wp, file);
                    if (autoload.files.indexOf(f) === -1) {
                        autoload.files.push(f);
                    }
                }
            } else {
                autoload[i] = path.join(wp, pack.autoload[i]);
            }
        }

        fs.writeFileSync(autoloadFile, JSON.stringify(autoload, null, 2));

        return next.then(function() {
                var promises = [];

                if (pack.dependencies) {
                    Object.keys(pack.dependencies).forEach(function(name) {
                        var dependency = pack.dependencies[name];

                        var dependencyPack = this.query(dependency);

                        var promise = dependencyPack.fetch()
                            .then(function() {
                                return dependencyPack.install();
                            });
                        promises.push(promise);
                    }.bind(this));
                }

                return Promise.all(promises);
            }.bind(this))
            .then(function() {
                return;
            });
    },

    getWorkingPath: function(pack) {
        'use strict';

        return path.join(this.cwd, VENDOR_DIRECTORY, pack.name);
    },

    update: function(pack) {
        'use strict';

        var fsUtil = this.require('util/fs');

        var autoloadFile = path.join(this.cwd, 'autoload.json');

        if (pack.working) {
            this.clean(pack);

            return this.install(pack);
        } else {
            throw new Error('Cannot update non-working dir');
        }
    },

    clean: function(pack) {
        'use strict';

        var fsUtil = this.require('util/fs');

        var autoloadFile = path.join(this.cwd, 'autoload.json');
        var vendorDir = path.join(this.cwd, VENDOR_DIRECTORY);

        this.i('pack', 'Removing %s ...', vendorDir);

        if (fs.existsSync(autoloadFile)) {
            fsUtil.rm(autoloadFile);
        }

        if (fs.existsSync(vendorDir)) {
            fsUtil.rm(vendorDir);
        }

    },

    up: function(pack, options) {
        'use strict';

        options = options || {};

        var port = options.p || options.port,
            serverDir = options.d || './www';


        return findPort(port)
            .then(function(port) {
                return findPort(port + 2)
                    .then(function(nextPort) {
                        return [port, nextPort];
                    });
            })
            .then(function(ports) {
                var promises = [];

                promises.push(new Promise(function(resolve, reject) {
                    var php = spawn('php', ['-S', '0.0.0.0:' + ports[1]], {
                        stdio: 'inherit',
                        cwd: serverDir

                    });
                    php.on('error', reject);
                    php.on('close', resolve);
                }));

                promises.push(new Promise(function(resolve, reject) {
                    var bs = require('browser-sync').create('Web server');
                    bs.watch('**/*.php').on('change', bs.reload);
                    bs.watch('**/*.html').on('change', bs.reload);
                    bs.watch('**/*.js').on('change', bs.reload);

                    bs.watch('**/*.css', function (event, file) {
                        if (event === 'change') {
                            bs.reload('*.css');
                        }
                    });

                    bs.init({
                        proxy: 'http://localhost:' + ports[1],
                        port: ports[0],
                        online: false,
                        xip: false,
                        reloadOnRestart: true,
                        open: false,
                    });
                }));
            });
    }
};

var classmapCollectClasses = function(baseDir, classF) {
    'use strict';

    var classes = {};

    var trueClassF = path.join(baseDir, classF);
    if (fs.statSync(trueClassF).isDirectory()) {
        fs.readdirSync(trueClassF).forEach(function(f) {
            var relF = path.join(classF, f);
            var result = classmapCollectClasses(baseDir, relF);
            for(var i in result) {
                classes[i] = result[i];
            }
        }.bind(this));
    } else {
        var codeFile = fs.readFileSync(path.join(baseDir, classF), 'utf8');
        var className = codeFile.match(/class\s+([^\s]+)/);
        if (!className || !className[1]) {
            return {};
        }
        className = className[1];

        var ns = codeFile.match(/namespace\s+(.*);/);
        if (!ns || !ns[1]) {
            return {};
        }
        ns = ns[1];

        classes[ns + '\\' +  className] = classF;
    }

    return classes;
};
