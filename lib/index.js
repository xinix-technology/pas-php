var path = require('path');

module.exports = {
    providerDirectories: [
        path.join(__dirname, 'providers', 'packagist.js')
    ],

    profileDirectories: [
        path.join(__dirname, 'profiles', 'php.js')
    ],
};