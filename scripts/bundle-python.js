const pythonBuild = require('python-build');
const path = require('path');

async function bundlePython() {
    await pythonBuild.installPython({
        version: '3.11',
        platform: process.platform,
        arch: process.arch,
        installPath: path.join(__dirname, '../bundled-python'),
        removeInstaller: true
    });

    // Install required packages
    await pythonBuild.installPackages([
        'openai',
        'pyperclip'
    ]);
}

bundlePython().catch(console.error); 